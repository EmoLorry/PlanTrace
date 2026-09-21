import { getJSON, setJSON } from './storage.js';

export const SETTINGS_KEY = 'settings';
export const DEFAULT_LANGUAGE = 'zh-CN';
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

const SUPPORTED_LANGUAGE_CODES = new Set(['zh-CN', 'en-US']);

export const COMMON_TIMEZONES = [
    { value: 'Asia/Shanghai', label: 'China - Beijing / Shanghai' },
    { value: 'Asia/Tokyo', label: 'Japan - Tokyo' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
    { value: 'Asia/Seoul', label: 'Korea - Seoul' },
    { value: 'Europe/London', label: 'United Kingdom - London' },
    { value: 'Europe/Berlin', label: 'Central Europe - Berlin' },
    { value: 'America/Los_Angeles', label: 'US Pacific - Los Angeles' },
    { value: 'America/Denver', label: 'US Mountain - Denver' },
    { value: 'America/Chicago', label: 'US Central - Chicago' },
    { value: 'America/New_York', label: 'US Eastern - New York' },
    { value: 'Australia/Sydney', label: 'Australia - Sydney' },
    { value: 'UTC', label: 'UTC' },
];

function getIntlTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

export function isValidTimezone(timezone) {
    if (typeof timezone !== 'string' || !timezone.trim()) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

export function getSystemTimezone() {
    const timezone = getIntlTimezone();
    return isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

function hasUserData() {
    const tasks = getJSON('tasks');
    const logs = getJSON('action_logs');
    const atomicSessions = getJSON('atomic_sessions');
    const customThemes = getJSON('custom_themes');
    const legacyStateKeys = [
        'theme',
        'show_edge',
        'onboarding_seen',
        'rollover_dismissed',
        'pt_version_last_check',
        'pt_version_dismissed',
    ];

    return (
        (Array.isArray(tasks) && tasks.length > 0)
        || (Array.isArray(logs) && logs.length > 0)
        || (Array.isArray(atomicSessions) && atomicSessions.length > 0)
        || (Array.isArray(customThemes) && customThemes.length > 0)
        || legacyStateKeys.some((key) => getJSON(key) !== null)
    );
}

function detectInitialTimezone() {
    return hasUserData() ? DEFAULT_TIMEZONE : getSystemTimezone();
}

export function normalizeSettings(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const timezone = isValidTimezone(source.timezone)
        ? source.timezone
        : detectInitialTimezone();
    const language = SUPPORTED_LANGUAGE_CODES.has(source.language)
        ? source.language
        : DEFAULT_LANGUAGE;

    return {
        schemaVersion: 1,
        language,
        timezone,
        timezonePolicy: source.timezonePolicy || 'fixed-app-timezone',
        legacyTimezone: source.legacyTimezone || DEFAULT_TIMEZONE,
        systemTimezoneAtInit: source.systemTimezoneAtInit || getSystemTimezone(),
        lastSeenSystemTimezone: getSystemTimezone(),
        initializedAt: source.initializedAt || Date.now(),
        updatedAt: Date.now(),
    };
}

export function getAppSettings() {
    return normalizeSettings(getJSON(SETTINGS_KEY));
}

export function initializeAppSettings() {
    const existing = getJSON(SETTINGS_KEY);
    const settings = normalizeSettings(existing || {});
    if (!existing) {
        setJSON(SETTINGS_KEY, settings);
    } else if (
        existing.timezone !== settings.timezone
        || existing.language !== settings.language
        || existing.lastSeenSystemTimezone !== settings.lastSeenSystemTimezone
    ) {
        setJSON(SETTINGS_KEY, { ...existing, ...settings });
    }
    return settings;
}

export function saveAppSettings(nextSettings) {
    const current = getAppSettings();
    const settings = normalizeSettings({
        ...current,
        ...nextSettings,
        updatedAt: Date.now(),
    });
    setJSON(SETTINGS_KEY, settings);
    return settings;
}

export function getAppTimezone() {
    return getAppSettings().timezone;
}

export function getAppLanguage() {
    return getAppSettings().language;
}
