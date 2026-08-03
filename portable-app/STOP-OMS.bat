@echo off
echo Stopping OMS Server...
taskkill /F /IM node.exe >nul 2>nul
echo Server stopped.
timeout /t 2 /nobreak >nul
