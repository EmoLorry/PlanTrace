import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, Plus, Trash2, BookOpen, ChevronLeft, ChevronRight, Bold, Highlighter, Italic, Underline } from 'lucide-react';
import {
    ensureDiaryStorage, importLegacyDiaryDirectory, migrateLegacyDiaries,
    readDiary, readDiaryMonthSummary, writeDiary, createEmptyDiary, noteId,
} from '../store/diaryStore.js';
import { getTodayBJ } from '../store/dateUtils.js';
import { getJSON, setJSON } from '../store/storage.js';
import TextExperienceControls from './TextExperienceControls.jsx';
import { getTextSurface } from './textExperience.js';

// ---------------------------------------------------------------------------
// Note color palette
// ---------------------------------------------------------------------------
const NOTE_COLORS = [
    { id: 'yellow', bg: 'rgba(254,243,199,0.92)', border: 'rgba(245,158,11,0.4)', dot: '#f59e0b' },
    { id: 'pink', bg: 'rgba(252,231,243,0.92)', border: 'rgba(236,72,153,0.3)', dot: '#ec4899' },
    { id: 'purple', bg: 'rgba(237,233,254,0.92)', border: 'rgba(139,92,246,0.3)', dot: '#8b5cf6' },
    { id: 'mint', bg: 'rgba(209,250,229,0.92)', border: 'rgba(52,211,153,0.3)', dot: '#34d399' },
    { id: 'orange', bg: 'rgba(254,215,170,0.92)', border: 'rgba(249,115,22,0.3)', dot: '#f97316' },
    { id: 'sky', bg: 'rgba(224,242,254,0.92)', border: 'rgba(56,189,248,0.3)', dot: '#38bdf8' },
    { id: 'rose', bg: 'rgba(255,228,230,0.92)', border: 'rgba(244,63,94,0.3)', dot: '#f43f5e' },
    { id: 'slate', bg: 'rgba(241,245,249,0.92)', border: 'rgba(148,163,184,0.35)', dot: '#94a3b8' },
];

const DEFAULT_NOTE_COLOR = NOTE_COLORS[0].id;
const CALENDAR_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const DIARY_WRITING_STYLE_KEY = 'diary_writing_style';
const DEFAULT_WRITING_STYLE = {
    fontSize: 15,
    lineHeight: 1.8,
    surface: 'paper',
};
const DIARY_MARK_COLORS = [
    { id: 'ochre', label: '赭金', value: '#d8a766' },
    { id: 'sage', label: '鼠尾草', value: '#7fb7a0' },
    { id: 'bluegrey', label: '雾蓝', value: '#83a9c4' },
    { id: 'rosewood', label: '玫瑰灰', value: '#d98291' },
];

