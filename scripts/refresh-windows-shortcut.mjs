import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  process.exit(0)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = fs.existsSync(path.join(root, 'Start-PlanTrace-Windows.bat'))
  ? path.join(root, 'Start-PlanTrace-Windows.bat')
  : path.join(root, 'start.bat')
const icon = path.join(root, 'public', 'plantrace.ico')

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

const command = `
$ErrorActionPreference = 'Stop'
$Target = ${quotePowerShellString(target)}
$WorkingDirectory = ${quotePowerShellString(root)}
$Icon = ${quotePowerShellString(icon)}
function Add-Candidate {
    param([string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) { return }
    try { $script:DesktopCandidates += [System.IO.Path]::GetFullPath($PathValue) }
    catch { $script:DesktopCandidates += $PathValue }
}

$DesktopCandidates = @()
Add-Candidate ([Environment]::GetFolderPath('Desktop'))
try {
    $ProbeShell = New-Object -ComObject WScript.Shell
    Add-Candidate ($ProbeShell.SpecialFolders.Item('Desktop'))
} catch {}
if ($env:USERPROFILE) {
    Add-Candidate (Join-Path $env:USERPROFILE 'Desktop')
    $Localized = Join-Path $env:USERPROFILE '桌面'
    if (Test-Path -LiteralPath $Localized) { Add-Candidate $Localized }
}
foreach ($Root in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
    if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root)) { continue }
    Add-Candidate (Join-Path $Root 'Desktop')
    $Localized = Join-Path $Root '桌面'
    if (Test-Path -LiteralPath $Localized) { Add-Candidate $Localized }
}

$Shell = New-Object -ComObject WScript.Shell
$Created = 0
foreach ($Desktop in @($DesktopCandidates | Select-Object -Unique)) {
    try {
        if ([string]::IsNullOrWhiteSpace($Desktop)) { continue }
        if (-not (Test-Path -LiteralPath $Desktop)) {
            New-Item -ItemType Directory -Force -Path $Desktop | Out-Null
        }
        $ShortcutPath = Join-Path $Desktop 'PlanTrace.lnk'
        if (Test-Path -LiteralPath $ShortcutPath) {
            Remove-Item -LiteralPath $ShortcutPath -Force -ErrorAction SilentlyContinue
        }
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = $Target
        $Shortcut.WorkingDirectory = $WorkingDirectory
        $Shortcut.Description = 'Start PlanTrace'
        if (Test-Path -LiteralPath $Icon) {
            $Shortcut.IconLocation = "$Icon,0"
        }
        $Shortcut.Save()
        $Created += 1
        Write-Host "PlanTrace desktop shortcut refreshed: $ShortcutPath"
    } catch {
        Write-Host "PlanTrace desktop shortcut skipped at ${Desktop}: $($_.Exception.Message)"
    }
}
if ($Created -eq 0) { exit 1 }
`

const encoded = Buffer.from(command, 'utf16le').toString('base64')
const result = spawnSync('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-EncodedCommand',
  encoded,
], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.status !== 0) {
  console.warn('PlanTrace shortcut refresh skipped.')
}

process.exit(0)
