/**
 * versionStore.js
 * Handles remote version checking with:
 *  - 5-second AbortController timeout (network stall won't block the app)
 *  - 24-hour cooldown between auto-checks
 *  - Per-version dismissal (user can say "skip this version")
 */

import { APP_VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Remote URL
// Use the raw GitHub URL so it works even when the app is running locally.
// ---------------------------------------------------------------------------
const REMOTE_URLS = [
    'https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/public/version.json',
    'https://cdn.jsdelivr.net/gh/EmoLorry/PlanTrace@main/public/version.json',
];

const TIMEOUT_MS       = 5000;  // abort fetch if no response in 5s
const CHECK_INTERVAL   = 24 * 60 * 60 * 1000; // 24h in ms

const LS_LAST_CHECK    = 'pt_version_last_check';
const LS_DISMISSED     = 'pt_version_dismissed';

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
// Auto-check cooldown
// ---------------------------------------------------------------------------
export function shouldAutoCheck() {
    const last = Number(localStorage.getItem(LS_LAST_CHECK) || 0);
    return Date.now() - last > CHECK_INTERVAL;
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
            const res = await fetch(url, {
                signal:  controller.signal,
                cache:   'no-store',
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) continue;
            return await res.json();
            // shape: { version, releaseDate, releaseNotes[], downloadUrl }
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
export async function checkUpdate({ force = false } = {}) {
    if (!force && !shouldAutoCheck()) return null;
    markChecked();
    const remote = await fetchRemoteVersion();
    if (!remote?.version) return null;
    if (!isNewer(remote.version, APP_VERSION)) return null;
    if (!force && isDismissed(remote.version)) return null;
    return remote;
}

export { APP_VERSION };
