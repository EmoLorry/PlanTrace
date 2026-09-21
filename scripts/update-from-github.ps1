param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$RepoOwner = 'EmoLorry',
    [string]$RepoName = 'PlanTrace',
    [string]$Branch = 'main',
    [switch]$Yes,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-JsonFromUrl {
    param([string[]]$Urls)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $lastError = $null
    foreach ($url in $Urls) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15
            $payload = $resp.Content | ConvertFrom-Json
            if ($payload.content -and $payload.encoding -eq 'base64') {
                $encoded = [string]$payload.content -replace '\s', ''
                $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
                return $decoded | ConvertFrom-Json
            }
            return $payload
        }
        catch {
            $lastError = $_.Exception.Message
        }
    }

    throw "Could not download version manifest. Check access to GitHub, GitHub API, or jsDelivr. Last error: $lastError"
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

function Get-LocalVersion {
    param([string]$Root)

    $versionJs = Join-Path $Root 'src\version.js'
    if (Test-Path -LiteralPath $versionJs) {
        $text = Get-Content -Raw -LiteralPath $versionJs
        if ($text -match "APP_VERSION\s*=\s*['""]([^'""]+)['""]") {
            return $Matches[1]
        }
    }

    $manifest = Join-Path $Root 'public\version.json'
    if (Test-Path -LiteralPath $manifest) {
        try {
            return (Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).version
        }
        catch { }
    }

    $pkg = Join-Path $Root 'package.json'
    if (Test-Path -LiteralPath $pkg) {
        try {
            return (Get-Content -Raw -LiteralPath $pkg | ConvertFrom-Json).version
        }
        catch { }
    }

    return '0.0.0'
}

function Test-NewerVersion {
    param(
        [string]$Remote,
        [string]$Local
    )

    $remoteParts = @($Remote.Split('.') | ForEach-Object { [int]($_ -replace '\D.*$', '') })
    $localParts = @($Local.Split('.') | ForEach-Object { [int]($_ -replace '\D.*$', '') })

    for ($i = 0; $i -lt 3; $i++) {
        $r = if ($i -lt $remoteParts.Count) { $remoteParts[$i] } else { 0 }
        $l = if ($i -lt $localParts.Count) { $localParts[$i] } else { 0 }
        if ($r -gt $l) { return $true }
        if ($r -lt $l) { return $false }
    }
    return $false
}

function Copy-ReplaceDirectory {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) { return }
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    Copy-Item -LiteralPath $Source -Destination (Split-Path -Parent $Destination) -Recurse -Force
}

function Copy-MergeDirectory {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) { return }
    if (-not (Test-Path -LiteralPath $Destination)) {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    }
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
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
    throw 'Install Node.js 20.19+ or 22.12+, then run Update-PlanTrace-Windows.bat again.'
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

    throw 'npm was found but was not usable. Reinstall Node.js LTS, then run Update-PlanTrace-Windows.bat again.'
}

