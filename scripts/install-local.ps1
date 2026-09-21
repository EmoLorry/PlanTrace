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

function Test-NpmCommand {
    param([string]$Command)

    if ([string]::IsNullOrWhiteSpace($Command)) { return $false }

    try {
        $output = & $Command --version 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        return -not [string]::IsNullOrWhiteSpace(($output | Select-Object -First 1))
    }
    catch {
        return $false
    }
}

function Get-NpmCommand {
    Refresh-Path

    $candidates = @()

    foreach ($nodeCommand in @(Get-Command node.exe -All -ErrorAction SilentlyContinue)) {
        if ($nodeCommand.Source) {
            $candidates += Join-Path (Split-Path -Parent $nodeCommand.Source) 'npm.cmd'
        }
    }

    $programFiles = [Environment]::GetFolderPath('ProgramFiles')
    $programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
    if ($programFiles) { $candidates += Join-Path $programFiles 'nodejs\npm.cmd' }
    if ($programFilesX86) { $candidates += Join-Path $programFilesX86 'nodejs\npm.cmd' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\npm.cmd' }

    foreach ($npmCmd in @(Get-Command npm.cmd -All -ErrorAction SilentlyContinue)) {
        if ($npmCmd.Source) { $candidates += $npmCmd.Source }
    }
    foreach ($npm in @(Get-Command npm -All -ErrorAction SilentlyContinue)) {
        if ($npm.Source) { $candidates += $npm.Source }
    }

    foreach ($candidate in @($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        if (Test-NpmCommand -Command $candidate) {
            return $candidate
        }
    }

    throw 'npm was found but was not usable. Reinstall Node.js LTS, then run this script again.'
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

function Initialize-DataDirectories {
    param([string]$Root)

    Write-Step 'Preparing user data folders'
    foreach ($relativePath in @('data', 'data\diary', 'backups')) {
        $targetPath = Join-Path $Root $relativePath
        New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
    }
}

function Get-DesktopDirectories {
    $candidates = @()

    $dotNetDesktop = [Environment]::GetFolderPath('Desktop')
    if ($dotNetDesktop) { $candidates += $dotNetDesktop }

    try {
        $shell = New-Object -ComObject WScript.Shell
        $wshDesktop = $shell.SpecialFolders.Item('Desktop')
        if ($wshDesktop) { $candidates += $wshDesktop }
    }
    catch {
        # WScript may be restricted on some Windows installs; other candidates below still work.
    }

    if ($env:USERPROFILE) {
        $candidates += Join-Path $env:USERPROFILE 'Desktop'
        $localizedDesktop = Join-Path $env:USERPROFILE '桌面'
        if (Test-Path -LiteralPath $localizedDesktop) { $candidates += $localizedDesktop }
    }

    foreach ($root in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
        if (-not $root) { continue }
        if (Test-Path -LiteralPath $root) {
            $candidates += Join-Path $root 'Desktop'
            $localizedDesktop = Join-Path $root '桌面'
            if (Test-Path -LiteralPath $localizedDesktop) { $candidates += $localizedDesktop }
        }
    }

    $unique = @()
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        try {
            $fullPath = [System.IO.Path]::GetFullPath($candidate)
        }
        catch {
            $fullPath = $candidate
        }
        if ($unique -notcontains $fullPath) { $unique += $fullPath }
    }

    return $unique
}

function New-PlanTraceShortcut {
    param([string]$Root)

    Write-Step 'Creating desktop shortcut'
    $desktopDirs = @(Get-DesktopDirectories)
    if (-not $desktopDirs.Count) {
        Write-Host 'Desktop path was not found; skipping shortcut.' -ForegroundColor Yellow
        return
    }

    $target = Join-Path $Root 'Start-PlanTrace-Windows.bat'
    if (-not (Test-Path -LiteralPath $target)) {
        $target = Join-Path $Root 'start.bat'
    }
    $iconPath = Join-Path $Root 'public\plantrace.ico'
    $created = 0

    foreach ($desktop in $desktopDirs) {
        try {
            if (-not (Test-Path -LiteralPath $desktop)) {
                New-Item -ItemType Directory -Force -Path $desktop | Out-Null
            }

            $shortcutPath = Join-Path $desktop 'PlanTrace.lnk'
            if (Test-Path -LiteralPath $shortcutPath) {
                Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
            }

            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $target
            $shortcut.WorkingDirectory = $Root
            $shortcut.Description = 'Start PlanTrace'

            if (Test-Path -LiteralPath $iconPath) {
                $shortcut.IconLocation = "$iconPath,0"
            }
            else {
                $nodeIcon = Join-Path $env:ProgramFiles 'nodejs\node.exe'
                if (Test-Path -LiteralPath $nodeIcon) {
                    $shortcut.IconLocation = $nodeIcon
                }
            }

            $shortcut.Save()
            $created += 1
            Write-Host "Shortcut refreshed: $shortcutPath"
        }
        catch {
            Write-Host "Shortcut creation failed at ${desktop}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    if ($created -eq 0) {
        Write-Host 'No desktop shortcut could be created. PlanTrace is still installed; use Start-PlanTrace-Windows.bat in the install folder.' -ForegroundColor Yellow
    }
}

function Start-PlanTrace {
    param([string]$Root)

    Write-Step 'Launching PlanTrace'
    $startBat = Join-Path $Root 'Start-PlanTrace-Windows.bat'
    if (-not (Test-Path -LiteralPath $startBat)) {
        $startBat = Join-Path $Root 'start.bat'
    }
    Start-Process -FilePath $startBat -WorkingDirectory $Root
}

$resolvedProjectDir = (Resolve-Path $ProjectDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedProjectDir 'package.json'))) {
    throw "package.json was not found in $resolvedProjectDir"
}

Ensure-Node
Install-Dependencies -Root $resolvedProjectDir
Initialize-DataDirectories -Root $resolvedProjectDir

if ($CreateShortcut) {
    New-PlanTraceShortcut -Root $resolvedProjectDir
}

if ($Launch) {
    Start-PlanTrace -Root $resolvedProjectDir
}

Write-Host ''
Write-Host 'PlanTrace install complete.' -ForegroundColor Green
