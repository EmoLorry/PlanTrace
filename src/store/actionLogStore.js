import { getJSON, setJSON } from './storage.js';
import { generateId, getTodayBJ } from './dateUtils.js';

const LOG_KEY = 'action_logs';

export function getAllLogs() {
    return getJSON(LOG_KEY) || [];
}

/**
 * Append an immutable log entry. Never modify existing logs.
 */
export function appendLog({ task_id, action_type, target_date }) {
    const logs = getAllLogs();
    const entry = {
        log_id: generateId('log'),
        task_id,
        action_type, // CREATE | COMPLETE | HAMMER | ROLLOVER | DELETE
        target_date,
        timestamp: Date.now(),
    };
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
    return getAllLogs().filter(
        (l) => l.task_id === taskId && l.action_type === 'HAMMER' && l.target_date === dateStr
    ).length;
}

/**
 * Count HAMMER logs for a task on today (BJ time)
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
