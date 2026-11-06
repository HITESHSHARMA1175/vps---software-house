<#
.SYNOPSIS
    Innovation Web Works - Lightweight Windows VPS Monitoring, User Activity & Remote Management Agent
.DESCRIPTION
    Monitors Windows user session logins/logouts, active and disconnected RDP sessions,
    RAM usage metrics, and multi-drive disk statistics.
    Executes automated remote administrative operations dispatched from the VPS Web Portal:
      1. User Password Sync (Set-LocalUser / net user)
      2. User Account Disable / Enable (Disable-LocalUser / Enable-LocalUser)
      3. Session Force Logoff / Termination (logoff.exe / rwinsta.exe)
      4. Zero-Trust Tally Client Provisioning with NTFS ACL Isolation
    Runs seamlessly as a 24/7 background system service under NT AUTHORITY\SYSTEM in Session 0,
    continuing execution uninterrupted even when Administrators log off their RDP sessions or disconnect.
    Communicates securely via HTTPS with API token authentication. Includes an offline queue retry mechanism.
    REQUIREMENT COMPLIANCE: Standalone Agent with outbound HTTPS polling. Zero open inbound ports required.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory=$false)]
    [string]$ServerId = "103.66.19.244:18526",

    [Parameter(Mandatory=$false)]
    [string]$ServerToken = "vps_sec_token_default",

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://vps.innovationwebworks.in/api/agent/telemetry",

    [Parameter(Mandatory=$false)]
    [int]$IntervalSeconds = 5,

    [Parameter(Mandatory=$false)]
    [switch]$InstallService,

    [Parameter(Mandatory=$false)]
    [switch]$UninstallService,

    [Parameter(Mandatory=$false)]
    [switch]$StatusService,

    [Parameter(Mandatory=$false)]
    [switch]$RestartService,

    [Parameter(Mandatory=$false)]
    [switch]$RunWorker,

    [Parameter(Mandatory=$false)]
    [switch]$Foreground
)

# Enable TLS 1.2 / TLS 1.1 / TLS (Works across .NET 3.5, 4.0, 4.5, 4.8+)
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12,Tls11,Tls'
} catch {
    [Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192
}
# Enforce native Windows root CA trust validation (ServerCertificateValidationCallback default)

# Compatibility Shim: Support Get-CimInstance on Windows Server 2008 R2 (PowerShell 2.0 uses Get-WmiObject)
if (-not (Get-Command Get-CimInstance -ErrorAction SilentlyContinue)) {
    function Get-CimInstance {
        param(
            [Parameter(Position=0)][string]$ClassName,
            [string]$Filter = "",
            [object]$ErrorAction
        )
        if ($Filter) {
            Get-WmiObject -Class $ClassName -Filter $Filter -ErrorAction SilentlyContinue
        } else {
            Get-WmiObject -Class $ClassName -ErrorAction SilentlyContinue
        }
    }
}

# System Service Paths & Identifiers
$TaskName            = "InnovationVpsAgentWorker"
$GuardianTaskName    = "InnovationVpsAgentGuardian"
$AgentInstallDir     = "$env:ProgramData\InnovationWebWorks\VpsAgent"
$InstalledScriptPath = "$AgentInstallDir\VpsAgent.ps1"
$ConfigFile          = "$AgentInstallDir\agent-config.json"
$LogFilePath         = "$AgentInstallDir\agent.log"
$QueueFilePath       = "$AgentInstallDir\VpsAgentQueue.json"
$StateFilePath       = "$AgentInstallDir\VpsAgentState.json"

function Write-AgentLog {
    param (
        [string]$Message,
        [string]$Level = "INFO",
        $Color = "White"
    )
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$ts] [$Level] $Message"

    try {
        if ([Environment]::UserInteractive) {
                $c = "$Color"
        if ($c -like "*Yellow*") { $c = "Yellow" }
        elseif ($c -like "*Green*") { $c = "Green" }
        elseif ($c -like "*Red*") { $c = "Red" }
        elseif ($c -like "*Cyan*") { $c = "Cyan" }
        elseif ($c -like "*Magenta*") { $c = "Magenta" }
        elseif ($c -like "*Gray*") { $c = "Gray" }
        elseif ($c -like "*Blue*") { $c = "Blue" }
        else { $c = "White" }
        Write-Host $logLine -ForegroundColor $c
        }
    } catch {}

    try {
        if (-not (Test-Path $AgentInstallDir)) {
            New-Item -ItemType Directory -Path $AgentInstallDir -Force | Out-Null
        }
        if (Test-Path $LogFilePath) {
            $logItem = Get-Item $LogFilePath -ErrorAction SilentlyContinue
            if ($logItem -and $logItem.Length -gt 10MB) {
                $oldLog = "$AgentInstallDir\agent.log.old"
                Move-Item -Path $LogFilePath -Destination $oldLog -Force -ErrorAction SilentlyContinue
            }
        }
        [System.IO.File]::AppendAllText($LogFilePath, "$logLine`r`n", [System.Text.Encoding]::UTF8)
    } catch {}
}

function Test-IsAdmin {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Get-VpsServiceStatus {
    param ([switch]$Quiet)

    $taskState = "Not Installed"
    try {
        if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
            $taskObj = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            if ($taskObj) {
                $taskState = $taskObj.State.ToString()
            }
        } else {
            $queryOut = & schtasks.exe /query /tn $TaskName 2>$null
            if ($queryOut) {
                $taskState = "Registered"
            }
        }
    } catch {}

    $procs = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%VpsAgent%' AND CommandLine LIKE '%RunWorker%'" -ErrorAction SilentlyContinue
    $procCount = if ($procs) { @($procs).Count } else { 0 }
    $pids = if ($procs) { (@($procs) | ForEach-Object { $_.ProcessId }) -join ", " } else { "None" }

    $statusResult = [PSCustomObject]@{
        TaskName       = $TaskName
        TaskState      = $taskState
        ActiveWorkerPIDs = $pids
        Running        = ($procCount -gt 0)
        Status         = if ($procCount -gt 0) { "Running 24/7 (Background Session 0)" } elseif ($taskState -ne "Not Installed") { "Installed ($taskState, Inactive)" } else { "Not Installed" }
    }

    if (-not $Quiet) {
        Write-Host "`n==========================================================================" -ForegroundColor Cyan
        Write-Host "   INNOVATION VPS AGENT - SERVICE STATUS                                  " -ForegroundColor Yellow
        Write-Host "==========================================================================" -ForegroundColor Cyan
        Write-Host " Task Name     : $TaskName"
        Write-Host " Task State    : $taskState"
        $statusColor = if ($procCount -gt 0) { "Green" } else { "Yellow" }
        Write-Host " Service Status: $($statusResult.Status)" -ForegroundColor $statusColor
        Write-Host " Install Dir   : $AgentInstallDir"
        Write-Host " Log File      : $LogFilePath"

        if (Test-Path $LogFilePath) {
            Write-Host "`n--- Recent Log Activity (Last 12 Lines) ---" -ForegroundColor Gray
            Get-Content -Path $LogFilePath -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object {
                Write-Host "  $_" -ForegroundColor DarkGray
            }
        }
        Write-Host "==========================================================================`n" -ForegroundColor Cyan
    }

    return $statusResult
}

