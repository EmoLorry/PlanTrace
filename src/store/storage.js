const STORAGE_PREFIX = 'plantrace_';

export function getJSON(key) {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function setJSON(key, value) {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
}

export function removeKey(key) {
    localStorage.removeItem(STORAGE_PREFIX + key);
}

/**
 * Export all data (Tasks + ActionLogs) as a JSON file
 * saved to the project's backups/ folder via the Vite dev server.
 * Filename uses Beijing time (UTC+8).
 */
export async function exportBackup() {
    const tasks = getJSON('tasks') || [];
    const actionLogs = getJSON('action_logs') || [];

    const payload = {
        tasks,
        actionLogs,
        exportedAt: new Date().toISOString(),
    };

    // Beijing time date for filename
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const bjDate = new Date(utcMs + 8 * 60 * 60000);
    const y = bjDate.getFullYear();
    const m = String(bjDate.getMonth() + 1).padStart(2, '0');
    const d = String(bjDate.getDate()).padStart(2, '0');
    const filename = `plantrace_backup_${y}-${m}-${d}.json`;
    const jsonStr = JSON.stringify(payload, null, 2);

    try {
        const res = await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, data: jsonStr }),
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ Backup saved to:\n${result.path}`);
        } else {
            throw new Error(result.error);
        }
    } catch {
        // Fallback: browser download
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
