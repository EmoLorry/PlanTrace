export const DEFAULT_THEME_ID = 'morning';

export const THEME_VARIABLES = [
    'color-text-primary',
    'color-text-secondary',
    'color-text-muted',
    'color-accent',
    'color-accent-light',
    'color-accent-medium',
    'color-green',
    'color-green-light',
    'color-amber',
    'color-amber-light',
    'color-red',
    'color-red-light',
    'color-grey-dot',
    'color-blue-dot',
    'color-green-dot',
    'color-surface',
    'color-divider',
    'th-bg',
    'th-sidebar-bg',
    'th-glass-bg',
    'th-glass-border',
    'th-glass-subtle-bg',
    'th-glass-subtle-border',
    'th-glass-shadow',
    'th-glass-subtle-shadow',
    'th-divider',
    'th-hover',
    'th-card-selected',
    'th-card-selected-shadow',
    'th-input-bg',
    'th-input-border',
    'th-modal-overlay',
    'th-modal-bg',
    'th-scrollbar',
    'th-scrollbar-hover',
    'th-checkbox-border',
    'th-edge-glow-color',
    'th-edge-glow-outer',
    'atomic-track',
    'atomic-idle',
    'atomic-progress',
    'atomic-urgent',
    'atomic-tick',
    'atomic-tick-major',
    'atomic-numeral',
    'atomic-face-bg',
    'atomic-panel-bg',
    'atomic-panel-border',
    'atomic-label-color',
    'atomic-count-bg',
    'atomic-count-color',
];

const LIGHT_DEFAULT_PALETTE = {
    mode: 'light',
    background: '#f5f5f7',
    surface: '#ffffff',
    text: '#1d1d1f',
    secondary: '#6e6e73',
    muted: '#aeaeb2',
    accent: '#007aff',
    green: '#34c759',
    amber: '#ff9500',
    red: '#ff3b30',
};

const DARK_DEFAULT_PALETTE = {
    mode: 'dark',
    background: '#0f1628',
    surface: '#161828',
    text: '#f5f7fb',
    secondary: '#9ca6b8',
    muted: '#647086',
    accent: '#5e9eff',
    green: '#4ade80',
    amber: '#fbbf24',
    red: '#f87171',
};

export const DEFAULT_CUSTOM_PALETTE = { ...LIGHT_DEFAULT_PALETTE };

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value) {
    return typeof value === 'string' && HEX_RE.test(value.trim());
}

function normalizeHex(value, fallback) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!isHexColor(raw)) return fallback;

    if (raw.length === 4) {
        const [, r, g, b] = raw;
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }

    return raw.toLowerCase();
}

function hexToRgb(hex) {
    const normalized = normalizeHex(hex, '#000000').slice(1);
    const value = Number.parseInt(normalized, 16);

    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
}

export function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normalizePalette(palette = {}) {
    const mode = palette.mode === 'dark' ? 'dark' : 'light';
    const fallback = mode === 'dark' ? DARK_DEFAULT_PALETTE : LIGHT_DEFAULT_PALETTE;

    return {
        mode,
        background: normalizeHex(palette.background, fallback.background),
        surface: normalizeHex(palette.surface, fallback.surface),
        text: normalizeHex(palette.text, fallback.text),
        secondary: normalizeHex(palette.secondary, fallback.secondary),
        muted: normalizeHex(palette.muted, fallback.muted),
        accent: normalizeHex(palette.accent, fallback.accent),
        green: normalizeHex(palette.green, fallback.green),
        amber: normalizeHex(palette.amber, fallback.amber),
        red: normalizeHex(palette.red, fallback.red),
    };
}

