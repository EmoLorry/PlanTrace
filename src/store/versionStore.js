/**
 * versionStore.js
 * Handles remote version checking with:
 *  - 5-second AbortController timeout (network stall won't block the app)
 *  - cache-busted manifest fetches so newly-published versions are seen quickly
 *  - Per-version dismissal (user can say "skip this version")
 */

import { APP_VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Remote URL
// Use the raw GitHub URL so it works even when the app is running locally.
// ---------------------------------------------------------------------------
const REMOTE_URLS = [
    '/api/update/check',
    'https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/public/version.json',
    'https://cdn.jsdelivr.net/gh/EmoLorry/PlanTrace@main/public/version.json',
    'https://api.github.com/repos/EmoLorry/PlanTrace/contents/public/version.json?ref=main',
];

const TIMEOUT_MS       = 5000;  // abort fetch if no response in 5s

const LS_LAST_CHECK    = 'pt_version_last_check';
const LS_DISMISSED     = 'pt_version_dismissed';

function normalizeReleaseNotes(notes) {
    return Array.isArray(notes)
        ? notes.filter((note) => typeof note === 'string' && note.trim()).map((note) => note.trim())
        : [];
}

function normalizeReleaseEntry(entry = {}) {
    return {
        version: String(entry.version || '').trim(),
        releaseDate: String(entry.releaseDate || '').trim(),
        releaseNotes: normalizeReleaseNotes(entry.releaseNotes || entry.notes),
    };
}

export function normalizeManifest(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const current = normalizeReleaseEntry(payload);
    const rawHistory = Array.isArray(payload.history)
        ? payload.history
        : (Array.isArray(payload.releases) ? payload.releases : []);

    const seen = new Set();
    const history = [current, ...rawHistory.map(normalizeReleaseEntry)]
        .filter((entry) => entry.version)
        .filter((entry) => {
            if (seen.has(entry.version)) return false;
            seen.add(entry.version);
            return true;
        });

    const currentFromHistory = history.find((entry) => entry.version === current.version) || current;

    return {
        ...payload,
        version: current.version,
        releaseDate: current.releaseDate || currentFromHistory.releaseDate,
        releaseNotes: current.releaseNotes.length ? current.releaseNotes : currentFromHistory.releaseNotes,
        history,
    };
}

// ---------------------------------------------------------------------------
// Version comparison — simple 3-segment semver (MAJOR.MINOR.PATCH)
// Returns true if `remote` is strictly newer than `local`.
// ---------------------------------------------------------------------------
export function isNewer(remote, local) {
    const seg = (v) => String(v || '0.0.0').split('.').map(Number);
    const r = seg(remote);
    const l = seg(local);
    for (let i = 0; i < 3; i++) {
        if ((r[i] ?? 0) > (l[i] ?? 0)) return true;
        if ((r[i] ?? 0) < (l[i] ?? 0)) return false;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Auto-check gate. Currently always enabled because the manifest is tiny and
// update prompts should appear as soon as a newer remote version is published.
// ---------------------------------------------------------------------------
export function shouldAutoCheck() {
    return true;
}

export function markChecked() {
    localStorage.setItem(LS_LAST_CHECK, String(Date.now()));
}

// ---------------------------------------------------------------------------
// Dismissal — user can permanently skip a specific remote version
// ---------------------------------------------------------------------------
export function isDismissed(remoteVersion) {
    return localStorage.getItem(LS_DISMISSED) === remoteVersion;
}

export function dismissVersion(remoteVersion) {
    localStorage.setItem(LS_DISMISSED, remoteVersion);
}

export function clearDismissal() {
    localStorage.removeItem(LS_DISMISSED);
}

// ---------------------------------------------------------------------------
// Main fetch — never throws; returns null on any error / timeout
// ---------------------------------------------------------------------------
export async function fetchRemoteVersion() {
    for (const url of REMOTE_URLS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
            const res = await fetch(cacheBustUrl, {
                signal:  controller.signal,
                cache:   'no-store',
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) continue;
            const payload = await res.json();
            if (payload?.content && payload?.encoding === 'base64') {
                return normalizeManifest(JSON.parse(atob(payload.content.replace(/\s/g, ''))));
            }
            if (payload?.error) continue;
            return normalizeManifest(payload);
            // shape: { version, releaseDate, releaseNotes[], history[], downloadUrl }
        } catch {
            // Try the next mirror. Auto-check should stay silent on all failures.
        } finally {
            clearTimeout(timer);
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// High-level helper used by App.jsx
// Returns the remote manifest if an update is available and not dismissed,
// otherwise returns null.
// ---------------------------------------------------------------------------
export async function checkUpdateStatus({ force = false } = {}) {
    if (!force && !shouldAutoCheck()) {
        return { status: 'cooldown', localVersion: APP_VERSION, remoteVersion: null, manifest: null };
    }

    const remote = await fetchRemoteVersion();
    if (!remote?.version) {
        return { status: 'unreachable', localVersion: APP_VERSION, remoteVersion: null, manifest: null };
    }

    markChecked();

    if (!isNewer(remote.version, APP_VERSION)) {
        return { status: 'current', localVersion: APP_VERSION, remoteVersion: remote.version, manifest: remote };
    }

    if (!force && isDismissed(remote.version)) {
        return { status: 'dismissed', localVersion: APP_VERSION, remoteVersion: remote.version, manifest: remote };
    }

    return { status: 'update', localVersion: APP_VERSION, remoteVersion: remote.version, manifest: remote };
}

export async function checkUpdate({ force = false } = {}) {
    const result = await checkUpdateStatus({ force });
    return result.status === 'update' ? result.manifest : null;
}

export { APP_VERSION };
