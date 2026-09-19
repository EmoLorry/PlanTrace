import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from 'react';
import { getJSON, setJSON } from '../store/storage.js';
import {
    BUILT_IN_THEMES,
    DEFAULT_THEME_ID,
    THEME_VARIABLES,
    createThemeFromPalette,
    getThemeById,
} from '../theme/themePresets.js';
import { ThemeContext } from '../theme/themeContext.js';
import { createCustomThemeId, getCustomThemes, saveCustomThemes } from '../theme/themeStore.js';

const THEME_KEY = 'theme';

function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.id);

    THEME_VARIABLES.forEach((name) => {
        const value = theme.vars?.[name] ?? BUILT_IN_THEMES[0].vars[name];
        if (value) root.style.setProperty(`--${name}`, value);
    });
}

export function ThemeProvider({ children }) {
    const [themeId, setThemeIdState] = useState(() => getJSON(THEME_KEY) || DEFAULT_THEME_ID);
    const [customThemes, setCustomThemes] = useState(() => getCustomThemes());

    const themes = useMemo(() => [...BUILT_IN_THEMES, ...customThemes], [customThemes]);
    const activeTheme = useMemo(() => {
        return getThemeById(themeId, themes) || getThemeById(DEFAULT_THEME_ID, BUILT_IN_THEMES);
    }, [themeId, themes]);

    useLayoutEffect(() => {
        applyTheme(activeTheme);
        setJSON(THEME_KEY, activeTheme.id);
    }, [activeTheme]);

    useEffect(() => {
        saveCustomThemes(customThemes);
    }, [customThemes]);

    const setThemeId = useCallback((nextThemeId) => {
        const exists = getThemeById(nextThemeId, themes);
        setThemeIdState(exists ? nextThemeId : DEFAULT_THEME_ID);
    }, [themes]);

    const saveCustomTheme = useCallback((draft) => {
        const nextTheme = createThemeFromPalette({
            id: draft.id || createCustomThemeId(),
            name: draft.name,
            label: draft.label || 'DIY Theme',
            palette: draft.palette,
            custom: true,
        });

        setCustomThemes((current) => {
            const exists = current.some((theme) => theme.id === nextTheme.id);
            return exists
                ? current.map((theme) => (theme.id === nextTheme.id ? nextTheme : theme))
                : [...current, nextTheme];
        });
        setThemeIdState(nextTheme.id);

        return nextTheme;
    }, []);

    const deleteCustomTheme = useCallback((customThemeId) => {
        setCustomThemes((current) => current.filter((theme) => theme.id !== customThemeId));
        setThemeIdState((currentThemeId) => (
            currentThemeId === customThemeId ? DEFAULT_THEME_ID : currentThemeId
        ));
    }, []);

    const value = useMemo(() => ({
        themeId: activeTheme.id,
        setThemeId,
        activeTheme,
        themes,
        builtInThemes: BUILT_IN_THEMES,
        customThemes,
        saveCustomTheme,
        deleteCustomTheme,
    }), [activeTheme, customThemes, deleteCustomTheme, saveCustomTheme, setThemeId, themes]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}
