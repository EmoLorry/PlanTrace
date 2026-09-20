import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform === 'win32') {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'refresh-windows-shortcut.mjs')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.status !== 0) {
    console.warn(`PlanTrace Windows shortcut refresh exited with code ${result.status ?? 'unknown'}.`)
  }
  process.exit(0)
}

if (process.platform === 'darwin') {
  const result = spawnSync('bash', [path.join(root, 'scripts', 'refresh-macos-launcher.sh'), root], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.warn(`PlanTrace macOS launcher refresh exited with code ${result.status ?? 'unknown'}.`)
  }
  process.exit(0)
}

process.exit(0)
