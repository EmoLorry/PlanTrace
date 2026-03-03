import { getJSON, setJSON } from './storage.js';
import { generateId, getTodayBJ, getPastDaysBJ } from './dateUtils.js';
import { appendLog } from './actionLogStore.js';

const TASKS_KEY = 'tasks';

function getAllTasks() {
    return getJSON(TASKS_KEY) || [];
}

function saveTasks(tasks) {
    setJSON(TASKS_KEY, tasks);
}

/**
 * Get a single task by ID
 */
export function getTaskById(taskId) {
    return getAllTasks().find((t) => t.id === taskId) || null;
}

/**
 * Get all tasks that are active on a given date
 */
export function getTasksForDate(dateStr) {
    return getAllTasks().filter(
        (t) => t.active_dates.includes(dateStr) && t.status !== 'deleted'
    );
}

/**
 * Get all tasks (non-deleted)
 */
export function getActiveTasks() {
    return getAllTasks().filter((t) => t.status !== 'deleted');
}

/**
 * Create a new task for a given date
 */
export function createTask(content, dateStr) {
    const tasks = getAllTasks();
    const task = {
        id: generateId('task'),
        content: content.trim(),
        status: 'pending',
        created_at: Date.now(),
        active_dates: [dateStr],
    };
    tasks.push(task);
    saveTasks(tasks);

    appendLog({
        task_id: task.id,
        action_type: 'CREATE',
        target_date: dateStr,
    });

    return task;
}

/**
 * Complete a task (only allowed on today BJ)
 */
export function completeTask(taskId) {
    const todayStr = getTodayBJ();
    const tasks = getAllTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    tasks[idx].status = 'completed';
    tasks[idx].completed_at = Date.now();
    saveTasks(tasks);

    appendLog({
        task_id: taskId,
        action_type: 'COMPLETE',
        target_date: todayStr,
    });

    return tasks[idx];
}

/**
 * Delete a task from a specific date only (removes dateStr from active_dates).
 * If active_dates becomes empty after removal, mark the whole task as deleted.
 */
export function deleteTask(taskId, dateStr) {
    const tasks = getAllTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    // 只移除当天，而不是整个任务
    tasks[idx].active_dates = tasks[idx].active_dates.filter((d) => d !== dateStr);

    // 如果所有日期都清空了，才真正标记为 deleted
    if (tasks[idx].active_dates.length === 0) {
        tasks[idx].status = 'deleted';
    }

    saveTasks(tasks);

    appendLog({
        task_id: taskId,
        action_type: 'DELETE',
        target_date: dateStr,
    });

    return tasks[idx];
}

/**
 * Hammer a task (record effort, no status change)
 */
export function hammerTask(taskId) {
    const todayStr = getTodayBJ();

    appendLog({
        task_id: taskId,
        action_type: 'HAMMER',
        target_date: todayStr,
    });
}

/**
 * Rollover a task to today — adds today to active_dates, writes ROLLOVER log
 */
export function rolloverTask(taskId) {
    const todayStr = getTodayBJ();
    const tasks = getAllTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    if (!tasks[idx].active_dates.includes(todayStr)) {
        tasks[idx].active_dates.push(todayStr);
    }
    saveTasks(tasks);

    appendLog({
        task_id: taskId,
        action_type: 'ROLLOVER',
        target_date: todayStr,
    });

    return tasks[idx];
}

/**
 * Get pending tasks from the past 7 days (not including today) for rollover prompt
 */
export function getPendingRolloverCandidates() {
    const past7 = getPastDaysBJ(7);
    const todayStr = getTodayBJ();
    const allTasks = getAllTasks();

    return allTasks.filter((t) => {
        if (t.status !== 'pending') return false;
        // Already active today? skip
        if (t.active_dates.includes(todayStr)) return false;
        // Must have been active on at least one of the past 7 days
        return t.active_dates.some((d) => past7.includes(d));
    });
}

/**
 * Get count of pending tasks for a given date
 */
export function getPendingCountForDate(dateStr) {
    return getTasksForDate(dateStr).filter((t) => t.status === 'pending').length;
}

/**
 * Get task status summary for a date (for sidebar dot)
 */
export function getDateStatus(dateStr) {
    const tasks = getTasksForDate(dateStr);
    if (tasks.length === 0) return 'empty';
    const hasPending = tasks.some((t) => t.status === 'pending');
    if (hasPending) return 'has_pending';
    return 'all_completed';
}
