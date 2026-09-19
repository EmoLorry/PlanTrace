import { useState, useRef, useEffect, useCallback } from 'react';
import { Hammer, Trash2, Edit2 } from 'lucide-react';
import { isToday, formatTimeBJ, getMsUntilEndOfDayBJ, isEndOfDayBJ } from '../store/dateUtils.js';
import { getHammerCount } from '../store/actionLogStore.js';
import { getTimeSpent } from '../store/taskStore.js';

// ---------------------------------------------------------------------------
// sessionStorage helpers — persist active timer start times across HMR reloads.
// Key: 'plantrace_active_timers'  Value: { [taskId]: startTimeMs }
// sessionStorage survives HMR/page-reload but is cleared when the tab closes.
// ---------------------------------------------------------------------------
const ACTIVE_TIMERS_KEY = 'plantrace_active_timers';

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
    const isCompleted = task.status === 'completed';
    const isPending = task.status === 'pending';
    const hammerCount = getHammerCount(task.id, selectedDate);
    const savedTimeSpent = getTimeSpent(task.id, selectedDate);

    // Timer state (component-local, only persisted on stop)
    const [isTimerOn, setIsTimerOn] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const intervalRef = useRef(null);
    const startTimeRef = useRef(null);
    const endOfDayTimeoutRef = useRef(null);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(task.content);

    // Keep a ref to onTimerStop to avoid stale-closure in cleanup/event handlers
    const onTimerStopRef = useRef(onTimerStop);
    useEffect(() => { onTimerStopRef.current = onTimerStop; }, [onTimerStop]);

    // Internal helper: flush elapsed time to the store.
    // Reads startTime from sessionStorage first for accuracy after HMR / sleep.
    const flushTimer = useCallback((taskId) => {
        const persistedStart = getActiveTimers()[taskId];
        const startTime = persistedStart ?? startTimeRef.current;
        clearActiveTimer(taskId);
        startTimeRef.current = null;
        const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        if (elapsed > 0) {
            onTimerStopRef.current(taskId, elapsed);
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
        const msRemaining = getMsUntilEndOfDayBJ();
        if (msRemaining > 0) {
            endOfDayTimeoutRef.current = setTimeout(() => stopTimer(), msRemaining);
        }
    }, [stopTimer]);

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

    // ---------------------------------------------------------------------------
    // Layer 1 — HMR / Refresh Recovery: on mount, check sessionStorage for a
    // persisted startTime. If found, silently restore the running timer state
    // so the timer continues from where it left off.
    // Time is only recorded when the user explicitly clicks stop.
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
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && startTimeRef.current) {
                setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

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
        if (!isTodayDate || !isPending) return;
        // Stop timer first if running
        if (isTimerOn) stopTimer();
        onComplete(task.id);
    };

    const handleDelete = () => {
        // Stop timer first if running
        if (isTimerOn) stopTimer();
        onDelete(task.id);
    };

    return (
        <div className={`group glass-subtle flex items-center gap-3 px-4 py-3.5 transition-all duration-200
            hover:bg-white/90 hover:shadow-sm animate-fade-in
            ${isCompleted ? 'opacity-55' : ''}
            ${isTimerOn ? 'ring-1 ring-amber/30 bg-amber-light/30' : ''}
        `}>
            {/* Status Icon */}
            <button
                onClick={handleComplete}
                disabled={!isTodayDate || isCompleted}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all
                    ${isCompleted
                        ? 'text-green cursor-default'
                        : isTodayDate
                            ? 'text-text-muted hover:text-accent hover:bg-accent-light cursor-pointer'
                            : 'text-text-muted/40 cursor-not-allowed'
                    }
                `}
                title={isCompleted ? '已完成' : isTodayDate ? '点一下完成今日任务' : '只能完成今天的任务'}
                aria-label={isCompleted ? '已完成' : isTodayDate ? '完成今日任务' : '只能完成今天的任务'}
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
            <div className={`flex items-center gap-0.5 transition-opacity ${isTimerOn ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
    );
}
