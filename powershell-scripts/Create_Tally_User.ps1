<#
================================================================================
 TALLY & TSPLUS USER PROVISIONING ENGINE - SECURE RUNTIME
 (C) Innovation Web Works. All Rights Reserved.
 PROPRIETARY ENCRYPTED BINARY PAYLOAD. UNAUTHORIZED REVERSE ENGINEERING PROHIBITED.
================================================================================
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

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192

# In-Memory AES-256 Decryption Engine (Zero Disk Footprint)
try {
    $callerPath = $PSCommandPath
    if (-not $callerPath) { $callerPath = $MyInvocation.MyCommand.Definition }
    if ($callerPath) {
        $env:INNOVATION_SCRIPT_PATH = $callerPath
    }

    $k = [System.Convert]::FromBase64String("kpFaXuH42A3VLcB2qwN8Ii3lv+dgjOUZpMg2fEwhTos=")
    $v = [System.Convert]::FromBase64String("7L4hXZ11gtow23r6ShL/wQ==")
    $p = (-join @(
    "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"
    ))

    $cipherBytes = [System.Convert]::FromBase64String($p)

    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $k
    $aes.IV = $v
    $decryptor = $aes.CreateDecryptor()

    $inMem = New-Object System.IO.MemoryStream
    $inMem.Write($cipherBytes, 0, $cipherBytes.Length)
    $inMem.Position = 0

    $cryptoStream = New-Object System.Security.Cryptography.CryptoStream($inMem, $decryptor, [System.Security.Cryptography.CryptoStreamMode]::Read)
    $gzip = New-Object System.IO.Compression.GZipStream($cryptoStream, [System.IO.Compression.CompressionMode]::Decompress)
    $outMem = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 65536
    while (($read = $gzip.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $outMem.Write($buffer, 0, $read)
    }

    $gzip.Close()
    $cryptoStream.Close()
    $inMem.Close()
    $decryptor.Dispose()
    $aes.Dispose()

    $code = [System.Text.Encoding]::UTF8.GetString($outMem.ToArray())
    $outMem.Close()

    # Pass all bound parameters and execute directly inside memory
    $sb = [ScriptBlock]::Create($code)
    & $sb @PSBoundParameters
} catch {
    Write-Host " [FATAL] Protected Agent Runtime Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
