import { useMemo, useState } from 'react';
import { Globe2, RotateCcw, Settings, X } from 'lucide-react';
import {
    COMMON_TIMEZONES,
    DEFAULT_TIMEZONE,
    getAppSettings,
    getSystemTimezone,
    isValidTimezone,
    saveAppSettings,
} from '../store/settingsStore.js';
import { flushStorageWrites } from '../store/storage.js';

const LANGUAGE_OPTIONS = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
];

function getTimezoneLabel(timezone) {
    const preset = COMMON_TIMEZONES.find((item) => item.value === timezone);
    return preset ? preset.label : timezone;
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

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-[520px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl border overflow-hidden"
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

                <div className="p-5 space-y-5">
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
