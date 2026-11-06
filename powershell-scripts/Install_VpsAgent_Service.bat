@echo off
setlocal EnableDelayedExpansion
title Innovation VPS 24/7 Background Agent Installer

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
echo   INNOVATION WEB WORKS - 24/7 VPS BACKGROUND AGENT INSTALLER
echo ====================================================================
echo.
echo Installing Innovation VPS Agent as a permanent 24/7 Background Task...
echo User: NT AUTHORITY\SYSTEM (Session 0)
echo.
echo NOTE: Even when you LOG OFF from RDP or close this window,
echo the agent WILL CONTINUE TO RUN in the background 24/7!
echo ====================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VpsAgent.ps1" -InstallService

echo.
echo ====================================================================
echo   INSTALLATION COMPLETED!
echo   You can now safely LOG OFF or DISCONNECT from your RDP session.
echo ====================================================================
echo.
pause
