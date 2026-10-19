@echo off
title Servidor StockFlow Pro - RT Esquadrias
chcp 65001 > nul
echo ====================================================
echo CONFIGURANDO E INICIANDO STOCKFLOW PRO
echo ====================================================

rem 1. Verificar se o Node.js esta instalado no sistema
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado neste computador!
    echo Baixando instalador oficial do Node.js...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi' -OutFile '%temp%\node_installer.msi'"
    echo Instalando o Node.js em segundo plano...
    msiexec /i "%temp%\node_installer.msi" /passive /norestart
    echo Node.js instalado com sucesso!
    set "PATH=%ProgramFiles%\nodejs\;%PATH%"
    set "PATH=%AppData%\npm;%PATH%"
)

rem 2. Verificar se o Python esta instalado
where python >nul 2>nul
if errorlevel 1 (
    echo ERRO: Python nao encontrado! Instale o Python antes de continuar.
    pause
    exit /b
)

rem 3. Criar Ambiente Virtual Python
if not exist ".venv" (
    echo Criando ambiente virtual Python...
    python -m venv .venv
    if errorlevel 1 (
        echo Erro ao criar .venv. Verifique a instalacao do Python.
        pause
        exit /b
    )
)

rem 4. Instalar Dependencias do Python no ambiente virtual
echo Verificando e instalando bibliotecas Python...
".venv\Scripts\python.exe" -m pip install --upgrade pip > nul
".venv\Scripts\pip.exe" install openpyxl pandas > nul

rem 5. Instalar Dependencias do Node.js
if not exist "node_modules" (
    echo Instalando pacotes do Node.js...
    call npm install
) else (
    echo Verificando atualizacoes dos pacotes do Node.js...
    call npm install
)

rem 6. Garantir que as pastas locais necessarias existam
if not exist "Estoques" (
    mkdir Estoques
)
if not exist "uploads" (
    mkdir uploads
)

echo.
echo ====================================================
echo AMBIENTE CONFIGURADO COM SUCESSO!
echo INICIANDO SERVIDOR EM http://localhost:3000
echo ====================================================
echo.

rem 7. Iniciar o Servidor Node.js
node server.js
pause
