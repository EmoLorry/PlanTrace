import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform === 'win32') {
  spawnSync(process.execPath, [path.join(root, 'scripts', 'refresh-windows-shortcut.mjs')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  })
  process.exit(0)
}

if (process.platform === 'darwin') {
  spawnSync('bash', [path.join(root, 'scripts', 'refresh-macos-launcher.sh'), root], {
    cwd: root,
    stdio: 'inherit',
  })
  process.exit(0)
}

process.exit(0)
