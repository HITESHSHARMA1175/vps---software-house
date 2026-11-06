@echo off
title Innovation VPS Agent - Status & Live Logs
cd /d "%~dp0"

sc.exe query InnovationVpsAgent 2>nul
if %errorlevel% equ 0 (
    echo.
    echo ====================================================================
    echo   Innovation VPS Windows Service is INSTALLED in services.msc!
    echo ====================================================================
    sc.exe query InnovationVpsAgent
    echo.
) else if exist "%~dp0VpsAgent.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VpsAgent.ps1" -StatusService
)

if exist "%ProgramData%\InnovationWebWorks\VpsAgent\agent.log" (
    echo.
    echo === LAST 15 LOG LINES ===
    powershell -NoProfile -Command "Get-Content '%ProgramData%\InnovationWebWorks\VpsAgent\agent.log' -Tail 15"
)

echo.
pause
