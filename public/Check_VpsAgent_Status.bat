@echo off
title Innovation VPS Agent - Status & Live Logs
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VpsAgent.ps1" -StatusService

echo.
pause
