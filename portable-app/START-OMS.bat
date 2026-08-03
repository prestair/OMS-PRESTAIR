@echo off
title OMS Prestair Systems LLP
echo ============================================
echo   OMS - PRESTAIR SYSTEMS LLP
echo   Starting Server...
echo ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo Download the LTS version and install it.
    echo After installation, restart this file.
    pause
    exit /b 1
)

:: Start server in background
start /b node server/index.js

:: Wait for server to start
echo Waiting for server to start...
timeout /t 3 /nobreak >nul

:: Open browser
echo Opening OMS Dashboard in browser...
start http://localhost:5000

echo.
echo ============================================
echo   Server running on http://localhost:5000
echo   DO NOT CLOSE THIS WINDOW!
echo   Close this window to stop the server.
echo ============================================
echo.

:: Keep window open
node server/index.js
