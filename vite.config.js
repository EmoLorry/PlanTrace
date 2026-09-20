import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import { execFileSync, spawn } from 'child_process'
import { Buffer } from 'node:buffer'
import process from 'node:process'

// ---------------------------------------------------------------------------
// Plugin: local data folder endpoint
// ---------------------------------------------------------------------------

const DATA_SCHEMA_VERSION = 1;

function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readRequestJson(req, limitBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > limitBytes) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function ensureDataDirs() {
  const dataDir = path.resolve('data');
  const diaryDir = path.join(dataDir, 'diary');
  fs.mkdirSync(diaryDir, { recursive: true });
  return {
    dataDir,
    diaryDir,
    dataFile: path.join(dataDir, 'plantrace-data.json'),
  };
}

function quarantineFile(filePath) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(filePath, corruptPath);
    return corruptPath;
  } catch {
    try {
      fs.copyFileSync(filePath, corruptPath);
      fs.unlinkSync(filePath);
      return corruptPath;
    } catch {
      return null;
    }
  }
}

function readPlanTraceData() {
  const { dataFile } = ensureDataDirs();
  if (!fs.existsSync(dataFile)) {
    return {
      schemaVersion: DATA_SCHEMA_VERSION,
      updatedAt: null,
      keys: {},
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      schemaVersion: data.schemaVersion || DATA_SCHEMA_VERSION,
      updatedAt: data.updatedAt || null,
      keys: data.keys && typeof data.keys === 'object' ? data.keys : {},
    };
  } catch {
    const corruptPath = quarantineFile(dataFile);
    return {
      schemaVersion: DATA_SCHEMA_VERSION,
      updatedAt: null,
      keys: {},
      recoveredFromCorruptFile: corruptPath,
    };
  }
}

function writePlanTraceData(data) {
  const { dataFile } = ensureDataDirs();
  const next = {
    schemaVersion: DATA_SCHEMA_VERSION,
    ...data,
    keys: data.keys && typeof data.keys === 'object' ? data.keys : {},
    updatedAt: new Date().toISOString(),
  };
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
  return next;
}

function parseDataRoute(req) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  return pathname.replace(/^\/api\/data/, '') || '/';
}

function validateDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) {
    throw new Error('Invalid date.');
  }
  return String(dateStr);
}

function diaryPathForDate(dateStr) {
  const { diaryDir } = ensureDataDirs();
  return path.join(diaryDir, `diary-${validateDateString(dateStr)}.json`);
}

function readDiaryFile(dateStr) {
  const filePath = diaryPathForDate(dateStr);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    quarantineFile(filePath);
    return null;
  }
}

function writeDiaryFile(dateStr, data) {
  const filePath = diaryPathForDate(dateStr);
  const next = {
    mainText: typeof data?.mainText === 'string' ? data.mainText : '',
    notes: Array.isArray(data?.notes) ? data.notes : [],
    lastModified: Number(data?.lastModified) || Date.now(),
  };
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
  return next;
}

