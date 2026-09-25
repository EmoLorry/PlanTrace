import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Palette, Plus, RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useTheme } from '../theme/themeContext.js';
import { DEFAULT_CUSTOM_PALETTE, createThemeVars, normalizePalette } from '../theme/themePresets.js';

const COLOR_FIELDS = [
    { key: 'background', label: '背景' },
    { key: 'surface', label: '面板' },
    { key: 'text', label: '文字' },
    { key: 'secondary', label: '副字' },
    { key: 'muted', label: '弱字' },
    { key: 'accent', label: '主色' },
    { key: 'green', label: '完成' },
    { key: 'amber', label: '提醒' },
    { key: 'red', label: '危险' },
];

function createDraftFromTheme(theme, forceCopy = false) {
    const palette = normalizePalette(theme?.palette || DEFAULT_CUSTOM_PALETTE);
    const isEditingCustom = theme?.custom && !forceCopy;

    return {
        id: isEditingCustom ? theme.id : '',
        name: isEditingCustom ? theme.name : `${theme?.name || 'Theme'} DIY`,
        palette,
    };
}

function ThemeSwatches({ theme }) {
    return (
        <div className="flex gap-1 shrink-0">
            <span
                className="w-4 h-4 rounded-full border border-[var(--th-glass-border)]"
                style={{ background: theme.color }}
            />
            <span
                className="w-4 h-4 rounded-full border border-[var(--th-glass-border)]"
                style={{ background: theme.vars?.['color-surface'] || theme.color }}
            />
            <span
                className="w-4 h-4 rounded-full border border-[var(--th-glass-border)]"
                style={{ background: theme.accent }}
            />
        </div>
    );
}

function ThemeRow({ theme, isActive, onSelect, onEdit }) {
    return (
        <div
            className={`group flex items-center gap-1 rounded-xl transition-all duration-200
                ${isActive ? 'bg-[var(--th-card-selected)]' : 'hover:bg-[var(--th-hover)]'}`}
        >
            <button
                type="button"
                onClick={onSelect}
                className="min-w-0 flex flex-1 items-center gap-3 px-3 py-2.5 text-left"
                title={`切换到 ${theme.name}`}
            >
                <ThemeSwatches theme={theme} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="truncate text-sm font-medium text-text-primary">{theme.name}</span>
                        <span className="truncate text-[11px] text-text-muted">{theme.label}</span>
                    </div>
                </div>
                {isActive && <Check size={14} className="text-accent shrink-0" />}
            </button>

            {theme.custom && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="mr-1 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--th-hover)]"
                    title="编辑 DIY 主题"
                >
                    <SlidersHorizontal size={14} />
                </button>
            )}
        </div>
    );
}

function ThemeGroup({ title, themes, themeId, onSelect, onEdit }) {
    if (!themes.length) return null;

    return (
        <div className="space-y-1">
            <div className="px-2.5 pt-2 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{title}</p>
            </div>
            {themes.map((theme) => (
                <ThemeRow
                    key={theme.id}
                    theme={theme}
                    isActive={themeId === theme.id}
                    onSelect={() => onSelect(theme)}
                    onEdit={() => onEdit(theme)}
                />
            ))}
        </div>
    );
}

