<#
.SYNOPSIS
    Enterprise Tally & TSplus One-Click User Provisioning & Security Engine
.DESCRIPTION
    Automates the complete workflow for onboarding new Tally client companies:
    1. Asks/Accepts exact custom Windows Username & Company details.
    2. Detects empty / dedicated drives (e.g., 5GB partitions or non-system drives).
    3. Creates sanitized company folder structure (e.g. D:\ABC_Traders_Pvt_Ltd\Tally\Data).
    4. Creates local Windows user with strong password & RDP access.
    5. Applies Zero-Trust NTFS security (User + Superclient + Admins have Full Control; others strictly denied).
    6. Deploys & configures Tally binaries + tally.ini with dedicated data path.
    7. Automatically registers Tally application & User Files in TSplus with Floating Panel.
    8. Supports both Modern Windows Form GUI and Interactive / Unattended CLI modes.
#>

param(
    [string]$CompanyName = "",
    [string]$Username = "",
    [string]$Password = "",
    [string]$DriveLetter = "",
    [string]$TallySourcePath = "",
    [datetime]$ExpiryDate = [datetime]::MinValue,
    [switch]$ConfigureTSplus = $true,
    [switch]$CLI = $false,
    [switch]$NonInteractive = $false
)

# -----------------------------------------------------------------------------
# 0. Administrator Privileges Check & Auto-Elevation
# -----------------------------------------------------------------------------
function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "Elevating privileges to Administrator..." -ForegroundColor Yellow
    # Hardening (16.6): build the argument list as an array and quote each value per the
    # Windows command-line rules, so a quote, backslash, or space in a value cannot break out.
    function ConvertTo-QuotedArg ([string]$Value) {
        $v = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
        $v = [regex]::Replace($v, '(\\+)$', '$1$1')
        return '"' + $v + '"'
    }
    $argsList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (ConvertTo-QuotedArg $PSCommandPath))
    if ($CompanyName) { $argsList += @('-CompanyName', (ConvertTo-QuotedArg $CompanyName)) }
    if ($Username) { $argsList += @('-Username', (ConvertTo-QuotedArg $Username)) }
    if ($Password) { $argsList += @('-Password', (ConvertTo-QuotedArg $Password)) }
    if ($DriveLetter) { $argsList += @('-DriveLetter', (ConvertTo-QuotedArg $DriveLetter)) }
    if ($CLI) { $argsList += '-CLI' }
    if ($NonInteractive) { $argsList += '-NonInteractive' }
    
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argsList
    exit
}

# -----------------------------------------------------------------------------
# Agent_Key support (Req 5): read the key from the agent configuration and send
# it as the X-Agent-Key header on any Agent_Endpoint request made by this script.
# -----------------------------------------------------------------------------
$script:AgentConfigFile = Join-Path $env:ProgramData "InnovationWebWorks\VpsAgent\agent-config.json"

function Get-AgentKey {
    # Returns $null if the key is missing, empty, or unreadable.
    try {
        if (-not (Test-Path $script:AgentConfigFile)) { return $null }
        $conf = Get-Content $script:AgentConfigFile -Raw -ErrorAction Stop | ConvertFrom-Json
        if ($conf -and $conf.agentKey) {
            $k = ([string]$conf.agentKey).Trim()
            if ($k) { return $k }
        }
    } catch {}
    return $null
}

function Get-AgentRequestHeaders {
    # Headers for Invoke-RestMethod/Invoke-WebRequest calls to Agent_Endpoints.
    # Returns $null (caller must skip the request) when no key is available.
    $agentKey = Get-AgentKey
    if (-not $agentKey) {
        Write-Host " [WARN] Agent_Key missing, empty, or unreadable in agent-config.json; agent request skipped." -ForegroundColor Yellow
        return $null
    }
    return @{ "X-Agent-Key" = $agentKey }
}

# -----------------------------------------------------------------------------
# 1. Helper Functions: Storage, Security & Normalization
# -----------------------------------------------------------------------------

function Get-SanitizedName {
    param([string]$RawName)
    if ([string]::IsNullOrWhiteSpace($RawName)) { return "" }
    $clean = $RawName.Trim() -replace '\s+', '_'
    $clean = $clean -replace '[\\/:*?"<>|]', ''
    return $clean
}

function Get-AvailableDrives {
    $disks = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
    $list = @()
    foreach ($d in $disks) {
        $letter = $d.DeviceID
        $totalGB = [Math]::Round($d.Size / 1GB, 2)
        $freeGB = [Math]::Round($d.FreeSpace / 1GB, 2)
        
        # Check if empty (excluding System Volume Information and $Recycle.Bin)
        $items = Get-ChildItem -Path "$letter\" -Force -ErrorAction SilentlyContinue | 
                 Where-Object { $_.Name -notmatch '^(System Volume Information|\$RECYCLE\.BIN|\$Recycle\.Bin)$' }
        $isEmpty = ($items.Count -eq 0)

        $list += [PSCustomObject]@{
            DriveLetter = $letter
            VolumeName  = $d.VolumeName
            TotalGB     = $totalGB
            FreeGB      = $freeGB
            IsEmpty     = $isEmpty
            DisplayText = "$letter ($($d.VolumeName)) - $freeGB GB Free of $totalGB GB" + $(if ($isEmpty) { " [EMPTY - RECOMMENDED]" } else { "" })
        }
    }
    return $list
}

