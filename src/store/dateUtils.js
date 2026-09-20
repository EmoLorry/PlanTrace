// All date/time operations use Beijing Time (UTC+8)
const BJ_OFFSET = 8 * 60; // minutes
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get current Date adjusted to Beijing time perspective.
 * Returns a standard Date object, but we extract BJ-local values from it.
 */
export function getNowBJ() {
    const now = new Date();
    // Get UTC time, then add 8 hours
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcMs + BJ_OFFSET * 60000);
}

/**
 * Get today's date string in Beijing time: "YYYY-MM-DD"
 */
export function getTodayBJ() {
    return formatDateBJ(getNowBJ());
}

/**
 * Get Beijing date string from an absolute timestamp.
 */
export function getDateBJFromTimestamp(timestamp) {
    const shifted = new Date(Number(timestamp) + BJ_OFFSET * 60000);
    return shifted.toISOString().slice(0, 10);
}

/**
 * Get the absolute timestamp for 00:00 at the start of a Beijing date.
 */
export function getStartOfDayMsBJ(dateStr) {
    return Date.parse(`${dateStr}T00:00:00+08:00`);
}

/**
 * Get the next Beijing date string.
 */
export function getNextDateBJ(dateStr) {
    return getDateBJFromTimestamp(getStartOfDayMsBJ(dateStr) + MS_PER_DAY);
}

/**
 * Get the next Beijing midnight after timestamp.
 */
export function getNextMidnightMsBJ(timestamp = Date.now()) {
    return getStartOfDayMsBJ(getNextDateBJ(getDateBJFromTimestamp(timestamp)));
}

/**
 * Split a real-time interval into Beijing-date segments.
 */
export function splitIntervalByBJDate(startMs, endMs) {
    const start = Number(startMs);
    const end = Number(endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

    const segments = [];
    let cursor = start;
    while (cursor < end) {
        const date = getDateBJFromTimestamp(cursor);
        const segmentEnd = Math.min(end, getNextMidnightMsBJ(cursor));
        const durationSeconds = Math.floor((segmentEnd - cursor) / 1000);
        if (durationSeconds > 0) {
            segments.push({
                date,
                startMs: cursor,
                endMs: cursor + durationSeconds * 1000,
                durationSeconds,
            });
        }
        cursor = segmentEnd;
        if (segmentEnd === cursor && segmentEnd >= end) break;
    }

    return segments;
}

/**
 * Format a BJ-adjusted Date to "YYYY-MM-DD"
 */
export function formatDateBJ(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Format timestamp (ms) to BJ time string "HH:MM"
 */
export function formatTimeBJ(timestamp) {
    const date = new Date(timestamp);
    const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
    const bjDate = new Date(utcMs + BJ_OFFSET * 60000);
    const h = String(bjDate.getHours()).padStart(2, '0');
    const min = String(bjDate.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
}

/**
 * Get array of past N days' date strings (not including today) in BJ time
 */
export function getPastDaysBJ(n = 7) {
    const today = getNowBJ();
    const dates = [];
    for (let i = n; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(formatDateBJ(d));
    }
    return dates;
}

/**
 * Get array of date strings: pastDays before + today + futureDays after
 */
export function getDateRangeBJ(pastDays = 7, futureDays = 6) {
    const today = getNowBJ();
    const dates = [];
    for (let i = pastDays; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(formatDateBJ(d));
    }
    dates.push(formatDateBJ(today)); // today
    for (let i = 1; i <= futureDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        dates.push(formatDateBJ(d));
    }
    return dates;
}

/**
 * Parse "YYYY-MM-DD" into a Date (treated as BJ local) 
 */
export function parseDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Get day-of-week name from date string
 */
export function getDayName(dateStr) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = parseDateStr(dateStr);
    return days[d.getDay()];
}

/**
 * Get full display format "Mar 3, 2026 · Tuesday"
 */
export function getFullDateDisplay(dateStr) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const daysFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday'];
    const d = parseDateStr(dateStr);
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${daysFull[d.getDay()]}`;
}

/**
 * Check if dateStr is today (BJ time)
 */
export function isToday(dateStr) {
    return dateStr === getTodayBJ();
}

/**
 * Check if dateStr is in the past relative to today (BJ time)
 */
export function isPast(dateStr) {
    return dateStr < getTodayBJ();
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id') {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${ts}_${rand}`;
}

/**
 * Shift a date range by a number of days
 */
export function shiftDate(dateStr, days) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + days);
    return formatDateBJ(d);
}

/**
 * Get milliseconds remaining until the next 00:00 BJ boundary.
 * Returns 0 if already past that time.
 */
export function getMsUntilEndOfDayBJ() {
    return Math.max(0, getNextMidnightMsBJ() - Date.now());
}

/**
 * Check if current BJ time is within the final second of the day.
 */
export function isEndOfDayBJ() {
    return getMsUntilEndOfDayBJ() <= 1000;
}
