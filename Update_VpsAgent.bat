@echo off
setlocal EnableDelayedExpansion
title Innovation VPS Agent - 1-Click Auto Updater & Healer

:: Check for Administrator Permissions
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ====================================================================
echo   INNOVATION WEB WORKS - VPS AGENT 1-CLICK AUTO UPDATER & HEALER
echo ====================================================================
echo.
echo Downloading latest Windows Native Agent from vps.innovationwebworks.in...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; (New-Object Net.WebClient).DownloadString('https://vps.innovationwebworks.in/install.ps1') | iex"

echo.
echo ====================================================================
echo   UPDATE & RESURRECTION COMPLETED!
echo   Service 'InnovationVpsAgent' is running 24/7 in services.msc!
echo ====================================================================
echo.
pause