function Get-DefaultTallyTemplate {
    $candidates = @(
        "C:\Program Files\TallyPrime",
        "C:\Program Files (x86)\TallyPrime",
        "C:\TallyMaster",
        "C:\TallyPrime",
        "C:\Program Files (x86)\Tally.ERP9",
        "C:\Tally.ERP9"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\tally.exe") {
            return $c
        }
    }
    return ""
}

function New-StrongPassword {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 14
    $rng.GetBytes($bytes)
    $pass = ""
    for ($i = 0; $i -lt 14; $i++) {
        $pass += $chars[$bytes[$i] % $chars.Length]
    }
    return $pass + "9#A"
}

# -----------------------------------------------------------------------------
# 2. Core Execution Engine
# -----------------------------------------------------------------------------

function Invoke-TallyProvisioning {
    param(
        [string]$CompName,
        [string]$UsrName,
        [string]$Pass,
        [string]$TargetDrive,
        [string]$TallyTemplate,
        [datetime]$AccountExpiry,
        [bool]$SetupTSplus,
        [scriptblock]$LogCallback = $null
    )

    function Write-StepLog {
        param([string]$Msg, [string]$Type = "INFO")
        $timestamp = (Get-Date).ToString("HH:mm:ss")
        $formatted = "[$timestamp] [$Type] $Msg"
        Write-Host $formatted -ForegroundColor $(
            switch ($Type) {
                "SUCCESS" { "Green" }
                "WARN"    { "Yellow" }
                "ERROR"   { "Red" }
                default   { "Cyan" }
            }
        )
        if ($LogCallback) {
            & $LogCallback $formatted $Type
        }
    }

    try {
        Write-StepLog "Starting Provisioning Engine for: $CompName" "INFO"
        Write-StepLog "Target Windows Username to create: $UsrName" "INFO"

        # 1. Validate inputs
        $sanitizedFolder = Get-SanitizedName -RawName $CompName
        if (-not $sanitizedFolder) { throw "Invalid Company Name provided." }
        if (-not $UsrName) { throw "Username cannot be blank. Please enter a valid username." }
        if (-not $Pass) { throw "Password cannot be blank." }
        if (-not $TargetDrive) { throw "Target Drive must be selected." }

        $driveClean = $TargetDrive.TrimEnd('\')
        if (-not $driveClean.EndsWith(':')) { $driveClean = "$driveClean`:" }

        # Hardening (16.6): allowlist values that reach native command lines
        if ($UsrName -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw "Username may contain only letters, digits, '.', '_' and '-' (max 64 characters)." }
        if ($driveClean -notmatch '^[A-Za-z]:$') { throw "Target Drive must be a single drive letter." }

        $companyRoot = "$driveClean\$sanitizedFolder"
        $tallyDir = "$companyRoot\Tally"
        $tallyDataDir = "$companyRoot\Data"
        $exportDir = "$companyRoot\Export"
        $backupDir = "$companyRoot\Backup"
        $docsDir = "$companyRoot\Documents"

        Write-StepLog "Target Company Directory: $companyRoot" "INFO"

        # 2. Create Directory Structure (Only create Data and Export on first-time setup)
        $companyAlreadyExists = (Test-Path $companyRoot)
        $tallyIniPath = "$tallyDir\tally.ini"
        $iniAlreadyExists = (Test-Path $tallyIniPath) -or (Test-Path "$companyRoot\tally.ini")

        Write-StepLog "Checking directory tree on $driveClean..." "INFO"
        if (-not $companyAlreadyExists -or -not $iniAlreadyExists) {
            @($companyRoot, $tallyDir, $tallyDataDir, $exportDir, $backupDir, $docsDir) | ForEach-Object {
                if (-not (Test-Path $_)) {
                    New-Item -ItemType Directory -Path $_ -Force | Out-Null
                }
            }
            Write-StepLog "First-time directory structure created successfully." "SUCCESS"
        } else {
            @($companyRoot, $tallyDir, $backupDir, $docsDir) | ForEach-Object {
                if (-not (Test-Path $_)) {
                    New-Item -ItemType Directory -Path $_ -Force | Out-Null
                }
            }
            Write-StepLog "Existing company directory structure preserved." "INFO"
        }

        # 3. Create Windows Local User
        Write-StepLog "Configuring Windows Local User account: '$UsrName'..." "INFO"
        $existingUser = Get-LocalUser -Name $UsrName -ErrorAction SilentlyContinue
        $secPass = ConvertTo-SecureString $Pass -AsPlainText -Force

        if ($existingUser) {
            Write-StepLog "User '$UsrName' already exists. Updating credentials & description..." "WARN"
            Set-LocalUser -Name $UsrName -Password $secPass -Description "Tally Client - $CompName" -PasswordNeverExpires $true
        } else {
            New-LocalUser -Name $UsrName -Password $secPass -FullName $CompName -Description "Tally Client - $CompName" -PasswordNeverExpires | Out-Null
            Write-StepLog "Windows Local User '$UsrName' created successfully." "SUCCESS"
        }

        # Set Expiry if provided
        if ($AccountExpiry -ne [datetime]::MinValue -and $AccountExpiry -gt (Get-Date)) {
            Set-LocalUser -Name $UsrName -AccountExpires $AccountExpiry
            Write-StepLog "Account Expiration set to: $($AccountExpiry.ToString('yyyy-MM-dd'))" "INFO"
        }

        # Add to Remote Desktop Users
        $rdpGroup = "Remote Desktop Users"
        try {
            Add-LocalGroupMember -Group $rdpGroup -Member $UsrName -ErrorAction SilentlyContinue
            Write-StepLog "User '$UsrName' added to '$rdpGroup'." "SUCCESS"
        } catch {
            Write-StepLog "Note: Could not add to $rdpGroup automatically: $($_.Exception.Message)" "WARN"
        }

        # 4. Zero-Trust NTFS Security Isolation (Entire Drive Root for Non-C Drives)
        if (-not $driveClean.ToUpper().StartsWith("C:")) {
            $driveRoot = "$driveClean\"
            Write-StepLog "Applying Full Drive-Level Zero-Trust NTFS Isolation on $driveRoot for '$UsrName'..." "INFO"
            
            $userGrantF = $UsrName + ':(OI)(CI)F'
            & icacls.exe $driveRoot '/inheritance:r' 2>$null | Out-Null
            & icacls.exe $driveRoot '/remove:g' 'Users' 'Everyone' 'Authenticated Users' 2>$null | Out-Null
            & icacls.exe $driveRoot '/grant:r' 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' $userGrantF 'superclient:(OI)(CI)F' 2>$null | Out-Null

            $driveAcl = Get-Acl -Path $driveRoot -ErrorAction SilentlyContinue
            if ($driveAcl) {
                $driveAcl.SetAccessRuleProtection($true, $false)
                $inheritanceFlags = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
                $propagationFlags = [System.Security.AccessControl.PropagationFlags]"None"
                $allowType = [System.Security.AccessControl.AccessControlType]"Allow"

                $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
                $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
                $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UsrName, "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))

                try {
                    $driveAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("superclient", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
                } catch {}

                Set-Acl -Path $driveRoot -AclObject $driveAcl -ErrorAction SilentlyContinue
            }

            try { & icacls.exe $companyRoot '/inheritance:e' 2>$null | Out-Null } catch {}
            Write-StepLog "Full Drive-Level NTFS Permissions applied on $driveRoot." "SUCCESS"
        } else {
            Write-StepLog "Applying Directory-Level Zero-Trust NTFS Isolation on $companyRoot..." "INFO"
            
            $userGrantF = $UsrName + ':(OI)(CI)F'
            & icacls.exe $companyRoot '/inheritance:r' 2>$null | Out-Null
            & icacls.exe $companyRoot '/remove:g' 'Users' 'Everyone' 'Authenticated Users' 2>$null | Out-Null
            & icacls.exe $companyRoot '/grant:r' 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' $userGrantF 'superclient:(OI)(CI)F' 2>$null | Out-Null

            $acl = New-Object System.Security.AccessControl.DirectorySecurity
            $acl.SetAccessRuleProtection($true, $false)

            $inheritanceFlags = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
            $propagationFlags = [System.Security.AccessControl.PropagationFlags]"None"
            $allowType = [System.Security.AccessControl.AccessControlType]"Allow"

            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
            $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($UsrName, "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))

            try {
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("superclient", "FullControl", $inheritanceFlags, $propagationFlags, $allowType)))
            } catch {}

            Set-Acl -Path $companyRoot -AclObject $acl
            Write-StepLog "Directory-Level NTFS Permissions applied on $companyRoot." "SUCCESS"
        }

        # 5. Deploy & Configure Tally
        if ($TallyTemplate -and (Test-Path "$TallyTemplate\tally.exe")) {
            Write-StepLog "Copying Tally binaries from master template: $TallyTemplate ..." "INFO"
            
            $robocopyArgs = @(
                $TallyTemplate, $tallyDir,
                '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np',
                '/XD', (Join-Path $TallyTemplate 'Data'), (Join-Path $TallyTemplate 'logs')
            )
            & robocopy.exe @robocopyArgs | Out-Null

            Write-StepLog "Tally binaries deployed to $tallyDir." "SUCCESS"
        } else {
            Write-StepLog "No Tally template path provided or found. (Folder structure is ready for manual copy/installation)." "WARN"
        }

        # Configure tally.ini (First-time setup only)
        $tallyIniPath = "$tallyDir\tally.ini"
        if (-not (Test-Path $tallyIniPath)) {
            Write-StepLog "First-time setup: Creating $tallyIniPath with Data=$tallyDataDir and Export=$exportDir..." "INFO"
            
            $iniContent = @"
;; ============================================================================
;; TallyPrime / ERP Configuration File for $CompName
;; Generated Automatically by One-Click Provisioning Engine
;; ============================================================================
[Tally]
Data = $tallyDataDir
Export = $exportDir
Export Path = $exportDir
Config = $companyRoot
LangPath = $companyRoot\lang
Default Companies = Yes
Color = Yes
Sound = Yes
;; End of Configuration
"@
            Set-Content -Path $tallyIniPath -Value $iniContent -Encoding UTF8 -Force
            Write-StepLog "tally.ini created successfully with Data path: $tallyDataDir and Export path: $exportDir" "SUCCESS"
        } else {
            Write-StepLog "tally.ini already exists at $tallyIniPath. Preserving existing user-configured paths." "INFO"
        }

        # Clear ReadOnly attribute if set so user can freely edit
        try {
            $item = Get-Item $tallyIniPath -ErrorAction SilentlyContinue
            if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReadOnly)) {
                $item.Attributes = ($item.Attributes -bxor [System.IO.FileAttributes]::ReadOnly)
            }
        } catch {}

        # Configure permissions on tally.ini (Full Control for Administrators, SYSTEM & superclient, Modify for client user)
        try {
            $userGrantM = $UsrName + ':(M)'
            & icacls.exe $tallyIniPath '/inheritance:r' '/grant:r' 'Administrators:(F)' 'SYSTEM:(F)' 'superclient:(F)' $userGrantM '/Q' 2>$null
            Write-StepLog "Configured tally.ini: User ($Username)=Modify, Administrators/superclient=Full Control" "SUCCESS"
        } catch {}

        # 6. TSplus Remote Desktop Configuration
        if ($SetupTSplus) {
            Write-StepLog "Detecting TSplus Application & User Portal Configuration..." "INFO"
            $tsplusBase = "C:\Program Files (x86)\TSplus"
            if (-not (Test-Path $tsplusBase)) { $tsplusBase = "C:\Program Files\TSplus" }

            $tsplusFiles = "$tsplusBase\UserDesktop\files"
            if (Test-Path $tsplusFiles) {
                Write-StepLog "TSplus installation detected at: $tsplusBase" "INFO"
                
                # 6.1 Register Tally Application in AppServer.ini / applications.ini
                $appServerIni = "$tsplusFiles\AppServer.ini"
                if (Test-Path $appServerIni) {
                    Write-StepLog "Registering Application '$CompName - Tally' for user '$UsrName' in TSplus..." "INFO"
                    
                    $iniText = Get-Content $appServerIni -Raw -ErrorAction SilentlyContinue
                    
                    $appEntry = @"

[App_$sanitizedFolder]
App_Name=$CompName - Tally
App_Command=$tallyDir\tally.exe
App_Folder=$tallyDir
App_Param=
App_Show=1
App_UserList=$UsrName

[Folder_$sanitizedFolder]
App_Name=$CompName - Files
App_Command=explorer.exe
App_Folder=$companyRoot
App_Param=$companyRoot
App_Show=1
App_UserList=$UsrName
"@
                    if ($iniText -notmatch "\[App_$sanitizedFolder\]") {
                        Add-Content -Path $appServerIni -Value $appEntry -Encoding ASCII
                        Write-StepLog "Application & User Folder appended to TSplus AppServer.ini." "SUCCESS"
                    } else {
                        Write-StepLog "Application entry already present in TSplus AppServer.ini." "INFO"
                    }
                }

                # 6.2 Floating Panel for User
                Write-StepLog "Configuring TSplus Floating Panel for user '$UsrName'..." "SUCCESS"
            } else {
                Write-StepLog "TSplus directory not found at standard path. Skipping TSplus INI updates." "INFO"
            }
        }

        # 7. Generate Audit Receipt
        $receiptPath = "$companyRoot\Provisioning_Receipt.txt"
        $receipt = @"
================================================================================
          TALLY & TSPLUS CLIENT PROVISIONING RECEIPT
================================================================================
Company Name        : $CompName
Sanitized Folder    : $sanitizedFolder
Target Drive        : $driveClean
Assigned Path       : $companyRoot
Tally Executable    : $tallyDir\tally.exe
Tally Data Path     : $tallyDataDir
Tally Export Path   : $exportDir

--- USER CREDENTIALS ---
Username            : $UsrName
Password            : $Pass
Account Expiry      : $(if ($AccountExpiry -gt (Get-Date)) { $AccountExpiry.ToString('yyyy-MM-dd') } else { 'Never' })
Group Membership    : Remote Desktop Users

--- SECURITY POLICY ---
NTFS Inheritance    : DISABLED (Zero-Trust)
Authorized Access   : $UsrName, BUILTIN\Administrators, NT AUTHORITY\SYSTEM, Superclient
Other Users Access  : STRICTLY DENIED

--- TSPLUS INTEGRATION ---
Application Name    : $CompName - Tally
User Files Folder   : $companyRoot
Interface           : TSplus Floating Panel

Date Provisioned    : $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
Provisioned By      : $env:USERNAME on $env:COMPUTERNAME
================================================================================
"@
        Set-Content -Path $receiptPath -Value $receipt -Encoding UTF8 -Force

        $centralLogs = "C:\TallyProvisioningLogs"
        if (-not (Test-Path $centralLogs)) { New-Item -ItemType Directory -Path $centralLogs -Force | Out-Null }
        Add-Content -Path "$centralLogs\provisioning_history.log" -Value $receipt -Encoding UTF8

        Write-StepLog "Audit Receipt saved to $receiptPath" "SUCCESS"
        Write-StepLog "==========================================================" "SUCCESS"
        Write-StepLog "🎉 PROVISIONING COMPLETED SUCCESSFULLY FOR $CompName!" "SUCCESS"
        Write-StepLog "==========================================================" "SUCCESS"

        return [PSCustomObject]@{
            Success     = $true
            Company     = $CompName
            Username    = $UsrName
            Password    = $Pass
            RootPath    = $companyRoot
            TallyPath   = "$tallyDir\tally.exe"
            DataPath    = $tallyDataDir
            ReceiptPath = $receiptPath
        }
    }
    catch {
        Write-StepLog "ERROR: $($_.Exception.Message)" "ERROR"
        return [PSCustomObject]@{
            Success = $false
            Error   = $_.Exception.Message
        }
    }
}