export function createThemeVars(paletteInput = DEFAULT_CUSTOM_PALETTE) {
    const palette = normalizePalette(paletteInput);
    const dark = palette.mode === 'dark';
    const white = '#ffffff';
    const black = '#000000';
    const borderBase = dark ? white : palette.text;
    const shadowBase = dark ? black : palette.text;

    return {
        'color-text-primary': palette.text,
        'color-text-secondary': palette.secondary,
        'color-text-muted': palette.muted,
        'color-accent': palette.accent,
        'color-accent-light': rgba(palette.accent, dark ? 0.15 : 0.1),
        'color-accent-medium': rgba(palette.accent, dark ? 0.2 : 0.15),
        'color-green': palette.green,
        'color-green-light': rgba(palette.green, dark ? 0.15 : 0.12),
        'color-amber': palette.amber,
        'color-amber-light': rgba(palette.amber, dark ? 0.12 : 0.1),
        'color-red': palette.red,
        'color-red-light': rgba(palette.red, dark ? 0.12 : 0.1),
        'color-grey-dot': dark ? rgba(white, 0.25) : rgba(palette.text, 0.22),
        'color-blue-dot': palette.accent,
        'color-green-dot': palette.green,
        'color-surface': palette.surface,
        'color-divider': rgba(borderBase, dark ? 0.12 : 0.1),

        'th-bg': palette.background,
        'th-sidebar-bg': rgba(palette.surface, dark ? 0.58 : 0.62),
        'th-glass-bg': rgba(palette.surface, dark ? 0.12 : 0.76),
        'th-glass-border': rgba(borderBase, dark ? 0.1 : 0.08),
        'th-glass-subtle-bg': rgba(palette.surface, dark ? 0.08 : 0.55),
        'th-glass-subtle-border': rgba(borderBase, dark ? 0.08 : 0.06),
        'th-glass-shadow': dark
            ? '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)'
            : `0 1px 3px ${rgba(shadowBase, 0.04)}, 0 4px 12px ${rgba(shadowBase, 0.03)}`,
        'th-glass-subtle-shadow': dark
            ? '0 1px 2px rgba(0, 0, 0, 0.2)'
            : `0 1px 2px ${rgba(shadowBase, 0.03)}`,
        'th-divider': rgba(borderBase, dark ? 0.08 : 0.07),
        'th-hover': rgba(borderBase, dark ? 0.07 : 0.05),
        'th-card-selected': rgba(palette.surface, dark ? 0.16 : 0.96),
        'th-card-selected-shadow': dark
            ? '0 1px 6px rgba(0, 0, 0, 0.3)'
            : `0 1px 4px ${rgba(shadowBase, 0.08)}`,
        'th-input-bg': rgba(borderBase, dark ? 0.07 : 0.04),
        'th-input-border': rgba(borderBase, dark ? 0.1 : 0.08),
        'th-modal-overlay': dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.18)',
        'th-modal-bg': rgba(palette.surface, dark ? 0.92 : 0.94),
        'th-scrollbar': rgba(borderBase, dark ? 0.12 : 0.13),
        'th-scrollbar-hover': rgba(borderBase, dark ? 0.2 : 0.22),
        'th-checkbox-border': rgba(borderBase, dark ? 0.2 : 0.2),
        'th-edge-glow-color': rgba(palette.accent, dark ? 0.16 : 0.11),
        'th-edge-glow-outer': rgba(palette.accent, dark ? 0.07 : 0.045),

        'atomic-track': rgba(borderBase, dark ? 0.12 : 0.1),
        'atomic-idle': rgba(borderBase, dark ? 0.25 : 0.2),
        'atomic-progress': palette.accent,
        'atomic-urgent': palette.red,
        'atomic-tick': rgba(borderBase, dark ? 0.14 : 0.12),
        'atomic-tick-major': rgba(borderBase, dark ? 0.32 : 0.28),
        'atomic-numeral': rgba(borderBase, dark ? 0.28 : 0.3),
        'atomic-face-bg': rgba(palette.surface, dark ? 0.04 : 0.3),
        'atomic-panel-bg': rgba(palette.surface, dark ? 0.08 : 0.72),
        'atomic-panel-border': rgba(borderBase, dark ? 0.09 : 0.08),
        'atomic-label-color': rgba(borderBase, dark ? 0.4 : 0.45),
        'atomic-count-bg': rgba(palette.accent, dark ? 0.12 : 0.1),
        'atomic-count-color': palette.accent,
    };
}

function defineTheme({ id, name, label, palette, color, accent, vars = {}, custom = false }) {
    const normalizedPalette = normalizePalette(palette);

    return {
        id,
        name,
        label,
        color: color || normalizedPalette.background,
        accent: accent || normalizedPalette.accent,
        palette: normalizedPalette,
        vars: {
            ...createThemeVars(normalizedPalette),
            ...vars,
        },
        custom,
    };
}

