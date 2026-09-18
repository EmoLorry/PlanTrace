/**
 * diaryStore.js
 * Local diary storage using File System Access API.
 * Directory handle is persisted in IndexedDB so the user only picks once.
 *
 * File layout (one per day): diary-YYYY-MM-DD.json
 * Schema: { mainText, notes: [{id, text, color, createdAt}], lastModified }
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
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirHandle(handle);
        return handle;
    } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
    }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Read diary for dateStr ("YYYY-MM-DD") from dirHandle.
 * Returns null if the file doesn't exist yet.
 */
export async function readDiary(dirHandle, dateStr) {
    try {
        const fh   = await dirHandle.getFileHandle(`diary-${dateStr}.json`);
        const file = await fh.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * Write diary data to disk (creates file if absent).
 */
export async function writeDiary(dirHandle, dateStr, data) {
    const fh       = await dirHandle.getFileHandle(`diary-${dateStr}.json`, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify({ ...data, lastModified: Date.now() }, null, 2));
    await writable.close();
}

// ---------------------------------------------------------------------------
// Default structure
// ---------------------------------------------------------------------------

export function createEmptyDiary() {
    return { mainText: '', notes: [], lastModified: Date.now() };
}

/** Generate a unique ID for a note */
export function noteId() {
    return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