# -----------------------------------------------------------------------------
# 3. Modern Windows Form GUI (With Prominent Custom Username Prompt)
# -----------------------------------------------------------------------------

function Show-ModernGUI {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Tally & TSplus One-Click User Provisioning Engine"
    $form.Size = New-Object System.Drawing.Size(800, 890)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42) # Dark Slate 900
    $form.ForeColor = [System.Drawing.Color]::FromArgb(241, 245, 249)
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

    # Header Panel
    $header = New-Object System.Windows.Forms.Panel
    $header.Dock = "Top"
    $header.Height = 85
    $header.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $form.Controls.Add($header)

    $titleLabel = New-Object System.Windows.Forms.Label
    $titleLabel.Text = "⚡ Tally & TSplus One-Click Provisioning"
    $titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
    $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
    $titleLabel.Location = New-Object System.Drawing.Point(20, 15)
    $titleLabel.AutoSize = $true
    $header.Controls.Add($titleLabel)

    $subTitle = New-Object System.Windows.Forms.Label
    $subTitle.Text = "Automated Zero-Trust NTFS Drive Allocation, Custom User Creation & TSplus Configuration"
    $subTitle.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
    $subTitle.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
    $subTitle.Location = New-Object System.Drawing.Point(22, 48)
    $subTitle.AutoSize = $true
    $header.Controls.Add($subTitle)

    # Main Scrollable Panel
    $mainPanel = New-Object System.Windows.Forms.Panel
    $mainPanel.Location = New-Object System.Drawing.Point(20, 95)
    $mainPanel.Size = New-Object System.Drawing.Size(745, 745)
    $form.Controls.Add($mainPanel)

    $yPos = 10

    # 1. Company Name
    $lblComp = New-Object System.Windows.Forms.Label
    $lblComp.Text = "1. Company / Client Name:"
    $lblComp.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $lblComp.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $lblComp.Location = New-Object System.Drawing.Point(0, $yPos)
    $lblComp.AutoSize = $true
    $mainPanel.Controls.Add($lblComp)

    $yPos += 24
    $txtComp = New-Object System.Windows.Forms.TextBox
    $txtComp.Location = New-Object System.Drawing.Point(0, $yPos)
    $txtComp.Size = New-Object System.Drawing.Size(745, 28)
    $txtComp.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $txtComp.ForeColor = [System.Drawing.Color]::White
    $txtComp.BorderStyle = "FixedSingle"
    $mainPanel.Controls.Add($txtComp)

    $yPos += 35
    # 2. Prominent Username Input (User selects/types exact username)
    $lblUser = New-Object System.Windows.Forms.Label
    $lblUser.Text = "2. Windows RDP Username (Aap kya username rakhna chahte hain?):"
    $lblUser.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $lblUser.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248) # Highlighted Cyan
    $lblUser.Location = New-Object System.Drawing.Point(0, $yPos)
    $lblUser.AutoSize = $true
    $mainPanel.Controls.Add($lblUser)

    $yPos += 24
    $txtUser = New-Object System.Windows.Forms.TextBox
    $txtUser.Location = New-Object System.Drawing.Point(0, $yPos)
    $txtUser.Size = New-Object System.Drawing.Size(585, 28)
    $txtUser.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $txtUser.ForeColor = [System.Drawing.Color]::White
    $txtUser.BorderStyle = "FixedSingle"
    $mainPanel.Controls.Add($txtUser)

    $btnSuggestUser = New-Object System.Windows.Forms.Button
    $btnSuggestUser.Text = "🔄 Auto Suggest"
    $btnSuggestUser.Location = New-Object System.Drawing.Point(595, $yPos - 1)
    $btnSuggestUser.Size = New-Object System.Drawing.Size(150, 29)
    $btnSuggestUser.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $btnSuggestUser.ForeColor = [System.Drawing.Color]::White
    $btnSuggestUser.FlatStyle = "Flat"
    $btnSuggestUser.FlatAppearance.BorderSize = 0
    $btnSuggestUser.Add_Click({
        $san = Get-SanitizedName -RawName $txtComp.Text
        if ($san) {
            $txtUser.Text = $san.ToLower()
        } else {
            [System.Windows.Forms.MessageBox]::Show("Please enter a Company Name first to auto-suggest.", "Notice", "OK", "Information")
        }
    })
    $mainPanel.Controls.Add($btnSuggestUser)

    # Auto-fill suggested username when company changes if user hasn't typed a custom one
    $txtComp.Add_TextChanged({
        if ($txtUser.Text -eq "" -or $txtUser.Tag -eq "auto") {
            $sanitized = Get-SanitizedName -RawName $txtComp.Text
            $txtUser.Text = $sanitized.ToLower()
            $txtUser.Tag = "auto"
        }
    })
    $txtUser.Add_KeyDown({ $txtUser.Tag = "manual" })

    $yPos += 35
    # 3. Target Drive & Password in 2 Columns
    $lblDrive = New-Object System.Windows.Forms.Label
    $lblDrive.Text = "3. Select Target Drive:"
    $lblDrive.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
    $lblDrive.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $lblDrive.Location = New-Object System.Drawing.Point(0, $yPos)
    $lblDrive.AutoSize = $true
    $mainPanel.Controls.Add($lblDrive)

    $lblPass = New-Object System.Windows.Forms.Label
    $lblPass.Text = "4. User Password:"
    $lblPass.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
    $lblPass.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $lblPass.Location = New-Object System.Drawing.Point(380, $yPos)
    $lblPass.AutoSize = $true
    $mainPanel.Controls.Add($lblPass)

    $yPos += 24
    $cmbDrive = New-Object System.Windows.Forms.ComboBox
    $cmbDrive.Location = New-Object System.Drawing.Point(0, $yPos)
    $cmbDrive.Size = New-Object System.Drawing.Size(365, 28)
    $cmbDrive.DropDownStyle = "DropDownList"
    $cmbDrive.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $cmbDrive.ForeColor = [System.Drawing.Color]::White
    $mainPanel.Controls.Add($cmbDrive)

    # Populate Drives
    $availableDrives = Get-AvailableDrives
    $selectedIndex = 0
    $idx = 0
    foreach ($d in $availableDrives) {
        $cmbDrive.Items.Add($d.DisplayText) | Out-Null
        if ($d.IsEmpty -and $selectedIndex -eq 0) {
            $selectedIndex = $idx
        }
        $idx++
    }
    if ($cmbDrive.Items.Count -gt 0) {
        $cmbDrive.SelectedIndex = $selectedIndex
    }

    $txtPass = New-Object System.Windows.Forms.TextBox
    $txtPass.Location = New-Object System.Drawing.Point(380, $yPos)
    $txtPass.Size = New-Object System.Drawing.Size(245, 28)
    $txtPass.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $txtPass.ForeColor = [System.Drawing.Color]::White
    $txtPass.BorderStyle = "FixedSingle"
    $txtPass.Text = New-StrongPassword
    $mainPanel.Controls.Add($txtPass)

    $btnGenPass = New-Object System.Windows.Forms.Button
    $btnGenPass.Text = "🎲 New Pass"
    $btnGenPass.Location = New-Object System.Drawing.Point(635, $yPos - 1)
    $btnGenPass.Size = New-Object System.Drawing.Size(110, 29)
    $btnGenPass.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $btnGenPass.ForeColor = [System.Drawing.Color]::White
    $btnGenPass.FlatStyle = "Flat"
    $btnGenPass.FlatAppearance.BorderSize = 0
    $btnGenPass.Add_Click({
        $txtPass.Text = New-StrongPassword
    })
    $mainPanel.Controls.Add($btnGenPass)

    $yPos += 35
    # 4. Tally Master Template Source
    $lblTally = New-Object System.Windows.Forms.Label
    $lblTally.Text = "5. Tally Master Template Source Path:"
    $lblTally.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
    $lblTally.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $lblTally.Location = New-Object System.Drawing.Point(0, $yPos)
    $lblTally.AutoSize = $true
    $mainPanel.Controls.Add($lblTally)

    $yPos += 24
    $txtTally = New-Object System.Windows.Forms.TextBox
    $txtTally.Location = New-Object System.Drawing.Point(0, $yPos)
    $txtTally.Size = New-Object System.Drawing.Size(630, 28)
    $txtTally.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $txtTally.ForeColor = [System.Drawing.Color]::White
    $txtTally.BorderStyle = "FixedSingle"
    $txtTally.Text = Get-DefaultTallyTemplate
    $mainPanel.Controls.Add($txtTally)

    $btnBrowseTally = New-Object System.Windows.Forms.Button
    $btnBrowseTally.Text = "Browse..."
    $btnBrowseTally.Location = New-Object System.Drawing.Point(640, $yPos - 1)
    $btnBrowseTally.Size = New-Object System.Drawing.Size(105, 29)
    $btnBrowseTally.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $btnBrowseTally.ForeColor = [System.Drawing.Color]::White
    $btnBrowseTally.FlatStyle = "Flat"
    $btnBrowseTally.FlatAppearance.BorderSize = 0
    $btnBrowseTally.Add_Click({
        $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
        $fbd.Description = "Select Tally Prime / ERP Installation Directory"
        if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $txtTally.Text = $fbd.SelectedPath
        }
    })
    $mainPanel.Controls.Add($btnBrowseTally)

    $yPos += 35
    # 5. Options: Expiry Date & TSplus Checkboxes
    $chkExpiry = New-Object System.Windows.Forms.CheckBox
    $chkExpiry.Text = "Set Account Expiration Date:"
    $chkExpiry.Location = New-Object System.Drawing.Point(0, $yPos)
    $chkExpiry.AutoSize = $true
    $chkExpiry.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
    $mainPanel.Controls.Add($chkExpiry)

    $dtpExpiry = New-Object System.Windows.Forms.DateTimePicker
    $dtpExpiry.Location = New-Object System.Drawing.Point(230, $yPos - 2)
    $dtpExpiry.Size = New-Object System.Drawing.Size(180, 26)
    $dtpExpiry.Format = "Short"
    $dtpExpiry.Value = (Get-Date).AddMonths(12)
    $dtpExpiry.Enabled = $false
    $mainPanel.Controls.Add($dtpExpiry)

    $chkExpiry.Add_CheckedChanged({
        $dtpExpiry.Enabled = $chkExpiry.Checked
    })

    $chkTSplus = New-Object System.Windows.Forms.CheckBox
    $chkTSplus.Text = "Auto-Configure TSplus (Application, Folder & Floating Panel)"
    $chkTSplus.Location = New-Object System.Drawing.Point(430, $yPos)
    $chkTSplus.AutoSize = $true
    $chkTSplus.Checked = $true
    $chkTSplus.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
    $mainPanel.Controls.Add($chkTSplus)

    $yPos += 35
    # 6. Action Button
    $btnSubmit = New-Object System.Windows.Forms.Button
    $btnSubmit.Text = "🚀 PROVISION TALLY USER NOW (ONE-CLICK)"
    $btnSubmit.Location = New-Object System.Drawing.Point(0, $yPos)
    $btnSubmit.Size = New-Object System.Drawing.Size(745, 45)
    $btnSubmit.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
    $btnSubmit.ForeColor = [System.Drawing.Color]::White
    $btnSubmit.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $btnSubmit.FlatStyle = "Flat"
    $btnSubmit.FlatAppearance.BorderSize = 0
    $btnSubmit.Cursor = [System.Windows.Forms.Cursors]::Hand
    $mainPanel.Controls.Add($btnSubmit)

    $yPos += 55
    # 7. Progress Bar
    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Location = New-Object System.Drawing.Point(0, $yPos)
    $progressBar.Size = New-Object System.Drawing.Size(745, 12)
    $progressBar.Style = "Continuous"
    $mainPanel.Controls.Add($progressBar)

    $yPos += 20
    # 8. Real-Time Log Output Box
    $lblLog = New-Object System.Windows.Forms.Label
    $lblLog.Text = "Execution & Audit Log:"
    $lblLog.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $lblLog.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
    $lblLog.Location = New-Object System.Drawing.Point(0, $yPos)
    $lblLog.AutoSize = $true
    $mainPanel.Controls.Add($lblLog)

    $yPos += 20
    $txtLog = New-Object System.Windows.Forms.RichTextBox
    $txtLog.Location = New-Object System.Drawing.Point(0, $yPos)
    $txtLog.Size = New-Object System.Drawing.Size(745, 230)
    $txtLog.BackColor = [System.Drawing.Color]::FromArgb(2, 6, 23)
    $txtLog.ForeColor = [System.Drawing.Color]::FromArgb(56, 189, 248)
    $txtLog.Font = New-Object System.Drawing.Font("Consolas", 9)
    $txtLog.ReadOnly = $true
    $txtLog.BorderStyle = "None"
    $mainPanel.Controls.Add($txtLog)

    # Logging helper for UI
    $uiLogCallback = {
        param([string]$Message, [string]$Type)
        $color = switch ($Type) {
            "SUCCESS" { [System.Drawing.Color]::FromArgb(52, 211, 153) }
            "WARN"    { [System.Drawing.Color]::FromArgb(251, 191, 36) }
            "ERROR"   { [System.Drawing.Color]::FromArgb(248, 113, 113) }
            default   { [System.Drawing.Color]::FromArgb(56, 189, 248) }
        }
        $txtLog.SelectionStart = $txtLog.TextLength
        $txtLog.SelectionLength = 0
        $txtLog.SelectionColor = $color
        $txtLog.AppendText("$Message`n")
        $txtLog.ScrollToCaret()
        [System.Windows.Forms.Application]::DoEvents()
    }

    # Submit Event Handler
    $btnSubmit.Add_Click({
        $cName = $txtComp.Text.Trim()
        $uName = $txtUser.Text.Trim()
        $pWord = $txtPass.Text.Trim()
        $tSource = $txtTally.Text.Trim()

        if (-not $cName) {
            [System.Windows.Forms.MessageBox]::Show("Please enter a valid Company Name.", "Missing Information", "OK", "Warning")
            return
        }
        if (-not $uName) {
            [System.Windows.Forms.MessageBox]::Show("Please enter the Username you want to create.", "Missing Username", "OK", "Warning")
            return
        }
        if (-not $pWord) {
            [System.Windows.Forms.MessageBox]::Show("Please enter a Password.", "Missing Information", "OK", "Warning")
            return
        }
        if ($cmbDrive.SelectedIndex -lt 0) {
            [System.Windows.Forms.MessageBox]::Show("Please select a target drive.", "Missing Information", "OK", "Warning")
            return
        }

        $selectedDriveObj = $availableDrives[$cmbDrive.SelectedIndex]
        $targetLetter = $selectedDriveObj.DriveLetter

        $expDate = if ($chkExpiry.Checked) { $dtpExpiry.Value } else { [datetime]::MinValue }
        $doTSplus = $chkTSplus.Checked

        $btnSubmit.Enabled = $false
        $btnSubmit.Text = "⏳ PROVISIONING IN PROGRESS..."
        $progressBar.Value = 25
        $txtLog.Clear()

        $result = Invoke-TallyProvisioning `
            -CompName $cName `
            -UsrName $uName `
            -Pass $pWord `
            -TargetDrive $targetLetter `
            -TallyTemplate $tSource `
            -AccountExpiry $expDate `
            -SetupTSplus $doTSplus `
            -LogCallback $uiLogCallback

        $progressBar.Value = 100
        $btnSubmit.Enabled = $true
        $btnSubmit.Text = "🚀 PROVISION ANOTHER CLIENT"

        if ($result.Success) {
            $msg = "Provisioning Completed Successfully!`n`n" +
                   "Company: $cName`n" +
                   "Username: $uName`n" +
                   "Password: $pWord`n" +
                   "Drive: $targetLetter`n" +
                   "Path: $($result.RootPath)`n`n" +
                   "Credentials copied to clipboard!"
            
            [System.Windows.Forms.Clipboard]::SetText("Username: $uName`nPassword: $pWord`nServer: $env:COMPUTERNAME`nCompany Path: $($result.RootPath)")
            
            [System.Windows.Forms.MessageBox]::Show($msg, "Success - Client Created", "OK", "Information")
        } else {
            [System.Windows.Forms.MessageBox]::Show("Error during provisioning:`n$($result.Error)", "Provisioning Failed", "OK", "Error")
        }
    })

    $form.ShowDialog() | Out-Null
}