export function createThemeFromPalette({ id, name, label = 'DIY Theme', palette, custom = true }) {
    const safeName = String(name || 'DIY Theme').trim().slice(0, 24) || 'DIY Theme';
    return defineTheme({
        id,
        name: safeName,
        label,
        palette,
        custom,
    });
}

const morningVars = {
    'th-bg': '#f5f5f7',
    'th-sidebar-bg': 'rgba(255, 255, 255, 0.5)',
    'th-glass-bg': 'rgba(255, 255, 255, 0.78)',
    'th-glass-border': 'rgba(0, 0, 0, 0.08)',
    'th-glass-subtle-bg': 'rgba(255, 255, 255, 0.55)',
    'th-glass-subtle-border': 'rgba(0, 0, 0, 0.05)',
    'th-glass-shadow': '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)',
    'th-glass-subtle-shadow': '0 1px 2px rgba(0, 0, 0, 0.03)',
    'th-divider': 'rgba(0, 0, 0, 0.06)',
    'th-hover': 'rgba(0, 0, 0, 0.04)',
    'th-card-selected': 'rgba(255, 255, 255, 1)',
    'th-card-selected-shadow': '0 1px 4px rgba(0, 0, 0, 0.08)',
    'th-input-bg': 'rgba(0, 0, 0, 0.03)',
    'th-input-border': 'rgba(0, 0, 0, 0.06)',
    'th-modal-overlay': 'rgba(0, 0, 0, 0.18)',
    'th-modal-bg': 'rgba(255, 255, 255, 0.92)',
    'th-scrollbar': 'rgba(0, 0, 0, 0.12)',
    'th-scrollbar-hover': 'rgba(0, 0, 0, 0.2)',
    'th-checkbox-border': 'rgba(0, 0, 0, 0.18)',
    'th-edge-glow-color': 'rgba(100, 150, 255, 0.1)',
    'th-edge-glow-outer': 'rgba(80, 130, 255, 0.04)',
    'atomic-track': 'rgba(0, 0, 0, 0.1)',
    'atomic-idle': 'rgba(0, 0, 0, 0.2)',
    'atomic-progress': '#007aff',
    'atomic-urgent': '#ff3b30',
    'atomic-tick': 'rgba(0, 0, 0, 0.12)',
    'atomic-tick-major': 'rgba(0, 0, 0, 0.28)',
    'atomic-numeral': 'rgba(0, 0, 0, 0.3)',
    'atomic-face-bg': 'rgba(255, 255, 255, 0.3)',
    'atomic-panel-bg': 'rgba(255, 255, 255, 0.72)',
    'atomic-panel-border': 'rgba(0, 0, 0, 0.07)',
    'atomic-label-color': 'rgba(0, 0, 0, 0.45)',
    'atomic-count-bg': 'rgba(0, 122, 255, 0.09)',
    'atomic-count-color': '#007aff',
};

const midnightVars = {
    'th-bg': 'linear-gradient(135deg, #0b0e1a 0%, #0f1628 30%, #111d35 60%, #0d1226 100%)',
    'th-sidebar-bg': 'rgba(12, 16, 30, 0.75)',
    'th-glass-bg': 'rgba(255, 255, 255, 0.05)',
    'th-glass-border': 'rgba(255, 255, 255, 0.08)',
    'th-glass-subtle-bg': 'rgba(255, 255, 255, 0.04)',
    'th-glass-subtle-border': 'rgba(255, 255, 255, 0.06)',
    'th-glass-shadow': '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)',
    'th-glass-subtle-shadow': '0 1px 2px rgba(0, 0, 0, 0.2)',
    'th-divider': 'rgba(255, 255, 255, 0.06)',
    'th-hover': 'rgba(255, 255, 255, 0.06)',
    'th-card-selected': 'rgba(255, 255, 255, 0.1)',
    'th-card-selected-shadow': '0 1px 6px rgba(0, 0, 0, 0.3)',
    'th-input-bg': 'rgba(255, 255, 255, 0.05)',
    'th-input-border': 'rgba(255, 255, 255, 0.08)',
    'th-modal-overlay': 'rgba(0, 0, 0, 0.55)',
    'th-modal-bg': 'rgba(22, 24, 40, 0.92)',
    'th-scrollbar': 'rgba(255, 255, 255, 0.1)',
    'th-scrollbar-hover': 'rgba(255, 255, 255, 0.18)',
    'th-checkbox-border': 'rgba(255, 255, 255, 0.2)',
    'th-edge-glow-color': 'rgba(80, 120, 255, 0.15)',
    'th-edge-glow-outer': 'rgba(60, 80, 200, 0.06)',
    'atomic-track': 'rgba(255, 255, 255, 0.12)',
    'atomic-idle': 'rgba(255, 255, 255, 0.25)',
    'atomic-progress': '#5e9eff',
    'atomic-urgent': '#f87171',
    'atomic-tick': 'rgba(255, 255, 255, 0.14)',
    'atomic-tick-major': 'rgba(255, 255, 255, 0.32)',
    'atomic-numeral': 'rgba(255, 255, 255, 0.28)',
    'atomic-face-bg': 'rgba(255, 255, 255, 0.03)',
    'atomic-panel-bg': 'rgba(255, 255, 255, 0.04)',
    'atomic-panel-border': 'rgba(255, 255, 255, 0.08)',
    'atomic-label-color': 'rgba(255, 255, 255, 0.4)',
    'atomic-count-bg': 'rgba(94, 158, 255, 0.12)',
    'atomic-count-color': '#5e9eff',
};