function Install-VpsServiceTask {
    param (
        [string]$TargetServerId = $ServerId,
        [string]$TargetServerToken = $ServerToken,
        [string]$TargetApiUrl = $ApiUrl,
        [int]$TargetInterval = $IntervalSeconds
    )

    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host "   INSTALLING INNOVATION VPS AGENT AS 24/7 SYSTEM BACKGROUND SERVICE      " -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Cyan

    if (-not (Test-IsAdmin)) {
        Write-Host " [X] ERROR: Administrator privileges required to install 24/7 background service." -ForegroundColor Red
        Write-Host " [>] Please right-click PowerShell and select 'Run as Administrator'." -ForegroundColor Yellow
        return $false
    }

    try {
        if (-not (Test-Path $AgentInstallDir)) {
            New-Item -ItemType Directory -Path $AgentInstallDir -Force | Out-Null
        }

        # 1. Copy script to permanent ProgramData location if not already there
        $sourceScript = $PSCommandPath
        if (-not $sourceScript) { $sourceScript = $MyInvocation.MyCommand.Definition }
        if (-not $sourceScript -or -not (Test-Path $sourceScript)) {
            if (Test-Path ".\VpsAgent.ps1") {
                $sourceScript = ".\VpsAgent.ps1"
            }
        }

        if ($sourceScript -and (Test-Path $sourceScript)) {
            $srcFull = ""
            $dstFull = ""
            try { $srcFull = [System.IO.Path]::GetFullPath($sourceScript).TrimEnd('\', '/') } catch {}
            try { $dstFull = [System.IO.Path]::GetFullPath($InstalledScriptPath).TrimEnd('\', '/') } catch {}

            if ($srcFull -and $dstFull -and ([string]::Compare($srcFull, $dstFull, [System.StringComparison]::OrdinalIgnoreCase) -ne 0)) {
                Copy-Item -Path $sourceScript -Destination $InstalledScriptPath -Force
                Write-Host " [+] Installed Script to: $InstalledScriptPath" -ForegroundColor Green
            } else {
                Write-Host " [+] Verified Script at: $InstalledScriptPath" -ForegroundColor Green
            }
        } else {
            if (Test-Path $InstalledScriptPath) {
                Write-Host " [+] Verified Script at: $InstalledScriptPath" -ForegroundColor Green
            } else {
                Write-Host " [!] Warning: Script not found at $InstalledScriptPath" -ForegroundColor Yellow
            }
        }

        # 2. Save permanent configuration
        $config = @{
            serverId        = $TargetServerId
            serverToken     = $TargetServerToken
            apiUrl          = $TargetApiUrl
            intervalSeconds = $TargetInterval
            installedAt     = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        $config | ConvertTo-Json -Depth 3 | Out-File -FilePath $ConfigFile -Encoding utf8 -Force
        Write-Host " [+] Saved Configuration: ServerId = $TargetServerId, Interval = $TargetInterval s" -ForegroundColor Green

        # 3. Add Defender exclusion to avoid false-positive script interference
        try {
            Add-MpPreference -ExclusionPath $AgentInstallDir -ErrorAction SilentlyContinue
            Write-Host " [+] Added Antivirus path exclusion for $AgentInstallDir" -ForegroundColor Green
        } catch {}

        # 4. Stop any older tasks or processes
        Write-Host " [*] Terminating previous agent instances..." -ForegroundColor Gray
        & schtasks.exe /end /tn $TaskName 2>$null
        Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%VpsAgent%'" -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessId -ne $PID
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

        # 5. Create Scheduled Task with SYSTEM account and indefinite runtime
        $actionArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -RunWorker"
        $registered = $false

        if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) {
            try {
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
                $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
                $trigger = New-ScheduledTaskTrigger -AtStartup
                $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
                $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([System.TimeSpan]::Zero) -RestartCount 999 -RestartInterval ([System.TimeSpan]::FromMinutes(1)) -MultipleInstances IgnoreNew
                Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
                $registered = $true
            } catch {
                Write-Host "Notice: PowerShell ScheduledTasks cmdlet fallback to schtasks.exe: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }

        if (-not $registered) {
            & schtasks.exe /create /tn $TaskName /tr "powershell.exe $actionArgs" /sc ONSTART /ru "NT AUTHORITY\SYSTEM" /rl HIGHEST /f | Out-Null
        }

        # 6. Start the task immediately in Session 0
        Write-Host " [*] Launching 24/7 Background Service in Session 0..." -ForegroundColor Cyan
        if (Get-Command Start-ScheduledTask -ErrorAction SilentlyContinue) {
            Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        } else {
            & schtasks.exe /run /tn $TaskName 2>$null
        }

        Start-Sleep -Seconds 2

        # 7. Install 24/7 Auto-Recovery Watchdog Guardian (Checks every 3 min; resurrects worker if killed or stopped)
        try {
            $guardianCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"`$p = Get-CimInstance Win32_Process -Filter `"CommandLine LIKE '`%VpsAgent`%' AND CommandLine LIKE '`%RunWorker`%'`" -ErrorAction SilentlyContinue; if (-not `$p) { & schtasks.exe /run /tn `"$TaskName`" 2>`$null }`""
            & schtasks.exe /create /tn $GuardianTaskName /tr "$guardianCmd" /sc MINUTE /mo 3 /ru "NT AUTHORITY\SYSTEM" /rl HIGHEST /f 2>$null | Out-Null
            Write-Host " [+] Configured 24/7 Auto-Recovery Watchdog Guardian ($GuardianTaskName, runs every 3 min)" -ForegroundColor Green
        } catch {}

        # 8. Verification & Confirmation
        $taskStatus = Get-VpsServiceStatus -Quiet
        Write-Host "`n==========================================================================" -ForegroundColor Green
        Write-Host " [OK] SUCCESS: Innovation VPS Agent is now running in Session 0 (SYSTEM)! " -ForegroundColor Green
        Write-Host "   Task Name     : $TaskName" -ForegroundColor White
        Write-Host "   Execution User: NT AUTHORITY\SYSTEM (Session 0 Background Daemon)" -ForegroundColor White
        Write-Host "   Auto-Start    : On System Boot / Server Restart" -ForegroundColor White
        Write-Host "   Log File Path : $LogFilePath" -ForegroundColor White
        Write-Host "   Current Status: $($taskStatus.Status)" -ForegroundColor Yellow
        Write-Host "==========================================================================" -ForegroundColor Green
        Write-Host " [i] YOU CAN NOW SAFELY LOG OFF YOUR RDP SESSION OR CLOSE ALL WINDOWS." -ForegroundColor Cyan
        Write-Host "     The agent will NEVER stop running, even after logoff or server reboot.`n" -ForegroundColor Cyan
        return $true
    } catch {
        Write-Host " [X] Failed to install background service: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Uninstall-VpsServiceTask {
    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host "   UNINSTALLING INNOVATION VPS BACKGROUND SERVICE                         " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan

    if (-not (Test-IsAdmin)) {
        Write-Host " [X] ERROR: Administrator privileges required to uninstall service." -ForegroundColor Red
        return $false
    }

    try {
        Write-Host " [*] Stopping running scheduled task..." -ForegroundColor Gray
        if (Get-Command Stop-ScheduledTask -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        }
        & schtasks.exe /end /tn $TaskName 2>$null

        Write-Host " [*] Terminating background agent worker processes..." -ForegroundColor Gray
        Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%VpsAgent%'" -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessId -ne $PID
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }

        Write-Host " [*] Unregistering Scheduled Tasks '$TaskName' and '$GuardianTaskName'..." -ForegroundColor Gray
        if (Get-Command Unregister-ScheduledTask -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $GuardianTaskName -Confirm:$false -ErrorAction SilentlyContinue
        }
        & schtasks.exe /delete /tn $TaskName /f 2>$null
        & schtasks.exe /delete /tn $GuardianTaskName /f 2>$null

        Write-Host " [OK] Innovation VPS Background Agent uninstalled successfully.`n" -ForegroundColor Green
        return $true
    } catch {
        Write-Host " [X] Error during uninstall: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Restart-VpsServiceTask {
    Write-Host "`n[*] Restarting Innovation VPS Background Service..." -ForegroundColor Cyan
    & schtasks.exe /end /tn $TaskName 2>$null
    Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%VpsAgent%'" -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $PID
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    if (Get-Command Start-ScheduledTask -ErrorAction SilentlyContinue) {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    } else {
        & schtasks.exe /run /tn $TaskName 2>$null
    }
    Start-Sleep -Seconds 2
    Get-VpsServiceStatus
}

function Show-InteractiveMenu {
    Clear-Host
    $curStatus = Get-VpsServiceStatus -Quiet
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "       INNOVATION WEB WORKS - VPS 24/7 BACKGROUND AGENT CONTROLLER         " -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host " Server ID      : $ServerId" -ForegroundColor Yellow
    $srvColor = if ($curStatus.Running) { "Green" } else { "Yellow" }
    Write-Host " Service Status : $($curStatus.Status)" -ForegroundColor $srvColor
    Write-Host " Worker PIDs    : $($curStatus.ActiveWorkerPIDs)" -ForegroundColor DarkGray
    Write-Host "--------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " [1] Install & Start 24/7 Background Service (Survives RDP Logoff & Reboot) [RECOMMENDED]" -ForegroundColor White
    Write-Host " [2] Check Status & View Live Logs" -ForegroundColor White
    Write-Host " [3] Restart Background Service" -ForegroundColor White
    Write-Host " [4] Stop & Uninstall Background Service" -ForegroundColor White
    Write-Host " [5] Run Foreground Debug Console (Stops when this window closes)" -ForegroundColor White
    Write-Host " [0] Exit" -ForegroundColor White
    Write-Host "==========================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Select an option [0-5]"

    switch ($choice.Trim()) {
        "1" { Install-VpsServiceTask; break }
        "2" { Get-VpsServiceStatus; break }
        "3" { Restart-VpsServiceTask; break }
        "4" { Uninstall-VpsServiceTask; break }
        "5" { Run-AgentWorker -IsForeground $true; break }
        "0" { Write-Host "Exiting."; exit 0 }
        default { Write-Host "Invalid choice."; break }
    }
}

function Get-RamStats {
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $usedGB = [math]::Round($totalGB - $freeGB, 2)
        $percent = [math]::Round(($usedGB / $totalGB) * 100)

        return @{
            totalGB = $totalGB
            usedGB = $usedGB
            freeGB = $freeGB
            percent = $percent
        }
    } catch {
        return @{ totalGB = 0; usedGB = 0; freeGB = 0; percent = 0 }
    }
}

function Get-DiskStats {
    try {
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop
        $result = @()
        foreach ($d in $disks) {
            $totalGB = [math]::Round($d.Size / 1GB, 2)
            $freeGB = [math]::Round($d.FreeSpace / 1GB, 2)
            $usedGB = [math]::Round($totalGB - $freeGB, 2)
            $freePercent = if ($totalGB -gt 0) { [math]::Round(($freeGB / $totalGB) * 100, 1) } else { 0 }

            $result += @{
                driveLetter = $d.DeviceID
                drive = $d.DeviceID
                volumeName = if ($d.VolumeName) { $d.VolumeName } else { if ($d.DeviceID -eq 'C:') { 'System Partition (OS)' } else { "Client Data ($($d.DeviceID))" } }
                totalGB = $totalGB
                usedGB = $usedGB
                freeGB = $freeGB
                freePercent = $freePercent
            }
        }
        return $result
    } catch {
        return @()
    }
}

function Get-PhysicalDiskStats {
    $physicalDisks = @()
    try {
        $rawDisks = Get-CimInstance -ClassName MSFT_Disk -Namespace "ROOT/Microsoft/Windows/Storage" -ErrorAction SilentlyContinue
        if (-not $rawDisks) {
            $rawDisks = Get-Disk -ErrorAction SilentlyContinue
        }

        if ($rawDisks) {
            foreach ($d in $rawDisks) {
                $totalBytes = [double]$d.Size
                $allocatedBytes = [double]$d.AllocatedSize
                $unallocatedBytes = [math]::Max(0, ($totalBytes - $allocatedBytes))

                $totalGB = [math]::Round($totalBytes / 1GB, 2)
                $allocatedGB = [math]::Round($allocatedBytes / 1GB, 2)
                $unallocatedGB = [math]::Round($unallocatedBytes / 1GB, 2)

                $statusStr = if ($d.IsOffline) { "Offline" } elseif ($d.OperationalStatus) { "$($d.OperationalStatus)" } else { "Online" }
                $partStyle = if ($d.PartitionStyle) { "$($d.PartitionStyle)" } else { "RAW" }

                $physicalDisks += @{
                    diskNumber        = [int]$d.Number
                    friendlyName      = [string]$d.FriendlyName
                    totalGB           = $totalGB
                    allocatedGB       = $allocatedGB
                    unallocatedGB     = $unallocatedGB
                    operationalStatus = $statusStr
                    isOffline         = [bool]$d.IsOffline
                    isReadOnly        = [bool]$d.IsReadOnly
                    partitionStyle    = $partStyle
                    busType           = [string]$d.BusType
                }
            }
        }
    } catch {}

    if ($physicalDisks.Count -eq 0) {
        try {
            $w32Disks = Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction SilentlyContinue
            foreach ($wd in $w32Disks) {
                $totalGB = [math]::Round([double]$wd.Size / 1GB, 2)
                $physicalDisks += @{
                    diskNumber        = [int]$wd.Index
                    friendlyName      = [string]$wd.Model
                    totalGB           = $totalGB
                    allocatedGB       = $totalGB
                    unallocatedGB     = 0
                    operationalStatus = if ($wd.Status -ieq "OK") { "Online" } else { "$($wd.Status)" }
                    isOffline         = $false
                    isReadOnly        = $false
                    partitionStyle    = "GPT"
                    busType           = [string]$wd.InterfaceType
                }
            }
        } catch {}
    }

    return $physicalDisks
}

function Get-InstalledTallyVersions {
    $versions = @()
    $seenPaths = @{}

    try {
        $masterRepo = "C:\TallyVersions"
        if (-not (Test-Path $masterRepo)) {
            try {
                New-Item -ItemType Directory -Path $masterRepo -Force | Out-Null
                $readme = @"
===========================================================
Tally Versions Repository for VPS Management System
===========================================================
Place standalone Tally version folders in this directory:
Example:
  C:\TallyVersions\TallyPrime 4.1
  C:\TallyVersions\TallyPrime 3.0
  C:\TallyVersions\Tally ERP 9
  C:\TallyVersions\Busy 21

Each folder should contain tally.exe or busy.exe.
The VPS Management Portal will automatically detect each version
and allow you to pick it when provisioning new clients!
===========================================================
"@
                Set-Content -Path "$masterRepo\README.txt" -Value $readme -Force
            } catch {}
        }

        # 1. Scan subdirectories of C:\TallyVersions
        if (Test-Path $masterRepo) {
            Get-ChildItem -Path $masterRepo -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $exe = Join-Path $_.FullName "tally.exe"
                if (-not (Test-Path $exe)) { $exe = Join-Path $_.FullName "busy.exe" }
                if ((Test-Path $exe) -and -not $seenPaths.ContainsKey($_.FullName)) {
                    $seenPaths[$_.FullName] = $true
                    $fvi = (Get-Item $exe).VersionInfo
                    $ver = if ($fvi.ProductVersion) { $fvi.ProductVersion } else { $_.Name }
                    $versions += @{
                        name = $_.Name
                        version = $ver
                        path = $_.FullName
                        exePath = $exe
                        isDefault = ($versions.Count -eq 0)
                    }
                }
            }
        }

        # 2. Scan standard installation paths
        $standardPaths = @(
            "C:\Program Files\TallyPrime",
            "C:\Program Files (x86)\TallyPrime",
            "C:\TallyPrime",
            "C:\TallyBase\TallyPrime",
            "C:\TallyBase",
            "C:\TallyMaster",
            "C:\Program Files\Tally.ERP9",
            "C:\Program Files (x86)\Tally.ERP9",
            "C:\Tally.ERP9"
        )

        foreach ($p in $standardPaths) {
            $exe = Join-Path $p "tally.exe"
            if ((Test-Path $exe) -and -not $seenPaths.ContainsKey($p)) {
                $seenPaths[$p] = $true
                $name = Split-Path $p -Leaf
                $fvi = (Get-Item $exe).VersionInfo
                $ver = if ($fvi.ProductVersion) { $fvi.ProductVersion } else { $name }
                $versions += @{
                    name = $name
                    version = $ver
                    path = $p
                    exePath = $exe
                    isDefault = ($versions.Count -eq 0)
                }
            }
        }
    } catch {}

    return $versions
}

function Set-TallyIniPaths ([string]$iniPath, [string]$companyRoot, [string]$dataDir = "", [string]$exportDir = "") {
    try {
        if (-not $iniPath) { return }
        $parentDir = Split-Path $iniPath -Parent
        if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Path $parentDir -Force | Out-Null }
        
        if (-not $dataDir) { $dataDir = "$companyRoot\Data" }
        if (-not $exportDir) { $exportDir = "$companyRoot\Export" }
        $configDir = $parentDir
        $tdlDir = "$companyRoot\tdl"
        $langDir = if (Test-Path "$parentDir\lang") { "$parentDir\lang" } else { "$companyRoot\lang" }

        # Remove ReadOnly attribute if set so user and Tally can edit freely
        try {
            $item = Get-Item $iniPath -ErrorAction SilentlyContinue
            if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReadOnly)) {
                $item.Attributes = ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly)
            }
        } catch {}

        if (Test-Path $iniPath) {
            $iniText = [System.IO.File]::ReadAllText($iniPath, [System.Text.Encoding]::Default)
            if (-not $iniText) {
                $iniText = Get-Content -Path $iniPath -Raw -ErrorAction SilentlyContinue
            }

            # If Data and Export already exist, DO NOT overwrite! Preserve user-configured paths permanently.
            $hasData = ($iniText -match "(?im)^\s*Data\s*=")
            $hasExport = ($iniText -match "(?im)^\s*Export\s*=")

            if ($hasData -and $hasExport) {
                Write-AgentLog "tally.ini at $iniPath already configured. Preserving existing user paths." "INFO" "Cyan"
                return
            }

            # Ensure [TALLY] or [Tally] header exists
            if ($iniText -notmatch "(?im)\[TALLY\]") {
                $iniText = "[TALLY]`r`n" + $iniText
            }

            # 1. Data= (only initialize if missing)
            if (-not $hasData) {
                if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
                $iniText = [System.Text.RegularExpressions.Regex]::Replace($iniText, "(?im)(\[TALLY\])", "`$1`r`nData=$dataDir")
                Write-AgentLog "Initialized missing Data path in existing tally.ini: $dataDir" "INFO" "Green"
            }

            # 2. Export= (only initialize if missing)
            if (-not $hasExport) {
                if (-not (Test-Path $exportDir)) { New-Item -ItemType Directory -Path $exportDir -Force | Out-Null }
                if ($iniText -match "(?im)^\s*Data\s*=.*$") {
                    $iniText = [System.Text.RegularExpressions.Regex]::Replace($iniText, "(?im)(^\s*Data\s*=.*$)", "`$1`r`nExport=$exportDir`r`nExport Path=$exportDir")
                } else {
                    $iniText = [System.Text.RegularExpressions.Regex]::Replace($iniText, "(?im)(\[TALLY\])", "`$1`r`nExport=$exportDir`r`nExport Path=$exportDir")
                }
            }

            # 3. Config= (only initialize if missing)
            if ($iniText -notmatch "(?im)^\s*Config\s*=") {
                $iniText += "`r`nConfig=$configDir"
            }

            # 4. LangPath= (only initialize if missing)
            if ($iniText -notmatch "(?im)^\s*LangPath\s*=") {
                if (-not (Test-Path $langDir)) { New-Item -ItemType Directory -Path $langDir -Force | Out-Null }
                $iniText += "`r`nLangPath=$langDir"
            }

            [System.IO.File]::WriteAllText($iniPath, $iniText, [System.Text.Encoding]::Default)
            Write-AgentLog "Configured missing tally.ini paths at $iniPath" "SUCCESS" "Green"
        } else {
            # First-time creation: tally.ini does NOT exist
            if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
            if (-not (Test-Path $exportDir)) { New-Item -ItemType Directory -Path $exportDir -Force | Out-Null }
            if (-not (Test-Path $tdlDir)) { New-Item -ItemType Directory -Path $tdlDir -Force | Out-Null }
            if (-not (Test-Path $langDir)) { New-Item -ItemType Directory -Path $langDir -Force | Out-Null }

            $iniContent = @"
;; TallyPrime workstation specific parameters file
[TALLY]

;; Specify location of Data files
Data=$dataDir
Export=$exportDir
Export Path=$exportDir

;; Specify location of TALLYSAV.tsf
Config=$configDir

;; Specify location of Language Files
LangPath=$langDir

Default Companies = Yes
Color = Yes
Sound = Yes
"@
            [System.IO.File]::WriteAllText($iniPath, $iniContent, [System.Text.Encoding]::Default)
            Write-AgentLog "Created first-time template tally.ini at $iniPath (Data=$dataDir, Export=$exportDir)" "SUCCESS" "Green"
        }
    } catch {
        Write-AgentLog "Notice updating tally.ini ($iniPath): $($_.Exception.Message)" "WARN" "Yellow"
    }
}

function Lock-TallyIniPermissions ([string]$iniPath, [string]$uName) {
    try {
        if (-not (Test-Path $iniPath)) { return }

        # Remove ReadOnly file attribute if set so user can freely edit
        try {
            $item = Get-Item $iniPath -ErrorAction SilentlyContinue
            if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReadOnly)) {
                $item.Attributes = ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly)
            }
        } catch {}

        $acl = Get-Acl $iniPath
        $acl.SetAccessRuleProtection($true, $false)
        
        $adminSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
        $systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
        
        $ruleAdmin = New-Object System.Security.AccessControl.FileSystemAccessRule($adminSid, "FullControl", "Allow")
        $ruleSystem = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, "FullControl", "Allow")
        
        $acl.AddAccessRule($ruleAdmin)
        $acl.AddAccessRule($ruleSystem)

        try {
            $ruleSuper = New-Object System.Security.AccessControl.FileSystemAccessRule("superclient", "FullControl", "Allow")
            $acl.AddAccessRule($ruleSuper)
        } catch {}

        if ($uName) {
            try {
                $ruleUser = New-Object System.Security.AccessControl.FileSystemAccessRule($uName, "Modify", "Allow")
                $acl.AddAccessRule($ruleUser)
            } catch {}
        }
        
        Set-Acl -Path $iniPath -AclObject $acl
        & icacls "$iniPath" /grant "superclient:(F)" "$($uName):(M)" /Q 2>$null
        Write-AgentLog "Configured tally.ini permissions: Administrators/superclient=Full, $uName=Modify" "SUCCESS" "Green"
    } catch {
        & icacls "$iniPath" /inheritance:r /grant:r "Administrators:(F)" "SYSTEM:(F)" "superclient:(F)" "$($uName):(M)" /Q 2>$null
    }
}

