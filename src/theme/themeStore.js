import { getJSON, setJSON } from '../store/storage.js';
import { DEFAULT_CUSTOM_PALETTE, createThemeFromPalette, normalizePalette } from './themePresets.js';

const CUSTOM_THEMES_KEY = 'custom_themes';

export function createCustomThemeId() {
    return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeStoredTheme(theme) {
    if (!theme || typeof theme !== 'object') return null;

    const palette = normalizePalette(theme.palette || DEFAULT_CUSTOM_PALETTE);
    const id = typeof theme.id === 'string' && theme.id.startsWith('custom-')
        ? theme.id
        : createCustomThemeId();

    return createThemeFromPalette({
        id,
        name: theme.name || 'DIY Theme',
        label: theme.label || 'DIY Theme',
        palette,
        custom: true,
    });
}

function serializeTheme(theme) {
    return {
        id: theme.id,
        name: theme.name,
        label: theme.label || 'DIY Theme',
        palette: normalizePalette(theme.palette || DEFAULT_CUSTOM_PALETTE),
    };
}

export function getCustomThemes() {
    const rawThemes = getJSON(CUSTOM_THEMES_KEY);
    if (!Array.isArray(rawThemes)) return [];

    return rawThemes
        .map(normalizeStoredTheme)
        .filter(Boolean);
}

export function saveCustomThemes(themes) {
    const cleanThemes = Array.isArray(themes)
        ? themes.filter((theme) => theme?.custom).map(serializeTheme)
        : [];

    setJSON(CUSTOM_THEMES_KEY, cleanThemes);
}
