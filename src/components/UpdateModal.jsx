import { useState, useRef } from 'react';
import { X, Download, RefreshCw, ChevronRight, Sparkles, CheckCircle2, AlertCircle, Loader } from 'lucide-react';
import { APP_VERSION, dismissVersion } from '../store/versionStore.js';

/**
 * UpdateModal
 * Props:
 *   manifest  — { version, releaseDate, releaseNotes[], downloadUrl }
 *   onClose   — close without action
 *   onSkip    — skip this version (dismisses permanently)
 *   isManual  — opened by the toolbar button (hide "跳过" option)
 */
export default function UpdateModal({ manifest, onClose, onSkip, isManual = false }) {
    const [phase, setPhase]       = useState('idle'); // idle | updating | done | error
    const [progress, setProgress] = useState([]);
    const [currentStep, setCurrentStep] = useState('');
    const scrollRef = useRef(null);

    if (!manifest) return null;

    const { version, releaseDate, releaseNotes = [] } = manifest;

    // ── Helpers ──────────────────────────────────────────────────────────────

    const fmtDate = (s) => {
        if (!s) return '';
        const d = new Date(s.replace(/-/g, '/'));
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    };

    const appendLog = (msg) => {
        setProgress((p) => {
            const next = [...p, msg];
            // keep last 200 lines
            return next.length > 200 ? next.slice(-200) : next;
        });
        // auto-scroll
        requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
    };

    // ── Auto-update via SSE stream ────────────────────────────────────────────

    const handleAutoUpdate = async () => {
        setPhase('updating');
        setProgress([]);
        setCurrentStep('准备中...');

        try {
            const resp = await fetch('/api/update/apply', { method: 'POST' });
            if (!resp.ok || !resp.body) throw new Error(`服务器响应异常 (${resp.status})`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines: each message is "data: {...}\n\n"
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? ''; // keep incomplete tail

                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    try {
                        const payload = JSON.parse(line.slice(5).trim());
                        if (payload.type === 'step') {
                            setCurrentStep(payload.message);
                            appendLog(`\n▶ ${payload.message}`);
                        } else if (payload.type === 'progress') {
                            appendLog(payload.message);
                        } else if (payload.type === 'done') {
                            appendLog(`\n✅ ${payload.message}`);
                            setCurrentStep(payload.message);
                            setPhase('done');
                        } else if (payload.type === 'error') {
                            appendLog(`\n❌ ${payload.message}`);
                            setCurrentStep(payload.message);
                            setPhase('error');
                        }
                    } catch { /* malformed JSON, skip */ }
                }
            }
            // If stream ended without explicit done/error, check phase
            setPhase((p) => p === 'updating' ? 'error' : p);
        } catch (err) {
            appendLog(`\n❌ ${err.message}`);
            setCurrentStep('连接更新服务失败，请确保 PlanTrace 服务正在运行');
            setPhase('error');
        }
    };

    // ── Render: updating / done / error screens ───────────────────────────────

    if (phase !== 'idle') {
        return (
            <div className="upd-overlay">
                <div className="upd-card">
                    {/* Header */}
                    <div className="upd-header">
                        <div className="upd-header-left">
                            <div className={`upd-icon-wrap ${phase === 'error' ? 'upd-icon-error' : ''}`}>
                                {phase === 'updating' && <Loader size={16} className="upd-spin" />}
                                {phase === 'done'     && <CheckCircle2 size={16} />}
                                {phase === 'error'    && <AlertCircle size={16} />}
                            </div>
                            <div>
                                <div className="upd-title">
                                    {phase === 'updating' && '正在更新 PlanTrace...'}
                                    {phase === 'done'     && '更新成功！'}
                                    {phase === 'error'    && '更新遇到问题'}
                                </div>
                                <div className="upd-subtitle">{currentStep}</div>
                            </div>
                        </div>
                        {phase !== 'updating' && (
                            <button className="upd-close" onClick={onClose}><X size={15} /></button>
                        )}
                    </div>

                    {/* Progress log */}
                    <div className="upd-log" ref={scrollRef}>
                        {progress.map((line, i) => (
                            <div key={i} className={`upd-log-line ${line.startsWith('\n▶') ? 'upd-log-step' : ''}`}>
                                {line}
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="upd-actions">
                        {phase === 'done' && (
                            <>
                                <div style={{ flex: 1 }} />
                                <button className="upd-btn-download" onClick={() => window.location.reload()}>
                                    <RefreshCw size={14} />
                                    刷新页面
                                </button>
                            </>
                        )}
                        {phase === 'error' && (
                            <>
                                <button className="upd-btn-later" onClick={() => setPhase('idle')}>← 返回</button>
                                <div style={{ flex: 1 }} />
                                <button className="upd-btn-download" onClick={handleAutoUpdate} title="重新尝试更新">
                                    <RefreshCw size={14} />
                                    重试
                                </button>
                            </>
                        )}
                        {phase === 'updating' && (
                            <div className="upd-updating-hint">
                                更新中，请勿关闭此窗口…
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Render: idle (version info) ───────────────────────────────────────────

    const handleSkip = () => {
        dismissVersion(version);
        onSkip?.();
        onClose();
    };

    return (
        <div className="upd-overlay" onClick={onClose}>
            <div className="upd-card" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="upd-header">
                    <div className="upd-header-left">
                        <div className="upd-icon-wrap">
                            <Sparkles size={16} />
                        </div>
                        <div>
                            <div className="upd-title">发现新版本</div>
                            <div className="upd-subtitle">{fmtDate(releaseDate)} 发布</div>
                        </div>
                    </div>
                    <button className="upd-close" onClick={onClose}><X size={15} /></button>
                </div>

                {/* Version banner */}
                <div className="upd-version-banner">
                    <div className="upd-ver-block upd-ver-current">
                        <div className="upd-ver-label">当前版本</div>
                        <div className="upd-ver-num">v{APP_VERSION}</div>
                    </div>
                    <ChevronRight size={18} className="upd-arrow" />
                    <div className="upd-ver-block upd-ver-new">
                        <div className="upd-ver-label">最新版本</div>
                        <div className="upd-ver-num">v{version}</div>
                    </div>
                </div>

                {/* Release notes */}
                {releaseNotes.length > 0 && (
                    <div className="upd-notes">
                        <div className="upd-notes-title">更新内容</div>
                        <ul className="upd-notes-list">
                            {releaseNotes.map((note, i) => (
                                <li key={i} className="upd-note-item">
                                    <span className="upd-note-dot" />{note}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Actions */}
                <div className="upd-actions">
                    {!isManual && (
                        <button className="upd-btn-skip" onClick={handleSkip}>
                            跳过此版本
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button className="upd-btn-later" onClick={onClose}>稍后再说</button>
                    <button className="upd-btn-download" onClick={handleAutoUpdate} title="下载并应用最新版本">
                        <Download size={14} />
                        一键更新
                    </button>
                </div>

                {/* Hint */}
                <div className="upd-hint">
                    <RefreshCw size={10} />
                    点击「一键更新」将自动下载并应用新版本，用户数据不受影响
                </div>
            </div>
        </div>
    );
}
