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
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
  const epubDir = path.join(dataDir, 'epub');
  const epubBooksDir = path.join(epubDir, 'books');
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.mkdirSync(epubBooksDir, { recursive: true });
  return {
    dataDir,
    diaryDir,
    epubDir,
    epubBooksDir,
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
    mainHtml: typeof data?.mainHtml === 'string' ? data.mainHtml : '',
    notes: Array.isArray(data?.notes) ? data.notes : [],
    lastModified: Number(data?.lastModified) || Date.now(),
  };
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
  return next;
}

function normalizeDiaryData(data) {
  return {
    mainText: typeof data?.mainText === 'string' ? data.mainText : '',
    mainHtml: typeof data?.mainHtml === 'string' ? data.mainHtml : '',
    notes: Array.isArray(data?.notes) ? data.notes.filter((note) => note && typeof note === 'object') : [],
    lastModified: Number(data?.lastModified) || 0,
  };
}

function diaryHasContent(data) {
  const diary = normalizeDiaryData(data);
  return Boolean(
    diary.mainText.trim()
    || diary.mainHtml.replace(/<[^>]+>/g, '').trim()
    || diary.notes.some((note) => String(note?.text || '').trim())
  );
}

function noteKey(note, index, prefix) {
  if (note?.id) return String(note.id);
  const text = String(note?.text || '').trim();
  const createdAt = note?.createdAt || note?.created_at || '';
  const color = note?.color || '';
  if (text || createdAt || color) return `${createdAt}|${color}|${text}`;
  return `${prefix}-${index}`;
}

function noteModified(note, fallbackModified) {
  return Number(note?.updatedAt || note?.updated_at || note?.lastModified || note?.createdAt || note?.created_at) || fallbackModified || 0;
}

function mergeDiaryData(existingRaw, incomingRaw) {
  const existing = normalizeDiaryData(existingRaw);
  const incoming = normalizeDiaryData(incomingRaw);
  const existingModified = existing.lastModified;
  const incomingModified = incoming.lastModified;
  const existingText = existing.mainText;
  const incomingText = incoming.mainText;
  const existingHtml = existing.mainHtml;
  const incomingHtml = incoming.mainHtml;

  let mainText = existingText;
  let mainHtml = existingHtml;
  if (incomingText.trim()) {
    if (!existingText.trim() || incomingModified >= existingModified) {
      mainText = incomingText;
      mainHtml = incomingHtml;
    }
  } else if (!existingText.trim()) {
    mainText = incomingText;
    mainHtml = incomingHtml;
  } else if (incomingHtml.trim() && incomingModified >= existingModified) {
    mainHtml = incomingHtml;
  }

  const noteMap = new Map();
  const putNote = (note, index, prefix, sourceModified) => {
    if (!note || typeof note !== 'object' || !String(note.text || '').trim()) return;
    const key = noteKey(note, index, prefix);
    const modified = noteModified(note, sourceModified);
    const current = noteMap.get(key);
    if (!current || modified >= current.modified) {
      noteMap.set(key, { note, modified });
    }
  };

  existing.notes.forEach((note, index) => putNote(note, index, 'existing', existingModified));
  incoming.notes.forEach((note, index) => putNote(note, index, 'incoming', incomingModified));

  const notes = [...noteMap.values()]
    .map((entry) => entry.note)
    .sort((a, b) => noteModified(b, 0) - noteModified(a, 0));

  return {
    mainText,
    mainHtml,
    notes,
    lastModified: Math.max(existingModified, incomingModified) || Date.now(),
  };
}

