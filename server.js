const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const BANCO_JSON = path.join(__dirname, "banco_estoque.json");
const PASTA_ESTOQUES = path.join(__dirname, "Estoques");

if (!fs.existsSync(PASTA_ESTOQUES)) {
  fs.mkdirSync(PASTA_ESTOQUES);
}

// Rotina de Backup Automático Diário em JSON
function executarBackupDiario() {
  try {
    if (fs.existsSync(BANCO_JSON)) {
      const dataHoje = new Date().toISOString().slice(0, 10);
      const nomeBackupDiario = `banco_backup_${dataHoje}.json`;
      const caminhoBackup = path.join(PASTA_ESTOQUES, nomeBackupDiario);

      if (!fs.existsSync(caminhoBackup)) {
        fs.copyFileSync(BANCO_JSON, caminhoBackup);
        console.log(
          `[BACKUP AUTOMÁTICO] Cópias de segurança criada com sucesso: ${nomeBackupDiario}`,
        );
      }
    }
  } catch (err) {
    console.error(
      "[BACKUP AUTOMÁTICO] Erro ao gerar cópias de segurança diária:",
      err,
    );
  }
}

// Executa o backup ao iniciar o servidor e agenda para repetir a cada 24h
executarBackupDiario();
setInterval(executarBackupDiario, 24 * 60 * 60 * 1000);