const sunsetVars = {
    'th-bg': '#fef5ee',
    'th-sidebar-bg': 'rgba(255, 248, 240, 0.65)',
    'th-glass-bg': 'rgba(255, 252, 248, 0.72)',
    'th-glass-border': 'rgba(180, 120, 60, 0.08)',
    'th-glass-subtle-bg': 'rgba(255, 250, 245, 0.55)',
    'th-glass-subtle-border': 'rgba(180, 120, 60, 0.06)',
    'th-glass-shadow': '0 1px 3px rgba(120, 60, 20, 0.04), 0 4px 12px rgba(120, 60, 20, 0.03)',
    'th-glass-subtle-shadow': '0 1px 2px rgba(120, 60, 20, 0.03)',
    'th-divider': 'rgba(180, 120, 60, 0.08)',
    'th-hover': 'rgba(180, 120, 60, 0.05)',
    'th-card-selected': 'rgba(255, 252, 248, 0.95)',
    'th-card-selected-shadow': '0 1px 4px rgba(120, 60, 20, 0.08)',
    'th-input-bg': 'rgba(180, 120, 60, 0.04)',
    'th-input-border': 'rgba(180, 120, 60, 0.08)',
    'th-modal-overlay': 'rgba(60, 30, 10, 0.15)',
    'th-modal-bg': 'rgba(255, 252, 248, 0.94)',
    'th-scrollbar': 'rgba(180, 120, 60, 0.12)',
    'th-scrollbar-hover': 'rgba(180, 120, 60, 0.2)',
    'th-checkbox-border': 'rgba(180, 120, 60, 0.2)',
    'th-edge-glow-color': 'rgba(255, 160, 80, 0.1)',
    'th-edge-glow-outer': 'rgba(255, 120, 100, 0.04)',
    'atomic-track': 'rgba(120, 60, 20, 0.1)',
    'atomic-idle': 'rgba(120, 60, 20, 0.25)',
    'atomic-progress': '#e07830',
    'atomic-urgent': '#d94f4f',
    'atomic-tick': 'rgba(120, 60, 20, 0.14)',
    'atomic-tick-major': 'rgba(120, 60, 20, 0.3)',
    'atomic-numeral': 'rgba(120, 60, 20, 0.3)',
    'atomic-face-bg': 'rgba(255, 248, 238, 0.3)',
    'atomic-panel-bg': 'rgba(255, 252, 248, 0.72)',
    'atomic-panel-border': 'rgba(180, 120, 60, 0.08)',
    'atomic-label-color': 'rgba(60, 30, 10, 0.4)',
    'atomic-count-bg': 'rgba(224, 120, 48, 0.1)',
    'atomic-count-color': '#e07830',
};

