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

    $k = [System.Convert]::FromBase64String("v2XiRb3n+iD8h8BcRcbGbTIhGS1iVlP80ifI0c2yo18=")
    $v = [System.Convert]::FromBase64String("FRXIHp9DigiNqp96qHqWWQ==")
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
