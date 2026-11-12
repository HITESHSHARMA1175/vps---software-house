import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Encrypts a PowerShell script using GZip compression and AES-256-CBC encryption.
 * The output is a self-decrypting runtime wrapper that executes completely in RAM.
 */
function createEncryptedScriptWrapper(masterFilePath, scriptType) {
  if (!fs.existsSync(masterFilePath)) {
    throw new Error(`Master script not found: ${masterFilePath}`);
  }

  const rawCode = fs.readFileSync(masterFilePath, 'utf8');

  // 1. Gzip compression (level 9 for maximum compact payload)
  const compressed = zlib.gzipSync(Buffer.from(rawCode, 'utf8'), { level: 9 });

  // 2. Cryptographic Key & IV Generation (AES-256)
  const key = crypto.randomBytes(32); // 256 bits
  const iv = crypto.randomBytes(16);  // 128 bits
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);

  const payloadB64 = encrypted.toString('base64');
  const keyB64 = key.toString('base64');
  const ivB64 = iv.toString('base64');

  // Split payload into clean lines
  const chunkSize = 120;
  const chunks = [];
  for (let i = 0; i < payloadB64.length; i += chunkSize) {
    chunks.push(`"${payloadB64.substring(i, i + chunkSize)}"`);
  }
  const payloadExpression = chunks.join(',\r\n    ');

  let paramBlock = '';
  let scriptHeaderTitle = 'ENTERPRISE PROTECTED RUNTIME';

  if (scriptType === 'VpsAgent') {
    scriptHeaderTitle = 'INNOVATION VPS AGENT - SECURE COMPILED RUNTIME';
    paramBlock = `[CmdletBinding()]
param (
    [Parameter(Mandatory=$false)]
    [string]$ServerId = "103.255.65.50:18526",

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
)`;
  } else if (scriptType === 'CreateTallyUser') {
    scriptHeaderTitle = 'TALLY & TSPLUS USER PROVISIONING ENGINE - SECURE RUNTIME';
    paramBlock = `param(
    [string]$CompanyName = "",
    [string]$Username = "",
    [string]$Password = "",
    [string]$DriveLetter = "",
    [string]$TallySourcePath = "",
    [datetime]$ExpiryDate = [datetime]::MinValue,
    [switch]$ConfigureTSplus = $true,
    [switch]$CLI = $false,
    [switch]$NonInteractive = $false
)`;
  } else {
    paramBlock = `param()`;
  }

  const wrapper = `<#
================================================================================
 ${scriptHeaderTitle}
 (C) Innovation Web Works. All Rights Reserved.
 PROPRIETARY ENCRYPTED BINARY PAYLOAD. UNAUTHORIZED REVERSE ENGINEERING PROHIBITED.
================================================================================
#>
${paramBlock}

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192

# In-Memory AES-256 Decryption Engine (Zero Disk Footprint)
try {
    $callerPath = $PSCommandPath
    if (-not $callerPath) { $callerPath = $MyInvocation.MyCommand.Definition }
    if ($callerPath) {
        $env:INNOVATION_SCRIPT_PATH = $callerPath
    }

    $k = [System.Convert]::FromBase64String("${keyB64}")
    $v = [System.Convert]::FromBase64String("${ivB64}")
    $p = (-join @(
    ${payloadExpression}
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
`;

  return { wrapper, rawLength: rawCode.length, encLength: wrapper.length };
}

/**
 * Post-build check (Req 5.4): decrypts a generated bundle exactly as the PowerShell
 * wrapper does (AES-256-CBC, then GZip) and fails if the decrypted code does not
 * contain the X-Agent-Key header logic.
 */