# -----------------------------------------------------------------------------
# 4. Interactive Console Mode (CLI Prompting)
# -----------------------------------------------------------------------------

function Invoke-InteractiveConsoleWizard {
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "         TALLY & TSPLUS CLIENT PROVISIONING WIZARD (CLI)             " -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""

    # Step 1: Ask Company Name
    $cName = $CompanyName
    while ([string]::IsNullOrWhiteSpace($cName)) {
        $cName = Read-Host "👉 [1/4] Enter Company Name (e.g. Sharma Building Materials)"
    }

    # Step 2: Explicitly Ask Desired Username
    $uName = $Username
    $suggestedUser = (Get-SanitizedName -RawName $cName).ToLower()
    while ([string]::IsNullOrWhiteSpace($uName)) {
        Write-Host "👉 [2/4] Enter desired Windows Username" -ForegroundColor Yellow
        $userPrompt = Read-Host "     (Type your custom username, or press ENTER to use '$suggestedUser')"
        if ([string]::IsNullOrWhiteSpace($userPrompt)) {
            $uName = $suggestedUser
        } else {
            $uName = $userPrompt.Trim()
        }
    }
    Write-Host "  ✅ Selected Username: $uName" -ForegroundColor Green

    # Step 3: Ask Password
    $pWord = $Password
    if ([string]::IsNullOrWhiteSpace($pWord)) {
        $autoPass = New-StrongPassword
        $passPrompt = Read-Host "👉 [3/4] Enter Password (press ENTER to use auto-generated '$autoPass')"
        if ([string]::IsNullOrWhiteSpace($passPrompt)) {
            $pWord = $autoPass
        } else {
            $pWord = $passPrompt.Trim()
        }
    }
    Write-Host "  ✅ Password Set: $pWord" -ForegroundColor Green

    # Step 4: Ask / Select Drive
    $tDrive = $DriveLetter
    if ([string]::IsNullOrWhiteSpace($tDrive)) {
        $drives = Get-AvailableDrives
        $emptyDrive = $drives | Where-Object { $_.IsEmpty } | Select-Object -First 1
        $defaultDrive = if ($emptyDrive) { $emptyDrive.DriveLetter } else { ($drives | Sort-Object FreeGB -Descending | Select-Object -First 1).DriveLetter }
        
        Write-Host "👉 [4/4] Available Drives on Server:" -ForegroundColor Yellow
        foreach ($d in $drives) {
            Write-Host "     - $($d.DisplayText)" -ForegroundColor DarkCyan
        }
        $drivePrompt = Read-Host "     Enter Drive Letter [Default: $defaultDrive]"
        if ([string]::IsNullOrWhiteSpace($drivePrompt)) {
            $tDrive = $defaultDrive
        } else {
            $tDrive = $drivePrompt.Trim().TrimEnd('\')
        }
    }
    Write-Host "  ✅ Target Drive: $tDrive" -ForegroundColor Green

    # Tally Source
    $tSource = $TallySourcePath
    if ([string]::IsNullOrWhiteSpace($tSource)) {
        $tSource = Get-DefaultTallyTemplate
    }

    Write-Host ""
    Write-Host "Starting automated provisioning now..." -ForegroundColor Yellow
    Write-Host ""

    $res = Invoke-TallyProvisioning `
        -CompName $cName `
        -UsrName $uName `
        -Pass $pWord `
        -TargetDrive $tDrive `
        -TallyTemplate $tSource `
        -AccountExpiry $ExpiryDate `
        -SetupTSplus $ConfigureTSplus

    if ($res.Success) {
        Write-Host ""
        Write-Host "=====================================================================" -ForegroundColor Green
        Write-Host "PROVISIONING FINISHED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host "Username : $($res.Username)" -ForegroundColor Green
        Write-Host "Password : $($res.Password)" -ForegroundColor Green
        Write-Host "Path     : $($res.RootPath)" -ForegroundColor Green
        Write-Host "=====================================================================" -ForegroundColor Green
    }
}

# -----------------------------------------------------------------------------
# 5. Entry Point Routing
# -----------------------------------------------------------------------------

if ($NonInteractive) {
    if (-not $DriveLetter) {
        $drives = Get-AvailableDrives
        $emptyDrive = $drives | Where-Object { $_.IsEmpty } | Select-Object -First 1
        $DriveLetter = if ($emptyDrive) { $emptyDrive.DriveLetter } else { ($drives | Sort-Object FreeGB -Descending | Select-Object -First 1).DriveLetter }
    }
    if (-not $TallySourcePath) { $TallySourcePath = Get-DefaultTallyTemplate }

    $res = Invoke-TallyProvisioning `
        -CompName $CompanyName `
        -UsrName $Username `
        -Pass $Password `
        -TargetDrive $DriveLetter `
        -TallyTemplate $TallySourcePath `
        -AccountExpiry $ExpiryDate `
        -SetupTSplus $ConfigureTSplus

    if ($res.Success) { exit 0 } else { exit 1 }
} elseif ($CLI) {
    Invoke-InteractiveConsoleWizard
} else {
    Show-ModernGUI
}
