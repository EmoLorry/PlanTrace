import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import { execSync, spawn } from 'child_process'

// ---------------------------------------------------------------------------
// Plugin: backup endpoint
// ---------------------------------------------------------------------------
function backupPlugin() {
  return {
    name: 'plantrace-backup',
    configureServer(server) {
      server.middlewares.use('/api/backup', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405; res.end('Method not allowed'); return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { filename, data } = JSON.parse(body);
            const backupDir = path.resolve('backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const filePath = path.join(backupDir, filename);
            fs.writeFileSync(filePath, data, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, path: filePath }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin: auto-update endpoint
// GET  /api/update/version  → current local package.json version
// POST /api/update/apply    → download + extract + npm install (SSE stream)
// ---------------------------------------------------------------------------

/** Recursively copy a directory, skipping nothing. */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Follow HTTP/HTTPS redirects and download to destPath. */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const fetch = (u) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'PlanTrace-Updater/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          file.close();
          fetch(res.headers.location); return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} while downloading ${u}`)); return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    fetch(url);
  });
}

/** Run npm install, streaming stdout/stderr lines back via send(). */
function runNpmInstall(cwd, send) {
  return new Promise((resolve, reject) => {
    const npm = spawn('npm.cmd', ['install', '--prefer-offline', '--loglevel', 'warn'], {
      cwd, shell: false,
    });
    npm.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) send({ type: 'progress', message: line });
    });
    npm.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) send({ type: 'progress', message: line });
    });
    npm.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed with exit code ${code}`));
    });
    npm.on('error', reject);
  });
}

function updatePlugin() {
  return {
    name: 'plantrace-update',
    configureServer(server) {

      // GET /api/update/version — return local version
      server.middlewares.use('/api/update/version', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        try {
          const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ version: pkg.version || '0.0.0' }));
        } catch {
          res.statusCode = 500; res.end('{}');
        }
      });

      // POST /api/update/apply — stream update progress
      server.middlewares.use('/api/update/apply', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Helper: send a structured SSE message
        const send = (payload) => {
          try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch { /* closed */ }
        };

        const projectDir = path.resolve('.');
        const tmpDir = path.join(os.tmpdir(), `plantrace-update-${Date.now()}`);
        const zipPath = path.join(tmpDir, 'update.zip');
        const extractDir = path.join(tmpDir, 'extracted');

        try {
          fs.mkdirSync(tmpDir, { recursive: true });
          fs.mkdirSync(extractDir, { recursive: true });

          // ── Step 1: Download ZIP ──
          send({ type: 'step', step: 1, message: '正在从 GitHub 下载最新版本...' });
          const ZIP_URL = 'https://github.com/EmoLorry/PlanTrace/archive/refs/heads/main.zip';
          await downloadFile(ZIP_URL, zipPath);
          send({ type: 'progress', message: '下载完成 ✓' });

          // ── Step 2: Extract ──
          send({ type: 'step', step: 2, message: '正在解压...' });
          execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
            { timeout: 60000 }
          );
          send({ type: 'progress', message: '解压完成 ✓' });

          // Find the inner folder (PlanTrace-main)
          const innerFolders = fs.readdirSync(extractDir);
          if (!innerFolders.length) throw new Error('解压后找不到源码文件夹');
          const sourceRoot = path.join(extractDir, innerFolders[0]);

          // ── Step 3: Apply files (safe list only) ──
          send({ type: 'step', step: 3, message: '正在应用更新（不会覆盖用户数据）...' });

          // Directories to replace entirely
          const DIRS = ['src', 'public'];
          for (const dir of DIRS) {
            const src = path.join(sourceRoot, dir);
            const dest = path.join(projectDir, dir);
            if (fs.existsSync(src)) {
              // Remove old dir then copy fresh
              if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
              copyDir(src, dest);
              send({ type: 'progress', message: `已更新 ${dir}/ ✓` });
            }
          }

          // Directories to merge, not replace. This keeps locally-added helper files.
          const MERGE_DIRS = ['scripts'];
          for (const dir of MERGE_DIRS) {
            const src = path.join(sourceRoot, dir);
            const dest = path.join(projectDir, dir);
            if (fs.existsSync(src)) {
              copyDir(src, dest);
              send({ type: 'progress', message: `已更新 ${dir}/ ✓` });
            }
          }

          // Individual files to update (never touch: backups/, .gitignore)
          const FILES = [
            'index.html',
            'package.json',
            'package-lock.json',
            'eslint.config.js',
            'vite.config.js',
            'install.bat',
            'start.bat',
            'Install-PlanTrace-From-GitHub.bat',
            'Update-PlanTrace.bat',
            'README.md',
            'DEPLOY.md',
            'LICENSE',
          ];
          for (const file of FILES) {
            const src = path.join(sourceRoot, file);
            const dest = path.join(projectDir, file);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              send({ type: 'progress', message: `已更新 ${file} ✓` });
            }
          }

          // ── Step 4: npm install ──
          send({ type: 'step', step: 4, message: '正在安装/更新依赖（约1-3分钟）...' });
          await runNpmInstall(projectDir, send);
          send({ type: 'progress', message: '依赖安装完成 ✓' });

          // ── Step 5: Cleanup ──
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

          send({ type: 'done', message: '更新完成！Vite 将自动热重载，若无变化请手动刷新。' });
          res.end();

        } catch (err) {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
          send({ type: 'error', message: `更新失败：${err.message}` });
          res.end();
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Vite config
// ---------------------------------------------------------------------------
export default defineConfig({
  server: {
    host: 'localhost',   // always bind to localhost, never 127.0.0.1
    port: 5173,
    open: 'http://localhost:5173',
  },
  plugins: [react(), tailwindcss(), backupPlugin(), updatePlugin()],
})
