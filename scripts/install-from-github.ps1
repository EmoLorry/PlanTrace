param(
    [string]$RepoOwner = 'EmoLorry',
    [string]$RepoName = 'PlanTrace',
    [string]$Branch = 'main',
    [string]$InstallRoot = $env:LOCALAPPDATA,
    [string]$AppName = 'PlanTrace'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-FileFromUrls {
    param(
        [string[]]$Urls,
        [string]$OutFile,
        [int]$TimeoutSec = 120
    )

    $lastError = $null
    foreach ($url in $Urls) {
        try {
            if (Test-Path -LiteralPath $OutFile) {
                Remove-Item -LiteralPath $OutFile -Force
            }
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $OutFile -TimeoutSec $TimeoutSec
            return $url
        }
        catch {
            $lastError = $_.Exception.Message
        }
    }

    throw "All download mirrors failed. Last error: $lastError"
}

if (-not $InstallRoot) {
    throw 'LOCALAPPDATA was not found. Pass -InstallRoot to choose an install directory.'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$installDir = Join-Path $InstallRoot $AppName
$tempRoot = Join-Path $env:TEMP ("PlanTraceInstall_" + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'source.zip'
$extractDir = Join-Path $tempRoot 'extract'
$preserveDir = Join-Path $tempRoot 'preserve'
$zipUrls = @(
    "https://codeload.github.com/$RepoOwner/$RepoName/zip/refs/heads/$Branch",
    "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"
)

try {
    Write-Step 'Preparing installer workspace'
    New-Item -ItemType Directory -Force -Path $tempRoot, $extractDir | Out-Null

    Write-Step "Downloading $RepoOwner/$RepoName ($Branch)"
    $usedZipUrl = Get-FileFromUrls -Urls $zipUrls -OutFile $zipPath -TimeoutSec 120
    Write-Host "Download source: $usedZipUrl"

    Write-Step 'Extracting source'
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $sourceDir = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
    if (-not $sourceDir) {
        throw 'The downloaded archive did not contain a project directory.'
    }

    Write-Step "Installing to $installDir"
    $existingBackups = Join-Path $installDir 'backups'
    if (Test-Path -LiteralPath $existingBackups) {
        New-Item -ItemType Directory -Force -Path $preserveDir | Out-Null
        Copy-Item -LiteralPath $existingBackups -Destination (Join-Path $preserveDir 'backups') -Recurse -Force
    }

    if (Test-Path -LiteralPath $installDir) {
        Remove-Item -LiteralPath $installDir -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Get-ChildItem -LiteralPath $sourceDir.FullName -Force | Copy-Item -Destination $installDir -Recurse -Force

    $preservedBackups = Join-Path $preserveDir 'backups'
    if (Test-Path -LiteralPath $preservedBackups) {
        Copy-Item -LiteralPath $preservedBackups -Destination $installDir -Recurse -Force
    }

    $localInstaller = Join-Path $installDir 'scripts\install-local.ps1'
    if (-not (Test-Path -LiteralPath $localInstaller)) {
        throw 'scripts\install-local.ps1 was not found in the downloaded project.'
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $localInstaller -ProjectDir $installDir -Launch -CreateShortcut
    if ($LASTEXITCODE -ne 0) {
        throw 'The local installer failed.'
    }
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Write-Host "PlanTrace was installed to $installDir" -ForegroundColor Green
