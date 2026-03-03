import { createContext, useContext, useState, useEffect } from 'react';
import { getJSON, setJSON } from '../store/storage.js';

const THEME_KEY = 'theme';

const THEMES = [
    { id: 'morning', name: '晨雾', label: 'Morning Mist', color: '#f5f5f7', accent: '#007aff' },
    { id: 'midnight', name: '星空', label: 'Starry Sky', color: '#0f1628', accent: '#5e9eff' },
    { id: 'sunset', name: '晚霞', label: 'Sunset', color: '#fef5ee', accent: '#e07830' },
];

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [themeId, setThemeId] = useState(() => {
        return getJSON(THEME_KEY) || 'morning';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeId);
        setJSON(THEME_KEY, themeId);
    }, [themeId]);

    return (
        <ThemeContext.Provider value={{ themeId, setThemeId, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

export { THEMES };
