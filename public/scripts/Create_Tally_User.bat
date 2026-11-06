@echo off
:: ============================================================================
:: One-Click Tally & TSplus User Provisioning Launcher (Auto-Elevates to Admin)
:: ============================================================================
title Tally & TSplus Provisioning Launcher

:: Check for administrative privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run_powershell
) else (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:run_powershell
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create_Tally_User.ps1"
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Provisioning encountered an issue. Press any key to exit.
    pause >nul
)
exit /b
