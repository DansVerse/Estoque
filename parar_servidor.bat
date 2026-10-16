@echo off
title Encerrar StockFlow Pro
color 0C

echo A desligar o servidor StockFlow Pro...
taskkill /F /IM node.exe >nul 2>&1

echo [OK] Servidor desligado com sucesso!
timeout /t 2 >nul