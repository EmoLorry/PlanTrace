import { useMemo, useState } from 'react';
import { Globe2, History as HistoryIcon, MonitorUp, RotateCcw, Settings, X } from 'lucide-react';
import {
    COMMON_TIMEZONES,
    DEFAULT_TIMEZONE,
    getAppSettings,
    getSystemTimezone,
    isValidTimezone,
    saveAppSettings,
} from '../store/settingsStore.js';
import { flushStorageWrites } from '../store/storage.js';
import { APP_VERSION, normalizeManifest } from '../store/versionStore.js';

const LANGUAGE_OPTIONS = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
];

function getTimezoneLabel(timezone) {
    const preset = COMMON_TIMEZONES.find((item) => item.value === timezone);
    return preset ? preset.label : timezone;
}

function formatReleaseDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function SettingsModal({ onClose }) {
    const initialSettings = useMemo(() => getAppSettings(), []);
    const systemTimezone = useMemo(() => getSystemTimezone(), []);
    const initialTimezonePreset = COMMON_TIMEZONES.some((item) => item.value === initialSettings.timezone)
        ? initialSettings.timezone
        : DEFAULT_TIMEZONE;
    const [language, setLanguage] = useState(initialSettings.language);
    const [timezone, setTimezone] = useState(initialTimezonePreset);
    const [customTimezone, setCustomTimezone] = useState(
        COMMON_TIMEZONES.some((item) => item.value === initialSettings.timezone)
            ? ''
            : initialSettings.timezone,
    );
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [shortcutStatus, setShortcutStatus] = useState({ state: 'idle', message: '' });
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [versionHistory, setVersionHistory] = useState([]);
    const [versionHistoryStatus, setVersionHistoryStatus] = useState('idle');

    const effectiveTimezone = customTimezone.trim() || timezone;
    const hasChanges = (
        language !== initialSettings.language
        || effectiveTimezone !== initialSettings.timezone
    );

    const handleUseSystemTimezone = () => {
        if (COMMON_TIMEZONES.some((item) => item.value === systemTimezone)) {
            setTimezone(systemTimezone);
            setCustomTimezone('');
        } else {
            setTimezone(DEFAULT_TIMEZONE);
            setCustomTimezone(systemTimezone);
        }
        setError('');
    };

    const handleUseLegacyTimezone = () => {
        setTimezone(DEFAULT_TIMEZONE);
        setCustomTimezone('');
        setError('');
    };

    const handleSave = async () => {
        const nextTimezone = effectiveTimezone.trim();
        if (!isValidTimezone(nextTimezone)) {
            setError('时区名称无效，请使用 IANA 时区名称，例如 Asia/Shanghai 或 America/New_York。');
            return;
        }

        setSaving(true);
        try {
            saveAppSettings({
                language,
                timezone: nextTimezone,
            });
            await flushStorageWrites();
        } catch (err) {
            setSaving(false);
            setError(err.message || '设置保存失败，请稍后再试。');
            return;
        }

        window.location.reload();
    };

    const handleCreateDesktopLauncher = async () => {
        setShortcutStatus({ state: 'loading', message: '正在刷新桌面入口...' });
        try {
            const res = await fetch('/api/system/desktop-launcher', { method: 'POST' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || payload.success === false) {
                throw new Error(payload.error || '桌面入口创建失败。');
            }
            setShortcutStatus({
                state: 'success',
                message: payload.platform === 'darwin'
                    ? '已刷新桌面 PlanTrace.app 和备用 .command。'
                    : '已刷新桌面 PlanTrace 快捷方式。',
            });
        } catch (err) {
            setShortcutStatus({
                state: 'error',
                message: err.message || '桌面入口创建失败，请稍后再试。',
            });
        }
    };

    const loadVersionHistory = async () => {
        setVersionHistoryStatus('loading');
        try {
            const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('无法读取本地版本记录。');
            const manifest = normalizeManifest(await res.json());
            setVersionHistory(Array.isArray(manifest.history) ? manifest.history : []);
            setVersionHistoryStatus('ready');
        } catch (err) {
            setVersionHistory([]);
            setVersionHistoryStatus(err.message || 'error');
        }
    };

    const handleToggleVersionHistory = () => {
        const next = !showVersionHistory;
        setShowVersionHistory(next);
        if (next && versionHistoryStatus === 'idle') {
            loadVersionHistory();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-[620px] max-w-[calc(100vw-32px)] max-h-[88vh] rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
                style={{
                    background: 'var(--th-modal-bg)',
                    borderColor: 'var(--th-glass-border)',
                    color: 'var(--color-text-primary)',
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div
                    className="flex items-center justify-between px-5 py-4 border-b"
                    style={{ borderColor: 'var(--th-divider)' }}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--th-hover)', color: 'var(--color-accent)' }}
                        >
                            <Settings size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold">设置</h2>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                语言、时区和本地使用偏好
                            </p>
                        </div>
                    </div>
                    <button
                        className="p-2 rounded-lg transition-all hover:bg-[var(--th-hover)]"
                        onClick={onClose}
                        aria-label="关闭设置"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-5 overflow-y-auto">
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Globe2 size={16} style={{ color: 'var(--color-accent)' }} />
                            <span>应用时区</span>
                        </div>

                        <div className="grid gap-3">
                            <label className="grid gap-1.5 text-xs">
                                <span style={{ color: 'var(--color-text-muted)' }}>常用时区</span>
                                <select
                                    value={timezone}
                                    onChange={(event) => {
                                        setTimezone(event.target.value);
                                        setCustomTimezone('');
                                        setError('');
                                    }}
                                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none bg-transparent"
                                    style={{ borderColor: 'var(--th-input-border)' }}
                                >
                                    {COMMON_TIMEZONES.map((item) => (
                                        <option key={item.value} value={item.value}>
                                            {item.label} ({item.value})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="grid gap-1.5 text-xs">
                                <span style={{ color: 'var(--color-text-muted)' }}>自定义 IANA 时区</span>
                                <input
                                    value={customTimezone}
                                    onChange={(event) => {
                                        setCustomTimezone(event.target.value);
                                        setError('');
                                    }}
                                    placeholder="例如 America/New_York"
                                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none bg-transparent"
                                    style={{ borderColor: 'var(--th-input-border)' }}
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:bg-[var(--th-hover)]"
                                style={{ color: 'var(--color-accent)' }}
                                onClick={handleUseSystemTimezone}
                            >
                                <RotateCcw size={14} />
                                使用系统时区：{systemTimezone}
                            </button>
                            <button
                                className="rounded-lg px-3 py-2 text-xs font-medium transition-all hover:bg-[var(--th-hover)]"
                                style={{ color: 'var(--color-text-muted)' }}
                                onClick={handleUseLegacyTimezone}
                            >
                                回到北京时间
                            </button>
                        </div>

                        <p className="text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                            当前应用时区：{getTimezoneLabel(effectiveTimezone)}。老用户首次升级会继续使用北京时间；
                            切换时区后，真实时间戳不变，只改变“今天”、跨 0 点、周视图和时间显示的解释方式。
                        </p>
                    </section>

                    <section className="space-y-3">
                        <div className="text-sm font-semibold">语言</div>
                        <label className="grid gap-1.5 text-xs">
                            <span style={{ color: 'var(--color-text-muted)' }}>界面语言偏好</span>
                            <select
                                value={language}
                                onChange={(event) => setLanguage(event.target.value)}
                                className="w-full rounded-xl border px-3 py-2 text-sm outline-none bg-transparent"
                                style={{ borderColor: 'var(--th-input-border)' }}
                            >
                                {LANGUAGE_OPTIONS.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <p className="text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                            语言设置已封装为独立偏好项；完整英文界面可以后续逐步接入，不影响当前中文体验。
                        </p>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <MonitorUp size={16} style={{ color: 'var(--color-accent)' }} />
                            <span>本机维护</span>
                        </div>
                        <div
                            className="rounded-2xl border p-3 space-y-3"
                            style={{ borderColor: 'var(--th-divider)', background: 'var(--th-glass-subtle-bg)' }}
                        >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-sm font-semibold">桌面入口</div>
                                    <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                        Windows 会刷新桌面快捷方式；macOS 会刷新桌面 PlanTrace.app 和备用启动文件。
                                    </p>
                                </div>
                                <button
                                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all disabled:opacity-60"
                                    style={{ background: 'var(--color-accent)' }}
                                    onClick={handleCreateDesktopLauncher}
                                    disabled={shortcutStatus.state === 'loading'}
                                >
                                    {shortcutStatus.state === 'loading' ? '处理中...' : '添加/刷新桌面入口'}
                                </button>
                            </div>
                            {shortcutStatus.message && (
                                <div
                                    className="rounded-xl border px-3 py-2 text-xs"
                                    style={{
                                        borderColor: shortcutStatus.state === 'error' ? 'rgba(248,113,113,0.35)' : 'var(--th-divider)',
                                        color: shortcutStatus.state === 'error' ? '#ef4444' : 'var(--color-text-secondary)',
                                    }}
                                >
                                    {shortcutStatus.message}
                                </div>
                            )}
                        </div>

                        <div
                            className="rounded-2xl border p-3 space-y-3"
                            style={{ borderColor: 'var(--th-divider)', background: 'var(--th-glass-subtle-bg)' }}
                        >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-sm font-semibold">历史版本</div>
                                    <p className="mt-1 text-xs leading-5" style={{ color: 'var(--color-text-muted)' }}>
                                        当前版本：v{APP_VERSION}。这里读取本地版本清单，不需要连接 GitHub。
                                    </p>
                                </div>
                                <button
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:bg-[var(--th-hover)]"
                                    style={{ color: 'var(--color-accent)' }}
                                    onClick={handleToggleVersionHistory}
                                >
                                    <HistoryIcon size={14} />
                                    {showVersionHistory ? '收起' : '查看历史版本'}
                                </button>
                            </div>

                            {showVersionHistory && (
                                <div className="max-h-72 overflow-y-auto pr-1 space-y-3">
                                    {versionHistoryStatus === 'loading' && (
                                        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>正在读取版本记录...</div>
                                    )}
                                    {versionHistoryStatus !== 'loading' && versionHistoryStatus !== 'ready' && (
                                        <div className="text-xs text-red-500">{versionHistoryStatus}</div>
                                    )}
                                    {versionHistoryStatus === 'ready' && versionHistory.map((entry) => (
                                        <div key={entry.version} className="border-t pt-3" style={{ borderColor: 'var(--th-divider)' }}>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-xs font-bold">v{entry.version}</span>
                                                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatReleaseDate(entry.releaseDate)}
                                                </span>
                                            </div>
                                            {entry.releaseNotes?.length > 0 && (
                                                <ul className="mt-2 list-disc pl-4 text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                                                    {entry.releaseNotes.map((note, index) => (
                                                        <li key={`${entry.version}-${index}`}>{note}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                            {error}
                        </div>
                    )}
                </div>

                <div
                    className="flex items-center justify-end gap-2 px-5 py-4 border-t"
                    style={{ borderColor: 'var(--th-divider)' }}
                >
                    <button
                        className="rounded-xl px-4 py-2 text-sm transition-all hover:bg-[var(--th-hover)]"
                        onClick={onClose}
                    >
                        取消
                    </button>
                    <button
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--color-accent)' }}
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                    >
                        {saving ? '保存中...' : '保存并刷新'}
                    </button>
                </div>
            </div>
        </div>
    );
}
