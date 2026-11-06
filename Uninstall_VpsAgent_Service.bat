@echo off
setlocal EnableDelayedExpansion
title Innovation VPS 24/7 Agent Uninstaller

:: Check for Administrator Permissions
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ====================================================================
    echo   Requesting Administrator Privileges...
    echo ====================================================================
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ====================================================================
echo   INNOVATION WEB WORKS - UNINSTALL VPS BACKGROUND AGENT
echo ====================================================================
echo.

net stop InnovationVpsAgent 2>nul
sc delete InnovationVpsAgent 2>nul
if exist "%ProgramData%\InnovationWebWorks\VpsAgent\InnovationVpsAgent.exe" (
    "%ProgramData%\InnovationWebWorks\VpsAgent\InnovationVpsAgent.exe" -uninstall
)
if exist "%~dp0VpsAgent.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VpsAgent.ps1" -UninstallService
)

echo.
pause