function Sync-AllCompanyTallyInis {
    # Deprecated: Paths are set ONLY once at user creation time.
    # Automatic drive scanning is disabled so no unwanted Data/Export folders are created in other directories,
    # and any subsequent path changes made by the user/admin in tally.ini remain untouched.
}

function Get-HardwareSpecs {
    try {
        $cpuName = ""
        try {
            $cpuName = (Get-ItemProperty -Path "HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0" -ErrorAction SilentlyContinue).ProcessorNameString
        } catch {}
        if (-not $cpuName) {
            try {
                $cpuObj = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1)
                if (-not $cpuObj) { $cpuObj = (Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1) }
                if ($cpuObj) { $cpuName = $cpuObj.Name }
            } catch {}
        }
        if ($cpuName) { $cpuName = $cpuName.Trim() -replace '\s+', ' ' }
        else { $cpuName = "Multi-Core Processor" }

        $logicalCores = [Environment]::ProcessorCount
        $physicalCores = $logicalCores
        try {
            $procList = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue)
            if (-not $procList) { $procList = (Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue) }
            if ($procList) {
                $cSum = ($procList | Measure-Object -Property NumberOfCores -Sum).Sum
                if ($cSum -and $cSum -gt 0) { $physicalCores = $cSum }
            }
        } catch {}

        $ramStats = Get-RamStats
        $ramGB = if ($ramStats.totalGB) { [math]::Round([double]$ramStats.totalGB, 0) } else { 0 }

        $diskStats = Get-DiskStats
        $totalDiskGB = 0
        if ($diskStats) {
            foreach ($d in $diskStats) {
                if ($d.totalGB) { $totalDiskGB += [double]$d.totalGB }
            }
        }
        $diskGB = [math]::Round($totalDiskGB, 0)

        # Clean CPU Name (e.g. "Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz" -> "Intel Xeon Gold 6248R")
        $cleanCpu = $cpuName -replace '\(R\)', '' -replace '\(TM\)', '' -replace ' CPU.*$', '' -replace '\s+', ' '
        $cleanCpu = $cleanCpu.Trim()

        $specsStr = "$physicalCores Core"
        if ($logicalCores -ne $physicalCores) { $specsStr += " ($logicalCores vCPU)" }
        if ($ramGB -gt 0) { $specsStr += " / ${ramGB}GB RAM" }
        if ($diskGB -gt 0) { $specsStr += " / ${diskGB}GB Disk" }
        if ($cleanCpu) { $specsStr += " • $cleanCpu" }

        return @{
            cpuName = $cleanCpu
            cpuFullName = $cpuName
            cpuCores = $physicalCores
            cpuLogical = $logicalCores
            ramTotalGB = $ramGB
            diskTotalGB = $diskGB
            specs = $specsStr
        }
    } catch {
        return $null
    }
}

function Clean-WindowsUsername ($cand) {
    if ([string]::IsNullOrWhiteSpace($cand)) { return "" }
    $c = $cand.Split([char]92)[-1].Trim()
    if ($c -match '^(.+?)\s+\d+$') {
        $c = $matches[1].Trim()
    }
    return $c
}

function Is-ValidSessionUser ($cand) {
    if ([string]::IsNullOrWhiteSpace($cand)) { return $false }
    $c = Clean-WindowsUsername $cand
    if ([string]::IsNullOrWhiteSpace($c)) { return $false }
    if ($c -match "^(Administrator|Guest|DefaultAccount|WDAGUtilityAccount|SYSTEM|LOCAL SERVICE|NETWORK SERVICE|SERVICE|SERVICES|ANONYMOUS LOGON|INTERACTIVE|WINDOW MANAGER|WMIC|rdp-tcp.*|console|listen|services|conn|connected|disc|disconnected|active)$") { return $false }
    if ($c -match "^(DWM-|UMFD-|FONT-)") { return $false }
    if ($c -match "^\d+$") { return $false }
    return $true
}

