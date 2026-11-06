@echo off
setlocal EnableDelayedExpansion
title Innovation VPS Agent - 1-Click Auto Updater

:: Check for Administrator Permissions
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ====================================================================
echo   INNOVATION WEB WORKS - VPS AGENT 1-CLICK AUTO UPDATER
echo ====================================================================
echo.
echo Downloading latest VpsAgent.ps1 from vps.innovationwebworks.in...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $dir = \"$env:ProgramData\InnovationWebWorks\VpsAgent\"; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }; Invoke-WebRequest -Uri 'https://vps.innovationwebworks.in/VpsAgent.ps1' -OutFile \"$dir\VpsAgent.ps1\" -UseBasicParsing; Write-Host 'Downloaded successfully!' -ForegroundColor Green"

echo.
echo Restarting 24/7 Background System Service...
schtasks.exe /end /tn InnovationVpsAgentWorker >nul 2>&1
schtasks.exe /run /tn InnovationVpsAgentWorker >nul 2>&1

echo.
echo ====================================================================
echo   UPDATE COMPLETED!
echo   The VPS Agent has been updated and is running 24/7 in the background!
echo ====================================================================
echo.
pause