export function verifyBundleHasAgentKey(bundlePath) {
  const text = fs.readFileSync(bundlePath, 'utf8');
  const keyMatch = text.match(/\$k = \[System\.Convert\]::FromBase64String\("([^"]+)"\)/);
  const ivMatch = text.match(/\$v = \[System\.Convert\]::FromBase64String\("([^"]+)"\)/);
  const payloadMatch = text.match(/\$p = \(-join @\(([\s\S]*?)\)\)/);
  if (!keyMatch || !ivMatch || !payloadMatch) {
    throw new Error(`Bundle check failed: cannot parse key/iv/payload in ${bundlePath}`);
  }
  const payloadB64 = [...payloadMatch[1].matchAll(/"([^"]*)"/g)].map(m => m[1]).join('');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(keyMatch[1], 'base64'),
    Buffer.from(ivMatch[1], 'base64')
  );
  const compressed = Buffer.concat([decipher.update(Buffer.from(payloadB64, 'base64')), decipher.final()]);
  const code = zlib.gunzipSync(compressed).toString('utf8');
  const rel = path.relative(rootDir, bundlePath);
  if (!code.includes('X-Agent-Key')) {
    throw new Error(`Bundle check failed: X-Agent-Key missing in decrypted ${rel}`);
  }
  if (!/function\s+Get-AgentKey/.test(code)) {
    throw new Error(`Bundle check failed: Get-AgentKey missing in decrypted ${rel}`);
  }
  console.log(`  ✔ Verified: X-Agent-Key present in decrypted ${rel}`);
}

export function buildAllProtectedScripts() {
  console.log('🔒 ====================================================================');
  console.log('🔒 INNOVATION WEB WORKS - AUTOMATED SCRIPT ENCRYPTION & SECURITY BUILD');
  console.log('🔒 ====================================================================');

  // 1. Process VpsAgent.ps1
  const vpsAgentMaster = path.join(rootDir, 'powershell-scripts', 'VpsAgent.master.ps1');
  if (fs.existsSync(vpsAgentMaster)) {
    const { wrapper, rawLength, encLength } = createEncryptedScriptWrapper(vpsAgentMaster, 'VpsAgent');

    const vpsAgentTargets = [
      path.join(rootDir, 'VpsAgent.ps1'),
      path.join(rootDir, 'public', 'VpsAgent.ps1'),
      path.join(rootDir, 'powershell-scripts', 'VpsAgent.ps1')
    ];

    vpsAgentTargets.forEach(dest => {
      fs.writeFileSync(dest, wrapper, 'utf8');
      console.log(`  └── Generated: ${path.relative(rootDir, dest)}`);
      verifyBundleHasAgentKey(dest);
    });

    console.log(`  [+] VpsAgent.ps1 encrypted successfully! Raw: ${(rawLength / 1024).toFixed(1)} KB -> Protected: ${(encLength / 1024).toFixed(1)} KB\n`);
  } else {
    console.warn(`  [!] Warning: ${vpsAgentMaster} not found, skipping VpsAgent encryption.`);
  }

  // 2. Process Create_Tally_User.ps1
  const tallyMaster = path.join(rootDir, 'powershell-scripts', 'Create_Tally_User.master.ps1');
  if (fs.existsSync(tallyMaster)) {
    const { wrapper, rawLength, encLength } = createEncryptedScriptWrapper(tallyMaster, 'CreateTallyUser');

    const tallyTargets = [
      path.join(rootDir, 'powershell-scripts', 'Create_Tally_User.ps1'),
      path.join(rootDir, 'public', 'scripts', 'Create_Tally_User.ps1')
    ];

    tallyTargets.forEach(dest => {
      fs.writeFileSync(dest, wrapper, 'utf8');
      console.log(`  └── Generated: ${path.relative(rootDir, dest)}`);
      verifyBundleHasAgentKey(dest);
    });

    console.log(`  [+] Create_Tally_User.ps1 encrypted successfully! Raw: ${(rawLength / 1024).toFixed(1)} KB -> Protected: ${(encLength / 1024).toFixed(1)} KB\n`);
  } else {
    console.warn(`  [!] Warning: ${tallyMaster} not found, skipping Create_Tally_User encryption.`);
  }

  console.log('🔒 All PowerShell scripts encrypted with AES-256 + Gzip runtime wrapper!');
  console.log('🔒 Zero plain-text code remains in public distribution files.\n');
}

// Allow direct execution: node scripts/build_encrypted_scripts.js
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  buildAllProtectedScripts();
}
