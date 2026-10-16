@echo off
title Servidor StockFlow Pro - RT Esquadrias
chcp 65001 > nul
echo ====================================================
echo 🚀 VERIFICANDO E CONFIGURANDO AMBIENTE STOCKFLOW PRO
echo ====================================================

rem 1. Verificar e Criar Ambiente Virtual Python
if not exist ".venv" (
    echo 📦 Criando ambiente virtual Python...
    python -m venv .venv
    if errorlevel 1 (
        echo ❌ Erro ao criar .venv. Verifique se o Python esta instalado no PATH.
        pause
        exit /b
    )
)

rem 2. Instalar Bibliotecas do Python no .venv
echo 🐍 Verificando dependencias Python...
".venv\Scripts\python.exe" -m pip install --upgrade pip > nul
".venv\Scripts\pip.exe" install openpyxl pandas > nul

rem 3. Instalar Dependencias do Node.js
if not exist "node_modules" (
    echo 📦 Pasta node_modules nao encontrada. Instalando dependencias Node.js...
    call npm install
) else (
    echo 📦 Verificando dependencias adicionais...
    call npm install
)

rem 4. Garantir que as pastas de backups e uploads existam
if not exist "Estoques" (
    mkdir Estoques
)
if not exist "uploads" (
    mkdir uploads
)

echo.
echo ====================================================
echo ✅ AMBIENTE PRONTO! INICIANDO SERVIDOR...
echo ====================================================
echo.

rem 5. Iniciar o Servidor Node.js
node server.js
pause