import { useState, useRef, useEffect, useCallback } from 'react';
import { Hammer, Trash2, Edit2, Plus, Check, X } from 'lucide-react';
import {
    isToday,
    formatTimeBJ,
    getNextMidnightMsBJ,
    isEndOfDayBJ,
    getStartOfDayMsBJ,
    getTodayBJ,
    shiftDate,
} from '../store/dateUtils.js';
import { getAllLogs, getHammerCount } from '../store/actionLogStore.js';
import { getTimeSpent, isTaskCompletedOnDate } from '../store/taskStore.js';

// ---------------------------------------------------------------------------
// sessionStorage helpers — persist active timer start times across HMR reloads.
// Key: 'plantrace_active_timers'  Value: { [taskId]: startTimeMs }
// sessionStorage survives HMR/page-reload but is cleared when the tab closes.
// ---------------------------------------------------------------------------
const ACTIVE_TIMERS_KEY = 'plantrace_active_timers';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function minuteToText(minute) {
    const normalized = Math.max(0, Number(minute) || 0);
    const hour = Math.floor(normalized / 60);
    const min = normalized % 60;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function getManualRangeMeta(dateStr) {
    const dayStart = getStartOfDayMsBJ(dateStr);
    const dayEnd = getStartOfDayMsBJ(shiftDate(dateStr, 1));
    const dayMinutes = Math.max(1, Math.round((dayEnd - dayStart) / 60000));
    const today = getTodayBJ();
    let capMinute = dateStr > today ? 0 : dayMinutes;

    if (dateStr === today) {
        capMinute = clamp(Math.floor((Date.now() - dayStart) / 60000), 0, dayMinutes);
    }

    return { dayStart, dayMinutes, capMinute };
}

function getCurrentAppMinute() {
    const today = getTodayBJ();
    const dayStart = getStartOfDayMsBJ(today);
    return Math.floor((Date.now() - dayStart) / 60000);
}

function getDefaultManualRange(dateStr) {
    const meta = getManualRangeMeta(dateStr);
    if (meta.capMinute <= 0) return { startMinute: 0, endMinute: 0 };

    const defaultEnd = clamp(getCurrentAppMinute(), 1, meta.capMinute);
    const endMinute = Math.max(1, defaultEnd);
    const startMinute = Math.max(0, endMinute - 60);
    return { startMinute, endMinute };
}

function getHammerIntervalsForTaskDate(taskId, dateStr) {
    return getAllLogs()
        .filter((log) => (
            log?.task_id === taskId
            && log.action_type === 'HAMMER'
            && log.target_date === dateStr
        ))
        .map((log) => {
            const endMs = Number(log.timestamp) || 0;
            const durationSeconds = Number(log.duration_seconds) || 0;
            const startMs = endMs - durationSeconds * 1000;
            return { startMs, endMs };
        })
        .filter((interval) => interval.endMs > interval.startMs)
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function findOverlappingHammerInterval(intervals, startMs, endMs) {
    return intervals.find((interval) => startMs < interval.endMs && endMs > interval.startMs) || null;
}

function getActiveTimers() {
    try {
        const raw = sessionStorage.getItem(ACTIVE_TIMERS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function setActiveTimer(taskId, startTimeMs) {
    const timers = getActiveTimers();
    timers[taskId] = startTimeMs;
    sessionStorage.setItem(ACTIVE_TIMERS_KEY, JSON.stringify(timers));
}

function clearActiveTimer(taskId) {
    const timers = getActiveTimers();
    delete timers[taskId];
    sessionStorage.setItem(ACTIVE_TIMERS_KEY, JSON.stringify(timers));
}

// Pen icon for pending tasks
function PenIcon({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
        </svg>
    );
}

// Animated checkmark icon for completed tasks
function CheckIcon({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                strokeLinejoin="round" opacity="0.2" />
            <path d="M6 13l4 4 8-10"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round" className="animate-check-draw" />
        </svg>
    );
}

// Format seconds to human readable: "1h 23m" or "5m 30s" or "30s"
function formatDuration(totalSeconds) {
    if (totalSeconds <= 0) return '0s';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// Format seconds to MM:SS for live timer display
function formatTimerDisplay(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TaskItem({ task, selectedDate, onComplete, onEditContent, onTimerStop, onDelete }) {
    const isTodayDate = isToday(selectedDate);
    const isCompleted = isTaskCompletedOnDate(task, selectedDate);
    const isPending = task.status !== 'deleted' && !isCompleted;
    const hammerCount = getHammerCount(task.id, selectedDate);
    const savedTimeSpent = getTimeSpent(task.id, selectedDate);
    const existingHammerIntervals = getHammerIntervalsForTaskDate(task.id, selectedDate);

    // Timer state (component-local, only persisted on stop)
    const [isTimerOn, setIsTimerOn] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const intervalRef = useRef(null);
    const startTimeRef = useRef(null);
    const endOfDayTimeoutRef = useRef(null);
    const attachIntervalRef = useRef(null);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(task.content);

    // Manual Hammer backfill state
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [manualStartMinute, setManualStartMinute] = useState(() => getDefaultManualRange(selectedDate).startMinute);
    const [manualEndMinute, setManualEndMinute] = useState(() => getDefaultManualRange(selectedDate).endMinute);
    const [manualError, setManualError] = useState('');

    // Keep a ref to onTimerStop to avoid stale-closure in cleanup/event handlers
    const onTimerStopRef = useRef(onTimerStop);
    useEffect(() => { onTimerStopRef.current = onTimerStop; }, [onTimerStop]);

    const resetManualRange = useCallback(() => {
        const nextRange = getDefaultManualRange(selectedDate);
        setManualStartMinute(nextRange.startMinute);
        setManualEndMinute(nextRange.endMinute);
        setManualError('');
    }, [selectedDate]);

    useEffect(() => {
        if (isManualOpen) resetManualRange();
    }, [isManualOpen, resetManualRange]);

    // Internal helper: flush elapsed time to the store.
    // Reads startTime from sessionStorage first for accuracy after HMR / sleep.
    const flushTimer = useCallback((taskId, endMs = Date.now(), { keepRunning = false } = {}) => {
        const persistedStart = getActiveTimers()[taskId];
        const startTime = persistedStart ?? startTimeRef.current;
        if (keepRunning) {
            setActiveTimer(taskId, endMs);
            startTimeRef.current = endMs;
        } else {
            clearActiveTimer(taskId);
            startTimeRef.current = null;
        }
        const elapsed = startTime ? Math.floor((endMs - startTime) / 1000) : 0;
        if (elapsed > 0) {
            onTimerStopRef.current(taskId, {
                startMs: startTime,
                endMs: startTime + elapsed * 1000,
            });
        }
        return elapsed;
    }, []);

    // Stop timer: persist data and reset state
    const stopTimer = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (endOfDayTimeoutRef.current) {
            clearTimeout(endOfDayTimeoutRef.current);
            endOfDayTimeoutRef.current = null;
        }

        setIsTimerOn(false);
        setElapsedSeconds(0);

        // flushTimer reads startTime from sessionStorage (accurate after HMR/sleep)
        flushTimer(task.id);
    }, [task.id, flushTimer]);

    // Internal: rebuild the interval + end-of-day timeout from an existing startTime.
    // Used both by startTimer and by the HMR-recovery useEffect.
    const attachInterval = useCallback((startTime) => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        if (endOfDayTimeoutRef.current) clearTimeout(endOfDayTimeoutRef.current);
        const boundary = getNextMidnightMsBJ(startTime);
        const msRemaining = Math.max(0, boundary - Date.now());
        endOfDayTimeoutRef.current = setTimeout(() => {
            flushTimer(task.id, boundary, { keepRunning: true });
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - boundary) / 1000)));
            attachIntervalRef.current?.(boundary);
        }, msRemaining);
    }, [flushTimer, task.id]);

    useEffect(() => {
        attachIntervalRef.current = attachInterval;
    }, [attachInterval]);

    const reconcileMidnightBoundary = useCallback(() => {
        const persistedStart = getActiveTimers()[task.id];
        const startTime = persistedStart ?? startTimeRef.current;
        if (!startTime) return false;

        const boundary = getNextMidnightMsBJ(startTime);
        if (Date.now() < boundary) return false;

        flushTimer(task.id, boundary, { keepRunning: true });
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - boundary) / 1000)));
        attachIntervalRef.current?.(boundary);
        return true;
    }, [flushTimer, task.id]);

    // Start timer
    const startTimer = useCallback(() => {
        if (isEndOfDayBJ()) return; // Don't allow starting at 23:59:59+

        const startTime = Date.now();
        startTimeRef.current = startTime;
        // Persist start time to sessionStorage so HMR reload can recover it
        setActiveTimer(task.id, startTime);

        setIsTimerOn(true);
        setElapsedSeconds(0);
        attachInterval(startTime);
    }, [task.id, attachInterval]);

    // Toggle handler
    const handleHammerToggle = () => {
        if (!isTodayDate || !isPending) return;
        if (isTimerOn) {
            stopTimer();
        } else {
            startTimer();
        }
    };

    const handleManualToggle = () => {
        if (isTimerOn) return;
        if (!isManualOpen) resetManualRange();
        setIsManualOpen((value) => !value);
    };

    const handleManualStartChange = (event) => {
        const meta = getManualRangeMeta(selectedDate);
        const maxStart = Math.max(0, meta.capMinute - 1);
        const nextStart = clamp(Number(event.target.value), 0, maxStart);
        setManualError('');
        setManualStartMinute(nextStart);
        setManualEndMinute((currentEnd) => clamp(Math.max(currentEnd, nextStart + 1), nextStart + 1, meta.capMinute));
    };

    const handleManualEndChange = (event) => {
        const meta = getManualRangeMeta(selectedDate);
        const nextEnd = clamp(Number(event.target.value), 1, meta.capMinute);
        setManualError('');
        setManualEndMinute(nextEnd);
        setManualStartMinute((currentStart) => clamp(Math.min(currentStart, nextEnd - 1), 0, nextEnd - 1));
    };

    const handleManualSave = () => {
        const meta = getManualRangeMeta(selectedDate);
        if (meta.capMinute <= 0) {
            setManualError(selectedDate > getTodayBJ() ? '不能补录未来日期的 Hammer。' : '当前还没有可补录的过去时间。');
            return;
        }

        const startMinute = clamp(manualStartMinute, 0, Math.max(0, meta.capMinute - 1));
        const endMinute = clamp(manualEndMinute, startMinute + 1, meta.capMinute);
        if (endMinute <= startMinute) {
            setManualError('结束时间必须晚于开始时间。');
            return;
        }

        const startMs = meta.dayStart + startMinute * 60000;
        const endMs = meta.dayStart + endMinute * 60000;
        const overlappingInterval = findOverlappingHammerInterval(
            getHammerIntervalsForTaskDate(task.id, selectedDate),
            startMs,
            endMs,
        );
        if (overlappingInterval) {
            setManualError(`不能和已有 Hammer 重叠：${formatTimeBJ(overlappingInterval.startMs)}-${formatTimeBJ(overlappingInterval.endMs)}`);
            return;
        }

        onTimerStop(task.id, {
            startMs,
            endMs,
        });
        setIsManualOpen(false);
        setManualError('');
    };

    // ---------------------------------------------------------------------------
    // Layer 1 — HMR / Refresh Recovery: on mount, check sessionStorage for a
    // persisted startTime. If found, silently restore the running timer state
    // so the timer continues from where it left off.
    // Cross-midnight time is automatically flushed and continued on the new day.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        const persistedStart = getActiveTimers()[task.id];
        if (persistedStart) {
            startTimeRef.current = persistedStart;
            setIsTimerOn(true);
            setElapsedSeconds(Math.floor((Date.now() - persistedStart) / 1000));
            attachInterval(persistedStart);
        }

        return () => {
            // Only clear intervals on unmount; sessionStorage is left intact
            // so HMR remount or route-back can restore the running state.
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (endOfDayTimeoutRef.current) clearTimeout(endOfDayTimeoutRef.current);
            startTimeRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally mount-only

    // ---------------------------------------------------------------------------
    // Layer 2 — Sleep/Wake: after the device wakes from sleep, setInterval ticks
    // may have been suspended. Re-sync elapsed display from the real clock.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        const syncTimerAfterWake = () => {
            const persistedStart = getActiveTimers()[task.id];
            const startTime = persistedStart ?? startTimeRef.current;
            if (!startTime) return;

            if (!reconcileMidnightBoundary()) {
                setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') syncTimerAfterWake();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', syncTimerAfterWake);
        window.addEventListener('pageshow', syncTimerAfterWake);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', syncTimerAfterWake);
            window.removeEventListener('pageshow', syncTimerAfterWake);
        };
    }, [reconcileMidnightBoundary, task.id]);

    // NOTE: beforeunload is intentionally NOT registered here.
    // It lives at the App level (App.jsx) so it remains active even when
    // the user navigates to a different route (TaskItem unmounts, but App persists).

    // Editing handlers
    const handleEditStart = () => {
        if (!isPending) return; // Only allow editing pending tasks
        setIsEditing(true);
        setEditValue(task.content);
    };

    const handleEditSave = () => {
        if (editValue.trim() && editValue.trim() !== task.content) {
            onEditContent(task.id, editValue.trim());
        } else {
            setEditValue(task.content);
        }
        setIsEditing(false);
    };

    const handleEditCancel = () => {
        setEditValue(task.content);
        setIsEditing(false);
    };

    const handleEditKeyDown = (e) => {
        if (e.key === 'Enter') handleEditSave();
        if (e.key === 'Escape') handleEditCancel();
    };

    const handleComplete = () => {
        if (!isPending) return;
        // Stop timer first if running
        if (isTimerOn) stopTimer();
        onComplete(task.id, selectedDate);
    };

    const handleDelete = () => {
        const ok = window.confirm(`确认删除这个任务在 ${selectedDate} 的记录吗？\n\n${task.content}\n\n不会直接清空其他日期的同名继承记录。`);
        if (!ok) return;
        // Stop timer first if running
        if (isTimerOn) stopTimer();
        onDelete(task.id);
    };

    const manualMeta = getManualRangeMeta(selectedDate);
    const displayStartMinute = clamp(manualStartMinute, 0, Math.max(0, manualMeta.capMinute - 1));
    const displayEndMinute = manualMeta.capMinute <= 0
        ? 0
        : clamp(manualEndMinute, displayStartMinute + 1, Math.max(displayStartMinute + 1, manualMeta.capMinute));
    const manualDurationSeconds = Math.max(0, displayEndMinute - displayStartMinute) * 60;
    const manualStartMs = manualMeta.dayStart + displayStartMinute * 60000;
    const manualEndMs = manualMeta.dayStart + displayEndMinute * 60000;
    const overlappingManualInterval = manualMeta.capMinute > 0
        ? findOverlappingHammerInterval(existingHammerIntervals, manualStartMs, manualEndMs)
        : null;
    const canEditManualRange = manualMeta.capMinute > 0 && !isTimerOn;
    const canSaveManualBackfill = canEditManualRange && !overlappingManualInterval;

    return (
        <div className={`group glass-subtle px-4 py-3.5 transition-all duration-200
            hover:bg-white/90 hover:shadow-sm animate-fade-in
            ${isCompleted ? 'opacity-55' : ''}
            ${isTimerOn ? 'ring-1 ring-amber/30 bg-amber-light/30' : ''}
        `}>
            <div className="flex items-center gap-3">
            {/* Status Icon */}
            <button
                onClick={handleComplete}
                disabled={isCompleted}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all
                    ${isCompleted
                        ? 'text-green cursor-default'
                        : 'text-text-muted hover:text-accent hover:bg-accent-light cursor-pointer'
                    }
                `}
                title={isCompleted ? '已完成' : '点一下完成这个任务'}
                aria-label={isCompleted ? '已完成' : '完成这个任务'}
            >
                {isCompleted ? <CheckIcon className="w-5 h-5" /> : <PenIcon className="w-5 h-5" />}
            </button>

            {/* Task Content */}
            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleEditSave}
                        onKeyDown={handleEditKeyDown}
                        className="w-full text-sm leading-relaxed bg-transparent outline-none border-b border-accent/30 focus:border-accent text-text-primary transition-colors"
                    />
                ) : (
                    <p
                        onDoubleClick={handleEditStart}
                        title={isPending ? '双击编辑任务名称' : undefined}
                        className={`text-sm leading-relaxed ${isCompleted ? 'line-through text-text-muted' : 'text-text-primary'} ${isPending ? 'cursor-text' : ''}`}
                    >
                        {task.content}
                    </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-text-muted">
                        {formatTimeBJ(task.created_at)}
                    </span>
                    {hammerCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber bg-amber-light px-1.5 py-0.5 rounded-full font-medium">
                            <Hammer size={9} />
                            {hammerCount}
                        </span>
                    )}
                    {(savedTimeSpent > 0 || isTimerOn) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber bg-amber-light px-1.5 py-0.5 rounded-full font-medium">
                            ⏱ {formatDuration(savedTimeSpent + (isTimerOn ? elapsedSeconds : 0))}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className={`flex items-center gap-0.5 transition-opacity ${isTimerOn || isManualOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {isPending && isTodayDate && (
                    <>
                        {/* Live timer display */}
                        {isTimerOn && (
                            <span className="text-xs font-mono text-amber font-semibold mr-1 tabular-nums">
                                {formatTimerDisplay(elapsedSeconds)}
                            </span>
                        )}
                        <button
                            onClick={handleHammerToggle}
                            className={`p-1.5 rounded-lg transition-all
                                ${isTimerOn
                                    ? 'bg-amber-light text-amber shadow-sm'
                                    : 'hover:bg-amber-light text-text-muted hover:text-amber'
                                }`}
                            title={isTimerOn ? '停止 Hammer 计时' : '开始 Hammer 计时'}
                            aria-label={isTimerOn ? '停止 Hammer 计时' : '开始 Hammer 计时'}
                        >
                            <Hammer size={15} className={isTimerOn ? 'animate-pulse' : ''} />
                        </button>
                    </>
                )}
                <button
                    onClick={handleManualToggle}
                    disabled={isTimerOn}
                    className={`relative p-1.5 rounded-lg transition-all
                        ${isManualOpen
                            ? 'bg-amber-light text-amber shadow-sm'
                            : 'hover:bg-amber-light text-text-muted hover:text-amber'
                        }
                        ${isTimerOn ? 'opacity-45 cursor-not-allowed' : ''}
                    `}
                    title={isTimerOn ? '当前正在计时，先停止后再补录' : '补录过去的 Hammer'}
                    aria-label="补录过去的 Hammer"
                >
                    <Hammer size={15} />
                    <Plus size={9} className="absolute right-0.5 top-0.5" />
                </button>
                {isPending && !isTimerOn && (
                    <button
                        onClick={handleEditStart}
                        className="p-1.5 rounded-lg hover:bg-[var(--th-hover)] text-text-muted hover:text-text-primary transition-all"
                        title="编辑任务名称"
                        aria-label="编辑任务名称"
                    >
                        <Edit2 size={15} />
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="p-1.5 rounded-lg hover:bg-red-light text-text-muted hover:text-red transition-all"
                    title="删除任务"
                    aria-label="删除任务"
                >
                    <Trash2 size={15} />
                </button>
            </div>
            </div>
            {isManualOpen && (
                <div className="manual-hammer-panel">
                    <div className="manual-hammer-panel-head">
                        <div className="manual-hammer-title">
                            <Hammer size={13} />
                            <span>补录 Hammer</span>
                        </div>
                        <span className="manual-hammer-date">{selectedDate}</span>
                    </div>

                    <div className="manual-hammer-summary">
                        <span>{minuteToText(displayStartMinute)}</span>
                        <i>→</i>
                        <span>{minuteToText(displayEndMinute)}</span>
                        <strong>{formatDuration(manualDurationSeconds)}</strong>
                    </div>

                    <label className="manual-hammer-slider">
                        <span>开始</span>
                        <input
                            type="range"
                            min="0"
                            max={Math.max(0, manualMeta.capMinute - 1)}
                            step="1"
                            value={displayStartMinute}
                            disabled={!canEditManualRange}
                            onChange={handleManualStartChange}
                        />
                        <strong>{minuteToText(displayStartMinute)}</strong>
                    </label>

                    <label className="manual-hammer-slider">
                        <span>结束</span>
                        <input
                            type="range"
                            min={Math.min(1, manualMeta.capMinute)}
                            max={Math.max(1, manualMeta.capMinute)}
                            step="1"
                            value={displayEndMinute}
                            disabled={!canEditManualRange}
                            onChange={handleManualEndChange}
                        />
                        <strong>{minuteToText(displayEndMinute)}</strong>
                    </label>

                    {manualError && <div className="manual-hammer-error">{manualError}</div>}
                    {!manualError && overlappingManualInterval && (
                        <div className="manual-hammer-error">
                            不能和已有 Hammer 重叠：{formatTimeBJ(overlappingManualInterval.startMs)}-{formatTimeBJ(overlappingManualInterval.endMs)}
                        </div>
                    )}
                    {!manualError && !overlappingManualInterval && manualMeta.capMinute <= 0 && (
                        <div className="manual-hammer-error subtle">
                            {selectedDate > getTodayBJ() ? '未来日期暂时不能补录 Hammer。' : '当前还没有可补录的过去时间。'}
                        </div>
                    )}

                    <div className="manual-hammer-actions">
                        <button type="button" className="manual-hammer-cancel" onClick={() => setIsManualOpen(false)}>
                            <X size={13} />
                            取消
                        </button>
                        <button
                            type="button"
                            className="manual-hammer-save"
                            disabled={!canSaveManualBackfill}
                            onClick={handleManualSave}
                        >
                            <Check size={13} />
                            添加
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
