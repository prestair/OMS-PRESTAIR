@echo off
title OMS - Prestair Systems LLP
echo ========================================
echo   OMS - Prestair Systems LLP
echo   Starting servers...
echo ========================================
cd /d "%~dp0"
start /B node server/index.js
timeout /t 3 /nobreak >nul
start http://localhost:3000
node node_modules/vite/bin/vite.js --port 3000