function New-PlanTraceShortcut {
    param([string]$Root)

    Write-Step 'Refreshing desktop shortcut'
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) {
        Write-Host 'Desktop path was not found; skipping shortcut.' -ForegroundColor Yellow
        return
    }

    $target = Join-Path $Root 'Start-PlanTrace-Windows.bat'
    if (-not (Test-Path -LiteralPath $target)) {
        $target = Join-Path $Root 'start.bat'
    }
    $shortcutPath = Join-Path $desktop 'PlanTrace.lnk'
    $iconPath = Join-Path $Root 'public\plantrace.ico'

    try {
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

        $shortcut.Save()
        Write-Host "Shortcut refreshed: $shortcutPath"
    }
    catch {
        Write-Host "Shortcut refresh skipped: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

$root = (Resolve-Path $ProjectDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    throw "package.json was not found in $root"
}

$manifestUrls = @(
    "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Branch/public/version.json",
    "https://cdn.jsdelivr.net/gh/$RepoOwner/$RepoName@$Branch/public/version.json",
    "https://api.github.com/repos/$RepoOwner/$RepoName/contents/public/version.json?ref=$Branch"
)
$zipUrls = @(
    "https://codeload.github.com/$RepoOwner/$RepoName/zip/refs/heads/$Branch",
    "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"
)
$tempRoot = Join-Path $env:TEMP ("PlanTraceUpdate_" + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'source.zip'
$extractDir = Join-Path $tempRoot 'extract'

try {
    $localVersion = Get-LocalVersion -Root $root

    Write-Step 'Checking latest version'
    $remoteManifest = Get-JsonFromUrl -Urls $manifestUrls
    $remoteVersion = [string]$remoteManifest.version

    Write-Host "Current version: v$localVersion"
    Write-Host "Latest version:  v$remoteVersion"

    if (-not (Test-NewerVersion -Remote $remoteVersion -Local $localVersion)) {
        Write-Host ''
        Write-Host 'PlanTrace is already up to date.' -ForegroundColor Green
        New-PlanTraceShortcut -Root $root
        return
    }

    if (-not $Yes) {
        Write-Host ''
        $answer = Read-Host "Update PlanTrace to v$remoteVersion now? (Y/n)"
        if ($answer -match '^(n|no)$') {
            Write-Host 'Update canceled.'
            return
        }
    }

    Write-Step 'Downloading latest source'
    New-Item -ItemType Directory -Force -Path $tempRoot, $extractDir | Out-Null
    $usedZipUrl = Get-FileFromUrls -Urls $zipUrls -OutFile $zipPath -TimeoutSec 120
    Write-Host "Download source: $usedZipUrl"

    Write-Step 'Extracting source'
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $sourceRoot = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
    if (-not $sourceRoot -or -not (Test-Path -LiteralPath (Join-Path $sourceRoot.FullName 'src'))) {
        throw 'Downloaded archive does not look like a PlanTrace project.'
    }

    Write-Step 'Applying update'
    foreach ($dir in @('src', 'public', 'Wechat_APP')) {
        $src = Join-Path $sourceRoot.FullName $dir
        $dst = Join-Path $root $dir
        if (Test-Path -LiteralPath $src) {
            Copy-ReplaceDirectory -Source $src -Destination $dst
            Write-Host "Updated $dir/"
        }
    }

    $sourceScripts = Join-Path $sourceRoot.FullName 'scripts'
    if (Test-Path -LiteralPath $sourceScripts) {
        Copy-MergeDirectory -Source $sourceScripts -Destination (Join-Path $root 'scripts')
        Write-Host 'Updated scripts/'
    }

    $files = @(
        '.gitattributes',
        'index.html',
        'package.json',
        'package-lock.json',
        'eslint.config.js',
        'vite.config.js',
        'install.bat',
        'start.bat',
        'Install-PlanTrace-From-GitHub.bat',
        'Update-PlanTrace.bat',
        'Install-PlanTrace-From-GitHub-Windows.bat',
        'Update-PlanTrace-Windows.bat',
        'Start-PlanTrace-Windows.bat',
        'Install-PlanTrace-Local-Windows.bat',
        'Install-PlanTrace-From-GitHub-macOS.command',
        'Update-PlanTrace-macOS.command',
        'start-macOS.command',
        'install-macOS.command',
        'README.md',
        'DEPLOY.md',
        'LICENSE'
    )

    foreach ($file in $files) {
        $src = Join-Path $sourceRoot.FullName $file
        $dst = Join-Path $root $file
        if (Test-Path -LiteralPath $src) {
            Copy-Item -LiteralPath $src -Destination $dst -Force
            Write-Host "Updated $file"
        }
    }

    Write-Step 'Installing dependencies'
    Ensure-Node
    $npm = Get-NpmCommand
    Push-Location $root
    try {
        & $npm install --prefer-offline --loglevel warn
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ''
    Write-Host "PlanTrace updated to v$remoteVersion." -ForegroundColor Green
    Write-Host 'User data in data/, backups/, and legacy browser localStorage was not changed.'
    New-PlanTraceShortcut -Root $root

    if (-not $NoLaunch) {
        $launch = Read-Host 'Start PlanTrace now? (Y/n)'
        if ($launch -notmatch '^(n|no)$') {
            $startScript = Join-Path $root 'Start-PlanTrace-Windows.bat'
            if (-not (Test-Path -LiteralPath $startScript)) {
                $startScript = Join-Path $root 'start.bat'
            }
            Start-Process -FilePath $startScript -WorkingDirectory $root
        }
    }
}
catch {
    Write-Host ''
    Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
