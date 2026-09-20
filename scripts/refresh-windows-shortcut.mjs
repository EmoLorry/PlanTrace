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
$Desktop = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($Desktop)) { exit 0 }
$ShortcutPath = Join-Path $Desktop 'PlanTrace.lnk'
if (Test-Path -LiteralPath $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force -ErrorAction SilentlyContinue
}
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Target
$Shortcut.WorkingDirectory = $WorkingDirectory
$Shortcut.Description = 'Start PlanTrace'
if (Test-Path -LiteralPath $Icon) {
    $Shortcut.IconLocation = "$Icon,0"
}
$Shortcut.Save()
Write-Host "PlanTrace desktop shortcut refreshed: $ShortcutPath"
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
