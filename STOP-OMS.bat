@echo off
echo Stopping OMS servers...
taskkill /F /IM node.exe 2>nul
echo Done.
timeout /t 2