function lerBanco() {
  if (!fs.existsSync(BANCO_JSON)) {
    const estruturaInicial = {
      cadastros: [],
      movimentacoes: [],
      estruturaBOM: [],
      logAuditoria: [],
    };
    fs.writeFileSync(
      BANCO_JSON,
      JSON.stringify(estruturaInicial, null, 2),
      "utf-8",
    );
    return estruturaInicial;
  }
  try {
    const raw = fs.readFileSync(BANCO_JSON, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return {
      cadastros: [],
      movimentacoes: [],
      estruturaBOM: [],
      logAuditoria: [],
    };
  }
}

function salvarBanco(dados) {
  fs.writeFileSync(BANCO_JSON, JSON.stringify(dados, null, 2), "utf-8");
}

function registrarLog(banco, acao, detalhes) {
  if (!banco.logAuditoria) banco.logAuditoria = [];
  banco.logAuditoria.push({
    dataHora: new Date().toLocaleString("pt-BR"),
    acao,
    detalhes,
  });
}

function calcularSaldos(banco) {
  const totais = {};
  (banco.movimentacoes || []).forEach((m) => {
    const cod = (m.codigo || "").toUpperCase().trim();
    if (!totais[cod]) totais[cod] = { entradas: 0, saidas: 0 };

    const tipoStr = (m.tipo || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (tipoStr.includes("entrada") || tipoStr.includes("retorno")) {
      totais[cod].entradas += Number(m.qtd || 0);
    } else if (tipoStr.includes("sai") || tipoStr.includes("baixa")) {
      totais[cod].saidas += Number(m.qtd || 0);
    }
  });
  return totais;
}

function chamarPython(script, payload) {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const pythonVenv = path.join(
      __dirname,
      ".venv",
      isWindows ? "Scripts/python.exe" : "bin/python",
    );
    const pythonExec = fs.existsSync(pythonVenv)
      ? pythonVenv
      : isWindows
        ? "python"
        : "python3";

    const pyProcess = spawn(pythonExec, [script], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let outputData = "";

    pyProcess.stdin.write(Buffer.from(JSON.stringify(payload), "utf-8"));
    pyProcess.stdin.end();

    pyProcess.stdout.on("data", (data) => {
      outputData += data.toString("utf-8");
    });

    pyProcess.on("close", () => {
      try {
        const linhas = outputData.trim().split("\n");
        let jsonString = linhas[linhas.length - 1].trim();
        resolve(JSON.parse(jsonString));
      } catch (e) {
        resolve({
          success: false,
          error: "Erro ao processar Python: " + outputData,
        });
      }
    });
  });
}

// --- ROTAS DA API ---

// 1. Obter estado completo
app.get("/api/estoque/completo", (req, res) => {
  const banco = lerBanco();
  const totais = calcularSaldos(banco);

  const painelEstoque = (banco.cadastros || []).map((c) => {
    const cod = (c.codigo || "").toUpperCase().trim();
    const mov = totais[cod] || { entradas: 0, saidas: 0 };
    const saldo = mov.entradas - mov.saidas;
    return {
      codigo: c.codigo,
      produto: c.descricao,
      entradas: mov.entradas,
      saidas: mov.saidas,
      saldo: saldo,
      minimo: c.minimo,
      status: saldo <= c.minimo ? "REPOR URGENTE" : "OK",
      custo: c.custo,
      total: saldo * c.custo,
    };
  });

  res.json({ ...banco, painelEstoque });
});

// 2. Lançamento / Movimentação
app.post("/api/estoque/movimentar", (req, res) => {
  const banco = lerBanco();
  const { tipo, codigo, qtd, obs } = req.body;
  const quantidade = Number(qtd);

  if (!codigo) {
    return res
      .status(400)
      .json({ success: false, error: "Selecione um produto válido." });
  }

  if (isNaN(quantidade) || quantidade <= 0) {
    return res.status(400).json({
      success: false,
      error: "Informe uma quantidade maior que zero.",
    });
  }

  const codUpper = codigo.toUpperCase().trim();
  const produto = banco.cadastros.find(
    (c) => c.codigo.toUpperCase().trim() === codUpper,
  );

  if (!produto) {
    return res
      .status(404)
      .json({ success: false, error: "Produto não encontrado no cadastro." });
  }

  const tipoStr = (tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const isSaida = tipoStr.includes("sai") || tipoStr.includes("baixa");
  const isEntrada = tipoStr.includes("entrada") || tipoStr.includes("retorno");

  const totaisAtuais = calcularSaldos(banco);
  const movAtual = totaisAtuais[codUpper] || { entradas: 0, saidas: 0 };
  const saldoAtual = movAtual.entradas - movAtual.saidas;

  if (isSaida && quantidade > saldoAtual) {
    return res.status(400).json({
      success: false,
      error: `BLOQUEADO: Estoque insuficiente de "${produto.descricao}" (${produto.codigo}). Saldo disponível: ${saldoAtual.toFixed(2)} | Solicitado: ${quantidade.toFixed(2)}.`,
    });
  }

  if (isEntrada && produto.codigo.startsWith("PA-")) {
    const insumosBOM = (banco.estruturaBOM || []).filter(
      (b) => b.codigoPA.toUpperCase().trim() === codUpper,
    );

    for (const bom of insumosBOM) {
      const codMP = bom.codigoMP.toUpperCase().trim();
      const mpInfo = banco.cadastros.find(
        (c) => c.codigo.toUpperCase().trim() === codMP,
      );
      const mpMov = totaisAtuais[codMP] || { entradas: 0, saidas: 0 };
      const saldoMP = mpMov.entradas - mpMov.saidas;
      const qtdNecessaria = quantidade * Number(bom.qtdConsumida || 1);

      if (qtdNecessaria > saldoMP) {
        return res.status(400).json({
          success: false,
          error: `PRODUÇÃO BLOQUEADA: Matéria-prima insuficiente (${bom.codigoMP} - ${bom.materiaPrima}). Necessário: ${qtdNecessaria.toFixed(2)} | Disponível: ${saldoMP.toFixed(2)}.`,
        });
      }
    }
  }

  const dataAtual = new Date().toLocaleDateString("pt-BR");

  banco.movimentacoes.push({
    data: dataAtual,
    tipo,
    codigo: produto.codigo,
    produto: produto.descricao,
    ncm: produto.ncm || "-",
    qtd: quantidade,
    obs: obs || "Lançamento Web",
    valorUnit: produto.custo,
    valorTotal: quantidade * produto.custo,
  });

  if (isEntrada && produto.codigo.startsWith("PA-")) {
    const insumosBOM = (banco.estruturaBOM || []).filter(
      (b) => b.codigoPA.toUpperCase().trim() === codUpper,
    );
    insumosBOM.forEach((bom) => {
      const codMP = bom.codigoMP.toUpperCase().trim();
      const mp = banco.cadastros.find(
        (c) => c.codigo.toUpperCase().trim() === codMP,
      );
      const qtdBaixa = quantidade * Number(bom.qtdConsumida || 1);
      banco.movimentacoes.push({
        data: dataAtual,
        tipo: "Saída (Baixa BOM)",
        codigo: mp ? mp.codigo : bom.codigoMP,
        produto: mp ? mp.descricao : bom.materiaPrima,
        ncm: mp ? mp.ncm : "-",
        qtd: qtdBaixa,
        obs: `Baixa aut. produção de ${quantidade}x ${produto.codigo}`,
        valorUnit: mp ? mp.custo : 0,
        valorTotal: qtdBaixa * (mp ? mp.custo : 0),
      });
    });
  }

  registrarLog(
    banco,
    "Movimentação Web",
    `${tipo} de ${quantidade} no item ${produto.codigo}`,
  );

  salvarBanco(banco);
  io.emit("atualizacao_estoque", { success: true });
  res.json({ success: true });
});

// 3. Cadastrar / Editar Produto
app.post("/api/estoque/cadastrar-produto", (req, res) => {
  const banco = lerBanco();
  const { codigo, descricao, ncm, categoria, unidade, minimo, custo } =
    req.body;

  if (!codigo || !descricao) {
    return res
      .status(400)
      .json({ success: false, error: "Código e descrição são obrigatórios." });
  }

  const codUpper = codigo.toUpperCase().trim();
  const idx = banco.cadastros.findIndex(
    (c) => c.codigo.toUpperCase() === codUpper,
  );

  const itemData = {
    codigo: codUpper,
    descricao,
    ncm: ncm || "-",
    categoria: categoria || "Matéria-Prima",
    unidade: unidade || "KG",
    minimo: Number(minimo) || 0,
    custo: Number(custo) || 0,
  };

  if (idx >= 0) {
    banco.cadastros[idx] = itemData;
    registrarLog(
      banco,
      "Edição de Produto",
      `Produto ${itemData.codigo} atualizado.`,
    );
  } else {
    banco.cadastros.push(itemData);
    registrarLog(banco, "Novo Cadastro", `Produto ${itemData.codigo} criado.`);
  }

  salvarBanco(banco);
  io.emit("atualizacao_estoque", { success: true });
  res.json({ success: true });
});

// 4. Excluir Produto
app.delete("/api/estoque/excluir-produto/:codigo", (req, res) => {
  const banco = lerBanco();
  const codigo = req.params.codigo.toUpperCase().trim();

  const idx = banco.cadastros.findIndex(
    (c) => c.codigo.toUpperCase().trim() === codigo,
  );
  if (idx === -1) {
    return res
      .status(404)
      .json({ success: false, error: "Produto não encontrado." });
  }

  banco.cadastros.splice(idx, 1);

  if (banco.estruturaBOM) {
    banco.estruturaBOM = banco.estruturaBOM.filter(
      (b) =>
        b.codigoPA.toUpperCase().trim() !== codigo &&
        b.codigoMP.toUpperCase().trim() !== codigo,
    );
  }

  registrarLog(banco, "Exclusão de Produto", `Produto ${codigo} foi removido.`);
  salvarBanco(banco);
  io.emit("atualizacao_estoque", { success: true });
  res.json({ success: true });
});

// 5. Ajuste Manual de Inventário
app.post("/api/estoque/ajustar", (req, res) => {
  const banco = lerBanco();
  const { codigo, quantidadeFisica, motivo } = req.body;
  const qtdContada = Number(quantidadeFisica);

  if (isNaN(qtdContada) || qtdContada < 0) {
    return res
      .status(400)
      .json({ success: false, error: "Quantidade física inválida." });
  }

  if (!motivo || motivo.trim() === "") {
    return res
      .status(400)
      .json({ success: false, error: "O motivo do ajuste é obrigatório." });
  }

  const codUpper = codigo.toUpperCase().trim();
  const produto = banco.cadastros.find(
    (c) => c.codigo.toUpperCase().trim() === codUpper,
  );

  if (!produto) {
    return res
      .status(404)
      .json({ success: false, error: "Produto não encontrado." });
  }

  const totais = calcularSaldos(banco);
  const mov = totais[codUpper] || { entradas: 0, saidas: 0 };
  const saldoAtual = mov.entradas - mov.saidas;
  const diferenca = qtdContada - saldoAtual;

  if (diferenca === 0) {
    return res.status(400).json({
      success: false,
      error: "O saldo contado é idêntico ao saldo atual em sistema.",
    });
  }

  const dataAtual = new Date().toLocaleDateString("pt-BR");
  const tipoAjuste =
    diferenca > 0 ? "Entrada (Ajuste Inventário)" : "Saída (Ajuste Inventário)";
  const qtdAjuste = Math.abs(diferenca);

  banco.movimentacoes.push({
    data: dataAtual,
    tipo: tipoAjuste,
    codigo: produto.codigo,
    produto: produto.descricao,
    ncm: produto.ncm || "-",
    qtd: qtdAjuste,
    obs: `Ajuste de Inventário: ${motivo.trim()}`,
    valorUnit: produto.custo,
    valorTotal: qtdAjuste * produto.custo,
  });

  registrarLog(
    banco,
    "Ajuste de Inventário",
    `Ajuste no item ${produto.codigo}: saldo alterado de ${saldoAtual.toFixed(2)} para ${qtdContada.toFixed(2)}. Motivo: ${motivo}`,
  );

  salvarBanco(banco);
  io.emit("atualizacao_estoque", { success: true });
  res.json({
    success: true,
    saldoAnterior: saldoAtual,
    novoSaldo: qtdContada,
    diferenca,
  });
});

// 6. Cadastrar / Editar Item da Estrutura BOM
app.post("/api/estoque/cadastrar-bom", (req, res) => {
  const banco = lerBanco();
  const { codigoPA, codigoMP, qtdConsumida } = req.body;

  const pa = banco.cadastros.find(
    (c) =>
      c.codigo.toUpperCase().trim() === (codigoPA || "").toUpperCase().trim(),
  );
  const mp = banco.cadastros.find(
    (c) =>
      c.codigo.toUpperCase().trim() === (codigoMP || "").toUpperCase().trim(),
  );

  if (!pa || !mp) {
    return res.status(400).json({
      success: false,
      error: "Produto Acabado ou Matéria-Prima não encontrados.",
    });
  }

  if (!banco.estruturaBOM) banco.estruturaBOM = [];

  banco.estruturaBOM = banco.estruturaBOM.filter(
    (b) =>
      !(
        b.codigoPA.toUpperCase().trim() === pa.codigo.toUpperCase().trim() &&
        b.codigoMP.toUpperCase().trim() === mp.codigo.toUpperCase().trim()
      ),
  );

  banco.estruturaBOM.push({
    codigoPA: pa.codigo,
    produtoPA: pa.descricao,
    codigoMP: mp.codigo,
    materiaPrima: mp.descricao,
    qtdConsumida: Number(qtdConsumida) || 1,
    unidade: mp.unidade || "KG",
  });

  registrarLog(
    banco,
    "Estrutura BOM",
    `Vínculo de ${qtdConsumida} ${mp.unidade} de ${mp.codigo} para o item ${pa.codigo}`,
  );

  salvarBanco(banco);
  io.emit("atualizacao_estoque", { success: true });
  res.json({ success: true });
});

// 7. Backups em Excel
app.post("/api/estoque/gerar-backup-excel", async (req, res) => {
  const banco = lerBanco();
  const resPython = await chamarPython("atualizar_excel.py", {
    acao: "backup",
    banco,
  });

  if (resPython.success && resPython.arquivo) {
    const caminhoFicheiro = path.join(PASTA_ESTOQUES, resPython.arquivo);
    return res.download(caminhoFicheiro, resPython.arquivo);
  }

  res.status(500).json(resPython);
});

app.post("/api/estoque/gerar-relatorio-contador", async (req, res) => {
  const banco = lerBanco();
  const resPython = await chamarPython("atualizar_excel.py", {
    acao: "relatorio_contador",
    banco,
  });

  if (resPython.success && resPython.arquivo) {
    const caminhoFicheiro = path.join(PASTA_ESTOQUES, resPython.arquivo);
    res.setHeader("Content-Type", "application/pdf");
    return res.download(caminhoFicheiro, resPython.arquivo);
  }

  res.status(500).json(resPython);
});
// 8. Exportar Backup da Base em JSON
app.get("/api/estoque/exportar-json", (req, res) => {
  const banco = lerBanco();
  const dataFormatada = new Date().toISOString().slice(0, 10);
  const nomeFicheiro = `Backup_Banco_Estoque_${dataFormatada}.json`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nomeFicheiro}"`,
  );
  res.send(JSON.stringify(banco, null, 2));
});

// 9. Importar / Restaurar Backup JSON
app.post(
  "/api/estoque/importar-json",
  upload.single("arquivoBackup"),
  (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Nenhum arquivo enviado." });
      }

      const conteudoRaw = fs.readFileSync(req.file.path, "utf-8");
      const novoBanco = JSON.parse(conteudoRaw);

      // Validação da estrutura mínima do banco JSON
      if (!novoBanco.cadastros || !novoBanco.movimentacoes) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error:
            "Formato inválido. O arquivo JSON deve conter as tabelas de cadastros e movimentações.",
        });
      }

      registrarLog(
        novoBanco,
        "Restauração de Backup",
        `Base de dados restaurada via arquivo importado (${req.file.originalname}).`,
      );

      salvarBanco(novoBanco);
      fs.unlinkSync(req.file.path);

      io.emit("atualizacao_estoque", { success: true });
      res.json({ success: true, message: "Backup restaurado com sucesso!" });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res.status(500).json({
        success: false,
        error: "Erro ao importar backup JSON: " + err.message,
      });
    }
  },
);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SERVIDOR WEBSYSTEM ON EM http://localhost:${PORT}`);
  console.log(`====================================================`);
});
