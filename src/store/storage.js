const STORAGE_PREFIX = 'plantrace_';
const LEGACY_DIRECT_KEYS = ['pt_version_last_check', 'pt_version_dismissed'];

let cache = {};
let initialized = false;
let storageMode = 'booting'; // booting | file | browser
let dataPath = '';
let diaryPath = '';
let initPromise = null;
const writeQueues = new Map();

function readLocalStorageKey(key) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeLocalStorageKey(key, value) {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

function removeLocalStorageKey(key) {
    localStorage.removeItem(STORAGE_PREFIX + key);
}

function collectLegacyLocalStorage() {
    const legacy = {};
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const rawKey = localStorage.key(i);
            if (!rawKey || !rawKey.startsWith(STORAGE_PREFIX)) continue;
            const key = rawKey.slice(STORAGE_PREFIX.length);
            const value = readLocalStorageKey(key);
            if (value !== null) legacy[key] = value;
        }
        for (const key of LEGACY_DIRECT_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw === null || legacy[key] !== undefined) continue;
            try {
                legacy[key] = JSON.parse(raw);
            } catch {
                legacy[key] = raw;
            }
        }
    } catch {
        /* localStorage may be unavailable */
    }
    return legacy;
}

async function requestJSON(url, options = {}) {
    const res = await fetch(url, {
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

async function persistKey(key, value, remove = false) {
    if (storageMode !== 'file') return;

    const previous = writeQueues.get(key) || Promise.resolve();
    const next = previous
        .catch(() => {})
        .then(() => requestJSON('/api/data/key', {
            method: 'POST',
            body: JSON.stringify({ key, value, remove }),
        }))
        .catch((err) => {
            console.warn(`PlanTrace data save failed for ${key}:`, err);
        });

    writeQueues.set(key, next);
}

async function flushPendingWrites() {
    await Promise.allSettled([...writeQueues.values()]);
}

export async function flushStorageWrites() {
    await flushPendingWrites();
}

export async function initFileStorage() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const legacy = collectLegacyLocalStorage();

        try {
            const snapshot = await requestJSON('/api/data/snapshot');
            cache = snapshot.keys || {};
            dataPath = snapshot.dataPath || '';
            diaryPath = snapshot.diaryPath || '';
            storageMode = 'file';

            if (Object.keys(legacy).length > 0) {
                const migrated = await requestJSON('/api/data/migrate', {
                    method: 'POST',
                    body: JSON.stringify({ keys: legacy }),
                });
                cache = migrated.keys || cache;
                dataPath = migrated.dataPath || dataPath;
            }

            initialized = true;
            return getStorageStatus();
        } catch (err) {
            console.warn('PlanTrace file storage is unavailable; falling back to browser storage.', err);
            cache = legacy;
            storageMode = 'browser';
            initialized = true;
            return getStorageStatus();
        }
    })();

    return initPromise;
}

export function getStorageStatus() {
    return {
        initialized,
        mode: storageMode,
        dataPath,
        diaryPath,
    };
}

export function getJSON(key) {
    if (initialized && Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key];
    }

    return readLocalStorageKey(key);
}

export function setJSON(key, value) {
    cache[key] = value;

    if (!initialized || storageMode === 'browser') {
        writeLocalStorageKey(key, value);
        return;
    }

    persistKey(key, value);
}

export function removeKey(key) {
    delete cache[key];

    if (!initialized || storageMode === 'browser') {
        removeLocalStorageKey(key);
        return;
    }

    persistKey(key, null, true);
}

export async function createBackupPayload() {
    let backupPayload = {
        schemaVersion: 3,
        storageMode,
        dataPath,
        diaryPath,
        keys: { ...cache },
        diaries: [],
        exportedAt: new Date().toISOString(),
    };

    try {
        await flushPendingWrites();
        const snapshot = await requestJSON('/api/data/export');
        backupPayload = {
            schemaVersion: 3,
            storageMode,
            dataPath: snapshot.dataPath || dataPath,
            diaryPath: snapshot.diaryPath || diaryPath,
            keys: snapshot.keys || { ...cache },
            diaries: Array.isArray(snapshot.diaries) ? snapshot.diaries : [],
            exportedAt: snapshot.exportedAt || new Date().toISOString(),
        };
    } catch {
        /* Fall back to the in-memory cache if the local API is unavailable. */
    }

    return backupPayload;
}

/**
 * Export a full backup as a JSON file saved to backups/ via the Vite dev server.
 * Filename uses the configured app timezone.
 */
export async function exportBackup() {
    const settings = getJSON('settings') || {};
    const timezone = settings.timezone || 'Asia/Shanghai';
    const options = {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    let dateParts;
    try {
        dateParts = new Intl.DateTimeFormat('en-CA', options).formatToParts(new Date());
    } catch {
        dateParts = new Intl.DateTimeFormat('en-CA', {
            ...options,
            timeZone: 'Asia/Shanghai',
        }).formatToParts(new Date());
    }
    const values = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
    const filename = `plantrace_backup_${values.year}-${values.month}-${values.day}.json`;
    const backupPayload = await createBackupPayload();

    try {
        const jsonStr = JSON.stringify(backupPayload, null, 2);
        const res = await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, data: jsonStr }),
        });
        const result = await res.json();
        if (result.success) {
            alert(`Backup saved to:\n${result.path}`);
        } else {
            throw new Error(result.error);
        }
    } catch {
        const jsonStr = JSON.stringify(backupPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
