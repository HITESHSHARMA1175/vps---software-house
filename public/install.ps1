param (
    [Parameter(Mandatory=$false)]
    [string]$ServerId = ""
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
$ErrorActionPreference = "Stop"

$portalBase = "https://vps.innovationwebworks.in"

Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host "   INNOVATION VPS AGENT - UNIVERSAL 1-CLICK BOOTSTRAP INSTALLER          " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Cyan

# 1. Check for Administrator Privileges
$isAdmin = $false
try {
    $curUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $curPrinc = New-Object Security.Principal.WindowsPrincipal($curUser)
    $isAdmin = $curPrinc.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {
    $isAdmin = $false
}

if (-not $isAdmin) {
    Write-Host "`n [!] ERROR: Administrator Privileges Required!" -ForegroundColor Red
    Write-Host " Please open PowerShell AS ADMINISTRATOR and re-run.`n" -ForegroundColor Yellow
    return
}

# 2. Intelligent Auto-Detection of VPS Public IP and Matching Server
if (-not $ServerId -or $ServerId -eq "auto" -or $ServerId -eq "srv-node-1") {
    Write-Host " [*] Auto-detecting VPS network identity and server node..." -ForegroundColor Gray
    try {
        $wcDetect = New-Object System.Net.WebClient
        $detectJson = $wcDetect.DownloadString("$portalBase/api/agent/detect-server")
        if ($detectJson) {
            $det = $detectJson | ConvertFrom-Json
            if ($det.matchedServerId) {
                $ServerId = $det.matchedServerId
                Write-Host " [+] Auto-detected Server Node from IP ($($det.clientIp)): $ServerId ($($det.serverName))" -ForegroundColor Green
            } elseif ($det.clientIp) {
                $ServerId = "$($det.clientIp):18526"
                Write-Host " [+] Auto-detected Public IP: $ServerId" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host " [!] Auto-detect notice: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

if (-not $ServerId) {
    # Fallback to local network adapter IPv4
    try {
        $locIp = (Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPEnabled -and $_.IPAddress }).IPAddress | Where-Object { $_ -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' -and $_ -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1
        if ($locIp) { $ServerId = "$locIp:18526" }
    } catch {}
}

if (-not $ServerId) {
    $ServerId = "auto"
}

Write-Host " [*] Target Server ID : $ServerId" -ForegroundColor White
Write-Host " [*] Portal Endpoint  : $portalBase" -ForegroundColor White

$dir = "$env:ProgramData\InnovationWebWorks\VpsAgent"
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# Add Defender Exclusion early
try {
    if (Get-Command Add-MpPreference -ErrorAction SilentlyContinue) {
        Add-MpPreference -ExclusionPath $dir -ErrorAction SilentlyContinue
        Add-MpPreference -ExclusionProcess "powershell.exe" -ErrorAction SilentlyContinue
        Add-MpPreference -ExclusionProcess "InnovationVpsAgent.exe" -ErrorAction SilentlyContinue
    }
} catch {}

# Stop service and any existing processes so binary is not locked on disk
try {
    Stop-Service -Name "InnovationVpsAgent" -Force -ErrorAction SilentlyContinue
    Get-Process -Name "InnovationVpsAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

$exeDest = "$dir\InnovationVpsAgent.exe"
$scriptPath = "$dir\VpsAgent.ps1"
$downloadedBinary = $false

Write-Host " [*] Downloading Native Windows Service Agent..." -ForegroundColor Cyan
try {
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InnovationVpsBootstrap/3.0")
    $wc.DownloadFile("$portalBase/InnovationVpsAgent.exe", $exeDest)
    if (Test-Path $exeDest) {
        if ((Get-Item $exeDest).Length -gt 15000) {
            $downloadedBinary = $true
            Write-Host " [+] Downloaded Native Windows Service Binary" -ForegroundColor Green
        }
    }
} catch {
    Write-Host " [!] Binary download notice: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Fallback: Compile on VPS using Microsoft C# compiler if needed
if (-not $downloadedBinary) {
    try {
        $cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
        if (-not (Test-Path $cscPath)) { $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
        if (Test-Path $cscPath) {
            Write-Host " [*] Compiling Native Windows Service on VPS via csc.exe..." -ForegroundColor Cyan
            $csDest = "$dir\VpsAgentService.cs"
            $wcCs = New-Object System.Net.WebClient
            $wcCs.DownloadFile("$portalBase/VpsAgentService.cs", $csDest)
            if (Test-Path $csDest) {
                & $cscPath /target:exe /out:"$exeDest" /optimize+ /reference:System.ServiceProcess.dll,System.Management.dll,System.DirectoryServices.dll,System.Web.Extensions.dll "$csDest" *>$null
                if (Test-Path $exeDest) {
                    $downloadedBinary = $true
                    Write-Host " [+] Compiled InnovationVpsAgent.exe on VPS successfully!" -ForegroundColor Green
                }
            }
        }
    } catch {}
}

# Download VpsAgent.ps1 for secondary tooling & backward compatibility
try {
    $wcPs = New-Object System.Net.WebClient
    $wcPs.DownloadFile("$portalBase/VpsAgent.ps1?serverId=" + [System.Uri]::EscapeDataString($ServerId), $scriptPath)
} catch {}

# Clean up older Scheduled Tasks & rogue file conflicts
if (Test-Path "C:\Program" -PathType Leaf) {
    try { Rename-Item "C:\Program" "C:\Program_conflict_bak" -Force } catch {}
}
try {
    & schtasks.exe /end /tn "InnovationVpsAgentWorker" 2>$null
    & schtasks.exe /delete /tn "InnovationVpsAgentWorker" /f 2>$null
    & schtasks.exe /delete /tn "InnovationVpsAgentGuardian" /f 2>$null
} catch {}

if ($downloadedBinary -and (Test-Path $exeDest)) {
    Write-Host " [*] Installing Native Windows Service in services.msc..." -ForegroundColor Cyan
    & "$exeDest" -install -serverId "$ServerId" -portal "$portalBase"

    # Fix any ImagePath quotes directly in Registry (eliminates Error 193: 0xc1)
    try {
        Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\InnovationVpsAgent" -Name "ImagePath" -Value "`"$exeDest`"" -Type ExpandString -Force -ErrorAction SilentlyContinue
    } catch {}

    # Configure SCM Crash-Recovery: Reset fail counter after 86400s (24h). 1s on 1st, 2s on 2nd, 5s on subsequent.
    try {
        & sc.exe failure InnovationVpsAgent reset= 86400 actions= restart/1000/restart/2000/restart/5000 *>$null
        & sc.exe failureflag InnovationVpsAgent 1 *>$null
    } catch {}

    # Setup 1-Minute Guardian Watchdog Task as secondary safety net
    try {
        & schtasks.exe /create /tn "InnovationVpsAgentGuardian" /tr "cmd.exe /c net start InnovationVpsAgent" /sc minute /mo 1 /ru "NT AUTHORITY\SYSTEM" /f /rl HIGHEST *>$null
    } catch {}

    Start-Sleep -Seconds 2

    # Attempt start if not already running
    $svc = Get-Service -Name "InnovationVpsAgent" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
        try { Start-Service -Name "InnovationVpsAgent" -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 1
        $svc = Get-Service -Name "InnovationVpsAgent" -ErrorAction SilentlyContinue
    }

    if ($svc -and $svc.Status -eq "Running") {
        Write-Host ""
        Write-Host "==========================================================================" -ForegroundColor Green
        Write-Host " [OK] SUCCESS: INNOVATION VPS SERVICE INSTALLED & RUNNING IN SERVICES.MSC!" -ForegroundColor Green
        Write-Host " Service Name  : InnovationVpsAgent                                      " -ForegroundColor White
        Write-Host " Display Name  : Innovation VPS 24/7 Enterprise Agent                    " -ForegroundColor White
        Write-Host " Startup Type  : Automatic (Starts at boot before user login)            " -ForegroundColor White
        Write-Host " Crash Recovery: 1-Second Auto-Resurrection in Windows SCM!              " -ForegroundColor Yellow
        Write-Host " Target Server : $ServerId                                               " -ForegroundColor White
        Write-Host " Log File      : $dir\agent.log                                          " -ForegroundColor Gray
        Write-Host " Portal Status : Check your management portal in 5-10 seconds!           " -ForegroundColor Cyan
        Write-Host "==========================================================================" -ForegroundColor Green
        Write-Host " [OK] ALL DONE: Windows Service runs 24/7. Survives all logoffs and reboots!" -ForegroundColor Yellow
        Write-Host " [OK] You can now safely close this window and disconnect from RDP." -ForegroundColor Cyan
        Write-Host "==========================================================================" -ForegroundColor Green
        return
    }
}

# Fallback to PowerShell
if (Test-Path $scriptPath) {
    Write-Host " [*] Fallback: Starting PowerShell background worker..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $scriptPath -InstallService -ServerId "$ServerId"
}