export const BUILT_IN_THEMES = [
    defineTheme({
        id: 'morning',
        name: '晨雾',
        label: 'Morning Mist',
        palette: LIGHT_DEFAULT_PALETTE,
        vars: morningVars,
    }),
    defineTheme({
        id: 'midnight',
        name: '星空',
        label: 'Starry Sky',
        palette: DARK_DEFAULT_PALETTE,
        vars: midnightVars,
    }),
    defineTheme({
        id: 'sunset',
        name: '晚霞',
        label: 'Sunset',
        palette: {
            mode: 'light',
            background: '#fef5ee',
            surface: '#fffcf8',
            text: '#3d2c1e',
            secondary: '#8b7355',
            muted: '#bda88a',
            accent: '#e07830',
            green: '#5cb85c',
            amber: '#e0922e',
            red: '#d94f4f',
        },
        vars: sunsetVars,
    }),
    defineTheme({
        id: 'graphite',
        name: '石墨',
        label: 'Graphite',
        palette: {
            mode: 'dark',
            background: '#0e1116',
            surface: '#191d24',
            text: '#f1efe7',
            secondary: '#aaa39a',
            muted: '#6f737b',
            accent: '#d7b56d',
            green: '#74c69d',
            amber: '#f0a85a',
            red: '#ff7a7a',
        },
        vars: {
            'th-bg': 'linear-gradient(135deg, #090b0d 0%, #11151a 45%, #18130f 100%)',
        },
    }),
    defineTheme({
        id: 'aurora',
        name: '极光',
        label: 'Aurora',
        palette: {
            mode: 'dark',
            background: '#071316',
            surface: '#102126',
            text: '#eefcf8',
            secondary: '#92b7b3',
            muted: '#587775',
            accent: '#39d0c5',
            green: '#7ddf92',
            amber: '#ffd166',
            red: '#ff6b8a',
        },
        vars: {
            'th-bg': 'linear-gradient(135deg, #061214 0%, #102126 42%, #141634 100%)',
            'th-edge-glow-color': 'rgba(57, 208, 197, 0.18)',
            'th-edge-glow-outer': 'rgba(126, 87, 194, 0.08)',
        },
    }),
    defineTheme({
        id: 'porcelain',
        name: '瓷白',
        label: 'Porcelain',
        palette: {
            mode: 'light',
            background: '#f6f9fb',
            surface: '#ffffff',
            text: '#1e2a32',
            secondary: '#5d6b75',
            muted: '#9aa7af',
            accent: '#2f64d6',
            green: '#2f9e80',
            amber: '#d99027',
            red: '#cf4b5d',
        },
    }),
    defineTheme({
        id: 'sage',
        name: '松影',
        label: 'Sage',
        palette: {
            mode: 'light',
            background: '#f1f4ef',
            surface: '#fbfcf8',
            text: '#20261f',
            secondary: '#667064',
            muted: '#a2aa9e',
            accent: '#4b8b6b',
            green: '#3f9f6d',
            amber: '#b8892f',
            red: '#c65f5f',
        },
        vars: {
            'th-edge-glow-color': 'rgba(75, 139, 107, 0.11)',
            'th-edge-glow-outer': 'rgba(63, 159, 109, 0.05)',
        },
    }),
    defineTheme({
        id: 'atelier',
        name: '画廊',
        label: 'Atelier',
        palette: {
            mode: 'light',
            background: '#f7f3ec',
            surface: '#fffdf7',
            text: '#25211c',
            secondary: '#696158',
            muted: '#a9a097',
            accent: '#345e8c',
            green: '#4f8f72',
            amber: '#c9892f',
            red: '#c5523f',
        },
    }),
    defineTheme({
        id: 'glacier',
        name: '冰川',
        label: 'Glacier',
        palette: {
            mode: 'light',
            background: '#eef5f7',
            surface: '#fbfeff',
            text: '#1c2c35',
            secondary: '#55717c',
            muted: '#91aab3',
            accent: '#2b8ca3',
            green: '#39966f',
            amber: '#c79a34',
            red: '#c95765',
        },
        vars: {
            'th-edge-glow-color': 'rgba(43, 140, 163, 0.12)',
            'th-edge-glow-outer': 'rgba(77, 166, 198, 0.05)',
        },
    }),
];

export function getThemeById(themeId, themes = BUILT_IN_THEMES) {
    return themes.find((theme) => theme.id === themeId) || null;
}

export const THEMES = BUILT_IN_THEMES;
