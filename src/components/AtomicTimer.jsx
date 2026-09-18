import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Play, AtomIcon, CheckCircle2, X, BellOff, Bell } from 'lucide-react';
import { getTodayBJ } from '../store/dateUtils.js';
import {
    createAtomicSession,
    completeAtomicSession,
    deleteAtomicSession,
    getTodayCompletedCount,
    getTodaySessions,
    getRunningSession,
    getActiveSessionSS,
    clearActiveSessionSS,
} from '../store/atomicStore.js';

const DEFAULT_HOURS = 1;
const DEFAULT_MINUTES = 30;

function padTwo(n) {
    return String(Math.floor(n)).padStart(2, '0');
}

function formatCountdown(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`;
    return `${padTwo(m)}:${padTwo(s)}`;
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatTime(ms) {
    if (!ms) return '--';
    const d = new Date(ms);
    return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------
async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
}

function fireNotification(label) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification('⚛ 原子时间结束', {
        body: `「${label}」专注时段已完成，记得休息一下。`,
        icon: '/favicon.ico',
        tag: 'atomic-complete',
        requireInteraction: false,
        silent: false,
    });
    setTimeout(() => n.close(), 8000);
}

// Page title flash — draws taskbar attention even without notification permission
function flashTitle(msg) {
    const original = document.title;
    let count = 0;
    const id = setInterval(() => {
        document.title = count % 2 === 0 ? msg : original;
        count++;
        if (count >= 14) { clearInterval(id); document.title = original; }
    }, 600);
}

// ---------------------------------------------------------------------------
// Clock math
// ---------------------------------------------------------------------------
function getHandAngles(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600) % 12;
    const m = Math.floor(totalSeconds / 60) % 60;
    const s = totalSeconds % 60;
    return {
        secAngle:  (s / 60) * 360,
        minAngle:  (m / 60) * 360 + (s / 60) * 6,
        hourAngle: (h / 12) * 360 + (m / 60) * 30,
    };
}

function polar(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClockFace({ totalSeconds, isRunning, isUrgent }) {
    const cx = 80, cy = 80, outerR = 68;
    const { secAngle, minAngle, hourAngle } = getHandAngles(totalSeconds);

    const secTip   = polar(cx, cy, outerR - 8,  secAngle);
    const secTail  = polar(cx, cy, -10, secAngle);
    const minTip   = polar(cx, cy, outerR - 14, minAngle);
    const minTail  = polar(cx, cy, -8,  minAngle);
    const hourTip  = polar(cx, cy, outerR - 26, hourAngle);
    const hourTail = polar(cx, cy, -6,  hourAngle);

    const handColor = isRunning ? 'var(--color-text-primary)' : 'var(--atomic-idle)';
    const secColor  = isRunning
        ? (isUrgent ? 'var(--atomic-urgent)' : 'var(--atomic-progress)')
        : 'var(--atomic-idle)';

    return (
        <svg viewBox="0 0 160 160" className="atomic-clock-svg">
            <circle cx={cx} cy={cy} r={outerR} fill="none"
                stroke="var(--atomic-track)" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r={outerR - 1} fill="var(--atomic-face-bg)" />

            {Array.from({ length: 60 }).map((_, i) => {
                const isMajor = i % 5 === 0;
                const a = i * 6;
                const inner = polar(cx, cy, isMajor ? outerR - 9 : outerR - 5, a);
                const outer = polar(cx, cy, outerR - 2, a);
                return (
                    <line key={i}
                        x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                        stroke={isMajor ? 'var(--atomic-tick-major)' : 'var(--atomic-tick)'}
                        strokeWidth={isMajor ? 1.5 : 0.7}
                        strokeLinecap="round"
                    />
                );
            })}

            {[0, 90, 180, 270].map((angle, i) => {
                const pos = polar(cx, cy, outerR - 17, angle);
                return (
                    <text key={i} x={pos.x} y={pos.y}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize="7" fontWeight="500"
                        fill="var(--atomic-numeral)"
                        fontFamily="system-ui, -apple-system, sans-serif">
                        {['12','3','6','9'][i]}
                    </text>
                );
            })}

            <line x1={hourTail.x} y1={hourTail.y} x2={hourTip.x} y2={hourTip.y}
                stroke={handColor} strokeWidth="3.5" strokeLinecap="round" />
            <line x1={minTail.x} y1={minTail.y} x2={minTip.x} y2={minTip.y}
                stroke={handColor} strokeWidth="2.2" strokeLinecap="round" />
            <line x1={secTail.x} y1={secTail.y} x2={secTip.x} y2={secTip.y}
                stroke={secColor} strokeWidth="1.2" strokeLinecap="round" />

            <circle cx={cx} cy={cy} r={4} fill="var(--color-text-primary)" />
            <circle cx={cx} cy={cy} r={2.5} fill={secColor} />
        </svg>
    );
}

// History panel — date-aware
function HistoryPanel({ date, onClose }) {
    const sessions = getTodaySessions(date).slice().reverse();
    const isToday  = date === getTodayBJ();
    const dateLabel = isToday ? '今日' : date;

    const statusMeta = {
        completed: { label: '完成', cls: 'hist-tag-done' },
        deleted:   { label: '删除', cls: 'hist-tag-del' },
        running:   { label: '进行中', cls: 'hist-tag-run' },
    };

    return (
        <div className="hist-overlay" onClick={onClose}>
            <div className="hist-panel animate-modal-in" onClick={(e) => e.stopPropagation()}>
                <div className="hist-header">
                    <span className="hist-title">{dateLabel} 原子时间</span>
                    <button className="hist-close" onClick={onClose}><X size={14} /></button>
                </div>

                {sessions.length === 0 ? (
                    <div className="hist-empty">该日期没有任何原子时间记录</div>
                ) : (
                    <div className="hist-list">
                        {sessions.map((s) => {
                            const meta   = statusMeta[s.status] || statusMeta.running;
                            const elapsed = s.ended_at
                                ? Math.round((s.ended_at - s.started_at) / 1000)
                                : null;
                            return (
                                <div key={s.session_id} className="hist-item">
                                    <div className="hist-item-top">
                                        <span className="hist-label">{s.label}</span>
                                        <span className={`hist-tag ${meta.cls}`}>{meta.label}</span>
                                    </div>
                                    <div className="hist-item-sub">
                                        <span className="hist-time">
                                            {formatTime(s.started_at)}
                                            {s.ended_at ? ` → ${formatTime(s.ended_at)}` : ''}
                                        </span>
                                        <span className="hist-dur">
                                            计划 {formatDuration(s.planned_seconds)}
                                            {elapsed !== null && s.status !== 'completed'
                                                ? ` · 实际 ${formatDuration(elapsed)}` : ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function DeleteConfirm({ onConfirm, onCancel }) {
    return (
        <div className="atomic-confirm-overlay" onClick={onCancel}>
            <div className="atomic-confirm-box animate-modal-in" onClick={(e) => e.stopPropagation()}>
                <div className="atomic-confirm-icon"><Trash2 size={18} /></div>
                <p className="atomic-confirm-title">删除原子时间？</p>
                <p className="atomic-confirm-desc">本次倒计时将被标记为已删除，不计入完成次数。</p>
                <div className="atomic-confirm-actions">
                    <button className="atomic-btn-cancel" onClick={onCancel}>取消</button>
                    <button className="atomic-btn-danger" onClick={onConfirm}>确认删除</button>
                </div>
            </div>
        </div>
    );
}

function CompletionModal({ label, onClose }) {
    return (
        <div className="atomic-confirm-overlay" onClick={onClose}>
            <div className="atomic-complete-box animate-modal-in" onClick={(e) => e.stopPropagation()}>
                <div className="atomic-complete-icon"><CheckCircle2 size={28} /></div>
                <p className="atomic-complete-title">原子时间结束</p>
                <p className="atomic-complete-label">「{label}」</p>
                <p className="atomic-complete-desc">专注时段已完成，记得休息一下。</p>
                <button className="atomic-btn-primary" onClick={onClose}>好的</button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AtomicTimer({ selectedDate }) {
    const [setupHours,   setSetupHours]   = useState(DEFAULT_HOURS);
    const [setupMinutes, setSetupMinutes] = useState(DEFAULT_MINUTES);
    const [labelInput,   setLabelInput]   = useState('');

    const [session,          setSession]          = useState(null);
    const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_HOURS * 3600 + DEFAULT_MINUTES * 60);

    // Count and history always reflect the SELECTED DATE
    const [displayDate,  setDisplayDate]  = useState(() => selectedDate || getTodayBJ());
    const [todayCount,   setTodayCount]   = useState(() => getTodayCompletedCount(selectedDate || getTodayBJ()));

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [completedSession,  setCompletedSession]  = useState(null);
    const [showHistory,       setShowHistory]       = useState(false);

    // Notification permission state
    const [notifPerm, setNotifPerm] = useState(() =>
        'Notification' in window ? Notification.permission : 'unsupported'
    );

    const intervalRef = useRef(null);
    const sessionRef  = useRef(null);

    // Re-read count whenever selected date changes
    useEffect(() => {
        const d = selectedDate || getTodayBJ();
        setDisplayDate(d);
        setTodayCount(getTodayCompletedCount(d));
    }, [selectedDate]);

    const refreshCount = useCallback(() => {
        const d = selectedDate || getTodayBJ();
        setTodayCount(getTodayCompletedCount(d));
    }, [selectedDate]);

    // Request notification permission once on mount (non-blocking)
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then((p) => setNotifPerm(p));
        }
    }, []);

    const startTick = useCallback((sess, startMs) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        const tick = () => {
            const elapsed   = Math.floor((Date.now() - startMs) / 1000);
            const remaining = Math.max(0, sess.planned_seconds - elapsed);
            setRemainingSeconds(remaining);

            if (remaining <= 0) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                completeAtomicSession(sess.session_id);
                setSession(null);
                sessionRef.current = null;
                setCompletedSession(sess);
                refreshCount();

                // System notification (causes Edge tab + Windows taskbar flash)
                fireNotification(sess.label);
                // Title flash as guaranteed fallback
                flashTitle('⚛ 原子时间结束！');
            }
        };
        tick();
        intervalRef.current = setInterval(tick, 500);
    }, [refreshCount]);

    // Sync idle clock display with sliders
    useEffect(() => {
        if (!session) setRemainingSeconds(setupHours * 3600 + setupMinutes * 60);
    }, [setupHours, setupMinutes, session]);

    // HMR / refresh recovery
    useEffect(() => {
        const activeSS = getActiveSessionSS();
        if (activeSS) {
            const running = getRunningSession();
            if (running) {
                const elapsed   = Math.floor((Date.now() - activeSS.startMs) / 1000);
                const remaining = running.planned_seconds - elapsed;
                if (remaining > 0) {
                    setSession(running);
                    sessionRef.current = running;
                    setRemainingSeconds(remaining);
                    startTick(running, activeSS.startMs);
                } else {
                    completeAtomicSession(running.session_id);
                    setCompletedSession(running);
                    refreshCount();
                }
            } else {
                clearActiveSessionSS();
            }
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleStart = useCallback(() => {
        const totalSeconds = (setupHours * 3600) + (setupMinutes * 60);
        if (totalSeconds <= 0) return;
        const sess = createAtomicSession(labelInput || '专注时间', totalSeconds);
        setSession(sess);
        sessionRef.current = sess;
        setRemainingSeconds(totalSeconds);
        startTick(sess, sess.started_at);
        setLabelInput('');
    }, [setupHours, setupMinutes, labelInput, startTick]);

    const handleDeleteConfirm = useCallback(() => {
        if (!sessionRef.current) return;
        deleteAtomicSession(sessionRef.current.session_id);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setSession(null);
        sessionRef.current = null;
        setRemainingSeconds(setupHours * 3600 + setupMinutes * 60);
        setShowDeleteConfirm(false);
    }, [setupHours, setupMinutes]);

    const handleCompleteClose = useCallback(() => setCompletedSession(null), []);

    const handleRequestNotif = async () => {
        const p = await requestNotificationPermission();
        setNotifPerm(p);
    };

    const isRunning = !!session;
    const isUrgent  = isRunning && remainingSeconds <= 300;
    const isToday   = displayDate === getTodayBJ();

    return (
        <div className="atomic-panel">

            {/* ── Header ── */}
            <div className="atomic-header">
                <div className="atomic-header-left">
                    <AtomIcon size={13} className="atomic-icon" />
                    <span className="atomic-title">
                        {isToday ? '原子时间' : `原子 · ${displayDate.slice(5)}`}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Notification permission indicator */}
                    {notifPerm === 'denied' && (
                        <span className="atomic-notif-badge atomic-notif-denied" title="通知已被拒绝，请在浏览器设置中手动开启">
                            <BellOff size={9} />
                        </span>
                    )}
                    {notifPerm === 'default' && (
                        <button className="atomic-notif-badge atomic-notif-ask"
                            title="点击开启倒计时结束通知"
                            onClick={handleRequestNotif}>
                            <Bell size={9} />
                        </button>
                    )}
                    {notifPerm === 'granted' && (
                        <span className="atomic-notif-badge atomic-notif-ok" title="通知已开启">
                            <Bell size={9} />
                        </span>
                    )}

                    {/* Count badge — shows selected date's count */}
                    <button
                        className="atomic-count-badge"
                        title={`${isToday ? '今日' : displayDate}完成次数，点击查看历史`}
                        onClick={() => setShowHistory(true)}
                    >
                        <CheckCircle2 size={10} />
                        <span>{todayCount}</span>
                    </button>
                </div>
            </div>

            {/* ── Clock face (always real-time) ── */}
            <div className="atomic-clock-wrap">
                <ClockFace
                    totalSeconds={remainingSeconds}
                    isRunning={isRunning}
                    isUrgent={isUrgent}
                />
            </div>

            {/* ── Time info below clock ── */}
            <div className="atomic-time-info">
                <div className={`atomic-time-display
                    ${isUrgent ? 'atomic-time-urgent' : ''}
                    ${!isRunning ? 'atomic-time-idle' : ''}`}>
                    {formatCountdown(remainingSeconds)}
                </div>
                <div className="atomic-session-label">
                    {isRunning ? session.label : '设置时长'}
                </div>
            </div>

            {/* ── Controls (only usable on today) ── */}
            {!isRunning ? (
                <div className="atomic-setup">
                    <div className="atomic-input-wrap">
                        <input
                            className="atomic-label-input"
                            type="text"
                            placeholder="这段时间做什么…"
                            value={labelInput}
                            maxLength={30}
                            onChange={(e) => setLabelInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                        />
                    </div>

                    <div className="atomic-duration-row">
                        <div className="atomic-dur-segment">
                            <button className="atomic-dur-step"
                                onClick={() => setSetupHours(h => Math.max(0, h - 1))}>−</button>
                            <div className="atomic-dur-value">
                                <input
                                    className="atomic-dur-input"
                                    type="number" min={0} max={23}
                                    value={setupHours}
                                    onChange={(e) => setSetupHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                                    onFocus={(e) => e.target.select()}
                                />
                                <span className="atomic-dur-unit">时</span>
                            </div>
                            <button className="atomic-dur-step"
                                onClick={() => setSetupHours(h => Math.min(23, h + 1))}>+</button>
                        </div>
                        <span className="atomic-dur-colon">:</span>
                        <div className="atomic-dur-segment">
                            <button className="atomic-dur-step"
                                onClick={() => setSetupMinutes(m => Math.max(0, m - 1))}>−</button>
                            <div className="atomic-dur-value">
                                <input
                                    className="atomic-dur-input"
                                    type="number" min={0} max={59}
                                    value={setupMinutes}
                                    onChange={(e) => setSetupMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                    onFocus={(e) => e.target.select()}
                                />
                                <span className="atomic-dur-unit">分</span>
                            </div>
                            <button className="atomic-dur-step"
                                onClick={() => setSetupMinutes(m => Math.min(59, m + 1))}>+</button>
                        </div>
                    </div>

                    <button
                        className="atomic-start-btn"
                        onClick={handleStart}
                        disabled={setupHours === 0 && setupMinutes === 0}
                    >
                        <Play size={13} fill="currentColor" />
                        启动
                    </button>
                </div>
            ) : (
                <div className="atomic-running-controls">
                    <span className="atomic-running-hint">进行中，不可暂停</span>
                    <button className="atomic-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 size={12} />
                        删除
                    </button>
                </div>
            )}

            {showDeleteConfirm && (
                <DeleteConfirm
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}
            {completedSession && (
                <CompletionModal
                    label={completedSession.label}
                    onClose={handleCompleteClose}
                />
            )}
            {showHistory && (
                <HistoryPanel
                    date={displayDate}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}
