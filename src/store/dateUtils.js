import { getAppTimezone } from './settingsStore.js';

export const LEGACY_BEIJING_TIMEZONE = 'Asia/Shanghai';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatterCache = new Map();

function getFormatter(timeZone, options) {
    const key = `${timeZone}:${JSON.stringify(options)}`;
    if (!formatterCache.has(key)) {
        formatterCache.set(key, new Intl.DateTimeFormat('en-CA', {
            timeZone,
            ...options,
        }));
    }
    return formatterCache.get(key);
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function assertDateStr(dateStr) {
    const match = DATE_RE.exec(String(dateStr));
    if (!match) throw new Error(`Invalid date string: ${dateStr}`);
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
}

function getDateTimePartsInZone(timestamp = Date.now(), timeZone = getAppTimezone()) {
    const formatter = getFormatter(timeZone, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(Number(timestamp)));
    const values = {};
    for (const part of parts) {
        if (part.type !== 'literal') values[part.type] = part.value;
    }
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
    };
}

function getTimezoneOffsetMs(timeZone, timestamp = Date.now()) {
    const parts = getDateTimePartsInZone(timestamp, timeZone);
    const asUTC = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return asUTC - Math.floor(Number(timestamp) / 1000) * 1000;
}

function datePartsToString({ year, month, day }) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function shiftDateString(dateStr, days) {
    const { year, month, day } = assertDateStr(dateStr);
    const shifted = new Date(Date.UTC(year, month - 1, day + Number(days)));
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function getAppDateTimeParts(timestamp = Date.now(), timeZone = getAppTimezone()) {
    return getDateTimePartsInZone(timestamp, timeZone);
}

export function getAppDateFromTimestamp(timestamp = Date.now(), timeZone = getAppTimezone()) {
    return datePartsToString(getDateTimePartsInZone(timestamp, timeZone));
}

export function getTodayInAppZone(timeZone = getAppTimezone()) {
    return getAppDateFromTimestamp(Date.now(), timeZone);
}

export function getStartOfDayMsInZone(dateStr, timeZone = getAppTimezone()) {
    assertDateStr(dateStr);
    const utcMidnight = Date.parse(`${dateStr}T00:00:00.000Z`);
    let candidate = utcMidnight - getTimezoneOffsetMs(timeZone, utcMidnight);

    // DST changes can alter the offset at local midnight, so resolve twice.
    candidate = utcMidnight - getTimezoneOffsetMs(timeZone, candidate);

    if (getAppDateFromTimestamp(candidate, timeZone) === dateStr) {
        return candidate;
    }

    // Extremely rare zones can have midnight transitions. Search nearby hours
    // for the first instant that belongs to the requested calendar date.
    for (let offsetHours = -24; offsetHours <= 24; offsetHours += 1) {
        const probe = candidate + offsetHours * 60 * 60 * 1000;
        if (getAppDateFromTimestamp(probe, timeZone) === dateStr) {
            let start = probe;
            while (getAppDateFromTimestamp(start - 60 * 1000, timeZone) === dateStr) {
                start -= 60 * 1000;
            }
            return start;
        }
    }

    return candidate;
}

export function getStartOfDayMsInAppZone(dateStr) {
    return getStartOfDayMsInZone(dateStr, getAppTimezone());
}

export function getNextDateInAppZone(dateStr) {
    return shiftDateString(dateStr, 1);
}

export function getNextMidnightMsInAppZone(timestamp = Date.now()) {
    const timeZone = getAppTimezone();
    const date = getAppDateFromTimestamp(timestamp, timeZone);
    return getStartOfDayMsInZone(shiftDateString(date, 1), timeZone);
}

export function splitIntervalByAppDate(startMs, endMs) {
    const start = Number(startMs);
    const end = Number(endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

    const segments = [];
    let cursor = start;
    while (cursor < end) {
        const date = getAppDateFromTimestamp(cursor);
        const segmentEnd = Math.min(end, getNextMidnightMsInAppZone(cursor));
        const durationSeconds = Math.floor((segmentEnd - cursor) / 1000);
        if (durationSeconds > 0) {
            segments.push({
                date,
                startMs: cursor,
                endMs: cursor + durationSeconds * 1000,
                durationSeconds,
            });
        }
        if (segmentEnd <= cursor) break;
        cursor = segmentEnd;
    }

    return segments;
}

export function formatDateForApp(dateLike) {
    if (typeof dateLike === 'string') return dateLike.slice(0, 10);
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatTimeInAppZone(timestamp, timeZone = getAppTimezone()) {
    const parts = getDateTimePartsInZone(timestamp, timeZone);
    return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function getPastDaysInAppZone(n = 7) {
    const today = getTodayInAppZone();
    const dates = [];
    for (let i = Number(n); i >= 1; i -= 1) {
        dates.push(shiftDateString(today, -i));
    }
    return dates;
}

export function getDateRangeInAppZone(pastDays = 7, futureDays = 6) {
    const today = getTodayInAppZone();
    const dates = [];
    for (let i = Number(pastDays); i >= 1; i -= 1) {
        dates.push(shiftDateString(today, -i));
    }
    dates.push(today);
    for (let i = 1; i <= Number(futureDays); i += 1) {
        dates.push(shiftDateString(today, i));
    }
    return dates;
}

export function parseDateStr(dateStr) {
    const { year, month, day } = assertDateStr(dateStr);
    return new Date(year, month - 1, day);
}

export function getDayName(dateStr) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[parseDateStr(dateStr).getDay()];
}

export function getFullDateDisplay(dateStr) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const daysFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday'];
    const d = parseDateStr(dateStr);
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${daysFull[d.getDay()]}`;
}

export function isToday(dateStr) {
    return dateStr === getTodayInAppZone();
}

export function isPast(dateStr) {
    return dateStr < getTodayInAppZone();
}

export function generateId(prefix = 'id') {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${ts}_${rand}`;
}

export function shiftDate(dateStr, days) {
    return shiftDateString(dateStr, days);
}

export function getMsUntilEndOfDayInAppZone() {
    return Math.max(0, getNextMidnightMsInAppZone() - Date.now());
}

export function isEndOfDayInAppZone() {
    return getMsUntilEndOfDayInAppZone() <= 1000;
}

// Compatibility layer: old names are kept so legacy modules and data remain
// stable. These now mean "current app timezone"; for legacy users that timezone
// is initialized to Asia/Shanghai.
export function getNowBJ() {
    return new Date();
}

export function getTodayBJ() {
    return getTodayInAppZone();
}

export function getDateBJFromTimestamp(timestamp) {
    return getAppDateFromTimestamp(timestamp);
}

export function getStartOfDayMsBJ(dateStr) {
    return getStartOfDayMsInAppZone(dateStr);
}

export function getNextDateBJ(dateStr) {
    return getNextDateInAppZone(dateStr);
}

export function getNextMidnightMsBJ(timestamp = Date.now()) {
    return getNextMidnightMsInAppZone(timestamp);
}

export function splitIntervalByBJDate(startMs, endMs) {
    return splitIntervalByAppDate(startMs, endMs);
}

export function formatDateBJ(date) {
    return formatDateForApp(date);
}

export function formatTimeBJ(timestamp) {
    return formatTimeInAppZone(timestamp);
}

export function getPastDaysBJ(n = 7) {
    return getPastDaysInAppZone(n);
}

export function getDateRangeBJ(pastDays = 7, futureDays = 6) {
    return getDateRangeInAppZone(pastDays, futureDays);
}

export function getMsUntilEndOfDayBJ() {
    return getMsUntilEndOfDayInAppZone();
}

export function isEndOfDayBJ() {
    return isEndOfDayInAppZone();
}
