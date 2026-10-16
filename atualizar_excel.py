import sys
import json
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os
from datetime import datetime

DIRETORIO_BASE = os.path.dirname(os.path.abspath(__file__))
PASTA_ESTOQUES = os.path.join(DIRETORIO_BASE, 'Estoques')
CAMINHO_MODELO = os.path.join(DIRETORIO_BASE, 'Estoque_Modelo.xlsx')

if not os.path.exists(PASTA_ESTOQUES):
    os.makedirs(PASTA_ESTOQUES)

def garantir_aba(wb, nome_aba):
    if nome_aba in wb.sheetnames:
        return wb[nome_aba]
    return wb.create_sheet(title=nome_aba)

def aplicar_estilo_cabecalho(ws, linha, cabecalhos, azul_escuro="1F4E78"):
    fonte_branca = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    fill_azul = PatternFill(start_color=azul_escuro, end_color=azul_escuro, fill_type="solid")
    
    for col_idx, texto in enumerate(cabecalhos, start=1):
        cell = ws.cell(row=linha, column=col_idx, value=texto)
        cell.font = fonte_branca
        cell.fill = fill_azul
        cell.alignment = Alignment(horizontal="center", vertical="center")

def gerar_backup(banco):
    # Se o modelo pré-formatado existir, carrega-o; caso contrário, cria do zero.
    if os.path.exists(CAMINHO_MODELO):
        wb = openpyxl.load_workbook(CAMINHO_MODELO)
    else:
        wb = openpyxl.Workbook()

    # -------------------------------------------------------------
    # 1. ABA CADASTROS
    # -------------------------------------------------------------
    ws_cad = garantir_aba(wb, 'Cadastros')
    
    # Se não houver cabeçalhos criados no modelo, cria a estrutura padrão
    if ws_cad.max_row < 3 or ws_cad.cell(3, 1).value is None:
        ws_cad.cell(1, 1, "BASE MODELO - CADASTRO DE PRODUTOS E INSUMOS").font = Font(name="Arial", size=12, bold=True, color="1F4E78")
        cabecalhos_cad = ["Código", "Descrição do Item", "NCM", "Categoria", "Unidade", "Est. Mínimo", "Custo Unitário (R$)"]
        aplicar_estilo_cabecalho(ws_cad, 3, cabecalhos_cad)

    # Limpa dados antigos da linha 4 em diante
    for r in range(4, max(ws_cad.max_row + 1, 100)):
        for c in range(1, 8):
            ws_cad.cell(row=r, column=c, value=None)

    for idx, item in enumerate(banco.get('cadastros', []), start=4):
        ws_cad.cell(row=idx, column=1, value=item.get('codigo', ''))
        ws_cad.cell(row=idx, column=2, value=item.get('descricao', ''))
        ws_cad.cell(row=idx, column=3, value=item.get('ncm', '-'))
        ws_cad.cell(row=idx, column=4, value=item.get('categoria', 'Matéria-Prima'))
        ws_cad.cell(row=idx, column=5, value=item.get('unidade', 'KG'))
        ws_cad.cell(row=idx, column=6, value=float(item.get('minimo', 0)))
        ws_cad.cell(row=idx, column=7, value=float(item.get('custo', 0)))

    # -------------------------------------------------------------
    # 2. ABA MOVIMENTAÇÕES
    # -------------------------------------------------------------
    ws_mov = garantir_aba(wb, 'Movimentacoes')
    if ws_mov.max_row < 1 or ws_mov.cell(1, 1).value is None:
        cabecalhos_mov = ["Data", "Tipo", "Código", "Produto", "NCM", "Quantidade", "Observação", "Custo Unit. (R$)", "Valor Total (R$)"]
        aplicar_estilo_cabecalho(ws_mov, 1, cabecalhos_mov)

    for r in range(2, max(ws_mov.max_row + 1, 100)):
        for c in range(1, 10):
            ws_mov.cell(row=r, column=c, value=None)

    for idx, mov in enumerate(banco.get('movimentacoes', []), start=2):
        ws_mov.cell(row=idx, column=1, value=mov.get('data', ''))
        ws_mov.cell(row=idx, column=2, value=mov.get('tipo', ''))
        ws_mov.cell(row=idx, column=3, value=mov.get('codigo', ''))
        ws_mov.cell(row=idx, column=4, value=mov.get('produto', ''))
        ws_mov.cell(row=idx, column=5, value=mov.get('ncm', '-'))
        ws_mov.cell(row=idx, column=6, value=float(mov.get('qtd', 0)))
        ws_mov.cell(row=idx, column=7, value=mov.get('obs', ''))
        ws_mov.cell(row=idx, column=8, value=float(mov.get('valorUnit', 0)))
        ws_mov.cell(row=idx, column=9, value=float(mov.get('valorTotal', 0)))

    # -------------------------------------------------------------
    # 3. ABA ESTRUTURA BOM
    # -------------------------------------------------------------
    ws_bom = garantir_aba(wb, 'Estrutura_BOM')
    if ws_bom.max_row < 3 or ws_bom.cell(3, 1).value is None:
        ws_bom.cell(1, 1, "BASE MODELO - FICHA TÉCNICA DE PRODUÇÃO (BOM)").font = Font(name="Arial", size=12, bold=True, color="1F4E78")
        cabecalhos_bom = ["Código PA", "Produto PA", "Código MP", "Matéria-Prima", "Qtd Consumida", "Unidade"]
        aplicar_estilo_cabecalho(ws_bom, 3, cabecalhos_bom)

    for r in range(4, max(ws_bom.max_row + 1, 50)):
        for c in range(1, 7):
            ws_bom.cell(row=r, column=c, value=None)

    for idx, bom in enumerate(banco.get('estruturaBOM', []), start=4):
        ws_bom.cell(row=idx, column=1, value=bom.get('codigoPA', ''))
        ws_bom.cell(row=idx, column=2, value=bom.get('produtoPA', ''))
        ws_bom.cell(row=idx, column=3, value=bom.get('codigoMP', ''))
        ws_bom.cell(row=idx, column=4, value=bom.get('materiaPrima', ''))
        ws_bom.cell(row=idx, column=5, value=float(bom.get('qtdConsumida', 0)))
        ws_bom.cell(row=idx, column=6, value=bom.get('unidade', 'KG'))

    # Autoajuste de largura de colunas em todas as abas
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Nomeia o arquivo final de exportação mantendo a extensão limpa .xlsx
    nome_backup = f"Backup_Estoque_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    caminho_saida = os.path.join(PASTA_ESTOQUES, nome_backup)
    wb.save(caminho_saida)
    wb.close()

    return {"success": True, "arquivo": nome_backup}

if __name__ == '__main__':
    try:
        raw = sys.stdin.read()
        if raw:
            payload = json.loads(raw)
            banco = payload.get('banco', payload)
            print(json.dumps(gerar_backup(banco)))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))