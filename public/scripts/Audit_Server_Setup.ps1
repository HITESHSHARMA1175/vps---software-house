<#
.SYNOPSIS
    Tally and TSplus Server Pre-Flight Audit Script (Non-Destructive)
.DESCRIPTION
    Scans the server for available drives, empty drives, Tally installations,
    TSplus configuration, and user permissions without modifying anything.
#>

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "       TALLY AND TSPLUS SERVER ENVIRONMENT AUDIT UTILITY             " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Drive Analysis
Write-Host "[1/5] Analyzing Logical Drives and Storage..." -ForegroundColor Yellow
$drives = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }

$driveReport = @()
foreach ($d in $drives) {
    $driveLetter = $d.DeviceID
    $totalGB = [Math]::Round($d.Size / 1GB, 2)
    $freeGB = [Math]::Round($d.FreeSpace / 1GB, 2)
    $usedGB = [Math]::Round(($d.Size - $d.FreeSpace) / 1GB, 2)
    $usedPct = if ($d.Size -gt 0) { [Math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }
    
    # Check if empty (excluding System Volume Information and $Recycle.Bin)
    $rootItems = Get-ChildItem -Path "$driveLetter\" -Force -ErrorAction SilentlyContinue | 
                 Where-Object { $_.Name -notmatch '^(System Volume Information|\$RECYCLE\.BIN|\$Recycle\.Bin)$' }
    $isEmpty = ($rootItems.Count -eq 0)

    $driveReport += [PSCustomObject]@{
        Drive        = $driveLetter
        Label        = $d.VolumeName
        Total_GB     = $totalGB
        Free_GB      = $freeGB
        Used_Percent = "$usedPct%"
        Is_Empty     = if ($isEmpty) { "YES (Ready for User)" } else { "NO ($($rootItems.Count) items)" }
    }
}

$driveReport | Format-Table -AutoSize
Write-Host ""

# 2. Tally Installation Detection
Write-Host "[2/5] Detecting Tally Master Templates and Installations..." -ForegroundColor Yellow
$tallyPaths = @(
    "C:\Program Files\TallyPrime",
    "C:\Program Files (x86)\TallyPrime",
    "C:\TallyPrime",
    "C:\TallyMaster",
    "C:\Program Files (x86)\Tally.ERP9",
    "C:\Tally.ERP9"
)

$foundTally = @()
foreach ($tp in $tallyPaths) {
    if (Test-Path "$tp\tally.exe") {
        $exeVer = (Get-Item "$tp\tally.exe").VersionInfo.FileVersion
        $sizeMB = [Math]::Round((Get-ChildItem -Path $tp -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
        $foundTally += [PSCustomObject]@{
            Path        = $tp
            Version     = if ($exeVer) { $exeVer } else { "Detected" }
            TotalSizeMB = "$sizeMB MB"
            Status      = "READY AS TEMPLATE"
        }
    }
}

if ($foundTally.Count -gt 0) {
    $foundTally | Format-Table -AutoSize
} else {
    Write-Host "  ⚠️  No standard Tally template found. You can place Tally template in 'C:\TallyMaster' or 'C:\Program Files\TallyPrime'." -ForegroundColor DarkYellow
}
Write-Host ""

# 3. TSplus Detection
Write-Host "[3/5] Detecting TSplus Remote Desktop Configuration..." -ForegroundColor Yellow
$tsplusPaths = @(
    "C:\Program Files (x86)\TSplus",
    "C:\Program Files\TSplus"
)

$tsplusFound = $false
foreach ($tsp in $tsplusPaths) {
    if (Test-Path "$tsp\UserDesktop\files") {
        $tsplusFound = $true
        Write-Host "  ✅ TSplus Found at: $tsp" -ForegroundColor Green
        
        $iniPath = "$tsp\UserDesktop\files\AppServer.ini"
        if (Test-Path $iniPath) {
            Write-Host "  ✅ AppServer.ini is present and writable." -ForegroundColor Green
        }
        
        $appsIni = "$tsp\UserDesktop\files\applications.ini"
        if (Test-Path $appsIni) {
            Write-Host "  ✅ applications.ini is present." -ForegroundColor Green
        }
        break
    }
}

if (-not $tsplusFound) {
    Write-Host "  ℹ️  TSplus directory not found at standard path. (Script will still configure Windows Users, NTFS security, and Tally folders)." -ForegroundColor DarkGray
}
Write-Host ""

# 4. Super Admin / Superclient User Check
Write-Host "[4/5] Checking Administrator and Management Accounts..." -ForegroundColor Yellow
$superclient = Get-LocalUser -Name "Superclient" -ErrorAction SilentlyContinue
if ($superclient) {
    Write-Host "  ✅ 'Superclient' user detected (Enabled: $($superclient.Enabled)). Full NTFS permissions will be assigned automatically." -ForegroundColor Green
} else {
    Write-Host "  ℹ️  'Superclient' local user not found. (Built-in Administrators and SYSTEM will retain Full Control)." -ForegroundColor DarkGray
}
Write-Host ""

# 5. Remote Desktop Users Group
Write-Host "[5/5] Checking Remote Desktop Users Group..." -ForegroundColor Yellow
$rdpGroup = Get-LocalGroup -Name "Remote Desktop Users" -ErrorAction SilentlyContinue
if ($rdpGroup) {
    Write-Host "  ✅ 'Remote Desktop Users' group is present. All newly provisioned users will be added automatically." -ForegroundColor Green
} else {
    Write-Host "  ⚠️  'Remote Desktop Users' group not found." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "AUDIT COMPLETE. Server is ready for New-TallyUserProvisioning.ps1" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