function diaryEquals(leftRaw, rightRaw) {
  return JSON.stringify(normalizeDiaryData(leftRaw)) === JSON.stringify(normalizeDiaryData(rightRaw));
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

function validateMonthString(monthStr) {
  if (!/^\d{4}-\d{2}$/.test(String(monthStr || ''))) {
    throw new Error('Invalid month.');
  }
  return String(monthStr);
}

function readDiaryMonthSummary(monthStr) {
  const month = validateMonthString(monthStr);
  const { diaryDir } = ensureDataDirs();
  const prefix = `diary-${month}-`;
  return fs.readdirSync(diaryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && /^diary-\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => {
      const date = entry.name.slice(6, 16);
      const diary = normalizeDiaryData(readDiaryFile(date));
      const mainText = diary.mainText.trim();
      const noteCount = diary.notes.filter((note) => String(note?.text || '').trim()).length;
      return {
        date,
        hasMain: Boolean(mainText),
        noteCount,
        hasContent: Boolean(mainText || noteCount),
        lastModified: diary.lastModified || 0,
      };
    })
    .filter((entry) => entry.hasContent)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// EPUB local library helpers
// ---------------------------------------------------------------------------
const DEFAULT_EPUB_SHELF_ID = 'shelf_default';

function makeLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureEpubLibrary() {
  const { epubDir, epubBooksDir } = ensureDataDirs();
  const libraryFile = path.join(epubDir, 'library.json');
  return { epubDir, epubBooksDir, libraryFile };
}

function makeEmptyEpubLibrary() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    updatedAt: now,
    shelves: [
      { id: DEFAULT_EPUB_SHELF_ID, name: '默认书架', createdAt: now, updatedAt: now },
    ],
    books: [],
    annotations: [],
  };
}

function normalizeEpubBook(book, shelfSet) {
  const legacyShelfId = shelfSet.has(book?.shelfId) ? book.shelfId : DEFAULT_EPUB_SHELF_ID;
  const shelfIds = new Set([DEFAULT_EPUB_SHELF_ID, legacyShelfId]);
  if (Array.isArray(book?.shelfIds)) {
    for (const shelfId of book.shelfIds) {
      if (shelfSet.has(shelfId)) shelfIds.add(shelfId);
    }
  }
  return {
    ...book,
    shelfId: legacyShelfId,
    shelfIds: [...shelfIds],
  };
}

function normalizeEpubLibrary(raw) {
  const empty = makeEmptyEpubLibrary();
  const source = raw && typeof raw === 'object' ? raw : empty;
  const shelves = Array.isArray(source.shelves) ? source.shelves.filter((item) => item?.id) : empty.shelves;
  const hasDefault = shelves.some((item) => item.id === DEFAULT_EPUB_SHELF_ID);
  const normalizedShelves = hasDefault ? shelves : [empty.shelves[0], ...shelves];
  const shelfSet = new Set(normalizedShelves.map((item) => item.id));
  return {
    schemaVersion: 1,
    updatedAt: source.updatedAt || empty.updatedAt,
    shelves: normalizedShelves,
    books: Array.isArray(source.books)
      ? source.books
        .filter((item) => item?.id && item?.fileName)
        .map((item) => normalizeEpubBook(item, shelfSet))
      : [],
    annotations: Array.isArray(source.annotations) ? source.annotations.filter((item) => item?.id && item?.bookId) : [],
  };
}

function readEpubLibrary() {
  const { libraryFile } = ensureEpubLibrary();
  if (!fs.existsSync(libraryFile)) {
    const empty = makeEmptyEpubLibrary();
    writeEpubLibrary(empty);
    return empty;
  }

  try {
    return normalizeEpubLibrary(JSON.parse(fs.readFileSync(libraryFile, 'utf8')));
  } catch {
    quarantineFile(libraryFile);
    const empty = makeEmptyEpubLibrary();
    writeEpubLibrary(empty);
    return empty;
  }
}

