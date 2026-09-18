import { getJSON, setJSON } from './storage.js';
import { getTodayBJ, generateId } from './dateUtils.js';

const SESSIONS_KEY = 'atomic_sessions';

// sessionStorage key for persisting the active session across HMR
const ACTIVE_SESSION_SS_KEY = 'plantrace_atomic_active';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function getAllSessions() {
    return getJSON(SESSIONS_KEY) || [];
}

function saveSessions(sessions) {
    setJSON(SESSIONS_KEY, sessions);
}

// ---------------------------------------------------------------------------
// sessionStorage helpers (survive HMR, cleared on tab close)
// ---------------------------------------------------------------------------

export function getActiveSessionSS() {
    try {
        const raw = sessionStorage.getItem(ACTIVE_SESSION_SS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function setActiveSessionSS(data) {
    sessionStorage.setItem(ACTIVE_SESSION_SS_KEY, JSON.stringify(data));
}

export function clearActiveSessionSS() {
    sessionStorage.removeItem(ACTIVE_SESSION_SS_KEY);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create and start a new atomic session.
 * @param {string} label - User-provided task name
 * @param {number} plannedSeconds - Total countdown duration in seconds
 */
export function createAtomicSession(label, plannedSeconds) {
    const sessions = getAllSessions();
    const dateStr = getTodayBJ();
    const session = {
        session_id: generateId('atomic'),
        label: label.trim() || '专注时间',
        planned_seconds: plannedSeconds,
        started_at: Date.now(),
        ended_at: null,
        status: 'running', // 'running' | 'completed' | 'deleted'
        date: dateStr,
    };
    sessions.push(session);
    saveSessions(sessions);

    // Persist to sessionStorage for HMR recovery
    setActiveSessionSS({ session_id: session.session_id, startMs: session.started_at });

    return session;
}

/**
 * Mark a session as completed.
 */
export function completeAtomicSession(sessionId) {
    const sessions = getAllSessions();
    const idx = sessions.findIndex((s) => s.session_id === sessionId);
    if (idx === -1) return null;

    sessions[idx].status = 'completed';
    sessions[idx].ended_at = Date.now();
    saveSessions(sessions);
    clearActiveSessionSS();

    return sessions[idx];
}

/**
 * Mark a session as deleted (user manually stopped it).
 */
export function deleteAtomicSession(sessionId) {
    const sessions = getAllSessions();
    const idx = sessions.findIndex((s) => s.session_id === sessionId);
    if (idx === -1) return null;

    sessions[idx].status = 'deleted';
    sessions[idx].ended_at = Date.now();
    saveSessions(sessions);
    clearActiveSessionSS();

    return sessions[idx];
}

/**
 * Get the currently running session (if any).
 */
export function getRunningSession() {
    return getAllSessions().find((s) => s.status === 'running') || null;
}

/**
 * Count completed atomic sessions for a given date (defaults to today BJ).
 */
export function getTodayCompletedCount(date) {
    const d = date || getTodayBJ();
    return getAllSessions().filter(
        (s) => s.status === 'completed' && s.date === d
    ).length;
}

/**
 * Get all sessions for a given date (defaults to today BJ).
 */
export function getTodaySessions(date) {
    const d = date || getTodayBJ();
    return getAllSessions().filter((s) => s.date === d);
}
