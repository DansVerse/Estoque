@echo off
title Servidor StockFlow Pro - RT Esquadrias
chcp 65001 > nul
echo ====================================================
echo VERIFICANDO E CONFIGURANDO AMBIENTE STOCKFLOW PRO
echo ====================================================

rem 1. Verificar se o Node.js esta instalado no Windows
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao foi encontrado neste computador!
    echo Baixando o instalador do Node.js automaticamente...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi' -OutFile '%temp%\node_installer.msi'"
    echo Instalando o Node.js em segundo plano...
    msiexec /i "%temp%\node_installer.msi" /passive /norestart
    echo Node.js instalado com sucesso!
    set "PATH=%ProgramFiles%\nodejs\;%PATH%"
    set "PATH=%AppData%\npm;%PATH%"
)

rem 2. Verificar e Criar Ambiente Virtual Python
if not exist ".venv" (
    echo Criando ambiente virtual Python...
    python -m venv .venv
    if errorlevel 1 (
        echo Erro ao criar .venv. Verifique se o Python esta instalado.
        pause
        exit /b
    )
)

rem 3. Instalar Bibliotecas do Python no .venv
echo Verificando dependencias do Python...
".venv\Scripts\python.exe" -m pip install --upgrade pip > nul
".venv\Scripts\pip.exe" install openpyxl pandas > nul

rem 4. Instalar Dependencias do Node.js
if not exist "node_modules" (
    echo Pasta node_modules nao encontrada. Instalando dependencias Node.js...
    call npm install
) else (
    echo Verificando dependencias Node.js...
    call npm install
)

rem 5. Garantir que as pastas locais existam
if not exist "Estoques" (
    mkdir Estoques
)
if not exist "uploads" (
    mkdir uploads
)

echo.
echo ====================================================
echo AMBIENTE PRONTO! INICIANDO SERVIDOR...
echo ====================================================
echo.

rem 6. Iniciar o Servidor Node.js
node server.js
pause