function writeEpubLibrary(library) {
  const { libraryFile } = ensureEpubLibrary();
  const next = normalizeEpubLibrary({
    ...library,
    updatedAt: new Date().toISOString(),
  });
  const tempFile = `${libraryFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tempFile, libraryFile);
  return next;
}

function parseEpubRoute(req) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  return pathname.replace(/^\/api\/epub/, '') || '/';
}

function sanitizeEpubUploadName(name) {
  const base = path.basename(String(name || 'book.epub'))
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char;
    })
    .join('');
  return base.toLowerCase().endsWith('.epub') ? base : `${base}.epub`;
}

function findEpubBook(library, bookId) {
  return library.books.find((book) => book.id === bookId && book.status !== 'deleted');
}

function normalizeImportedPack(raw) {
  const pack = raw?.type === 'plantrace-mobile-pack' ? raw.payload : raw;
  if (!pack || typeof pack !== 'object') {
    throw new Error('Invalid PlanTrace import file.');
  }

  const keys = pack.keys && typeof pack.keys === 'object' ? pack.keys : {};
  const diaries = Array.isArray(pack.diaries) ? pack.diaries : [];
  return { keys, diaries };
}

function mergeById(existing, incoming, idKey) {
  const map = new Map();
  let imported = 0;
  let replaced = 0;

  for (const item of Array.isArray(existing) ? existing : []) {
    if (item && item[idKey]) map.set(item[idKey], item);
  }

  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (!item || !item[idKey]) continue;
    const current = map.get(item[idKey]);
    if (!current) {
      imported += 1;
      map.set(item[idKey], item);
      continue;
    }

    const incomingModified = Number(item.updated_at || item.lastModified || item.completed_at || item.timestamp || item.created_at) || 0;
    const currentModified = Number(current.updated_at || current.lastModified || current.completed_at || current.timestamp || current.created_at) || 0;
    if (incomingModified >= currentModified) {
      replaced += 1;
      map.set(item[idKey], item);
    }
  }

  return { items: [...map.values()], imported, replaced };
}

function mergeMobilePack(raw) {
  const importedPack = normalizeImportedPack(raw);
  const data = readPlanTraceData();
  const keys = data.keys && typeof data.keys === 'object' ? data.keys : {};
  const stats = {
    tasks: { imported: 0, replaced: 0 },
    logs: { imported: 0, replaced: 0 },
    atomicSessions: { imported: 0, replaced: 0 },
    diaries: { imported: 0, replaced: 0, skipped: 0 },
  };

  const taskMerge = mergeById(keys.tasks, importedPack.keys.tasks, 'id');
  keys.tasks = taskMerge.items;
  stats.tasks = { imported: taskMerge.imported, replaced: taskMerge.replaced };

  const logMerge = mergeById(keys.action_logs, importedPack.keys.action_logs, 'log_id');
  keys.action_logs = logMerge.items;
  stats.logs = { imported: logMerge.imported, replaced: logMerge.replaced };

  const atomicMerge = mergeById(keys.atomic_sessions, importedPack.keys.atomic_sessions, 'session_id');
  keys.atomic_sessions = atomicMerge.items;
  stats.atomicSessions = { imported: atomicMerge.imported, replaced: atomicMerge.replaced };

  data.keys = keys;
  writePlanTraceData(data);

  for (const entry of importedPack.diaries) {
    try {
      const date = validateDateString(entry.date);
      const incoming = entry.diary || entry.data;
      const existing = readDiaryFile(date);
      if (!existing) {
        if (!diaryHasContent(incoming)) {
          stats.diaries.skipped += 1;
          continue;
        }
        writeDiaryFile(date, incoming);
        stats.diaries.imported += 1;
      } else {
        if (!diaryHasContent(incoming)) {
          stats.diaries.skipped += 1;
          continue;
        }
        const merged = mergeDiaryData(existing, incoming);
        if (diaryEquals(existing, merged)) {
          stats.diaries.skipped += 1;
          continue;
        }
        writeDiaryFile(date, merged);
        stats.diaries.replaced += 1;
      }
    } catch {
      stats.diaries.skipped += 1;
    }
  }

  return stats;
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

          const diarySummaryMatch = route.match(/^\/diary-summary\/(\d{4}-\d{2})$/);
          if (diarySummaryMatch && req.method === 'GET') {
            sendJson(res, {
              success: true,
              month: diarySummaryMatch[1],
              days: readDiaryMonthSummary(diarySummaryMatch[1]),
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
                if (!existing) {
                  if (!diaryHasContent(incoming)) {
                    skipped += 1;
                    continue;
                  }
                  writeDiaryFile(date, incoming);
                  imported += 1;
                } else {
                  if (!diaryHasContent(incoming)) {
                    skipped += 1;
                    continue;
                  }
                  const merged = mergeDiaryData(existing, incoming);
                  if (diaryEquals(existing, merged)) {
                    skipped += 1;
                    continue;
                  }
                  writeDiaryFile(date, merged);
                  imported += 1;
                }
              } catch {
                skipped += 1;
              }
            }
            sendJson(res, { success: true, imported, skipped, diaryPath: diaryDir });
            return;
          }

          if (route === '/mobile-import' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const stats = mergeMobilePack(body.pack || body);
            sendJson(res, { success: true, stats });
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

function epubPlugin() {
  return {
    name: 'plantrace-epub',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (!pathname.startsWith('/api/epub')) {
          next();
          return;
        }

        try {
          const route = parseEpubRoute(req);

          if (route === '/library' && req.method === 'GET') {
            sendJson(res, { success: true, library: readEpubLibrary() });
            return;
          }

          if (route === '/shelf' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const name = String(body.name || '').trim();
            if (!name) throw new Error('Missing shelf name.');
            const library = readEpubLibrary();
            const now = new Date().toISOString();
            const shelf = { id: makeLocalId('shelf'), name: name.slice(0, 60), createdAt: now, updatedAt: now };
            library.shelves.push(shelf);
            sendJson(res, { success: true, shelf, library: writeEpubLibrary(library) });
            return;
          }

          const shelfMatch = route.match(/^\/shelf\/([^/]+)$/);
          if (shelfMatch && req.method === 'DELETE') {
            const shelfId = decodeURIComponent(shelfMatch[1]);
            if (shelfId === DEFAULT_EPUB_SHELF_ID) throw new Error('Default shelf cannot be deleted.');

            const library = readEpubLibrary();
            const shelf = library.shelves.find((item) => item.id === shelfId);
            if (!shelf) throw new Error('Shelf was not found.');

            const now = new Date().toISOString();
            library.shelves = library.shelves.filter((item) => item.id !== shelfId);
            const shelfSet = new Set(library.shelves.map((item) => item.id));
            library.books = library.books.map((book) => {
              const next = {
                ...book,
                shelfId: book.shelfId === shelfId ? DEFAULT_EPUB_SHELF_ID : book.shelfId,
                shelfIds: Array.isArray(book.shelfIds)
                  ? book.shelfIds.filter((id) => id !== shelfId)
                  : [],
              };
              const normalized = normalizeEpubBook(next, shelfSet);
              if (JSON.stringify(normalized) !== JSON.stringify(book)) {
                normalized.updatedAt = now;
              }
              return normalized;
            });

            sendJson(res, { success: true, shelf, library: writeEpubLibrary(library) });
            return;
          }

          if (route === '/import' && req.method === 'POST') {
            const body = await readRequestJson(req, 160 * 1024 * 1024);
            const originalName = sanitizeEpubUploadName(body.name);
            const dataBase64 = String(body.dataBase64 || '');
            if (!dataBase64) throw new Error('Missing EPUB file data.');

            const buffer = Buffer.from(dataBase64, 'base64');
            if (!buffer.length) throw new Error('EPUB file is empty.');
            if (buffer.length > 120 * 1024 * 1024) throw new Error('EPUB file is too large.');

            const { epubBooksDir } = ensureEpubLibrary();
            const library = readEpubLibrary();
            const now = new Date().toISOString();
            const id = makeLocalId('book');
            const fileName = `${id}.epub`;
            const filePath = path.join(epubBooksDir, fileName);
            fs.writeFileSync(filePath, buffer);

            const title = originalName.replace(/\.epub$/i, '').trim() || '未命名书籍';
            const shelfId = library.shelves.some((item) => item.id === body.shelfId) ? body.shelfId : DEFAULT_EPUB_SHELF_ID;
            const book = {
              id,
              title,
              author: '',
              originalName,
              fileName,
              shelfId,
              shelfIds: [...new Set([DEFAULT_EPUB_SHELF_ID, shelfId])],
              size: buffer.length,
              createdAt: now,
              updatedAt: now,
              lastLocation: null,
              readerSettings: {
                fontSize: 18,
                surface: 'paper',
                lineHeight: 1.65,
              },
            };

            library.books.unshift(book);
            sendJson(res, { success: true, book, library: writeEpubLibrary(library) });
            return;
          }

          const fileMatch = route.match(/^\/file\/([^/]+)(?:\/[^/]+)?$/);
          if (fileMatch && req.method === 'GET') {
            const library = readEpubLibrary();
            const book = findEpubBook(library, fileMatch[1]);
            if (!book) throw new Error('Book was not found.');
            const { epubBooksDir } = ensureEpubLibrary();
            const filePath = path.join(epubBooksDir, book.fileName);
            if (!fs.existsSync(filePath)) throw new Error('EPUB file was not found.');
            const stat = fs.statSync(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/epub+zip');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Length', String(stat.size));
            res.setHeader('Accept-Ranges', 'bytes');
            fs.createReadStream(filePath).pipe(res);
            return;
          }

          const bookMatch = route.match(/^\/book\/([^/]+)$/);
          if (bookMatch && req.method === 'POST') {
            const body = await readRequestJson(req);
            const library = readEpubLibrary();
            const book = findEpubBook(library, bookMatch[1]);
            if (!book) throw new Error('Book was not found.');

            const allowed = ['title', 'author', 'shelfId', 'shelfIds', 'lastLocation', 'readerSettings'];
            for (const key of allowed) {
              if (Object.prototype.hasOwnProperty.call(body, key)) {
                book[key] = body[key];
              }
            }
            if (!library.shelves.some((item) => item.id === book.shelfId)) {
              book.shelfId = DEFAULT_EPUB_SHELF_ID;
            }
            Object.assign(book, normalizeEpubBook(book, new Set(library.shelves.map((item) => item.id))));
            book.updatedAt = new Date().toISOString();
            sendJson(res, { success: true, book, library: writeEpubLibrary(library) });
            return;
          }

          if (route === '/annotation' && req.method === 'POST') {
            const body = await readRequestJson(req);
            const library = readEpubLibrary();
            const book = findEpubBook(library, body.bookId);
            if (!book) throw new Error('Book was not found.');
            if (!body.cfiRange) throw new Error('Missing selection location.');
            const now = new Date().toISOString();
            const annotation = {
              id: makeLocalId('anno'),
              bookId: book.id,
              cfiRange: String(body.cfiRange),
              text: String(body.text || '').slice(0, 3000),
              note: String(body.note || '').slice(0, 3000),
              color: String(body.color || '#f4b26b'),
              type: ['highlight', 'textColor', 'underline'].includes(body.type) ? body.type : 'highlight',
              createdAt: now,
              updatedAt: now,
            };
            library.annotations.unshift(annotation);
            sendJson(res, { success: true, annotation, library: writeEpubLibrary(library) });
            return;
          }

          const annotationMatch = route.match(/^\/annotation\/([^/]+)$/);
          if (annotationMatch && req.method === 'DELETE') {
            const library = readEpubLibrary();
            library.annotations = library.annotations.filter((item) => item.id !== annotationMatch[1]);
            sendJson(res, { success: true, library: writeEpubLibrary(library) });
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
          const DIRS = ['src', 'public', 'Wechat_APP'];
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
// Plugin: local system maintenance endpoint
// POST /api/system/desktop-launcher  → refresh desktop launcher/shortcut
// ---------------------------------------------------------------------------
function refreshDesktopLauncher(root) {
  if (process.platform === 'win32') {
    const script = path.join(root, 'scripts', 'refresh-windows-shortcut.mjs');
    if (!fs.existsSync(script)) throw new Error('Windows shortcut helper was not found.');
    return execFileSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
  }

  if (process.platform === 'darwin') {
    const script = path.join(root, 'scripts', 'refresh-macos-launcher.sh');
    if (!fs.existsSync(script)) throw new Error('macOS launcher helper was not found.');
    return execFileSync('bash', [script, root], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
    });
  }

  throw new Error(`Desktop launcher refresh is not supported on ${process.platform}.`);
}

function systemPlugin() {
  return {
    name: 'plantrace-system',
    configureServer(server) {
      server.middlewares.use('/api/system/desktop-launcher', (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, { success: false, error: 'Method not allowed.' }, 405);
          return;
        }

        try {
          const root = path.resolve('.');
          const output = refreshDesktopLauncher(root);
          sendJson(res, {
            success: true,
            platform: process.platform,
            message: output || 'Desktop launcher refreshed.',
          });
        } catch (err) {
          sendJson(res, {
            success: false,
            platform: process.platform,
            error: err.message || 'Desktop launcher refresh failed.',
          }, 500);
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
    watch: {
      ignored: [
        '**/data/**',
        '**/backups/**',
        '**/dist/**',
      ],
    },
  },
  plugins: [react(), tailwindcss(), dataPlugin(), epubPlugin(), backupPlugin(), updatePlugin(), systemPlugin()],
})