function Get-UserSessions {
    $activeUsers = @()
    $disconnectedUsers = @()
    $detailedSessions = @()

    if (-not $Global:SessionLogonTimes) {
        $Global:SessionLogonTimes = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([System.StringComparer]::OrdinalIgnoreCase)
    }
    $currentPingActive = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

    # Provider 1: qwinsta.exe (Direct fixed-column session inspection)
    try {
        $qwOutput = & qwinsta.exe 2>$null
        if ($qwOutput) {
            foreach ($qLine in $qwOutput) {
                if ([string]::IsNullOrWhiteSpace($qLine) -or $qLine -match "^\s*SESSIONNAME\s+") { continue }
                if ($qLine.Length -lt 25) { continue }

                $sessName = ($qLine.Substring(0, [math]::Min(19, $qLine.Length))).Replace('>', '').Trim()
                $userName = ""
                if ($qLine.Length -gt 19) {
                    $rawSlice = ($qLine.Substring(19, [math]::Min(20, $qLine.Length - 19))).Trim()
                    $userName = Clean-WindowsUsername $rawSlice
                }

                if (-not (Is-ValidSessionUser $userName)) {
                    $cleanQ = $qLine.Replace('>', '').Trim()
                    $qTokens = $cleanQ -split '\s+'
                    foreach ($tok in $qTokens) {
                        $tokClean = Clean-WindowsUsername $tok
                        if ((Is-ValidSessionUser $tokClean) -and $tokClean -notmatch '^(Active|Disc|Disconnected|Listen|Conn|Connected|rdp-tcp.*|console|services)$') {
                            $userName = $tokClean
                            break
                        }
                    }
                }

                if (Is-ValidSessionUser $userName) {
                    $cleanUserName = Clean-WindowsUsername $userName
                    $restOfLine = if ($qLine.Length -ge 44) { $qLine.Substring(44).Trim() } else { $qLine.Trim() }
                    $restTokens = $restOfLine -split '\s+'
                    $sessId = if ($restTokens.Count -ge 1 -and $restTokens[0] -match '^\d+$') { $restTokens[0] } else { "1" }
                    if ($sessId -eq "0") { continue } # Session 0 is Windows OS internal services
                    
                    $rawState = if ($restTokens.Count -ge 2) { $restTokens[1] } else { "" }
                    if (-not $rawState) {
                        $rawState = if ($qLine -match "\bActive\b") { "Active" } else { "Disc" }
                    }

                    $isDisc = ($rawState -match "^(Disc|Disconnected)$" -or $qLine -match "\s+Disc\s*")
                    $stateClean = if ($isDisc) { "Disconnected" } else { "Active" }

                    if (-not $Global:SessionLogonTimes.ContainsKey($cleanUserName)) {
                        $Global:SessionLogonTimes[$cleanUserName] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    }

                    if ($isDisc) {
                        if (-not ($disconnectedUsers -contains $cleanUserName)) {
                            $disconnectedUsers += $cleanUserName
                        }
                    } else {
                        if (-not ($activeUsers -contains $cleanUserName)) {
                            $activeUsers += $cleanUserName
                            [void]$currentPingActive.Add($cleanUserName)
                        }
                    }

                    $detailedSessions += @{
                        username    = $cleanUserName
                        sessionId   = $sessId
                        sessionName = if ($sessName) { $sessName } else { if ($isDisc) { "Disconnected" } else { "rdp-active" } }
                        state       = $stateClean
                        idleTime    = "none"
                        logonTime   = $Global:SessionLogonTimes[$cleanUserName]
                    }
                }
            }
        }
    } catch {}

    # Provider 2: quser.exe (High-precision user, idle time, and logon time parsing)
    if ($detailedSessions.Count -eq 0) {
        try {
            $quserOutput = & quser.exe 2>$null
            if (-not $quserOutput) { $quserOutput = & query.exe user 2>$null }
            if ($quserOutput) {
                $rawLines = $quserOutput -split "`r?`n"
                foreach ($rLine in $rawLines) {
                    $line = $rLine.Trim()
                    if ([string]::IsNullOrWhiteSpace($line) -or $line -match "^USERNAME\s+") { continue }

                    $cleanLine = $line.Replace('>', '').Trim()
                    $tokens = $cleanLine -split '\s+'

                    if ($tokens.Count -ge 2) {
                        $uName = $tokens[0].Trim().Split([char]92)[-1]
                        if ($uName -and $uName -ne "USERNAME" -and (Is-ValidSessionUser $uName)) {
                            $sState = "Active"
                            $sId = "1"
                            $sName = "rdp-tcp"
                            $idle = "none"
                            $logonDate = ""

                            for ($i = 1; $i -lt $tokens.Count; $i++) {
                                $tok = $tokens[$i]
                                if ($tok -match "^(Active)$") { $sState = "Active" }
                                elseif ($tok -match "^(Disc|Disconnected)$") { $sState = "Disconnected" }
                                elseif ($tok -match "^\d+$" -and $sId -eq "1") { $sId = $tok }
                                elseif ($tok -match "^(rdp-|console)") { $sName = $tok }
                                elseif ($tok -match "^\d+:\d+$") { $idle = $tok }
                                elseif ($tok -match "^\d{1,2}/\d{1,2}/\d{2,4}") {
                                    $logonDate = "$tok " + $tokens[$i+1]
                                }
                            }

                            if ($sId -eq "0") { continue }

                            if (-not $Global:SessionLogonTimes.ContainsKey($uName)) {
                                $Global:SessionLogonTimes[$uName] = if ($logonDate) { $logonDate } else { (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }
                            }

                            if ($sState -eq "Disconnected") {
                                if (-not ($disconnectedUsers -contains $uName)) { $disconnectedUsers += $uName }
                            } else {
                                if (-not ($activeUsers -contains $uName)) {
                                    $activeUsers += $uName
                                    [void]$currentPingActive.Add($uName)
                                }
                            }

                            $detailedSessions += @{
                                username    = $uName
                                sessionId   = $sId
                                sessionName = $sName
                                state       = $sState
                                idleTime    = $idle
                                logonTime   = $Global:SessionLogonTimes[$uName]
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    # Provider 3: Fallback via Win32_Process (explorer.exe / userinit.exe)
    if ($detailedSessions.Count -eq 0) {
        try {
            $explorers = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'explorer.exe' -or $_.Name -eq 'userinit.exe' }
            foreach ($proc in $explorers) {
                $owner = (Invoke-CimMethod -InputObject $proc -MethodName GetOwner -ErrorAction SilentlyContinue).User
                if ($owner -and (Is-ValidSessionUser $owner)) {
                    $uName = $owner.Split([char]92)[-1].Trim()
                    if ($proc.SessionId -eq 0) { continue }

                    if (-not $Global:SessionLogonTimes.ContainsKey($uName)) {
                        $Global:SessionLogonTimes[$uName] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                    }

                    if (-not ($activeUsers -contains $uName)) {
                        $activeUsers += $uName
                        [void]$currentPingActive.Add($uName)

                        $detailedSessions += @{
                            username    = $uName
                            sessionId   = "$($proc.SessionId)"
                            sessionName = "explorer"
                            state       = "Active"
                            idleTime    = "none"
                            logonTime   = $Global:SessionLogonTimes[$uName]
                        }
                    }
                }
            }
        } catch {}
    }

    $trackedKeys = @($Global:SessionLogonTimes.Keys)
    foreach ($tk in $trackedKeys) {
        if (-not $currentPingActive.Contains($tk) -and -not ($disconnectedUsers -contains $tk)) {
            [void]$Global:SessionLogonTimes.Remove($tk)
        }
    }

    $allUsersHashSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $disUsersHashSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

    # Direct Structured Windows Local Users Enum (100% Exact 1-to-1 match with lusrmgr.msc)
    try {
        if (Get-Command Get-LocalUser -ErrorAction SilentlyContinue) {
            $locUsers = Get-LocalUser -ErrorAction SilentlyContinue | Select-Object Name, Enabled, Description, FullName
            foreach ($u in $locUsers) {
                $uName = "$($u.Name)".Trim()
                if ($uName -and $uName -notmatch "^(Administrator|Guest|DefaultAccount|WDAGUtilityAccount)$") {
                    [void]$allUsersHashSet.Add($uName)
                    if ($u.Enabled -eq $false -or "$($u.Enabled)" -eq "False") {
                        [void]$disUsersHashSet.Add($uName)
                    }
                }
            }
        }
    } catch {}

    if ($allUsersHashSet.Count -eq 0) {
        try {
            $cimUsers = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" -ErrorAction SilentlyContinue | Select-Object Name, FullName, Description, Disabled
            foreach ($u in $cimUsers) {
                $uName = "$($u.Name)".Trim()
                if ($uName -and $uName -notmatch "^(Administrator|Guest|DefaultAccount|WDAGUtilityAccount)$") {
                    [void]$allUsersHashSet.Add($uName)
                    if ($u.Disabled -eq $true -or "$($u.Disabled)" -eq "True") {
                        [void]$disUsersHashSet.Add($uName)
                    }
                }
            }
        } catch {}
    }

    $allPhysical = @($allUsersHashSet)
    $disabledUsers = @($disUsersHashSet)

    $allPhysicalArr = @()
    if ($allPhysical) {
        foreach ($item in $allPhysical) {
            if ($item -and $item.ToString().Trim() -ne "") {
                $allPhysicalArr += $item.ToString().Trim()
            }
        }
    }

    $disabledUsersArr = @()
    if ($disabledUsers) {
        foreach ($item in $disabledUsers) {
            if ($item -and $item.ToString().Trim() -ne "") {
                $disabledUsersArr += $item.ToString().Trim()
            }
        }
    }

    return @{
        activeUsers         = @($activeUsers)
        activeCount         = $activeUsers.Count
        disconnectedUsers   = @($disconnectedUsers)
        disconnectedCount   = $disconnectedUsers.Count
        detailedSessions    = @($detailedSessions)
        allServerUsers      = $allPhysicalArr
        disabledServerUsers = $disabledUsersArr
    }
}

function Save-QueueEvent ($event) {
    try {
        $queue = @()
        if (Test-Path $QueueFilePath) {
            $content = Get-Content $QueueFilePath -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $queue = ConvertFrom-Json $content
            }
        }
        $queue += $event
        if ($queue.Count -gt 100) {
            $queue = $queue | Select-Object -Last 100
        }
        $queue | ConvertTo-Json -Depth 5 | Set-Content $QueueFilePath -Force
    } catch {}
}

function Flush-QueueEvents ($sessionEventUrl) {
    if (-not (Test-Path $QueueFilePath)) { return }
    try {
        $content = Get-Content $QueueFilePath -Raw -ErrorAction SilentlyContinue
        if (-not $content) { return }
        $queue = ConvertFrom-Json $content
        if (-not $queue -or $queue.Count -eq 0) { return }

        $headers = @{
            "Content-Type" = "application/json"
            "X-Server-Token" = $ServerToken
        }

        $payload = @{
            serverId = $ServerId
            events = $queue
        } | ConvertTo-Json -Depth 5

        $res = Invoke-RestMethod -Uri $sessionEventUrl -Method Post -Headers $headers -Body $payload -TimeoutSec 10 -ErrorAction Stop
        if ($res.success) {
            Remove-Item $QueueFilePath -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Invoke-VpsJobExecution ($job, $jobResultUrl) {
    $jobId = $job.id
    $action = if ($job.action) { $job.action } else { "PROVISION_TALLY_USER" }
    $uName = $job.username
    $cleanUser = Clean-WindowsUsername $uName

    Write-AgentLog "Executing Remote Job: Action = $action | User = $cleanUser | Job ID = $jobId" "JOB" "Yellow"

    # -------------------------------------------------------------
    # ACTION 0: UPDATE_AGENT (Trigger Instant Self-Update)
    # -------------------------------------------------------------
    if ($action -eq "UPDATE_AGENT") {
        Write-AgentLog "Remote update command received. Checking for agent updates..." "UPDATE" "Cyan"
        try {
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = "Agent auto-update acknowledged." } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {}
        Check-AndApplyAgentAutoUpdate
        return
    }

    # -------------------------------------------------------------
    # ACTION 0.1: GET_AGENT_LOG (Remote Diagnostic Log Retrieval)
    # -------------------------------------------------------------
    if ($action -eq "GET_AGENT_LOG") {
        try {
            $logFile = "$AgentInstallDir\agent.log"
            $content = ""
            if (Test-Path $logFile) {
                $content = (Get-Content $logFile -Tail 100 -ErrorAction SilentlyContinue) -join "`r`n"
            } else {
                $content = "agent.log file not found on VPS."
            }
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = $content } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "$_" } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 1: CHANGE_USER_PASSWORD
    # -------------------------------------------------------------
    if ($action -eq "CHANGE_USER_PASSWORD") {
        try {
            $newPass = if ($job.newPassword) { $job.newPassword } else { $job.password }
            if (-not $newPass) { throw "New password cannot be empty." }
            if (-not $cleanUser) { throw "Username is required." }

            $changed = $false
            $lastErr = ""

            # Method 1: ADSI (Native COM WinNT interface - 100% reliable across all Windows Server editions)
            try {
                $compName = $env:COMPUTERNAME
                $userEntry = [ADSI]"WinNT://$compName/$cleanUser,user"
                if ($userEntry -and $userEntry.Name) {
                    $userEntry.SetPassword($newPass)
                    $userEntry.SetInfo()
                    $changed = $true
                    Write-AgentLog "Password changed successfully via ADSI for '$cleanUser'." "SUCCESS" "Green"
                }
            } catch {
                $lastErr = $_.Exception.Message
                Write-AgentLog "ADSI SetPassword notice for '$cleanUser': $lastErr" "WARN" "Yellow"
            }

            # Method 2: Set-LocalUser (PowerShell LocalAccounts cmdlet)
            if (-not $changed) {
                try {
                    $secPass = ConvertTo-SecureString $newPass -AsPlainText -Force
                    Set-LocalUser -Name $cleanUser -Password $secPass -ErrorAction Stop
                    $changed = $true
                    Write-AgentLog "Password changed successfully via Set-LocalUser for '$cleanUser'." "SUCCESS" "Green"
                } catch {
                    $lastErr = $_.Exception.Message
                    Write-AgentLog "Set-LocalUser notice for '$cleanUser': $lastErr" "WARN" "Yellow"
                }
            }

            # Method 3: net.exe user fallback
            if (-not $changed) {
                try {
                    & net.exe user "$cleanUser" "$newPass" 2>$null
                    if ($LASTEXITCODE -eq 0) {
                        $changed = $true
                        Write-AgentLog "Password changed successfully via net.exe for '$cleanUser'." "SUCCESS" "Green"
                    }
                } catch {
                    $lastErr = $_.Exception.Message
                }
            }

            if (-not $changed) {
                throw "Failed to update Windows password for '$cleanUser'. Details: $lastErr. (Ensure password satisfies Windows Server complexity requirements: minimum 6-8 chars with uppercase, lowercase, numbers or symbols)."
            }

            Write-AgentLog "Password updated successfully for user '$cleanUser' on Windows VPS." "SUCCESS" "Green"

            $resultBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = "Password successfully updated on Windows VPS for user '$cleanUser'."
                details  = @{
                    username  = $cleanUser
                    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                }
            } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resultBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "Password change failed for '$cleanUser': $($_.Exception.Message)" "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $_.Exception.Message
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 2: TOGGLE_USER_STATUS (Enable / Disable Windows Account)
    # -------------------------------------------------------------
    if ($action -eq "TOGGLE_USER_STATUS") {
        try {
            $targetStatus = if ($job.userStatus) { $job.userStatus } else { $job.status }
            $shouldDisable = ($targetStatus -match '^(Disabled|DISABLED)$' -or $job.enabled -eq $false)
            $cleanUser = if ($uName -match '\\') { $uName.Split('\')[-1].Trim() } else { "$uName".Trim() }

            if ($shouldDisable) {
                try { Disable-LocalUser -Name $cleanUser -ErrorAction SilentlyContinue } catch {}
                try {
                    $compName = $env:COMPUTERNAME
                    $userEntry = [ADSI]"WinNT://$compName/$cleanUser,user"
                    $userEntry.AccountDisabled = $true
                    $userEntry.SetInfo()
                } catch {}
                & net.exe user "$cleanUser" /active:no 2>$null
                Write-AgentLog "User account '$cleanUser' DISABLED on Windows VPS." "SUCCESS" "Green"
                $msg = "Account '$cleanUser' successfully disabled on Windows VPS."
            } else {
                try { Enable-LocalUser -Name $cleanUser -ErrorAction SilentlyContinue } catch {}
                try {
                    $compName = $env:COMPUTERNAME
                    $userEntry = [ADSI]"WinNT://$compName/$cleanUser,user"
                    $userEntry.AccountDisabled = $false
                    $userEntry.SetInfo()
                } catch {}
                & net.exe user "$cleanUser" /active:yes 2>$null
                Write-AgentLog "User account '$cleanUser' ENABLED on Windows VPS." "SUCCESS" "Green"
                $msg = "Account '$cleanUser' successfully enabled on Windows VPS."
            }

            $resultBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = $msg
                details  = @{
                    username  = $cleanUser
                    disabled  = $shouldDisable
                    updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                }
            } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resultBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "User status toggle failed for '$cleanUser': $($_.Exception.Message)" "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $_.Exception.Message
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 3: TERMINATE_SESSION (Force Logoff User Session)
    # -------------------------------------------------------------
    if ($action -eq "TERMINATE_SESSION") {
        try {
            $sessId = $job.sessionId
            $cleanUser = if ($uName -match '\\') { $uName.Split('\')[-1].Trim() } else { "$uName".Trim() }
            $termOk = $false

            # Resolve real System32 path (handling 32-bit SysWOW64 redirection)
            $sys32 = "$env:SystemRoot\System32"
            if ([IntPtr]::Size -eq 4 -and (Test-Path "$env:SystemRoot\Sysnative")) {
                $sys32 = "$env:SystemRoot\Sysnative"
            }
            $logoffExe = if (Test-Path "$sys32\logoff.exe") { "$sys32\logoff.exe" } else { "logoff.exe" }
            $rwinstaExe = if (Test-Path "$sys32\rwinsta.exe") { "$sys32\rwinsta.exe" } else { "rwinsta.exe" }
            $quserExe = if (Test-Path "$sys32\quser.exe") { "$sys32\quser.exe" } else { "quser.exe" }

            # 1. Terminate by session ID if valid integer
            if ($sessId -and "$sessId" -match '^\d+$') {
                Write-AgentLog "Terminating Session ID $sessId via $logoffExe..." "JOB" "Yellow"
                & $logoffExe $sessId 2>$null
                if ($LASTEXITCODE -eq 0) { $termOk = $true }
                else {
                    & $rwinstaExe $sessId 2>$null
                    if ($LASTEXITCODE -eq 0) { $termOk = $true }
                }
            }

            # 2. Terminate by searching session ID for user from quser
            if ($cleanUser) {
                Write-AgentLog "Searching live terminal sessions for '$cleanUser' via $quserExe..." "JOB" "Yellow"
                $quserOutput = & $quserExe 2>$null
                if (-not $quserOutput -and (Test-Path "$sys32\query.exe")) {
                    $quserOutput = & "$sys32\query.exe" user 2>$null
                }
                if ($quserOutput) {
                    foreach ($rLine in ($quserOutput -split "`r?`n")) {
                        if ($rLine -match "\b$cleanUser\b") {
                            $cleanLine = $rLine.Replace('>', '').Trim()
                            $tokens = $cleanLine -split '\s+'
                            $candId = if ($tokens.Count -ge 2 -and $tokens[1] -match '^\d+$') { $tokens[1] } elseif ($tokens.Count -ge 3 -and $tokens[2] -match '^\d+$') { $tokens[2] } else { $null }
                            if ($candId -and $candId -match '^\d+$') {
                                Write-AgentLog "Found active session $candId for user '$cleanUser'. Logging off..." "JOB" "Yellow"
                                & $logoffExe $candId 2>$null
                                if ($LASTEXITCODE -eq 0) { $termOk = $true }
                                else {
                                    & $rwinstaExe $candId 2>$null
                                    if ($LASTEXITCODE -eq 0) { $termOk = $true }
                                }
                                $sessId = $candId
                            }
                        }
                    }
                }
            }

            # 3. Bulletproof Fallback: Terminate all processes owned by this user
            if ($cleanUser) {
                try {
                    $userProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
                        $pOwner = (Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction SilentlyContinue).User
                        $pOwner -and ($pOwner -ieq $cleanUser -or $pOwner.EndsWith("\$cleanUser", [System.StringComparison]::OrdinalIgnoreCase))
                    }
                    if ($userProcs -and $userProcs.Count -gt 0) {
                        Write-AgentLog "Terminating $($userProcs.Count) running process(es) for '$cleanUser' to ensure complete session termination..." "JOB" "Yellow"
                        $userProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
                        $termOk = $true
                    }
                } catch {}
            }

            Write-AgentLog "Session termination completed for Session ID $sessId / User '$cleanUser'." "SUCCESS" "Green"

            $resultBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = "Session $(if ($sessId) { $sessId } else { 'auto-detected' }) ($cleanUser) logged off successfully."
                details  = @{
                    sessionId   = $sessId
                    username    = $cleanUser
                    terminatedAt= (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                }
            } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resultBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "Session logoff failed: $($_.Exception.Message)" "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $_.Exception.Message
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # Helper: Configure TSplus AppControl.ini
    function Configure-TSplusAppControl {
        param(
            [string]$CompanyName,
            [string]$SanitizedFolder,
            [string]$Username,
            [string]$CompanyRoot,
            [string]$TallyDir
        )

        try {
            $iniCandidates = @(
                "C:\Program Files (x86)\TSplus\UserDesktop\files\AppControl.ini",
                "C:\Program Files\TSplus\UserDesktop\files\AppControl.ini",
                "C:\wsession\AppControl.ini"
            )

            $iniPath = $iniCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
            if (-not $iniPath) { return }

            $machine = $env:COMPUTERNAME
            $fullUser = "$machine\$Username"
            $filesDir = Split-Path $iniPath

            # Explicit ACLs on TSplus binaries so execution is never blocked
            $fpExe = Join-Path $filesDir "floatingpanel.exe"
            if (Test-Path $fpExe) {
                try {
                    $aclFp = Get-Acl $fpExe
                    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Username, "ReadAndExecute", "Allow")
                    $aclFp.AddAccessRule($rule)
                    Set-Acl -Path $fpExe -AclObject $aclFp
                } catch {}
            }
            $foldExe = "C:\Program Files (x86)\TSplus\UserDesktop\files\folder.exe"
            if (-not (Test-Path $foldExe)) { $foldExe = Join-Path $filesDir "folder.exe" }
            if (Test-Path $foldExe) {
                try {
                    $aclFl = Get-Acl $foldExe
                    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Username, "ReadAndExecute", "Allow")
                    $aclFl.AddAccessRule($rule)
                    Set-Acl -Path $foldExe -AclObject $aclFl
                } catch {}
            }

            # Backup INI before modification
            try { Copy-Item $iniPath "$iniPath.bak_last" -Force } catch {}

            # Parse INI
            $lines = Get-Content $iniPath -Encoding Default
            $sections = [System.Collections.Generic.List[object]]::new()
            $preamble = [System.Collections.Generic.List[string]]::new()
            $curSec = $null
            $maxAppIdx = 0

            foreach ($line in $lines) {
                $t = $line.Trim()
                if ($t.StartsWith("[") -and $t.EndsWith("]")) {
                    $curSec = [ordered]@{
                        Header = $t
                        Lines = [System.Collections.Generic.List[string]]::new()
                        KeyValues = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
                    }
                    if ($t -match '^\[App(\d+)\]$') {
                        $idx = [int]$matches[1]
                        if ($idx -gt $maxAppIdx) { $maxAppIdx = $idx }
                    }
                    $sections.Add($curSec)
                } else {
                    if ($null -eq $curSec) {
                        $preamble.Add($line)
                    } else {
                        $curSec.Lines.Add($line)
                        $eq = $t.IndexOf('=')
                        if ($eq -gt 0) {
                            $k = $t.Substring(0, $eq).Trim()
                            $v = $t.Substring($eq + 1).Trim()
                            $curSec.KeyValues[$k] = $v
                        }
                    }
                }
            }

            $SetSecVal = {
                param($sec, $key, $val)
                $sec.KeyValues[$key] = $val
                $found = $false
                for ($i = 0; $i -lt $sec.Lines.Count; $i++) {
                    if ($sec.Lines[$i].Trim().StartsWith("$key=", [System.StringComparison]::OrdinalIgnoreCase)) {
                        $sec.Lines[$i] = "$key=$val"
                        $found = $true
                        break
                    }
                }
                if (-not $found) {
                    $sec.Lines.Add("$key=$val")
                }
            }

            $AddUser = {
                param($list, $u)
                $m = $env:COMPUTERNAME
                $fu = "$m\$u"
                if ([string]::IsNullOrWhiteSpace($list)) { return $fu }
                $norm = $list.Replace(',', ';')
                $parts = $norm.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
                $cleaned = [System.Collections.Generic.List[string]]::new()
                $present = $false
                foreach ($p in $parts) {
                    $pt = $p.Trim()
                    if (-not $pt) { continue }
                    if (-not $pt.Contains("\")) { $pt = "$m\$pt" }
                    if ($pt -ieq $fu -or $pt -ieq $u) {
                        $present = $true
                        if (-not $cleaned.Contains($fu)) { $cleaned.Add($fu) }
                    } else {
                        if (-not $cleaned.Contains($pt)) { $cleaned.Add($pt) }
                    }
                }
                if (-not $present) { $cleaned.Add($fu) }
                return ($cleaned -join ';')
            }

            $RemUser = {
                param($list, $u)
                if ([string]::IsNullOrWhiteSpace($list)) { return "" }
                $m = $env:COMPUTERNAME
                $fu = "$m\$u"
                $norm = $list.Replace(',', ';')
                $parts = $norm.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
                $kept = [System.Collections.Generic.List[string]]::new()
                foreach ($p in $parts) {
                    $pt = $p.Trim()
                    if (-not $pt) { continue }
                    if ($pt -inotlike "*\$u" -and $pt -ine $fu -and $pt -ine $u) {
                        $kept.Add($pt)
                    }
                }
                return ($kept -join ';')
            }

            # 1. Update FloatingPanel & Remote Desktop
            $fpFound = $false
            foreach ($s in $sections) {
                $an = ($s.KeyValues["appname"] | Out-String).Trim()
                if ($an -ieq "FloatingPanel" -or $an -ieq "Floating Panel") {
                    $curU = if ($s.KeyValues.ContainsKey("users")) { $s.KeyValues["users"] } else { "" }
                    $newU = & $AddUser $curU $Username
                    & $SetSecVal $s "users" $newU
                    $fpFound = $true
                }
                if ($an -ieq "Microsoft Remote Desktop") {
                    $curU = if ($s.KeyValues.ContainsKey("users")) { $s.KeyValues["users"] } else { "" }
                    $newU = & $RemUser $curU $Username
                    & $SetSecVal $s "users" $newU
                }
            }

            if (-not $fpFound) {
                $maxAppIdx++
                $newFp = [ordered]@{
                    Header = "[App$maxAppIdx]"
                    Lines = [System.Collections.Generic.List[string]]::new()
                    KeyValues = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
                }
                & $SetSecVal $newFp "appname" "FloatingPanel"
                & $SetSecVal $newFp "path" (if (Test-Path $fpExe) { $fpExe } else { "C:\Program Files (x86)\TSplus\UserDesktop\FloatingPanel.exe" })
                & $SetSecVal $newFp "startup" $filesDir
                & $SetSecVal $newFp "cmdline" ""
                & $SetSecVal $newFp "groups" ""
                & $SetSecVal $newFp "users" $fullUser
                & $SetSecVal $newFp "maximized" "no"
                & $SetSecVal $newFp "minimized" "no"
                & $SetSecVal $newFp "hide" "no"
                & $SetSecVal $newFp "all_users" "no"
                & $SetSecVal $newFp "folder" ""
                $sections.Add($newFp)
            }

            # 2. Tally App
            $tallyAppName = "$SanitizedFolder`_TallyPrime"
            $tExe = Join-Path $CompanyRoot "tally.exe"
            if (-not (Test-Path $tExe)) {
                $altT = Join-Path $TallyDir "tally.exe"
                if (Test-Path $altT) { $tExe = $altT }
            }
            $tStartup = Split-Path $tExe

            $tallySec = $null
            foreach ($s in $sections) {
                $an = ($s.KeyValues["appname"] | Out-String).Trim()
                if ($an -ieq $tallyAppName -or $an -ieq "$SanitizedFolder`_Tally") {
                    $tallySec = $s
                    break
                }
            }

            if ($tallySec) {
                $curU = if ($tallySec.KeyValues.ContainsKey("users")) { $tallySec.KeyValues["users"] } else { "" }
                $newU = & $AddUser $curU $Username
                & $SetSecVal $tallySec "users" $newU
                if (Test-Path $tExe) {
                    & $SetSecVal $tallySec "path" $tExe
                    & $SetSecVal $tallySec "startup" $tStartup
                }
            } else {
                $maxAppIdx++
                $newTally = [ordered]@{
                    Header = "[App$maxAppIdx]"
                    Lines = [System.Collections.Generic.List[string]]::new()
                    KeyValues = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
                }
                & $SetSecVal $newTally "appname" $tallyAppName
                & $SetSecVal $newTally "path" $tExe
                & $SetSecVal $newTally "startup" $tStartup
                & $SetSecVal $newTally "cmdline" ""
                & $SetSecVal $newTally "groups" ""
                & $SetSecVal $newTally "users" $fullUser
                & $SetSecVal $newTally "maximized" "no"
                & $SetSecVal $newTally "minimized" "no"
                & $SetSecVal $newTally "hide" "no"
                & $SetSecVal $newTally "all_users" "no"
                & $SetSecVal $newTally "folder" ""
                $sections.Add($newTally)
            }

            # 3. Folder App
            $folderAppName = "$SanitizedFolder`_Folder"
            $folderSec = $null
            foreach ($s in $sections) {
                $an = ($s.KeyValues["appname"] | Out-String).Trim()
                $cl = ($s.KeyValues["cmdline"] | Out-String).Trim()
                if ($an -ieq $folderAppName -or $an -ieq $SanitizedFolder -or $cl -ieq $CompanyRoot) {
                    $folderSec = $s
                    break
                }
            }

            if ($folderSec) {
                $curU = if ($folderSec.KeyValues.ContainsKey("users")) { $folderSec.KeyValues["users"] } else { "" }
                $newU = & $AddUser $curU $Username
                & $SetSecVal $folderSec "users" $newU
                & $SetSecVal $folderSec "cmdline" $CompanyRoot
            } else {
                $maxAppIdx++
                $newFold = [ordered]@{
                    Header = "[App$maxAppIdx]"
                    Lines = [System.Collections.Generic.List[string]]::new()
                    KeyValues = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
                }
                & $SetSecVal $newFold "appname" $folderAppName
                & $SetSecVal $newFold "path" $foldExe
                & $SetSecVal $newFold "startup" (Split-Path $foldExe)
                & $SetSecVal $newFold "cmdline" $CompanyRoot
                & $SetSecVal $newFold "groups" ""
                & $SetSecVal $newFold "users" $fullUser
                & $SetSecVal $newFold "maximized" "no"
                & $SetSecVal $newFold "minimized" "no"
                & $SetSecVal $newFold "hide" "no"
                & $SetSecVal $newFold "all_users" "no"
                & $SetSecVal $newFold "folder" ""
                $sections.Add($newFold)
            }

            # Write Back File
            $out = [System.Collections.Generic.List[string]]::new()
            $out.AddRange($preamble)
            foreach ($s in $sections) {
                $out.Add($s.Header)
                $out.AddRange($s.Lines)
            }
            [System.IO.File]::WriteAllLines($iniPath, $out.ToArray(), [System.Text.Encoding]::Default)
            Write-AgentLog "TSplus configuration updated for user '$Username' ($fullUser) in $iniPath" "SUCCESS" "Green"
        } catch {
            Write-AgentLog "TSplus configuration notice: $($_.Exception.Message)" "WARN" "Yellow"
        }
    }

    # -------------------------------------------------------------
    # ACTION 4: PROVISION_TALLY_USER (Zero-Trust Storage & NTFS Isolation)
    # -------------------------------------------------------------
    $compName = $job.companyName
    $pass = $job.password
    $rawDrive = $job.drive
    $expiryStr = $job.expiryDate
    $setupTSplus = ($job.setupTSplus -ne $false)

    try {
        # 1. Clean Drive Letter and Folder Name
        $driveLetter = $rawDrive.Replace("Drive", "").Trim().TrimEnd('\')
        if (-not $driveLetter.EndsWith(':')) { $driveLetter = "$driveLetter`:" }
        
        $sanitizedFolder = $compName.Trim() -replace '\s+', '_'
        $sanitizedFolder = $sanitizedFolder -replace '[\\/:*?"<>|]', ''

        $companyRoot = "$driveLetter\$sanitizedFolder"
        $tallyDir = "$companyRoot\Tally"
        $tallyDataDir = "$companyRoot\Data"
        $exportDir = "$companyRoot\Export"
        $tdlDir = "$companyRoot\tdl"
        $langDir = "$companyRoot\lang"
        $backupDir = "$companyRoot\Backup"
        $docsDir = "$companyRoot\Documents"

        # 2. Create Directory Structure (Only create Data and Export on first-time setup)
        $companyAlreadyExists = (Test-Path $companyRoot)
        $iniAlreadyExists = (Test-Path "$tallyDir\tally.ini") -or (Test-Path "$companyRoot\tally.ini")

        if (-not $companyAlreadyExists -or -not $iniAlreadyExists) {
            @($companyRoot, $tallyDir, $tallyDataDir, $exportDir, $tdlDir, $langDir, $backupDir, $docsDir) | ForEach-Object {
                if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
            }
        } else {
            @($companyRoot, $tallyDir, $backupDir, $docsDir) | ForEach-Object {
                if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
            }
        }

        # 3. Create / Update Windows Local User (Universal: Cmdlet -> ADSI -> net.exe)
        $userConfigured = $false
        if (Get-Command Get-LocalUser -ErrorAction SilentlyContinue) {
            try {
                $existingUser = Get-LocalUser -Name $uName -ErrorAction SilentlyContinue
                $secPass = ConvertTo-SecureString $pass -AsPlainText -Force
                if ($existingUser) {
                    Set-LocalUser -Name $uName -Password $secPass -Description "Tally Client - $compName" -PasswordNeverExpires $true -ErrorAction Stop
                } else {
                    New-LocalUser -Name $uName -Password $secPass -FullName $compName -Description "Tally Client - $compName" -PasswordNeverExpires $true -ErrorAction Stop | Out-Null
                }
                $userConfigured = $true
            } catch {}
        }

        if (-not $userConfigured) {
            try {
                $comp = $env:COMPUTERNAME
                $adsiComp = [ADSI]"WinNT://$comp"
                $adsiUser = $null
                try { $adsiUser = [ADSI]"WinNT://$comp/$uName,user" } catch {}
                if ($adsiUser -and $adsiUser.Name) {
                    $adsiUser.SetPassword($pass)
                    $adsiUser.Description = "Tally Client - $compName"
                    $adsiUser.SetInfo()
                } else {
                    $newUser = $adsiComp.Create("User", $uName)
                    $newUser.SetPassword($pass)
                    $newUser.Description = "Tally Client - $compName"
                    $newUser.FullName = $compName
                    $newUser.SetInfo()
                }
                $userConfigured = $true
            } catch {
                & net.exe user "$uName" "$pass" /add /comment:"Tally Client - $compName" /expires:never /y 2>$null
                if ($LASTEXITCODE -ne 0) {
                    & net.exe user "$uName" "$pass" /y 2>$null
                }
            }
        }

        # Account Expiry
        if ($expiryStr) {
            try {
                $parsedExpiry = [datetime]::MinValue
                if ([datetime]::TryParse($expiryStr, [ref]$parsedExpiry) -and $parsedExpiry -gt (Get-Date)) {
                    if (Get-Command Set-LocalUser -ErrorAction SilentlyContinue) {
                        Set-LocalUser -Name $uName -AccountExpires $parsedExpiry -ErrorAction SilentlyContinue
                    }
                }
            } catch {}
        }

        # Add to Remote Desktop Users
        try {
            if (Get-Command Add-LocalGroupMember -ErrorAction SilentlyContinue) {
                Add-LocalGroupMember -Group "Remote Desktop Users" -Member $uName -ErrorAction SilentlyContinue
            } else {
                & net.exe localgroup "Remote Desktop Users" "$uName" /add 2>$null
            }
        } catch {
            & net.exe localgroup "Remote Desktop Users" "$uName" /add 2>$null
        }

        # 4. Zero-Trust NTFS Security Isolation on the Entire Drive Root
        if (-not $driveLetter.ToUpper().StartsWith("C:")) {
            $driveRoot = "$driveLetter\"
            try {
                Write-AgentLog "Applying Full Drive-Level Zero-Trust NTFS Isolation on $driveRoot for '$uName'..." "JOB" "Cyan"
                
                # 1. Native icacls enforcement on Entire Drive Root:
                # Strip inheritance and purge all default shared groups (Users, Everyone, Authenticated Users)
                & icacls.exe "$driveRoot" /inheritance:r 2>$null | Out-Null
                & icacls.exe "$driveRoot" /remove:g "Users" "Everyone" "Authenticated Users" 2>$null | Out-Null
                & icacls.exe "$driveRoot" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "$uName`:(OI)(CI)F" "superclient:(OI)(CI)F" 2>$null | Out-Null
                
                # 2. .NET AccessControl API enforcement on Entire Drive Root
                $driveAcl = Get-Acl -Path $driveRoot -ErrorAction SilentlyContinue
                if ($driveAcl) {
                    $driveAcl.SetAccessRuleProtection($true, $false)
                    $inherit = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
                    $prop = [System.Security.AccessControl.PropagationFlags]"None"
                    $allow = [System.Security.AccessControl.AccessControlType]"Allow"

                    $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", $inherit, $prop, $allow)))
                    $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", $inherit, $prop, $allow)))
                    $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($uName, "FullControl", $inherit, $prop, $allow)))

                    try {
                        $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("superclient", "FullControl", $inherit, $prop, $allow)))
                    } catch {}

                    Set-Acl -Path $driveRoot -AclObject $driveAcl -ErrorAction SilentlyContinue
                }

                # Ensure companyRoot inherits from the drive root seamlessly
                try {
                    & icacls.exe "$companyRoot" /inheritance:e 2>$null | Out-Null
                } catch {}

                Write-AgentLog "Full Drive-Level NTFS Isolation successfully applied on $driveRoot for '$uName'." "SUCCESS" "Green"
            } catch {
                Write-AgentLog "Notice applying Drive-Level ACL on $driveRoot : $($_.Exception.Message)" "WARN" "Yellow"
            }
        } else {
            # Safety Fallback: System Drive C: cannot have entire root locked out; isolate company directory
            try {
                Write-AgentLog "System Drive C: detected. Applying Directory-Level Zero-Trust NTFS Isolation on $companyRoot for '$uName'..." "WARN" "Yellow"
                & icacls.exe "$companyRoot" /inheritance:r 2>$null | Out-Null
                & icacls.exe "$companyRoot" /remove:g "Users" "Everyone" "Authenticated Users" 2>$null | Out-Null
                & icacls.exe "$companyRoot" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "$uName`:(OI)(CI)F" "superclient:(OI)(CI)F" 2>$null | Out-Null

                $acl = New-Object System.Security.AccessControl.DirectorySecurity
                $acl.SetAccessRuleProtection($true, $false)
                $inherit = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
                $prop = [System.Security.AccessControl.PropagationFlags]"None"
                $allow = [System.Security.AccessControl.AccessControlType]"Allow"

                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", $inherit, $prop, $allow)))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", $inherit, $prop, $allow)))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($uName, "FullControl", $inherit, $prop, $allow)))

                try {
                    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("superclient", "FullControl", $inherit, $prop, $allow)))
                } catch {}

                Set-Acl -Path $companyRoot -AclObject $acl
            } catch {
                Write-AgentLog "Notice applying ACL on $companyRoot : $($_.Exception.Message)" "WARN" "Yellow"
            }
        }

        # 5. Clone Tally Template or Run Installer & Configure tally.ini
        $tallyCandidates = @()
        if ($job.tallyVersion) {
            $tallyCandidates += "C:\TallyVersions\$($job.tallyVersion)"
            $tallyCandidates += "C:\TallyVersions\$($job.tallyVersion.Trim())"
        }
        if (Test-Path "C:\TallyVersions") {
            Get-ChildItem -Path "C:\TallyVersions" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                $tallyCandidates += $_.FullName
            }
            $tallyCandidates += "C:\TallyVersions"
        }
        $tallyCandidates += @(
            "C:\TallyMaster",
            "C:\Program Files\TallyPrime",
            "C:\Program Files (x86)\TallyPrime",
            "C:\TallyPrime",
            "C:\Program Files (x86)\Tally.ERP9",
            "C:\Tally.ERP9"
        )

        if ($env:USERPROFILE) {
            $tallyCandidates += "$env:USERPROFILE\Downloads\Tally"
            $tallyCandidates += "$env:USERPROFILE\Downloads"
        }
        $tallyCandidates += "C:\Downloads\Tally"
        $tallyCandidates += "C:\Downloads"

        if (Test-Path "C:\Users") {
            $profiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue
            foreach ($p in $profiles) {
                $tallyCandidates += "$($p.FullName)\Downloads\Tally"
                $tallyCandidates += "$($p.FullName)\Downloads"
            }
        }

        $tallyInstalled = $false

        foreach ($cand in $tallyCandidates) {
            if (-not (Test-Path $cand)) { continue }
            if (Test-Path "$cand\tally.exe") {
                & robocopy.exe "$cand" "$tallyDir" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np /XF *.lock *.dmp /XD "$cand\Data" "$cand\logs" 2>$null | Out-Null
                $tallyInstalled = (Test-Path "$tallyDir\tally.exe")
                if ($tallyInstalled) { break }
            }
        }

        if (-not $tallyInstalled) {
            $allDrives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
            foreach ($d in $allDrives) {
                $letter = $d.DeviceID
                $existingTally = Get-ChildItem -Path "$letter\" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    if (Test-Path "$($_.FullName)\Tally\tally.exe") { "$($_.FullName)\Tally" }
                } | Select-Object -First 1
                if ($existingTally) {
                    & robocopy.exe "$existingTally" "$tallyDir" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np /XF *.lock *.dmp /XD "$existingTally\Data" "$existingTally\logs" 2>$null | Out-Null
                    $tallyInstalled = (Test-Path "$tallyDir\tally.exe")
                    if ($tallyInstalled) { break }
                }
            }
        }

        if (-not $tallyInstalled) {
            foreach ($cand in $tallyCandidates) {
                if (-not (Test-Path $cand)) { continue }
                $setupFile = Get-ChildItem -Path $cand -Filter "*.exe" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "(setup|installer|tallyprime|tally)" } | Select-Object -First 1
                if ($setupFile) {
                    try {
                        Start-Process -FilePath $setupFile.FullName -ArgumentList "/silent /installpath=`"$tallyDir`"" -Wait -PassThru -NoNewWindow
                        if (Test-Path "$tallyDir\tally.exe") {
                            $tallyInstalled = $true
                            break
                        }
                    } catch {}
                }
            }
        }

        # Configure tally.ini (Data and Export paths) across all locations in companyRoot
        $targetInis = @(
            "$companyRoot\Tally\tally.ini",
            "$companyRoot\tally.ini"
        )
        Get-ChildItem -Path $companyRoot -Filter "tally*.ini" -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            if ($targetInis -notcontains $_.FullName) { $targetInis += $_.FullName }
        }

        foreach ($ini in $targetInis) {
            Set-TallyIniPaths -iniPath $ini -companyRoot $companyRoot -dataDir $tallyDataDir -exportDir $exportDir
            Lock-TallyIniPermissions -iniPath $ini -uName $uName
        }

        # 6. Audit Receipt
        $receipt = @"
Company: $compName
Username: $uName
Drive: $driveLetter
Root: $companyRoot
Tally: $tallyDir\tally.exe
Data: $tallyDataDir
Export: $exportDir
Date: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
"@
        Set-Content -Path "$companyRoot\Provisioning_Receipt.txt" -Value $receipt -Force

        # 7. Configure TSplus Application & Floating Panel
        if ($setupTSplus) {
            try {
                Configure-TSplusAppControl -CompanyName $compName -SanitizedFolder $sanitizedFolder -Username $uName -CompanyRoot $companyRoot -TallyDir $tallyDir
            } catch {
                Write-AgentLog "Notice configuring TSplus: $($_.Exception.Message)" "WARN" "Yellow"
            }
        }

        Write-AgentLog "User '$uName' provisioned on $driveLetter for '$compName'." "SUCCESS" "Green"

        $resultBody = @{
            serverId = $ServerId
            jobId    = $jobId
            status   = "COMPLETED"
            message  = "User '$uName' created on $driveLetter ($companyRoot) with Zero-Trust NTFS and TSplus config."
            details  = @{
                username = $uName
                company  = $compName
                drive    = $driveLetter
                rootPath = $companyRoot
            }
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resultBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
    }
    catch {
        Write-AgentLog "Provisioning failed for '$uName': $($_.Exception.Message)" "ERROR" "Red"
        $failBody = @{
            serverId = $ServerId
            jobId    = $jobId
            status   = "FAILED"
            message  = $_.Exception.Message
        } | ConvertTo-Json
        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
    }

    # -------------------------------------------------------------
    # ACTION 5: INITIALIZE_DISK / CREATE_PARTITION (Online, Initialize GPT if RAW, Partition from Unallocated Space & Format NTFS)
    # -------------------------------------------------------------
    if ($action -eq "INITIALIZE_DISK" -or $action -eq "CREATE_PARTITION") {
        $diskNum = if ($job.diskNumber -ne $null) { [int]$job.diskNumber } else { 1 }
        $reqLetter = if ($job.driveLetter) { $job.driveLetter.Replace(':', '').Replace('Drive', '').Trim().ToUpper() } else { "D" }
        $reqLabel = if ($job.label) { $job.label.Trim() } else { "Data_$reqLetter" }
        $sizeGb = if ($job.sizeGB) { [double]$job.sizeGB } else { 0 }

        Write-AgentLog "Executing INITIALIZE_DISK: Disk $diskNum -> Drive $reqLetter`: (Label: $reqLabel, Size: $(if ($sizeGb -gt 0) { "$sizeGb GB" } else { "All Unallocated" }))..." "JOB" "Cyan"

        $success = $false
        $errorMsg = ""

        try {
            # 1. Bring online and clear read-only
            Set-Disk -Number $diskNum -IsOffline $false -IsReadOnly $false -ErrorAction SilentlyContinue

            # 2. Initialize GPT if RAW
            Initialize-Disk -Number $diskNum -PartitionStyle GPT -ErrorAction SilentlyContinue

            # 3. Create partition using unallocated space without drive letter first (prevents Windows Explorer raw format popup)
            if ($sizeGb -gt 0) {
                $bytes = [long]($sizeGb * 1GB)
                $part = New-Partition -DiskNumber $diskNum -Size $bytes -AssignDriveLetter:$false -ErrorAction Stop
            } else {
                $part = New-Partition -DiskNumber $diskNum -UseMaximumSize -AssignDriveLetter:$false -ErrorAction Stop
            }

            # 4. Format NTFS Volume BEFORE assigning letter
            Format-Volume -Partition $part -FileSystem NTFS -NewFileSystemLabel $reqLabel -Confirm:$false -ErrorAction Stop | Out-Null
            Set-Partition -InputObject $part -NewDriveLetter $reqLetter -ErrorAction Stop | Out-Null

            $success = (Test-Path "$reqLetter`:\")
        } catch {
            $errorMsg = $_.Exception.Message
            # Diskpart fallback (format BEFORE assign letter prevents Explorer format popup)
            try {
                $dpSizeLine = if ($sizeGb -gt 0) { "create partition primary size=" + [int]($sizeGb * 1024) } else { "create partition primary" }
                $dpScript = @(
                    "select disk $diskNum",
                    "online disk noerr",
                    "attributes disk clear readonly noerr",
                    "convert gpt noerr",
                    $dpSizeLine,
                    "format fs=ntfs quick label=`"$reqLabel`"",
                    "assign letter=$reqLetter"
                ) -join "`r`n"

                $tmpDp = "$env:TEMP\init_disk_$diskNum.txt"
                Set-Content -Path $tmpDp -Value $dpScript -Force
                & diskpart.exe /s $tmpDp *>$null
                Remove-Item $tmpDp -Force -ErrorAction SilentlyContinue

                $success = (Test-Path "$reqLetter`:\")
            } catch {
                $errorMsg += " | Diskpart error: $($_.Exception.Message)"
            }
        }

        if ($success) {
            $msg = "Disk $diskNum successfully onlined, initialized (GPT), and formatted as Drive $reqLetter`: ($reqLabel, NTFS)."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = $msg
                details  = @{
                    diskNumber  = $diskNum
                    driveLetter = "$reqLetter`:"
                    label       = $reqLabel
                }
            } | ConvertTo-Json -Depth 5
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } else {
            $msg = "Failed to initialize Disk ${diskNum}: $errorMsg"
            Write-AgentLog $msg "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $msg
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 6: EXTEND_DRIVE / EXTEND_VOLUME (Resize Partition using unallocated space)
    # -------------------------------------------------------------
    if ($action -eq "EXTEND_DRIVE" -or $action -eq "EXTEND_VOLUME" -or $action -eq "RESIZE_PARTITION") {
        $diskNum = if ($job.diskNumber -ne $null) { [int]$job.diskNumber } else { 0 }
        $reqLetter = if ($job.driveLetter) { $job.driveLetter.Replace(':', '').Replace('Drive', '').Trim().ToUpper() } else { "E" }
        $addSizeGb = if ($job.sizeGB) { [double]$job.sizeGB } else { 0 }

        Write-AgentLog "Executing EXTEND_DRIVE: Drive $reqLetter`: on Disk $diskNum (Add Size: $(if ($addSizeGb -gt 0) { "$addSizeGb GB" } else { "All Available Unallocated" }))..." "JOB" "Cyan"

        $success = $false
        $errorMsg = ""

        try {
            $part = Get-Partition -DriveLetter $reqLetter -ErrorAction Stop
            $supp = Get-PartitionSupportedSize -DriveLetter $reqLetter -ErrorAction Stop
            if ($addSizeGb -gt 0) {
                $targetBytes = [long]($part.Size + ($addSizeGb * 1GB))
                if ($targetBytes -gt $supp.SizeMax) { $targetBytes = $supp.SizeMax }
                Resize-Partition -DriveLetter $reqLetter -Size $targetBytes -ErrorAction Stop
            } else {
                Resize-Partition -DriveLetter $reqLetter -Size $supp.SizeMax -ErrorAction Stop
            }
            $success = $true
        } catch {
            $errorMsg = $_.Exception.Message
            try {
                $dpLines = if ($addSizeGb -gt 0) {
                    @("select volume $reqLetter", "extend size=" + [int]($addSizeGb * 1024) + " noerr")
                } else {
                    @("select volume $reqLetter", "extend noerr")
                } -join "`r`n"

                $tmpDp = "$env:TEMP\extend_disk_$reqLetter.txt"
                Set-Content -Path $tmpDp -Value $dpLines -Force
                & diskpart.exe /s $tmpDp *>$null
                Remove-Item $tmpDp -Force -ErrorAction SilentlyContinue
                $success = $true
            } catch {
                $errorMsg += " | Diskpart error: $($_.Exception.Message)"
            }
        }

        if ($success) {
            $msg = "Drive $reqLetter`: successfully extended using unallocated space on Disk $diskNum."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = $msg
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } else {
            $msg = "Failed to extend Drive $reqLetter`: $errorMsg"
            Write-AgentLog $msg "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $msg
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 7: LOCKDOWN_DRIVE (Enforce Zero-Trust Drive Root Hardening)
    # -------------------------------------------------------------
    if ($action -eq "LOCKDOWN_DRIVE" -or $action -eq "HARDEN_DRIVE") {
        $reqLetter = if ($job.driveLetter) { $job.driveLetter.Replace(':', '').Replace('Drive', '').Trim().ToUpper() } else { "E" }

        if ($reqLetter -eq "C") {
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = "System drive C: is protected and cannot be locked down."
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            return
        }

        try {
            & icacls.exe "$reqLetter`:\" /inheritance:r 2>$null | Out-Null
            & icacls.exe "$reqLetter`:\" /remove:g "Users" "Everyone" "Authenticated Users" /q 2>$null | Out-Null
            & icacls.exe "$reqLetter`:\" /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "superclient:(OI)(CI)F" /q 2>$null | Out-Null
            $msg = "Zero-Trust NTFS security isolation enforced on Drive $reqLetter`:. Broad groups (Users/Everyone) stripped from root."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "COMPLETED"
                message  = $msg
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            $msg = "Failed to lockdown Drive $reqLetter`: $($_.Exception.Message)"
            Write-AgentLog $msg "ERROR" "Red"
            $failBody = @{
                serverId = $ServerId
                jobId    = $jobId
                status   = "FAILED"
                message  = $msg
            } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 8: EXPORT_CLIENT_DATA (1-Click Migration Phase 1)
    # -------------------------------------------------------------
    if ($action -eq "EXPORT_CLIENT_DATA") {
        $migrationId = if ($job.migrationId) { $job.migrationId } else { [guid]::NewGuid().ToString() }
        $uploadUrl = if ($job.uploadUrl) { $job.uploadUrl } else { "$PortalUrl/api/agent/migration/upload-chunk" }
        $company = if ($job.companyName) { $job.companyName } else { "" }
        $rawDrive = if ($job.drive) { $job.drive } else { "D:" }
        $driveLetter = $rawDrive.Replace(':', '').Replace('Drive', '').Trim().ToUpper()

        Write-AgentLog "Starting Client Export for '$username' (Company: $company) from Drive $driveLetter`: [Migration ID: $migrationId]" "INFO" "Cyan"

        # 1. Force logoff
        try {
            $q = quser 2>$null
            foreach ($line in ($q -split "`r?`n")) {
                if ($line -match $username) {
                    $tokens = $line -split '\s+'
                    for ($p = 1; $p -lt $tokens.Length; $p++) {
                        if ($tokens[$p] -match '^\d+$') {
                            logoff $tokens[$p] 2>$null | Out-Null
                            break
                        }
                    }
                }
            }
        } catch {}

        # 2. Disable user
        try {
            Disable-LocalUser -Name $username -ErrorAction SilentlyContinue | Out-Null
            & net user "$username" /active:no 2>$null | Out-Null
        } catch {}

        # 3. Locate client folder
        $driveRoot = "$driveLetter`:\"
        $cleanComp = ($company -replace '[^a-zA-Z0-9_\-]', '_').Trim('_')
        $clientDir = $null
        if ($cleanComp -and (Test-Path "$driveRoot$cleanComp")) { $clientDir = "$driveRoot$cleanComp" }
        elseif ($username -and (Test-Path "$driveRoot$username")) { $clientDir = "$driveRoot$username" }
        else {
            $candidates = Get-ChildItem -Path $driveRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
                $_.Name -notmatch '^\$' -and $_.Name -notmatch 'System Volume Information' -and $_.Name -notmatch '_MIGRATED_BACKUP_' -and
                (($username -and $_.Name -match [regex]::Escape($username)) -or ($cleanComp -and $_.Name -match [regex]::Escape($cleanComp)))
            }
            if ($candidates) { $clientDir = $candidates[0].FullName }
        }

        if (-not $clientDir -or -not (Test-Path $clientDir)) {
            $msg = "Client directory not found on Drive $driveLetter`: for user '$username' / company '$company'."
            Write-AgentLog $msg "ERROR" "Red"
            $failBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            return
        }

        # 4. Create ZIP — file-by-file, skip locked files (Tally gateway/license stay locked, that's fine)
        $tempZip = "$env:SystemDrive\Temp\mig_exp_$migrationId.zip"
        if (-not (Test-Path "$env:SystemDrive\Temp")) { New-Item -ItemType Directory -Path "$env:SystemDrive\Temp" -Force | Out-Null }
        if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }

        Write-AgentLog "Building ZIP from '$clientDir' (locked files will be skipped)..." "INFO" "Cyan"

        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem

        $includedFiles = 0
        $skippedFiles  = 0
        $zipStream = [System.IO.File]::Open($tempZip, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $zipArchive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)

        try {
            $allFiles = Get-ChildItem -Path $clientDir -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer }
            foreach ($file in $allFiles) {
                try {
                    # Open with ReadWrite share so we don't block Tally but can still read data
                    $fs = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                    $relPath = $file.FullName.Substring($clientDir.TrimEnd('\').Length + 1)
                    $entry   = $zipArchive.CreateEntry($relPath, [System.IO.Compression.CompressionLevel]::Fastest)
                    $entryStream = $entry.Open()
                    $buf = New-Object byte[] 65536
                    $n = 0
                    while (($n = $fs.Read($buf, 0, 65536)) -gt 0) { $entryStream.Write($buf, 0, $n) }
                    $entryStream.Close()
                    $fs.Close()
                    $includedFiles++
                } catch {
                    $skippedFiles++
                    Write-AgentLog "Skipped locked: $($file.Name)" "WARN" "Yellow"
                }
            }
        } finally {
            $zipArchive.Dispose()
            $zipStream.Close()
        }

        Write-AgentLog "ZIP complete: $includedFiles files included, $skippedFiles locked files skipped." "INFO" "Cyan"

        $fileLength = (Get-Item $tempZip).Length
        $sha = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash.ToLower()
        Write-AgentLog "Archive: $([math]::Round($fileLength/1MB, 1)) MB | SHA-256: $sha" "INFO" "Cyan"

        # 5. Upload entire ZIP as single streaming POST — no chunking, no timeouts from repeated connections
        $uploadFullUrl = "$PortalUrl/api/agent/migration/upload-full?migrationId=$migrationId&sha256=$sha&username=$([uri]::EscapeDataString($username))&company=$([uri]::EscapeDataString($company))&fileSize=$fileLength"

        Write-AgentLog "Streaming $([math]::Round($fileLength/1MB, 1)) MB to portal (single connection, 2h timeout)..." "INFO" "Cyan"

        $uploadStart = Get-Date
        try {
            $req = [System.Net.HttpWebRequest]::Create($uploadFullUrl)
            $req.Method        = "POST"
            $req.ContentType   = "application/octet-stream"
            $req.ContentLength = $fileLength
            $req.Timeout       = -1            # No connect timeout
            $req.ReadWriteTimeout = 7200000    # 2 hours read/write timeout
            $req.AllowWriteStreamBuffering = $false   # Stream directly, do not buffer in RAM

            $reqStream  = $req.GetRequestStream()
            $fileStream = [System.IO.File]::OpenRead($tempZip)
            $buf        = New-Object byte[] 131072   # 128KB copy buffer
            $sent       = 0
            $lastLog    = 0
            while (($n = $fileStream.Read($buf, 0, 131072)) -gt 0) {
                $reqStream.Write($buf, 0, $n)
                $sent += $n
                # Log every 50MB
                if (($sent - $lastLog) -ge (50 * 1024 * 1024)) {
                    $elSec   = [Math]::Max(1, ((Get-Date) - $uploadStart).TotalSeconds)
                    $speedMB = [Math]::Round($sent / $elSec / 1MB, 2)
                    Write-AgentLog "Uploaded $([math]::Round($sent/1MB,0))/$([math]::Round($fileLength/1MB,0)) MB @ ${speedMB} MB/s" "INFO" "Cyan"
                    $lastLog = $sent
                }
            }
            $fileStream.Close()
            $reqStream.Close()

            $resp       = $req.GetResponse()
            $reader     = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $respBody   = $reader.ReadToEnd()
            $resp.Close()

            $elTotal  = [Math]::Max(1, ((Get-Date) - $uploadStart).TotalSeconds)
            $avgSpeed = [Math]::Round($fileLength / $elTotal / 1MB, 2)
            Write-AgentLog "Upload complete in $([Math]::Round($elTotal))s @ avg ${avgSpeed} MB/s" "SUCCESS" "Green"
        } catch {
            throw "Upload failed: $($_.Exception.Message)"
        }

        # 6. Preserve source folder as backup
        try {
            $backupName = "$clientDir`_MIGRATED_BACKUP_$((Get-Date).ToString('yyyyMMdd_HHmmss'))"
            Rename-Item -Path $clientDir -NewName (Split-Path $backupName -Leaf) -Force -ErrorAction SilentlyContinue
        } catch {}

        if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }

        $succMsg = "Client data exported ($([math]::Round($fileLength / 1MB, 1)) MB, $includedFiles files, $skippedFiles locked skipped). SHA-256: $sha. Source preserved as backup."
        Write-AgentLog $succMsg "SUCCESS" "Green"
        $resBody = @{
            serverId = $ServerId
            jobId    = $jobId
            status   = "COMPLETED"
            message  = $succMsg
            details  = @{
                migrationId    = $migrationId
                sha256         = $sha
                fileSizeBytes  = $fileLength
                filesIncluded  = $includedFiles
                filesSkipped   = $skippedFiles
            }
        } | ConvertTo-Json
        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        return
    }

    # -------------------------------------------------------------
    # ACTION 9: IMPORT_CLIENT_DATA (1-Click Migration Phase 2)
    # -------------------------------------------------------------
    if ($action -eq "IMPORT_CLIENT_DATA") {
        $migrationId = if ($job.migrationId) { $job.migrationId } else { [guid]::NewGuid().ToString() }
        $downloadUrl = if ($job.downloadUrl) { $job.downloadUrl } else { "$PortalUrl/api/agent/migration/download-chunk" }
        $company = if ($job.companyName) { $job.companyName } else { "" }
        $rawDrive = if ($job.targetDrive) { $job.targetDrive } else { (if ($job.drive) { $job.drive } else { "E:" }) }
        $driveLetter = $rawDrive.Replace(':', '').Replace('Drive', '').Trim().ToUpper()
        $password = if ($job.password) { $job.password } else { "Pass#123" }
        $expectedSha = if ($job.sha256) { $job.sha256.Trim().ToLower() } else { "" }

        Write-AgentLog "Starting Client Import for '$username' onto Drive $driveLetter`: [Migration ID: $migrationId]" "INFO" "Cyan"

        $driveRoot = "$driveLetter`:\"
        if (-not (Test-Path $driveRoot)) {
            $msg = "Target Drive $driveLetter`: does not exist on this VPS."
            $failBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            return
        }

        $tempZip = "$env:SystemDrive\Temp\mig_imp_$migrationId.zip"
        if (-not (Test-Path "$env:SystemDrive\Temp")) { New-Item -ItemType Directory -Path "$env:SystemDrive\Temp" -Force | Out-Null }
        if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }

        # Single streaming download — one connection, 2h timeout, streams directly to disk
        $dUrl = "$downloadUrl`?migrationId=$migrationId&full=1"
        Write-AgentLog "Downloading archive from portal (single stream, 2h timeout)..." "INFO" "Cyan"

        $dlStart = Get-Date
        try {
            $dlReq = [System.Net.HttpWebRequest]::Create($dUrl)
            $dlReq.Method           = "GET"
            $dlReq.Timeout          = -1
            $dlReq.ReadWriteTimeout = 7200000   # 2 hours
            $dlResp   = $dlReq.GetResponse()
            $dlStream = $dlResp.GetResponseStream()
            $fOut     = [System.IO.File]::OpenWrite($tempZip)
            $buf      = New-Object byte[] 131072   # 128KB buffer
            $received = 0
            $lastLog  = 0
            $totalSize = $dlResp.ContentLength
            while (($n = $dlStream.Read($buf, 0, 131072)) -gt 0) {
                $fOut.Write($buf, 0, $n)
                $received += $n
                if (($received - $lastLog) -ge (50 * 1024 * 1024)) {
                    $elSec   = [Math]::Max(1, ((Get-Date) - $dlStart).TotalSeconds)
                    $speedMB = [Math]::Round($received / $elSec / 1MB, 2)
                    $pct     = if ($totalSize -gt 0) { [Math]::Round($received / $totalSize * 100) } else { "?" }
                    Write-AgentLog "Downloaded $([math]::Round($received/1MB,0)) MB ($pct%) @ ${speedMB} MB/s" "INFO" "Cyan"
                    $lastLog = $received
                }
            }
            $fOut.Close()
            $dlStream.Close()
            $dlResp.Close()
            $elTotal = [Math]::Max(1, ((Get-Date) - $dlStart).TotalSeconds)
            $avgSpd  = [Math]::Round($received / $elTotal / 1MB, 2)
            Write-AgentLog "Download complete: $([math]::Round($received/1MB,1)) MB in $([Math]::Round($elTotal))s @ avg ${avgSpd} MB/s" "SUCCESS" "Green"
        } catch {
            throw "Download failed: $($_.Exception.Message)"
        }

        $actualSha = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash.ToLower()
        if ($expectedSha -and ($actualSha -ne $expectedSha)) {
            $msg = "Integrity check failed! Expected SHA-256: $expectedSha, Actual: $actualSha"
            if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }
            $failBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $failBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            return
        }

        $cleanComp = ($company -replace '[^a-zA-Z0-9_\-]', '_').Trim('_')
        if (-not $cleanComp) { $cleanComp = $username }
        $targetDir = "$driveRoot$cleanComp"
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }

        # Extract
        [System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $targetDir)

        # Update tally.ini
        if (Test-Path "$targetDir\tally.ini") {
            try {
                $ini = Get-Content "$targetDir\tally.ini" -Raw
                $ini = $ini -replace '(?m)^(\s*Data\s*=\s*).*$', "`$1$targetDir\Data"
                Set-Content -Path "$targetDir\tally.ini" -Value $ini -Force
            } catch {}
        }

        # User creation & Zero-Trust
        & net user "$username" "$password" /add /comment:"Tally Client - $company" /expires:never /y 2>$null | Out-Null
        & net user "$username" "$password" /y 2>$null | Out-Null
        & net localgroup "Remote Desktop Users" "$username" /add 2>$null | Out-Null

        # Permissions
        try {
            & icacls.exe "$driveLetter`:\" /grant "$username`:(NP)(RX)" /q 2>$null | Out-Null
            & icacls.exe "$targetDir" /inheritance:r 2>$null | Out-Null
            & icacls.exe "$targetDir" /grant "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "superclient:(OI)(CI)F" "$username`:(OI)(CI)F" /q 2>$null | Out-Null
        } catch {}

        if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }

        $succMsg = "Client '$username' ($company) successfully migrated to Drive $driveLetter`: with Zero-Trust NTFS."
        Write-AgentLog $succMsg "SUCCESS" "Green"
        $resBody = @{
            serverId = $ServerId
            jobId    = $jobId
            status   = "COMPLETED"
            message  = $succMsg
            details  = @{ migrationId = $migrationId; targetDir = $targetDir; driveLetter = $driveLetter }
        } | ConvertTo-Json
        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        return
    }

    # -------------------------------------------------------------
    # ACTION 10: OPTIMIZE_SERVER (Server Auto-Optimization)
    # -------------------------------------------------------------
    if ($action -eq "OPTIMIZE_SERVER") {
        Write-AgentLog "Executing Server Auto-Optimization & Junk Cleanup..." "INFO" "Cyan"
        $cleaned = 0
        try {
            $q = quser 2>$null
            foreach ($line in ($q -split "`r?`n")) {
                if ($line -match 'Disc' -and ($line -match '1\+' -or $line -match '2\+' -or $line -match '3\+')) {
                    $tokens = $line -split '\s+'
                    for ($p = 1; $p -lt $tokens.Length; $p++) {
                        if ($tokens[$p] -match '^\d+$') {
                            logoff $tokens[$p] 2>$null | Out-Null
                            $cleaned++
                            break
                        }
                    }
                }
            }
        } catch {}

        # Temp purge
        $dirs = @("$env:TEMP", "C:\Windows\Temp", "C:\ProgramData\Microsoft\Windows\WER\ReportQueue", "C:\Windows\System32\spool\PRINTERS")
        $bytes = 0
        foreach ($d in $dirs) {
            if (Test-Path $d) {
                Get-ChildItem -Path $d -File -ErrorAction SilentlyContinue | Where-Object { (Get-Date) - $_.LastWriteTime -gt (New-TimeSpan -Hours 24) } | ForEach-Object {
                    $bytes += $_.Length
                    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
                }
            }
        }

        # SSD Trim
        try {
            Optimize-Volume -DriveLetter C -ReTrim -ErrorAction SilentlyContinue | Out-Null
            Get-Volume | Where-Object { $_.DriveType -eq 'Fixed' -and $_.DriveLetter -and $_.DriveLetter -ne 'C' } | ForEach-Object {
                Optimize-Volume -DriveLetter $_.DriveLetter -ReTrim -ErrorAction SilentlyContinue | Out-Null
            }
        } catch {}

        $msg = "Cleaned $cleaned stale session(s). Purged $([math]::Round($bytes / 1MB, 1)) MB junk files. Executed SSD ReTrim on all volumes."
        Write-AgentLog $msg "SUCCESS" "Green"
        $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = $msg } | ConvertTo-Json
        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        return
    }

    # -------------------------------------------------------------
    # ACTION 12: CONFIGURE_SHADOW_POLICY (Remote Desktop Shadowing)
    # -------------------------------------------------------------
    if ($action -eq "CONFIGURE_SHADOW_POLICY") {
        try {
            $shadowLevel = if ($job.shadowLevel) { [int]$job.shadowLevel } else { 2 }
            Write-AgentLog "Configuring RDS Shadowing policy to Level $shadowLevel..." "JOB" "Cyan"
            
            $tsPol = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"
            if (-not (Test-Path $tsPol)) { New-Item -Path $tsPol -Force | Out-Null }
            Set-ItemProperty -Path $tsPol -Name "Shadow" -Value $shadowLevel -Type DWord -Force
            Set-ItemProperty -Path $tsPol -Name "fAllowToGetHelp" -Value 1 -Type DWord -Force
            Set-ItemProperty -Path $tsPol -Name "fDenyTSConnections" -Value 0 -Type DWord -Force
            
            $tsTcp = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp"
            if (Test-Path $tsTcp) {
                Set-ItemProperty -Path $tsTcp -Name "Shadow" -Value $shadowLevel -Type DWord -Force
            }
            
            $msg = "Remote Desktop Session Shadowing configured to Level $shadowLevel (Full Control, Immediate Assist)."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "CONFIGURE_SHADOW_POLICY error: $_" "ERROR" "Red"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "$_" } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 14: CONFIGURE_DUPLICATE_SESSION_POLICY
    # -------------------------------------------------------------
    if ($action -eq "CONFIGURE_DUPLICATE_SESSION_POLICY") {
        try {
            $mode = if ($job.mode) { $job.mode } else { "Audit" }
            $grace = if ($job.gracePeriodSeconds) { [int]$job.gracePeriodSeconds } else { 15 }
            if ($grace -lt 5) { $grace = 15 }

            $global:DuplicateSessionMode = $mode
            $global:DuplicateGracePeriod = $grace

            $msg = "Duplicate session policy configured: Mode=$mode, GracePeriod=${grace}s."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "CONFIGURE_DUPLICATE_SESSION_POLICY error: $_" "ERROR" "Red"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "$_" } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 13: CAPTURE_SESSION_SCREEN (Instant Live Screen Snapshot)
    # -------------------------------------------------------------
    if ($action -eq "CAPTURE_SESSION_SCREEN") {
        try {
            $targetSess = if ($job.sessionId) { [int]$job.sessionId } else { 1 }
            Write-AgentLog "Capturing Live Screen for Session $targetSess ($uName)..." "JOB" "Cyan"

            $tempDir = "$env:ProgramData\InnovationVpsAgent"
            if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
            $screenFile = "$tempDir\screen_$targetSess.jpg"
            if (Test-Path $screenFile) { Remove-Item $screenFile -Force -ErrorAction SilentlyContinue }

            # Execute capture in session context via scheduled task trigger
            $taskName = "Agent_ScreenCap_$targetSess"
            $psCmd = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; `$w = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; `$h = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height; `$bmp = New-Object Drawing.Bitmap(`$w, `$h); `$g = [Drawing.Graphics]::FromImage(`$bmp); `$g.CopyFromScreen(0,0,0,0,`$bmp.Size); `$bmp.Save('$screenFile', [Drawing.Imaging.ImageFormat]::Jpeg); `$g.Dispose(); `$bmp.Dispose();"
            $encCmd = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($psCmd))
            
            & schtasks.exe /create /tn $taskName /tr "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encCmd" /sc ONCE /st 00:00 /it /f 2>$null | Out-Null
            & schtasks.exe /run /tn $taskName 2>$null | Out-Null
            Start-Sleep -Milliseconds 800
            & schtasks.exe /delete /tn $taskName /f 2>$null | Out-Null

            if (Test-Path $screenFile) {
                $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($screenFile))
                $msg = "Screen captured successfully ($($b64.Length) chars)"
                Write-AgentLog $msg "SUCCESS" "Green"
                $resBody = @{
                    serverId = $ServerId
                    jobId = $jobId
                    status = "COMPLETED"
                    message = $msg
                    details = @{
                        sessionId = $targetSess
                        screenBase64 = $b64
                        capturedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                    }
                } | ConvertTo-Json
                Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
            } else {
                throw "Screen file was not generated. Session may be disconnected or locked."
            }
        } catch {
            Write-AgentLog "CAPTURE_SESSION_SCREEN error: $_" "ERROR" "Red"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "$_" } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # ACTION 14: CONFIGURE_DUPLICATE_SESSION_POLICY
    # -------------------------------------------------------------
    if ($action -eq "CONFIGURE_DUPLICATE_SESSION_POLICY") {
        try {
            $mode = if ($job.mode) { $job.mode } else { "Audit" }
            $grace = if ($job.gracePeriodSeconds) { [int]$job.gracePeriodSeconds } else { 15 }
            if ($grace -lt 5) { $grace = 15 }

            $global:DuplicateSessionMode = $mode
            $global:DuplicateGracePeriod = $grace

            $msg = "Duplicate session policy configured: Mode=$mode, GracePeriod=${grace}s."
            Write-AgentLog $msg "SUCCESS" "Green"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "COMPLETED"; message = $msg } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-AgentLog "CONFIGURE_DUPLICATE_SESSION_POLICY error: $_" "ERROR" "Red"
            $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "$_" } | ConvertTo-Json
            Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
        }
        return
    }

    # -------------------------------------------------------------
    # FALLBACK: UNHANDLED ACTION
    # -------------------------------------------------------------
    Write-AgentLog "Unhandled action '$action' for Job ID: $jobId" "WARN" "Yellow"
    try {
        $resBody = @{ serverId = $ServerId; jobId = $jobId; status = "FAILED"; message = "Unhandled action '$action' on Windows agent" } | ConvertTo-Json
        Invoke-RestMethod -Uri $jobResultUrl -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $resBody -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
    } catch {}
    return
}

function Check-AndApplyAgentAutoUpdate {
    param ([string]$UpdateUrl = "")
    try {
        if (-not $InstalledScriptPath -or -not (Test-Path $InstalledScriptPath)) { return }
        $tempDownload = "$AgentInstallDir\VpsAgent.ps1.new"
        
        $effId = if ($script:ServerId) { $script:ServerId } else { $ServerId }
        if (-not $UpdateUrl) {
            $UpdateUrl = "https://vps.innovationwebworks.in/VpsAgent.ps1?serverId=" + [System.Uri]::EscapeDataString($effId)
        }

        # Download latest script from server
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12,Tls11,Tls'
        } catch {
            [Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192
        }
        Invoke-WebRequest -Uri $UpdateUrl -OutFile $tempDownload -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop

        if (Test-Path $tempDownload) {
            $newSize = (Get-Item $tempDownload).Length
            
            # Verify file is not empty and is valid PowerShell agent script
            if ($newSize -gt 15000) {
                $newContent = Get-Content $tempDownload -Raw -ErrorAction SilentlyContinue
                if ($newContent -match "Innovation Web Works" -and $newContent -match "Run-AgentWorker") {
                    # Compare logic hash excluding the ServerId line so ID differences never cause an update loop
                    $newClean = $newContent -replace '\[string\]\$ServerId\s*=\s*"[^"]*"', ''
                    $curClean = (Get-Content $InstalledScriptPath -Raw -ErrorAction SilentlyContinue) -replace '\[string\]\$ServerId\s*=\s*"[^"]*"', ''
                    
                    $sha = [System.Security.Cryptography.SHA256]::Create()
                    $newHash = [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($newClean)))
                    $curHash = [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($curClean)))

                    if ($newHash -ne $curHash) {
                        Write-AgentLog "[*] New agent version detected. Applying auto-update..." "UPDATE" "Cyan"
                        Move-Item -Path $tempDownload -Destination $InstalledScriptPath -Force
                        Write-AgentLog "[+] Agent script updated successfully! Triggering worker restart..." "UPDATE" "Green"
                        
                        & schtasks.exe /run /tn $TaskName 2>$null
                        exit 0
                    }
                }
            }
            Remove-Item $tempDownload -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Silently continue on network hiccups
    }
}

function Run-AgentWorker {
    param ([bool]$IsForeground = $false)

    # 1. Enforce single worker instance to avoid duplicate telemetry posts
    try {
        $curPid = $PID
        Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%VpsAgent%'" -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessId -ne $curPid -and ($_.CommandLine -match "RunWorker" -or $_.CommandLine -match "Foreground")
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {}

    # 2. Load persistent config if present and parameters were defaults
    if (Test-Path $ConfigFile) {
        try {
            $savedConf = Get-Content $ConfigFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
            if ($savedConf) {
                if ($savedConf.serverId) {
                    $script:ServerId = $savedConf.serverId
                }
                if ($savedConf.serverToken -and $ServerToken -eq "vps_sec_token_default") {
                    $script:ServerToken = $savedConf.serverToken
                }
                if ($savedConf.apiUrl -and $ApiUrl -eq "https://vps.innovationwebworks.in/api/agent/telemetry") {
                    $script:ApiUrl = $savedConf.apiUrl
                }
                if ($savedConf.intervalSeconds -and ($IntervalSeconds -eq 5 -or $IntervalSeconds -eq 10)) {
                    $script:IntervalSeconds = [int]$savedConf.intervalSeconds
                }
            }
        } catch {}
    }

    $sessionEventEndpoint = $ApiUrl.Replace("/telemetry", "/session-event")
    $instantJobsEndpoint  = $ApiUrl.Replace("/telemetry", "/listen-jobs")
    $jobResultEndpoint    = $ApiUrl.Replace("/telemetry", "/job-result")
    $modeStr = if ($IsForeground) { "Foreground Debug Console" } else { "24/7 Background System Daemon (Session 0 - Survives Admin Logoff)" }

    function Send-VpsTelemetrySync {
        param ([bool]$Quick = $false)

        try {
            $ram = Get-RamStats
            $disks = Get-DiskStats
            $physDisks = Get-PhysicalDiskStats
            $sessions = Get-UserSessions
            $hw = Get-HardwareSpecs

            $payload = @{
                serverId = $ServerId
                serverToken = $ServerToken
                cpuUsage = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
                ram = $ram
                disks = $disks
                physicalDisks = $physDisks
                occupiedDrives = (Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | ForEach-Object { $_.DeviceID.ToUpper() })
                tallyVersions = (Get-InstalledTallyVersions)
                activeUsers = $sessions.activeUsers
                activeUsersCount = $sessions.activeCount
                disconnectedUsers = $sessions.disconnectedUsers
                disconnectedUsersCount = $sessions.disconnectedCount
                detailedSessions = $sessions.detailedSessions
                allServerUsers = $sessions.allServerUsers
                disabledServerUsers = $sessions.disabledServerUsers
                hardware = $hw
                specs = if ($hw) { $hw.specs } else { $null }
                uptime = "Active"
                timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            } | ConvertTo-Json -Depth 5

            $headers = @{
                "Content-Type" = "application/json"
                "X-Server-Token" = $ServerToken
            }

            # Send Telemetry & Check for any pending jobs as secondary safeguard
            $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $payload -TimeoutSec 15 -ErrorAction Stop
            
            $logType = if ($Quick) { "INSTANT-SYNC" } else { "SYNC" }
            Write-AgentLog "Telemetry synced. Active: $($sessions.activeCount) | Disconnected: $($sessions.disconnectedCount) | Accounts: $($sessions.allServerUsers.Count)" $logType "Green"

            # Process Pending Remote Jobs if any returned
            $pJobs = @($response.pendingJobs)
            if ($pJobs -and $pJobs.Count -gt 0) {
                foreach ($pJob in $pJobs) {
                    if ($pJob -and $pJob.id) {
                        Invoke-VpsJobExecution -job $pJob -jobResultUrl $jobResultEndpoint
                    }
                }
            }
        } catch {
            Write-AgentLog "Warning: Telemetry send failed ($($_.Exception.Message))." "WARN" "Yellow"
        }
    }

    Write-AgentLog "==========================================================================" "START" "Cyan"
    Write-AgentLog " Innovation Web Works VPS Agent Engine (Real-Time 0-Sec Push Enabled)" "START" "Green"
    Write-AgentLog " Execution Mode : $modeStr" "INFO" "Yellow"
    Write-AgentLog " Process PID    : $PID (User: $env:USERNAME)" "INFO" "Yellow"
    Write-AgentLog " Server ID      : $ServerId" "INFO" "Yellow"
    Write-AgentLog " Instant Pipe   : $instantJobsEndpoint" "INFO" "Magenta"
    Write-AgentLog " Cadence Timer  : $IntervalSeconds seconds" "INFO" "Yellow"
    Write-AgentLog "==========================================================================" "START" "Cyan"

    # Initial telemetry sync on startup
    Send-VpsTelemetrySync -Quick $false
    $lastTelemetryTime = [DateTime]::UtcNow
    $lastUpdateCheck = [DateTime]::UtcNow

    while ($true) {
        try {
            # 1. OPTION B: 0-SECOND INSTANT PUSH LONG-POLL LISTENER
            # The server holds this request and returns IMMEDIATELY (< 50ms) the moment an admin
            # clicks Change Password, Disable/Enable User, or Logoff in the web portal!
            $listenUrl = "$instantJobsEndpoint`?serverId=$([System.Uri]::EscapeDataString($ServerId))&serverToken=$([System.Uri]::EscapeDataString($ServerToken))"
            $listenHeaders = @{
                "Content-Type"   = "application/json"
                "X-Server-Token" = $ServerToken
                "X-Server-Id"    = $ServerId
            }

            $listenResponse = $null
            try {
                $listenResponse = Invoke-RestMethod -Uri $listenUrl -Method Get -Headers $listenHeaders -TimeoutSec 30 -ErrorAction Stop
            } catch {
                # In case of temporary network glitch or proxy timeout, continue
            }

            # If jobs were dispatched instantly via the push pipe
            $instantList = @($listenResponse.pendingJobs)
            if ($instantList -and $instantList.Count -gt 0) {
                Write-AgentLog "[*] [INSTANT PUSH] Received $($instantList.Count) jobs in 0-second realtime pipe!" "INSTANT" "Magenta"
                foreach ($pJob in $instantList) {
                    if ($pJob -and $pJob.id) {
                        Invoke-VpsJobExecution -job $pJob -jobResultUrl $jobResultEndpoint
                    }
                }
                # Immediately send updated state so the portal reflects changes with 0 lag!
                Send-VpsTelemetrySync -Quick $true
            }

            # 2. Routine Hardware & Session Telemetry (every $IntervalSeconds)
            $now = [DateTime]::UtcNow
            if (($now - $lastTelemetryTime).TotalSeconds -ge $IntervalSeconds) {
                Send-VpsTelemetrySync -Quick $false
                $lastTelemetryTime = $now
            }

            # 3. Periodic Background Auto-Update Check (every 30 minutes)
            if (($now - $lastUpdateCheck).TotalMinutes -ge 30) {
                Check-AndApplyAgentAutoUpdate
                $lastUpdateCheck = $now
            }

            # Flush queued offline events if any
            Flush-QueueEvents -sessionEventUrl $sessionEventEndpoint

        } catch {
            Write-AgentLog "Warning in worker loop: $($_.Exception.Message)" "WARN" "Yellow"
            Start-Sleep -Seconds 1
        }
    }
}

# =========================================================================
# Execution Entry Point & Switch Routing
# =========================================================================

if ($InstallService) {
    $success = Install-VpsServiceTask -TargetServerId $ServerId -TargetServerToken $ServerToken -TargetApiUrl $ApiUrl -TargetInterval $IntervalSeconds
    exit $(if ($success) { 0 } else { 1 })
}

if ($UninstallService) {
    $success = Uninstall-VpsServiceTask
    exit $(if ($success) { 0 } else { 1 })
}

if ($StatusService) {
    Get-VpsServiceStatus
    exit 0
}

if ($RestartService) {
    Restart-VpsServiceTask
    exit 0
}

if ($RunWorker) {
    Run-AgentWorker -IsForeground $false
    exit 0
}

if ($Foreground) {
    Run-AgentWorker -IsForeground $true
    exit 0
}

# If launched interactively without command-line switches, display the interactive management menu
if ([Environment]::UserInteractive) {
    Show-InteractiveMenu
    exit 0
}

# Non-interactive default: run worker directly
Run-AgentWorker -IsForeground $false