function readAllDiaryFiles() {
  const { diaryDir } = ensureDataDirs();
  return fs.readdirSync(diaryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => /^diary-(\d{4}-\d{2}-\d{2})\.json$/.exec(entry.name))
    .filter(Boolean)
    .map((match) => {
      const date = match[1];
      return { date, diary: readDiaryFile(date) };
    })
    .filter((entry) => entry.diary)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dataPlugin() {
  return {
    name: 'plantrace-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (!pathname.startsWith('/api/data')) {
          next();
          return;
        }

        try {
          const route = parseDataRoute(req);
          const { dataDir, diaryDir, dataFile } = ensureDataDirs();

          if (route === '/snapshot' && req.method === 'GET') {
            const data = readPlanTraceData();
            sendJson(res, {
              success: true,
              schemaVersion: DATA_SCHEMA_VERSION,
              keys: data.keys,
              dataPath: dataFile,
              diaryPath: diaryDir,
              updatedAt: data.updatedAt,
            });
            return;
          }

          if (route === '/key' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const key = String(body.key || '');
            if (!key) throw new Error('Missing key.');
            const data = readPlanTraceData();
            if (body.remove) {
              delete data.keys[key];
            } else {
              data.keys[key] = body.value;
            }
            const nextData = writePlanTraceData(data);
            sendJson(res, { success: true, key, dataPath: dataFile, updatedAt: nextData.updatedAt });
            return;
          }

          if (route === '/migrate' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const incoming = body.keys && typeof body.keys === 'object' ? body.keys : {};
            const data = readPlanTraceData();
            let imported = 0;
            for (const [key, value] of Object.entries(incoming)) {
              if (data.keys[key] === undefined || data.keys[key] === null) {
                data.keys[key] = value;
                imported += 1;
              }
            }
            const nextData = imported > 0 ? writePlanTraceData(data) : data;
            sendJson(res, {
              success: true,
              imported,
              keys: nextData.keys,
              dataPath: dataFile,
              updatedAt: nextData.updatedAt,
            });
            return;
          }

          if (route === '/info' && req.method === 'GET') {
            sendJson(res, { success: true, dataPath: dataDir, diaryPath: diaryDir });
            return;
          }

          if (route === '/export' && req.method === 'GET') {
            const data = readPlanTraceData();
            sendJson(res, {
              success: true,
              schemaVersion: DATA_SCHEMA_VERSION,
              exportedAt: new Date().toISOString(),
              dataPath: dataFile,
              diaryPath: diaryDir,
              keys: data.keys,
              diaries: readAllDiaryFiles(),
            });
            return;
          }

          const diaryMatch = route.match(/^\/diary\/(\d{4}-\d{2}-\d{2})$/);
          if (diaryMatch && req.method === 'GET') {
            sendJson(res, {
              success: true,
              diary: readDiaryFile(diaryMatch[1]),
              diaryPath: diaryPathForDate(diaryMatch[1]),
            });
            return;
          }
          if (diaryMatch && req.method === 'POST') {
            const body = await readRequestJson(req);
            const diary = writeDiaryFile(diaryMatch[1], body.diary || body);
            sendJson(res, { success: true, diary, diaryPath: diaryPathForDate(diaryMatch[1]) });
            return;
          }

          if (route === '/diary-import' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const entries = Array.isArray(body.entries) ? body.entries : [];
            let imported = 0;
            let skipped = 0;
            for (const entry of entries) {
              try {
                const date = validateDateString(entry.date);
                const incoming = entry.diary || entry.data;
                const existing = readDiaryFile(date);
                const incomingModified = Number(incoming?.lastModified) || 0;
                const existingModified = Number(existing?.lastModified) || 0;
                if (!existing || incomingModified >= existingModified) {
                  writeDiaryFile(date, incoming);
                  imported += 1;
                } else {
                  skipped += 1;
                }
              } catch {
                skipped += 1;
              }
            }
            sendJson(res, { success: true, imported, skipped, diaryPath: diaryDir });
            return;
          }

          sendJson(res, { success: false, error: 'Not found.' }, 404);
        } catch (err) {
          sendJson(res, { success: false, error: err.message }, 500);
        }
      });
    },
  };
}

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
function downloadFile(url, destPath, { timeoutMs = 120000, idleTimeoutMs = 30000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let file = null;
    let settled = false;
    let downloaded = 0;
    let lastReportedMb = 0;
    let req = null;
    let idleTimer = null;
    const startedAt = Date.now();

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (req) req.destroy();
      if (file) file.destroy();
      try { if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true }); } catch { /* ignore */ }
      reject(err);
    };

    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const resetIdleTimer = (currentUrl) => {
      cleanup();
      idleTimer = setTimeout(() => {
        fail(new Error(`No download data for ${Math.round(idleTimeoutMs / 1000)}s from ${currentUrl}`));
      }, idleTimeoutMs);
    };

    const fetch = (u) => {
      const mod = u.startsWith('https') ? https : http;
      req = mod.get(u, { headers: { 'User-Agent': 'PlanTrace-Updater/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          cleanup();
          fetch(new URL(res.headers.location, u).toString());
          return;
        }
        if (res.statusCode !== 200) {
          fail(new Error(`HTTP ${res.statusCode} while downloading ${u}`));
          return;
        }
        file = fs.createWriteStream(destPath);
        resetIdleTimer(u);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          resetIdleTimer(u);
          const downloadedMb = Math.floor(downloaded / 1024 / 1024);
          if (downloadedMb >= lastReportedMb + 3) {
            lastReportedMb = downloadedMb;
            onProgress?.(`${downloadedMb} MB downloaded...`);
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(done));
        file.on('error', fail);
      }).on('error', fail);
      req.setTimeout(timeoutMs, () => {
        fail(new Error(`Download timed out after ${Math.round((Date.now() - startedAt) / 1000)}s from ${u}`));
      });
    };
    fetch(url);
  });
}

