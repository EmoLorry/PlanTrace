import { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme } from './ThemeContext.jsx';

export default function ThemeSwitcher() {
    const { themeId, setThemeId, themes } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-secondary hover:text-text-primary"
                title="Switch theme"
            >
                <Palette size={18} />
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 top-full mt-2 w-60 glass p-1.5 animate-drop-in z-50"
                    style={{ background: 'var(--th-modal-bg)', backdropFilter: 'blur(24px) saturate(200%)' }}
                >
                    <div className="px-2.5 py-1.5 mb-1">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Theme</p>
                    </div>
                    {themes.map((theme) => {
                        const isActive = themeId === theme.id;
                        return (
                            <button
                                key={theme.id}
                                onClick={() => {
                                    setThemeId(theme.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${isActive
                                        ? 'bg-[var(--th-card-selected)]'
                                        : 'hover:bg-[var(--th-hover)]'
                                    }
                `}
                            >
                                {/* Color indicator */}
                                <div className="flex gap-1 shrink-0">
                                    <span
                                        className="w-4 h-4 rounded-full border border-[var(--th-glass-border)]"
                                        style={{ background: theme.color }}
                                    />
                                    <span
                                        className="w-4 h-4 rounded-full border border-[var(--th-glass-border)]"
                                        style={{ background: theme.accent }}
                                    />
                                </div>

                                {/* Name */}
                                <div className="flex-1 text-left whitespace-nowrap">
                                    <span className="text-sm font-medium text-text-primary">{theme.name}</span>
                                    <span className="text-[11px] text-text-muted ml-1.5">{theme.label}</span>
                                </div>

                                {/* Active check */}
                                {isActive && (
                                    <Check size={14} className="text-accent shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
