/**
 * diaryStore.js
 * Local diary storage using PlanTrace's data/diary folder via the local Vite server.
 * Legacy File System Access handles are kept only for one-time migration/import.
 *
 * File layout (one per day): data/diary/diary-YYYY-MM-DD.json
 * Schema: { mainText, mainHtml, notes: [{id, text, color, createdAt}], lastModified }
 */

const DB_NAME    = 'plantrace_diary';
const DB_VERSION = 1;
const STORE_DIR  = 'handles';   // stores the FileSystemDirectoryHandle

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_DIR)) {
                db.createObjectStore(STORE_DIR);
            }
        };
        req.onsuccess  = () => resolve(req.result);
        req.onerror    = () => reject(req.error);
    });
}

async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx  = db.transaction(STORE_DIR, 'readonly');
        const req = tx.objectStore(STORE_DIR).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror   = () => resolve(null);
    });
}

async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_DIR, 'readwrite');
        tx.objectStore(STORE_DIR).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
    });
}

async function idbDel(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_DIR, 'readwrite');
        tx.objectStore(STORE_DIR).delete(key);
        tx.oncomplete = resolve;
    });
}

// ---------------------------------------------------------------------------
// Directory handle persistence
// ---------------------------------------------------------------------------

/** Retrieve the previously-saved directory handle (may be null). */
export async function getSavedDirHandle() {
    return idbGet('diary-dir');
}

/** Persist a directory handle for future sessions. */
export async function saveDirHandle(handle) {
    return idbSet('diary-dir', handle);
}

/** Forget the saved handle (user wants to change folder). */
export async function clearDirHandle() {
    return idbDel('diary-dir');
}

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

/**
 * Verify that we have (or can obtain) readwrite permission for a handle.
 * Returns true if granted, false otherwise.
 */
export async function verifyPermission(handle) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    try {
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
    } catch {
        /* stale handle */
    }
    return false;
}

// ---------------------------------------------------------------------------
// Directory picker
// ---------------------------------------------------------------------------

/**
 * Prompt user to pick a local folder.
 * Saves the handle to IndexedDB on success.
 * Returns the handle, or null if cancelled.
 */
export async function pickDirectory() {
    try {
        if (!window.showDirectoryPicker) return null;
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirHandle(handle);
        return handle;
    } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Server-backed file I/O
// ---------------------------------------------------------------------------

async function requestJSON(url, options = {}) {
    const res = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.success === false) {
        throw new Error(payload.error || `Request failed: ${url}`);
    }
    return payload;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJSONWithRetry(url, options = {}, retries = 4) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await requestJSON(url, options);
        } catch (err) {
            lastError = err;
            if (attempt >= retries) break;
            await wait(220 * (attempt + 1));
        }
    }
    throw lastError || new Error(`Request failed: ${url}`);
}

export async function ensureDiaryStorage() {
    try {
        return await requestJSONWithRetry('/api/data/info');
    } catch (infoError) {
        try {
            const snapshot = await requestJSONWithRetry('/api/data/snapshot', {}, 2);
            return {
                success: true,
                dataPath: snapshot.dataPath || '',
                diaryPath: snapshot.diaryPath || '',
            };
        } catch {
            throw infoError;
        }
    }
}

/**
 * Read diary for dateStr ("YYYY-MM-DD") from PlanTrace/data/diary.
 * Returns null if the file doesn't exist yet.
 */
export async function readDiary(_dirHandle, dateStr) {
    try {
        const payload = await requestJSON(`/api/data/diary/${dateStr}`);
        return payload.diary || null;
    } catch {
        return null;
    }
}

/**
 * Write diary data to PlanTrace/data/diary (creates file if absent).
 */
export async function writeDiary(_dirHandle, dateStr, data) {
    const payload = await requestJSON(`/api/data/diary/${dateStr}`, {
        method: 'POST',
        body: JSON.stringify({ diary: { ...data, lastModified: Date.now() } }),
    });
    return payload.diary;
}

export async function readDiaryMonthSummary(monthStr) {
    try {
        const payload = await requestJSONWithRetry(`/api/data/diary-summary/${monthStr}`, {}, 2);
        return Array.isArray(payload.days) ? payload.days : [];
    } catch {
        return [];
    }
}

async function collectDiaryEntriesFromHandle(dirHandle) {
    const entries = [];
    if (!dirHandle || !dirHandle.entries) return entries;

    for await (const [name, handle] of dirHandle.entries()) {
        const match = /^diary-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
        if (!match || handle.kind !== 'file') continue;
        try {
            const file = await handle.getFile();
            const diary = JSON.parse(await file.text());
            entries.push({ date: match[1], diary });
        } catch {
            /* skip invalid legacy diary file */
        }
    }

    return entries;
}

async function importDiaryEntries(entries) {
    if (!entries.length) {
        return { imported: 0, skipped: 0 };
    }
    return requestJSON('/api/data/diary-import', {
        method: 'POST',
        body: JSON.stringify({ entries }),
    });
}

export async function migrateLegacyDiaries({ requestPermission = false } = {}) {
    const handle = await getSavedDirHandle();
    if (!handle) return { status: 'none', imported: 0, skipped: 0 };

    const opts = { mode: 'readwrite' };
    let permission = 'denied';
    try {
        permission = await handle.queryPermission(opts);
        if (permission !== 'granted' && requestPermission) {
            permission = await handle.requestPermission(opts);
        }
    } catch {
        return { status: 'stale', imported: 0, skipped: 0 };
    }

    if (permission !== 'granted') {
        return { status: 'needs-permission', imported: 0, skipped: 0 };
    }

    const entries = await collectDiaryEntriesFromHandle(handle);
    const result = await importDiaryEntries(entries);
    return { status: 'imported', ...result };
}

export async function importLegacyDiaryDirectory() {
    const handle = await pickDirectory();
    if (!handle) return { status: 'canceled', imported: 0, skipped: 0 };
    const ok = await verifyPermission(handle);
    if (!ok) return { status: 'needs-permission', imported: 0, skipped: 0 };
    const entries = await collectDiaryEntriesFromHandle(handle);
    const result = await importDiaryEntries(entries);
    return { status: 'imported', ...result };
}

// ---------------------------------------------------------------------------
// Default structure
// ---------------------------------------------------------------------------

export function createEmptyDiary() {
    return { mainText: '', mainHtml: '', notes: [], lastModified: Date.now() };
}

/** Generate a unique ID for a note */
export function noteId() {
    return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
