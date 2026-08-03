@echo off
title OMS Prestair Systems LLP - Setup
color 0A
echo ============================================
echo   OMS - PRESTAIR SYSTEMS LLP
echo ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  Node.js not found! Installing...
    echo  Downloading Node.js installer...
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.15.0/node-v20.15.0-x64.msi' -OutFile '%TEMP%\node-installer.msi'"
    echo  Running installer...
    msiexec /i "%TEMP%\node-installer.msi" /passive
    echo  Node.js installed! Please RESTART this file.
    pause
    exit /b
)

echo  Node.js found: 
node --version
echo.
echo  Starting OMS Server...
echo.

:: Start server
start /b node server/index.js

:: Wait for server
ping 127.0.0.1 -n 4 >nul

:: Open browser
start http://localhost:5000

echo ============================================
echo   Server: http://localhost:5000
echo   DO NOT CLOSE THIS WINDOW!
echo ============================================
echo.

:: Keep window open (restart server if it crashes)
:loop
node server/index.js
echo  Server stopped. Restarting...
timeout /t 2 /nobreak >nul
goto loop
