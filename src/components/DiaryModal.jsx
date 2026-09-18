import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, FolderOpen, Plus, Trash2, Check, BookOpen } from 'lucide-react';
import {
    getSavedDirHandle, pickDirectory, verifyPermission,
    readDiary, writeDiary, createEmptyDiary, noteId, clearDirHandle,
} from '../store/diaryStore.js';

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

function getNoteColor(id) {
    return NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[0];
}

function formatNoteTime(ms) {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return `${mo}/${day} ${h}:${m}`;
}

// ---------------------------------------------------------------------------
// NoteCard
// ---------------------------------------------------------------------------
function NoteCard({ note, onChange, onDelete }) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const color = getNoteColor(note.color);

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
                className="diary-note-text"
                value={note.text}
                placeholder="写下随想…"
                onChange={(e) => onChange({ ...note, text: e.target.value })}
                rows={3}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Folder setup banner
// ---------------------------------------------------------------------------
function FolderBanner({ onPick, onRetry }) {
    return (
        <div className="diary-folder-banner">
            <FolderOpen size={18} className="diary-folder-icon" />
            <p className="diary-folder-text">请选择本地文件夹来保存日记(可以新建一个文件夹)</p>
            <button className="diary-folder-btn" onClick={onPick}>选择文件夹</button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main DiaryModal
// ---------------------------------------------------------------------------
export default function DiaryModal({ selectedDate, onClose }) {
    const [fullscreen, setFullscreen] = useState(false);
    const [tab, setTab] = useState('main'); // 'main' | 'notes' (compact mode only)

    // File system state
    const [dirHandle, setDirHandle] = useState(null);
    const [fsState, setFsState] = useState('loading'); // 'loading' | 'ready' | 'nodir' | 'error'

    // Diary data
    const [diary, setDiary] = useState(createEmptyDiary());
    const [saving, setSaving] = useState(false);

    const saveTimerRef = useRef(null);
    const dirRef = useRef(null);
    dirRef.current = dirHandle;

    // ── Load directory handle on mount ──
    useEffect(() => {
        (async () => {
            const handle = await getSavedDirHandle();
            if (!handle) { setFsState('nodir'); return; }
            const ok = await verifyPermission(handle);
            if (!ok) { setFsState('nodir'); return; }
            setDirHandle(handle);
            setFsState('ready');
        })();
    }, []);

    // ── Load diary data when dir and date are ready ──
    useEffect(() => {
        if (fsState !== 'ready' || !dirHandle) return;
        (async () => {
            const data = await readDiary(dirHandle, selectedDate);
            setDiary(data || createEmptyDiary());
        })();
    }, [fsState, dirHandle, selectedDate]);

    // ── Auto-save with 800ms debounce ──
    const scheduleSave = useCallback((data) => {
        if (!dirRef.current) return;
        clearTimeout(saveTimerRef.current);
        setSaving(true);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await writeDiary(dirRef.current, selectedDate, data);
            } catch (e) {
                console.error('Diary save failed:', e);
            } finally {
                setSaving(false);
            }
        }, 800);
    }, [selectedDate]);

    const updateDiary = useCallback((updater) => {
        setDiary((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
            scheduleSave(next);
            return next;
        });
    }, [scheduleSave]);

    const handlePickDir = async () => {
        const handle = await pickDirectory();
        if (!handle) return;
        const ok = await verifyPermission(handle);
        if (ok) { setDirHandle(handle); setFsState('ready'); }
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

    // ── Render ──
    const mainSection = (
        <div className="diary-main-section">
            <textarea
                className="diary-main-textarea"
                placeholder={`${dateLbl} — 今天发生了什么…`}
                value={diary.mainText}
                onChange={(e) => updateDiary({ mainText: e.target.value })}
            />
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
                            <span className="diary-saved-dot" title="已保存到本地" />
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

                {/* ── No folder state ── */}
                {fsState === 'loading' && (
                    <div className="diary-state-msg">正在恢复文件夹权限…</div>
                )}
                {fsState === 'nodir' && <FolderBanner onPick={handlePickDir} />}

                {/* ── Content ── */}
                {fsState === 'ready' && (
                    <>
                        {fullscreen ? (
                            // Full screen: two columns
                            <div className="diary-full-body">
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
                            📁 {dirHandle?.name}
                        </span>
                        <button className="diary-footer-change" onClick={async () => {
                            await clearDirHandle();
                            setDirHandle(null);
                            setFsState('nodir');
                        }}>更换</button>
                    </div>
                )}
            </div>
        </div>
    );
}
