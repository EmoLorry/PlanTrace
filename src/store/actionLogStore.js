import { getJSON, setJSON } from './storage.js';
import { generateId, getTodayBJ } from './dateUtils.js';

const LOG_KEY = 'action_logs';
const DATE_MEMBERSHIP_ACTIONS = new Set(['CREATE', 'ROLLOVER', 'DELETE']);

export function getAllLogs() {
    return getJSON(LOG_KEY) || [];
}

export function isTaskDateDeleted(taskId, dateStr, logs = getAllLogs()) {
    let latest = null;
    for (const log of logs) {
        if (
            log.task_id === taskId
            && log.target_date === dateStr
            && DATE_MEMBERSHIP_ACTIONS.has(log.action_type)
        ) {
            if (!latest || (Number(log.timestamp) || 0) >= (Number(latest.timestamp) || 0)) {
                latest = log;
            }
        }
    }
    return latest?.action_type === 'DELETE';
}

/**
 * Append an immutable log entry. Never modify existing logs.
 */
export function appendLog({ task_id, action_type, target_date, duration_seconds, timestamp }) {
    const logs = getAllLogs();
    const entry = {
        log_id: generateId('log'),
        task_id,
        action_type, // CREATE | COMPLETE | HAMMER | ROLLOVER | DELETE
        target_date,
        timestamp: Number(timestamp) || Date.now(),
    };
    if (duration_seconds !== undefined) {
        entry.duration_seconds = duration_seconds;
    }
    logs.push(entry);
    setJSON(LOG_KEY, logs);
    return entry;
}

/**
 * Get all logs for a specific task
 */
export function getLogsForTask(taskId) {
    return getAllLogs().filter((l) => l.task_id === taskId);
}

/**
 * Count HAMMER logs for a task on a specific date
 */
export function getHammerCount(taskId, dateStr) {
    const logs = getAllLogs();
    if (isTaskDateDeleted(taskId, dateStr, logs)) return 0;
    return logs.filter(
        (l) => l.task_id === taskId && l.action_type === 'HAMMER' && l.target_date === dateStr
    ).length;
}

/**
 * Count HAMMER logs for a task on today in the app timezone.
 */
export function getHammerCountToday(taskId) {
    return getHammerCount(taskId, getTodayBJ());
}

/**
 * Get all logs (for debugging / future analytics)
 */
export function exportAllLogs() {
    return getAllLogs();
}
