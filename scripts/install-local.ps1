param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$Launch,
    [switch]$CreateShortcut,
    [switch]$SkipNodeInstall
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Get-NodeVersion {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { return $null }

    $raw = (& $node.Source --version 2>$null)
    if (-not $raw) { return $null }

    try {
        return [version]($raw.Trim().TrimStart('v').Split('-')[0])
    }
    catch {
        return $null
    }
}

function Test-NodeVersion {
    $version = Get-NodeVersion
    if (-not $version) { return $false }

    if ($version.Major -eq 20 -and $version.Minor -ge 19) { return $true }
    if ($version.Major -eq 22 -and $version.Minor -ge 12) { return $true }
    if ($version.Major -gt 22) { return $true }
    return $false
}

function Install-NodeLts {
    if ($SkipNodeInstall) {
        throw 'Node.js 20.19+ is required, but automatic Node install was skipped.'
    }

    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Step 'Installing Node.js LTS with winget'
        & $winget.Source install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -eq 0) {
            Refresh-Path
            return
        }
        Write-Host 'winget install did not finish cleanly. Opening the Node.js download page.' -ForegroundColor Yellow
    }
    else {
        Write-Host 'winget was not found. Opening the Node.js download page.' -ForegroundColor Yellow
    }

    Start-Process 'https://nodejs.org/en/download'
    throw 'Install Node.js 20.19+ or 22.12+, then run install.bat again.'
}

function Ensure-Node {
    Write-Step 'Checking Node.js'
    Refresh-Path

    if (Test-NodeVersion) {
        $version = Get-NodeVersion
        Write-Host "Node.js $version found."
        return
    }

    Install-NodeLts

    if (-not (Test-NodeVersion)) {
        throw 'Node.js was installed or updated, but the required version is still not available in this shell.'
    }

    $version = Get-NodeVersion
    Write-Host "Node.js $version found."
}

function Get-NpmCommand {
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) { return $npmCmd.Source }

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) { return $npm.Source }

    throw 'npm was not found. Reinstall Node.js LTS and try again.'
}

function Install-Dependencies {
    param([string]$Root)

    Write-Step 'Installing dependencies'
    $npm = Get-NpmCommand

    Push-Location $Root
    try {
        if (Test-Path -LiteralPath (Join-Path $Root 'package-lock.json')) {
            & $npm ci --loglevel warn
            if ($LASTEXITCODE -ne 0) {
                Write-Host 'npm ci failed; falling back to npm install.' -ForegroundColor Yellow
                & $npm install --loglevel warn
            }
        }
        else {
            & $npm install --loglevel warn
        }

        if ($LASTEXITCODE -ne 0) {
            throw 'Dependency install failed. Check the network connection and npm registry access.'
        }
    }
    finally {
        Pop-Location
    }
}

function New-PlanTraceShortcut {
    param([string]$Root)

    Write-Step 'Creating desktop shortcut'
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) {
        Write-Host 'Desktop path was not found; skipping shortcut.' -ForegroundColor Yellow
        return
    }

    $target = Join-Path $Root 'start.bat'
    $shortcutPath = Join-Path $desktop 'PlanTrace.lnk'

    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $target
        $shortcut.WorkingDirectory = $Root
        $shortcut.Description = 'Start PlanTrace'

        $nodeIcon = Join-Path $env:ProgramFiles 'nodejs\node.exe'
        if (Test-Path -LiteralPath $nodeIcon) {
            $shortcut.IconLocation = $nodeIcon
        }

        $shortcut.Save()
        Write-Host "Shortcut created: $shortcutPath"
    }
    catch {
        Write-Host "Shortcut creation skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

function Start-PlanTrace {
    param([string]$Root)

    Write-Step 'Launching PlanTrace'
    $startBat = Join-Path $Root 'start.bat'
    Start-Process -FilePath $startBat -WorkingDirectory $Root
}

$resolvedProjectDir = (Resolve-Path $ProjectDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedProjectDir 'package.json'))) {
    throw "package.json was not found in $resolvedProjectDir"
}

Ensure-Node
Install-Dependencies -Root $resolvedProjectDir

if ($CreateShortcut) {
    New-PlanTraceShortcut -Root $resolvedProjectDir
}

if ($Launch) {
    Start-PlanTrace -Root $resolvedProjectDir
}

Write-Host ''
Write-Host 'PlanTrace install complete.' -ForegroundColor Green