function normalizeCssColor(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
        return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
    }
    const match = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return raw;
    return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function isSameColor(a, b) {
    return normalizeCssColor(a) === normalizeCssColor(b);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function plainTextToHtml(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function getNoteColor(id) {
    return NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[0];
}

function normalizeDiaryState(raw) {
    const source = raw && typeof raw === 'object' ? raw : createEmptyDiary();
    const seenNoteIds = new Set();
    const notes = Array.isArray(source.notes)
        ? source.notes
            .filter((note) => note && typeof note === 'object')
            .map((note) => {
                let id = note.id ? String(note.id) : noteId();
                while (seenNoteIds.has(id)) id = noteId();
                seenNoteIds.add(id);
                return {
                    ...note,
                    id,
                    text: typeof note.text === 'string' ? note.text : '',
                    color: getNoteColor(note.color).id,
                    createdAt: Number(note.createdAt) || Date.now(),
                };
            })
        : [];

    const mainText = typeof source.mainText === 'string' ? source.mainText : '';
    const mainHtml = typeof source.mainHtml === 'string' ? source.mainHtml : plainTextToHtml(mainText);
    return {
        ...createEmptyDiary(),
        ...source,
        mainText,
        mainHtml,
        notes,
        lastModified: Number(source.lastModified) || Date.now(),
    };
}

function formatNoteTime(ms) {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return `${mo}/${day} ${h}:${m}`;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatDate(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

function shiftMonth(monthStr, offset) {
    const [year, month] = String(monthStr).split('-').map(Number);
    const shifted = new Date(year, month - 1 + offset, 1);
    return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}`;
}

function getMonthTitle(monthStr) {
    const [year, month] = String(monthStr).split('-');
    return `${year}年 ${Number(month)}月`;
}

function buildCalendarCells(monthStr) {
    const [year, month] = String(monthStr).split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const previousMonthDays = new Date(year, month - 1, 0).getDate();
    const totalCells = Math.max(35, Math.ceil((startOffset + daysInMonth) / 7) * 7);

    return Array.from({ length: totalCells }, (_, index) => {
        const dayNumber = index - startOffset + 1;
        let cellYear = year;
        let cellMonth = month;
        let day = dayNumber;
        let inMonth = true;

        if (dayNumber <= 0) {
            const previous = new Date(year, month - 2, 1);
            cellYear = previous.getFullYear();
            cellMonth = previous.getMonth() + 1;
            day = previousMonthDays + dayNumber;
            inMonth = false;
        } else if (dayNumber > daysInMonth) {
            const next = new Date(year, month, 1);
            cellYear = next.getFullYear();
            cellMonth = next.getMonth() + 1;
            day = dayNumber - daysInMonth;
            inMonth = false;
        }

        const date = formatDate(cellYear, cellMonth, day);
        return { date, day, inMonth };
    });
}

// ---------------------------------------------------------------------------
// NoteCard
// ---------------------------------------------------------------------------
function NoteCard({ note, onChange, onDelete, textStyle }) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const textareaRef = useRef(null);
    const color = getNoteColor(note.color);

    const resizeTextArea = useCallback((node = textareaRef.current) => {
        if (!node) return;
        node.style.height = 'auto';
        node.style.height = `${node.scrollHeight}px`;
    }, []);

    useEffect(() => {
        resizeTextArea();
    }, [note.text, resizeTextArea, textStyle]);

    return (
        <div className="diary-note-card" style={{ background: color.bg, borderColor: color.border }}>
            <div className="diary-note-header">
                <span className="diary-note-time">{formatNoteTime(note.createdAt)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Color picker toggle */}
                    <div style={{ position: 'relative' }}>
                        <button
                            className="diary-note-color-btn"
                            style={{ background: color.dot }}
                            onClick={() => setShowColorPicker((v) => !v)}
                            title="更改颜色"
                        />
                        {showColorPicker && (
                            <div className="diary-note-color-picker">
                                {NOTE_COLORS.map((c) => (
                                    <button
                                        key={c.id}
                                        className={`diary-note-color-dot ${note.color === c.id ? 'active' : ''}`}
                                        style={{ background: c.dot }}
                                        onClick={() => { onChange({ ...note, color: c.id }); setShowColorPicker(false); }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="diary-note-delete" onClick={onDelete} title="删除">
                        <Trash2 size={11} />
                    </button>
                </div>
            </div>
            <textarea
                ref={textareaRef}
                className="diary-note-text"
                value={note.text}
                placeholder="写下随想…"
                onChange={(e) => {
                    resizeTextArea(e.currentTarget);
                    onChange({ ...note, text: e.target.value });
                }}
                rows={1}
                style={textStyle}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main DiaryModal
// ---------------------------------------------------------------------------
export default function DiaryModal({ selectedDate, onDateChange, onClose }) {
    const [fullscreen, setFullscreen] = useState(false);
    const [tab, setTab] = useState('main'); // 'main' | 'notes' (compact mode only)

    // File system state
    const [fsState, setFsState] = useState('loading'); // 'loading' | 'ready' | 'error'
    const [migrationInfo, setMigrationInfo] = useState(null);

    // Diary data
    const [diary, setDiary] = useState(createEmptyDiary());
    const [calendarMonth, setCalendarMonth] = useState(selectedDate.slice(0, 7));
    const [monthSummary, setMonthSummary] = useState([]);
    const [saving, setSaving] = useState(false);
    const [writingStyle, setWritingStyle] = useState(() => ({
        ...DEFAULT_WRITING_STYLE,
        ...(getJSON(DIARY_WRITING_STYLE_KEY) || {}),
    }));
    const [activeTextColor, setActiveTextColor] = useState(null);

    const saveTimerRef = useRef(null);
    const richEditorRef = useRef(null);
    const diaryRef = useRef(createEmptyDiary());
    const fullscreenRef = useRef(false);
    const richEditorComposingRef = useRef(false);
    const writingSurface = getTextSurface(writingStyle.surface);
    const mainTextStyle = {
        fontSize: `${writingStyle.fontSize}px`,
        lineHeight: writingStyle.lineHeight,
        background: writingSurface.background,
        color: writingSurface.color,
    };
    const noteTextStyle = {
        fontSize: `${Math.max(12, writingStyle.fontSize - 1)}px`,
        lineHeight: writingStyle.lineHeight,
    };

    const syncRichEditor = useCallback((data) => {
        const editor = richEditorRef.current;
        if (!editor) return;
        editor.innerHTML = data?.mainHtml || plainTextToHtml(data?.mainText || '');
    }, []);

    const initializeDiaryStorage = useCallback(async () => {
        setFsState('loading');
        try {
            await ensureDiaryStorage();
            const migration = await migrateLegacyDiaries({ requestPermission: false });
            setMigrationInfo(migration);
            setFsState('ready');
        } catch (e) {
            console.error('Diary storage init failed:', e);
            setFsState('error');
        }
    }, []);

    // ── Prepare PlanTrace data/diary storage on mount ──
    useEffect(() => {
        initializeDiaryStorage();
    }, [initializeDiaryStorage]);

    useEffect(() => {
        fullscreenRef.current = fullscreen;
    }, [fullscreen]);

    useEffect(() => {
        setCalendarMonth(selectedDate.slice(0, 7));
    }, [selectedDate]);

    useEffect(() => {
        if (fsState !== 'ready') return undefined;
        let alive = true;
        (async () => {
            const days = await readDiaryMonthSummary(calendarMonth);
            if (alive) setMonthSummary(days);
        })();
        return () => { alive = false; };
    }, [calendarMonth, fsState]);

    // ── Load diary data when storage and date are ready ──
    useEffect(() => {
        if (fsState !== 'ready') return;
        (async () => {
            const data = await readDiary(null, selectedDate);
            const next = normalizeDiaryState(data || createEmptyDiary());
            diaryRef.current = next;
            setDiary(next);
            if (fullscreenRef.current) {
                requestAnimationFrame(() => syncRichEditor(next));
            }
        })();
    }, [fsState, selectedDate, syncRichEditor]);

    useEffect(() => {
        if (fullscreen) {
            requestAnimationFrame(() => syncRichEditor(diaryRef.current));
        }
    }, [fullscreen, selectedDate, syncRichEditor]);

    // ── Auto-save with 800ms debounce ──
    const scheduleSave = useCallback((data) => {
        clearTimeout(saveTimerRef.current);
        setSaving(true);
        const targetDate = selectedDate;
        const targetMonth = targetDate.slice(0, 7);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await writeDiary(null, targetDate, data);
                const days = await readDiaryMonthSummary(targetMonth);
                if (targetMonth === calendarMonth) setMonthSummary(days);
            } catch (e) {
                console.error('Diary save failed:', e);
            } finally {
                setSaving(false);
            }
        }, 800);
    }, [calendarMonth, selectedDate]);

    const updateDiary = useCallback((updater) => {
        const base = diaryRef.current || createEmptyDiary();
        const next = normalizeDiaryState(
            typeof updater === 'function' ? updater(base) : { ...base, ...updater },
        );
        diaryRef.current = next;
        setDiary(next);
        scheduleSave(next);
    }, [scheduleSave]);

    const handleImportLegacyDir = async () => {
        setSaving(true);
        try {
            const result = await importLegacyDiaryDirectory();
            setMigrationInfo(result);
            const data = await readDiary(null, selectedDate);
            const next = normalizeDiaryState(data || createEmptyDiary());
            diaryRef.current = next;
            setDiary(next);
            if (fullscreen) syncRichEditor(next);
        } catch (e) {
            console.error('Legacy diary import failed:', e);
            setMigrationInfo({ status: 'error', imported: 0, skipped: 0 });
        } finally {
            setSaving(false);
        }
    };

    const addNote = () => {
        const note = { id: noteId(), text: '', color: DEFAULT_NOTE_COLOR, createdAt: Date.now() };
        updateDiary((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
    };

    const updateNote = (id, updated) => {
        updateDiary((prev) => ({
            ...prev,
            notes: prev.notes.map((n) => (n.id === id ? updated : n)),
        }));
    };

    const deleteNote = (id) => {
        updateDiary((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
    };

    const handleCalendarPick = (date) => {
        setCalendarMonth(date.slice(0, 7));
        onDateChange?.(date);
    };

    const updateWritingStyle = (patch) => {
        setWritingStyle((current) => {
            const next = { ...current, ...patch };
            setJSON(DIARY_WRITING_STYLE_KEY, next);
            return next;
        });
    };

    const handleRichInput = () => {
        if (richEditorComposingRef.current) return;
        const editor = richEditorRef.current;
        if (!editor) return;
        const next = {
            ...(diaryRef.current || diary),
            mainText: editor.innerText || '',
            mainHtml: editor.innerHTML || '',
            lastModified: Date.now(),
        };
        diaryRef.current = next;
        scheduleSave(next);
    };

    const applyDiaryFormat = (command, value = null) => {
        richEditorRef.current?.focus();
        try {
            document.execCommand(command, false, value);
        } catch {
            return;
        }
        handleRichInput();
    };

    const updateActiveTextColor = useCallback(() => {
        const editor = richEditorRef.current;
        if (!fullscreenRef.current || !editor) return;
        const selection = document.getSelection?.();
        if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
        let value = '';
        try {
            value = document.queryCommandValue('foreColor');
        } catch {
            value = '';
        }
        const matched = DIARY_MARK_COLORS.find((color) => isSameColor(color.value, value));
        setActiveTextColor(matched?.value || null);
    }, []);

    const applyDiaryTextColor = (value) => {
        const selectedColor = isSameColor(activeTextColor, value) ? null : value;
        const nextColor = selectedColor || writingSurface.color;
        applyDiaryFormat('foreColor', nextColor);
        setActiveTextColor(selectedColor || null);
    };

    useEffect(() => {
        if (!fullscreen) return undefined;
        document.addEventListener('selectionchange', updateActiveTextColor);
        return () => document.removeEventListener('selectionchange', updateActiveTextColor);
    }, [fullscreen, updateActiveTextColor]);

    // Escape key closes
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // ── Date display ──
    const dateObj = new Date(selectedDate.replace(/-/g, '/'));
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const dateLbl = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 · 周${weekdays[dateObj.getDay()]}`;
    const todayStr = getTodayBJ();
    const summaryByDate = new Map(monthSummary.map((item) => [item.date, item]));
    const calendarCells = buildCalendarCells(calendarMonth);

    const calendarSection = (
        <div className="diary-calendar">
            <div className="diary-calendar-head">
                <button
                    className="diary-calendar-nav"
                    onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                    title="上个月"
                >
                    <ChevronLeft size={13} />
                </button>
                <div className="diary-calendar-title">{getMonthTitle(calendarMonth)}</div>
                <button
                    className="diary-calendar-nav"
                    onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}
                    title="下个月"
                >
                    <ChevronRight size={13} />
                </button>
            </div>
            <div className="diary-calendar-weekdays">
                {CALENDAR_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="diary-calendar-grid">
                {calendarCells.map((cell) => {
                    const summary = summaryByDate.get(cell.date);
                    const hasMain = Boolean(summary?.hasMain);
                    const noteCount = Number(summary?.noteCount) || 0;
                    return (
                        <button
                            key={cell.date}
                            className={[
                                'diary-calendar-cell',
                                cell.inMonth ? '' : 'muted',
                                cell.date === selectedDate ? 'selected' : '',
                                cell.date === todayStr ? 'today' : '',
                                summary?.hasContent ? 'has-content' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => handleCalendarPick(cell.date)}
                            title={`${cell.date}${hasMain ? ' · 有主日记' : ''}${noteCount ? ` · ${noteCount} 条碎碎念` : ''}`}
                        >
                            <span className="diary-calendar-day">{cell.day}</span>
                            {(hasMain || noteCount > 0) && (
                                <span className="diary-calendar-signals">
                                    {hasMain && <span className="diary-calendar-main-dot" />}
                                    {noteCount > 0 && <span className="diary-calendar-note-count">{noteCount}</span>}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const writingControls = (
        <div className="diary-writing-controls">
            <TextExperienceControls
                dense
                fontSize={writingStyle.fontSize}
                lineHeight={writingStyle.lineHeight}
                surface={writingStyle.surface}
                onFontSize={(value) => updateWritingStyle({ fontSize: value })}
                onLineHeight={(value) => updateWritingStyle({ lineHeight: value })}
                onSurface={(value) => updateWritingStyle({ surface: value })}
            />
        </div>
    );

    // ── Render ──
    const mainSection = (
        <div className="diary-main-section">
            {fullscreen && (
                <div className="diary-rich-toolbar">
                    <button
                        onMouseDown={(event) => { event.preventDefault(); applyDiaryFormat('bold'); }}
                        title="加粗"
                    >
                        <Bold size={13} />
                    </button>
                    <button
                        onMouseDown={(event) => { event.preventDefault(); applyDiaryFormat('italic'); }}
                        title="斜体"
                    >
                        <Italic size={13} />
                    </button>
                    <button
                        onMouseDown={(event) => { event.preventDefault(); applyDiaryFormat('underline'); }}
                        title="下划线"
                    >
                        <Underline size={13} />
                    </button>
                    {DIARY_MARK_COLORS.map((color) => (
                        <button
                            key={color.id}
                            className="diary-rich-color"
                            style={{ background: color.value }}
                            onMouseDown={(event) => { event.preventDefault(); applyDiaryFormat('backColor', color.value); }}
                            title={`标色：${color.label}`}
                        />
                    ))}
                    {DIARY_MARK_COLORS.map((color) => (
                        <button
                            key={`text-${color.id}`}
                            className={`diary-rich-color diary-rich-text-color ${isSameColor(activeTextColor, color.value) ? 'active' : ''}`}
                            style={{ '--diary-text-color': color.value }}
                            onMouseDown={(event) => { event.preventDefault(); applyDiaryTextColor(color.value); }}
                            title={`字体色：${color.label}`}
                        >
                            <span className="diary-rich-text-dot" />
                            A
                        </button>
                    ))}
                    <button
                        onMouseDown={(event) => {
                            event.preventDefault();
                            applyDiaryFormat('removeFormat');
                            setActiveTextColor(null);
                        }}
                        title="清除格式"
                    >
                        清除
                    </button>
                </div>
            )}
            {fullscreen ? (
                <div
                    key={selectedDate}
                    ref={richEditorRef}
                    className="diary-rich-editor"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder={`${dateLbl} — 今天发生了什么…`}
                    style={mainTextStyle}
                    onCompositionStart={() => { richEditorComposingRef.current = true; }}
                    onCompositionEnd={() => {
                        richEditorComposingRef.current = false;
                        handleRichInput();
                    }}
                    onMouseUp={updateActiveTextColor}
                    onKeyUp={updateActiveTextColor}
                    onInput={handleRichInput}
                />
            ) : (
                <textarea
                    className="diary-main-textarea"
                    placeholder={`${dateLbl} — 今天发生了什么…`}
                    value={diary.mainText}
                    onChange={(e) => updateDiary({ mainText: e.target.value, mainHtml: plainTextToHtml(e.target.value) })}
                />
            )}
        </div>
    );

    const notesSection = (
        <div className="diary-notes-section">
            <div className="diary-notes-toolbar">
                <span className="diary-notes-label">碎碎念</span>
                <button className="diary-add-note-btn" onClick={addNote}>
                    <Plus size={13} /> 新增
                </button>
            </div>
            <div className="diary-notes-list">
                {diary.notes.length === 0 ? (
                    <div className="diary-notes-empty">还没有碎碎念，点击「新增」开始</div>
                ) : (
                    diary.notes.map((note) => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onChange={(updated) => updateNote(note.id, updated)}
                            onDelete={() => deleteNote(note.id)}
                            textStyle={fullscreen ? noteTextStyle : undefined}
                        />
                    ))
                )}
            </div>
        </div>
    );

    return (
        <div className={`diary-overlay ${fullscreen ? 'diary-overlay-full' : ''}`}
            onClick={!fullscreen ? onClose : undefined}>
            <div
                className={`diary-modal ${fullscreen ? 'diary-modal-full' : 'diary-modal-compact'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="diary-header">
                    <div className="diary-header-left">
                        <BookOpen size={14} className="diary-header-icon" />
                        <span className="diary-header-date">{dateLbl}</span>
                        {saving && <span className="diary-saving-dot" title="保存中…" />}
                        {fsState === 'ready' && !saving && (
                            <span className="diary-saved-dot" title="已保存到 PlanTrace/data/diary" />
                        )}
                    </div>
                    <div className="diary-header-actions">
                        <button
                            className="diary-icon-btn"
                            onClick={() => setFullscreen((v) => !v)}
                            title={fullscreen ? '收起' : '全屏'}
                        >
                            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                        <button className="diary-icon-btn" onClick={onClose} title="关闭">
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* ── Storage state ── */}
                {fsState === 'loading' && (
                    <div className="diary-state-msg">正在准备 PlanTrace/data/diary…</div>
                )}
                {fsState === 'error' && (
                    <div className="diary-state-msg">
                        <div>日记数据文件夹初始化失败。</div>
                        <button className="diary-folder-btn diary-retry-btn" onClick={initializeDiaryStorage}>
                            重新初始化
                        </button>
                    </div>
                )}
                {/* ── Content ── */}
                {fsState === 'ready' && (
                    <>
                        {fullscreen ? (
                            // Full screen: two columns
                            <div className="diary-full-body">
                                <aside className="diary-full-calendar">
                                    {calendarSection}
                                    {writingControls}
                                </aside>
                                {mainSection}
                                <div className="diary-full-divider" />
                                {notesSection}
                            </div>
                        ) : (
                            // Compact: tabs
                            <>
                                <div className="diary-tabs">
                                    <button
                                        className={`diary-tab ${tab === 'main' ? 'active' : ''}`}
                                        onClick={() => setTab('main')}
                                    >主日记</button>
                                    <button
                                        className={`diary-tab ${tab === 'notes' ? 'active' : ''}`}
                                        onClick={() => setTab('notes')}
                                    >
                                        碎碎念
                                        {diary.notes.length > 0 &&
                                            <span className="diary-tab-count">{diary.notes.length}</span>}
                                    </button>
                                </div>
                                <div className="diary-compact-body">
                                    {tab === 'main' ? mainSection : notesSection}
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* ── Footer (folder path hint) ── */}
                {fsState === 'ready' && (
                    <div className="diary-footer">
                        <span className="diary-footer-hint">
                            📁 PlanTrace/data/diary
                            {migrationInfo?.imported > 0 ? ` · 已导入 ${migrationInfo.imported} 篇旧日记` : ''}
                        </span>
                        <button className="diary-footer-change" onClick={handleImportLegacyDir}>导入旧日记</button>
                    </div>
                )}
            </div>
        </div>
    );
}