export default function ThemeSwitcher() {
    const {
        themeId,
        setThemeId,
        activeTheme,
        builtInThemes,
        customThemes,
        saveCustomTheme,
        deleteCustomTheme,
    } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState('themes');
    const [draft, setDraft] = useState(() => createDraftFromTheme(activeTheme, true));
    const ref = useRef(null);

    const draftPalette = useMemo(() => normalizePalette(draft.palette), [draft.palette]);
    const draftVars = useMemo(() => createThemeVars(draftPalette), [draftPalette]);
    const editingExisting = Boolean(draft.id);

    useEffect(() => {
        const handleClick = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && view === 'themes') {
            setDraft(createDraftFromTheme(activeTheme, !activeTheme?.custom));
        }
    }, [activeTheme, isOpen, view]);

    const openDiy = (theme = activeTheme, forceCopy = !theme?.custom) => {
        setDraft(createDraftFromTheme(theme, forceCopy));
        setView('diy');
    };

    const updatePalette = (key, value) => {
        setDraft((current) => ({
            ...current,
            palette: normalizePalette({
                ...current.palette,
                [key]: value,
            }),
        }));
    };

    const handleSave = () => {
        const savedTheme = saveCustomTheme({
            ...draft,
            palette: draftPalette,
        });

        setDraft(createDraftFromTheme(savedTheme));
        setView('themes');
    };

    const handleDelete = () => {
        if (!draft.id) return;
        if (!window.confirm(`确认删除 DIY 主题「${draft.name || '未命名主题'}」吗？\n\n删除后这个自定义主题会从本机主题列表中移除。`)) return;
        deleteCustomTheme(draft.id);
        setDraft(createDraftFromTheme(activeTheme, true));
        setView('themes');
    };

    const handleSelect = (theme) => {
        setThemeId(theme.id);
        setIsOpen(false);
        setView('themes');
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-secondary hover:text-text-primary"
                title="切换主题 / DIY 主题"
                aria-label="切换主题"
            >
                <Palette size={18} />
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-24px)] glass p-2 animate-drop-in z-50"
                    style={{ background: 'var(--th-modal-bg)', backdropFilter: 'blur(24px) saturate(200%)' }}
                >
                    <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Theme</p>
                        <div className="flex rounded-xl p-0.5 bg-[var(--th-glass-subtle-bg)] border border-[var(--th-glass-subtle-border)]">
                            <button
                                type="button"
                                onClick={() => setView('themes')}
                                className={`theme-segment ${view === 'themes' ? 'is-active' : ''}`}
                                title="主题列表"
                            >
                                <Palette size={13} />
                                <span>主题</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => openDiy(activeTheme)}
                                className={`theme-segment ${view === 'diy' ? 'is-active' : ''}`}
                                title="DIY 主题"
                            >
                                <SlidersHorizontal size={13} />
                                <span>DIY</span>
                            </button>
                        </div>
                    </div>

                    {view === 'themes' ? (
                        <div className="max-h-[72vh] overflow-y-auto pr-0.5">
                            <ThemeGroup
                                title="精选主题"
                                themes={builtInThemes}
                                themeId={themeId}
                                onSelect={handleSelect}
                                onEdit={openDiy}
                            />

                            <ThemeGroup
                                title="我的 DIY"
                                themes={customThemes}
                                themeId={themeId}
                                onSelect={handleSelect}
                                onEdit={(theme) => openDiy(theme, false)}
                            />

                            <button
                                type="button"
                                onClick={() => openDiy(activeTheme, true)}
                                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-accent bg-accent-light hover:bg-accent-light/80 transition-colors"
                            >
                                <Plus size={15} />
                                新建 DIY 主题
                            </button>
                        </div>
                    ) : (
                        <div className="max-h-[72vh] overflow-y-auto pr-0.5">
                            <div
                                className="theme-preview"
                                style={{
                                    background: draftVars['th-bg'],
                                    borderColor: draftVars['th-glass-border'],
                                    color: draftVars['color-text-primary'],
                                }}
                            >
                                <div className="theme-preview-panel" style={{ background: draftVars['th-glass-bg'] }}>
                                    <span style={{ color: draftVars['color-text-secondary'] }}>PlanTrace</span>
                                    <strong>{draft.name || 'DIY Theme'}</strong>
                                    <div>
                                        <i style={{ background: draftVars['color-green'] }} />
                                        <i style={{ background: draftVars['color-accent'] }} />
                                        <i style={{ background: draftVars['color-amber'] }} />
                                    </div>
                                </div>
                            </div>

                            <label className="theme-input-row">
                                <span>名称</span>
                                <input
                                    value={draft.name}
                                    onChange={(event) => setDraft((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))}
                                    maxLength={24}
                                    placeholder="DIY Theme"
                                />
                            </label>

                            <div className="theme-mode-row">
                                <span>模式</span>
                                <div>
                                    {['light', 'dark'].map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => updatePalette('mode', mode)}
                                            className={draftPalette.mode === mode ? 'is-active' : ''}
                                        >
                                            {mode === 'light' ? '浅色' : '深色'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="theme-color-grid">
                                {COLOR_FIELDS.map((field) => (
                                    <label key={field.key} className="theme-color-field">
                                        <span>{field.label}</span>
                                        <input
                                            type="color"
                                            value={draftPalette[field.key]}
                                            onChange={(event) => updatePalette(field.key, event.target.value)}
                                            title={field.label}
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="theme-actions">
                                <button
                                    type="button"
                                    onClick={() => setDraft(createDraftFromTheme(activeTheme, !activeTheme?.custom))}
                                    title="用当前主题重置"
                                >
                                    <RotateCcw size={15} />
                                </button>
                                {editingExisting && (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        className="is-danger"
                                        title="删除 DIY 主题"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    className="is-primary"
                                >
                                    <Save size={15} />
                                    {editingExisting ? '保存' : '创建'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