async function downloadFirstAvailable(urls, destPath, send) {
  const errors = [];
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true });
      send?.({ type: 'progress', message: `下载通道 ${i + 1}/${urls.length}: ${url}` });
      await downloadFile(url, destPath, {
        onProgress: (message) => send?.({ type: 'progress', message }),
      });
      return url;
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
      send?.({ type: 'progress', message: `该下载通道无响应，正在切换备用通道... (${err.message})` });
    }
  }
  throw new Error(`All download mirrors failed. ${errors.join(' | ')}`);
}

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractZipArchive(zipPath, extractDir) {
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath ${quotePowerShellString(zipPath)} -DestinationPath ${quotePowerShellString(extractDir)} -Force`,
    ], { timeout: 60000 });
    return;
  }

  execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { timeout: 60000 });
}

function makeProjectScriptsExecutable(root) {
  if (process.platform === 'win32') return;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.command')) {
      try { fs.chmodSync(path.join(root, entry.name), 0o755); } catch { /* ignore */ }
    }
  }

  const scriptsDir = path.join(root, 'scripts');
  if (!fs.existsSync(scriptsDir)) return;
  for (const entry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      try { fs.chmodSync(path.join(scriptsDir, entry.name), 0o755); } catch { /* ignore */ }
    }
  }
}

/** Follow HTTP/HTTPS redirects and read a URL as text. */
function getText(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const fetch = (u) => {
      const mod = u.startsWith('https') ? https : http;
      const req = mod.get(u, { headers: { 'User-Agent': 'PlanTrace-Updater/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetch(new URL(res.headers.location, u).toString());
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} while reading ${u}`));
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body));
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout while reading ${u}`)));
      req.on('error', reject);
    };
    fetch(url);
  });
}

async function fetchRemoteVersionManifest() {
  const cacheBust = `t=${Date.now()}`;
  const sources = [
    {
      kind: 'json',
      url: `https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/public/version.json?${cacheBust}`,
    },
    {
      kind: 'json',
      url: `https://cdn.jsdelivr.net/gh/EmoLorry/PlanTrace@main/public/version.json?${cacheBust}`,
    },
    {
      kind: 'github-content',
      url: `https://api.github.com/repos/EmoLorry/PlanTrace/contents/public/version.json?ref=main&${cacheBust}`,
    },
  ];

  const errors = [];
  for (const source of sources) {
    try {
      const text = await getText(source.url);
      if (source.kind === 'github-content') {
        const payload = JSON.parse(text);
        const content = String(payload.content || '').replace(/\s/g, '');
        const decoded = Buffer.from(content, 'base64').toString('utf8');
        return JSON.parse(decoded);
      }
      return JSON.parse(text);
    } catch (err) {
      errors.push(`${source.kind}: ${err.message}`);
    }
  }

  throw new Error(`Could not fetch remote version manifest. ${errors.join(' | ')}`);
}

function quoteCmdPath(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function validateWindowsNpm(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return false;

  try {
    execFileSync(process.env.ComSpec || 'cmd.exe', [
      '/d',
      '/c',
      `${quoteCmdPath(candidate)} --version`,
    ], {
      cwd: os.tmpdir(),
      timeout: 15000,
      stdio: 'ignore',
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function getWindowsNpmCommand() {
  const candidates = [
    process.execPath && path.join(path.dirname(process.execPath), 'npm.cmd'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'npm.cmd'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'npm.cmd'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'npm.cmd'),
  ].filter(Boolean);

  try {
    const whereOut = execFileSync('where.exe', ['npm.cmd'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    candidates.push(...whereOut.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  } catch {
    // PATH lookup is only a fallback; official Node paths above are preferred.
  }

  const validCandidate = [...new Set(candidates)].find(validateWindowsNpm);
  if (!validCandidate) {
    throw new Error('npm was found but was not usable. Reinstall Node.js LTS, then try again.');
  }
  return validCandidate;
}

/** Run npm install, streaming stdout/stderr lines back via send(). */
function runNpmInstall(cwd, send) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const windowsNpm = isWindows ? getWindowsNpmCommand() : null;
    const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const commandArgs = isWindows
      ? ['/d', '/c', `${quoteCmdPath(windowsNpm)} install --prefer-offline --loglevel warn`]
      : ['install', '--prefer-offline', '--loglevel', 'warn'];
    const npm = spawn(command, [
      ...commandArgs,
    ], {
      cwd,
      windowsHide: isWindows,
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
      server.middlewares.use('/api/update/check', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        try {
          const manifest = await fetchRemoteVersionManifest();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(manifest));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });

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
          const ZIP_URLS = [
            'https://codeload.github.com/EmoLorry/PlanTrace/zip/refs/heads/main',
            'https://github.com/EmoLorry/PlanTrace/archive/refs/heads/main.zip',
          ];
          const usedZipUrl = await downloadFirstAvailable(ZIP_URLS, zipPath, send);
          send({ type: 'progress', message: `下载通道: ${usedZipUrl}` });
          send({ type: 'progress', message: '下载完成 ✓' });

          // ── Step 2: Extract ──
          send({ type: 'step', step: 2, message: '正在解压...' });
          extractZipArchive(zipPath, extractDir);
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

          makeProjectScriptsExecutable(projectDir);

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
  plugins: [react(), tailwindcss(), dataPlugin(), backupPlugin(), updatePlugin()],
})
