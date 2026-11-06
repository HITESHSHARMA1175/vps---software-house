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

:: Add Defender exclusion early to prevent binary quarantine
powershell -Command "try { Add-MpPreference -ExclusionPath '%ProgramData%\InnovationWebWorks\VpsAgent' -ErrorAction SilentlyContinue } catch {}" >nul 2>&1

:: Clean up any rogue C:\Program conflict file
if exist "C:\Program" ren "C:\Program" "C:\Program_conflict_bak" >nul 2>&1

if exist "%~dp0InnovationVpsAgent.exe" (
    "%~dp0InnovationVpsAgent.exe" -install
) else if exist "%ProgramData%\InnovationWebWorks\VpsAgent\InnovationVpsAgent.exe" (
    "%ProgramData%\InnovationWebWorks\VpsAgent\InnovationVpsAgent.exe" -install
) else if exist "%~dp0VpsAgent.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VpsAgent.ps1" -InstallService
) else if exist "%ProgramData%\InnovationWebWorks\VpsAgent\VpsAgent.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ProgramData%\InnovationWebWorks\VpsAgent\VpsAgent.ps1" -InstallService
) else (
    echo [*] Downloading and installing latest VpsAgent engine...
    powershell -ExecutionPolicy Bypass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; (New-Object Net.WebClient).DownloadString('https://vps.innovationwebworks.in/install.ps1') | iex"
)

:: Ensure clean registry ImagePath (fixes Error 193: 0xc1)
powershell -Command "try { Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\InnovationVpsAgent' -Name 'ImagePath' -Value '\"%ProgramData%\InnovationWebWorks\VpsAgent\InnovationVpsAgent.exe\"' -Type ExpandString -Force -ErrorAction SilentlyContinue; Start-Service InnovationVpsAgent -ErrorAction SilentlyContinue } catch {}" >nul 2>&1

echo.
echo ====================================================================
echo   INSTALLATION COMPLETED!
echo   You can now safely LOG OFF or DISCONNECT from your RDP session.
echo ====================================================================
echo.
pause
