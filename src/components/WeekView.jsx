import { useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { getAllLogs } from '../store/actionLogStore.js';
import { getJSON } from '../store/storage.js';
import {
    parseDateStr,
    formatDateBJ,
    formatTimeBJ,
    getStartOfDayMsBJ,
    getTodayBJ,
    shiftDate,
    splitIntervalByBJDate,
} from '../store/dateUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HOUR_H   = 64;  // px per hour — 30min = 32px, 15min = 16px
const HEADER_H = 68;  // sticky day-header height
const MIN_BLOCK_H = 22; // minimum visible height for very short sessions
const DATE_MEMBERSHIP_ACTIONS = new Set(['CREATE', 'ROLLOVER', 'DELETE']);

// ---------------------------------------------------------------------------
// Task color palette — consistent hash → color
// ---------------------------------------------------------------------------
const PALETTE = [
    { bg: 'rgba(52,130,246,0.14)',  border: '#3482f6', text: '#1e40af' },
    { bg: 'rgba(52,199,89,0.14)',   border: '#34c759', text: '#166534' },
    { bg: 'rgba(255,149,0,0.14)',   border: '#ff9500', text: '#92400e' },
    { bg: 'rgba(175,82,222,0.14)',  border: '#af52de', text: '#6b21a8' },
    { bg: 'rgba(255,59,48,0.14)',   border: '#ff3b30', text: '#991b1b' },
    { bg: 'rgba(14,165,233,0.14)',  border: '#0ea5e9', text: '#075985' },
    { bg: 'rgba(234,179,8,0.14)',   border: '#eab308', text: '#713f12' },
    { bg: 'rgba(34,197,94,0.14)',   border: '#22c55e', text: '#14532d' },
    { bg: 'rgba(249,115,22,0.14)',  border: '#f97316', text: '#7c2d12' },
    { bg: 'rgba(6,182,212,0.14)',   border: '#06b6d4', text: '#164e63' },
    { bg: 'rgba(244,63,94,0.14)',   border: '#f43f5e', text: '#881337' },
    { bg: 'rgba(99,102,241,0.14)',  border: '#6366f1', text: '#3730a3' },
];
const ATOMIC_PALETTE = [
    { bg: 'rgba(251,146,60,0.18)',  border: '#fb923c', text: '#9a3412' },
    { bg: 'rgba(234,179,8,0.18)',   border: '#eab308', text: '#713f12' },
    { bg: 'rgba(249,115,22,0.18)',  border: '#f97316', text: '#7c2d12' },
    { bg: 'rgba(239,68,68,0.18)',   border: '#ef4444', text: '#7f1d1d' },
];

function strHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}
function taskColor(id)    { return PALETTE[strHash(id) % PALETTE.length]; }
function atomicColor(lbl) { return ATOMIC_PALETTE[strHash(lbl) % ATOMIC_PALETTE.length]; }

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getWeekDates(dateStr) {
    const d   = parseDateStr(dateStr);
    const dow = d.getDay();
    const mondayOff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOff);
    return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        return formatDateBJ(day);
    });
}

const CN_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function fmtDuration(secs) {
    if (!secs || secs <= 0) return '0m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

/**
 * ms → pixel offset from the TOP of the visible range (startHour:00).
 */
function msToTop(ms, dateStr, startHour) {
    const dayStart = getStartOfDayMsBJ(dateStr);
    return ((ms - dayStart) / 3600000) * HOUR_H - startHour * HOUR_H;
}

function secToH(secs) { return (secs / 3600) * HOUR_H; }

/**
 * Scan all blocks this week and return the tightest integer-hour window that
 * contains every event, padded by 1 hour on each side.
 * Falls back to [7, 22] when no events exist.
 */
function getDateBlocks(blockMap, dateStr) {
    return blockMap.get(dateStr) || [];
}

function calcTimeRange(weekDates, blockMap) {
    let minH = Infinity, maxH = -Infinity;
    for (const dateStr of weekDates) {
        const blocks = getDateBlocks(blockMap, dateStr);
        const dayStart = getStartOfDayMsBJ(dateStr);
        for (const b of blocks) {
            const sh = (b.startMs - dayStart) / 3600000;
            const eh = (b.endMs   - dayStart) / 3600000;
            if (sh < minH) minH = sh;
            if (eh > maxH) maxH = eh;
        }
    }
    if (!isFinite(minH)) return { startHour: 7, endHour: 22 };
    return {
        startHour: Math.max(0,  Math.floor(minH) - 1),
        endHour:   Math.min(24, Math.ceil(maxH)  + 1),
    };
}

// ---------------------------------------------------------------------------
// Overlap layout algorithm
// ---------------------------------------------------------------------------
function getVisualEndMs(block) {
    const actualDurationMs = Math.max(0, block.endMs - block.startMs);
    const minDurationMs = (MIN_BLOCK_H / HOUR_H) * 3600000;
    return block.startMs + Math.max(actualDurationMs, minDurationMs);
}

function getOverlapClusters(sortedBlocks) {
    const clusters = [];
    let current = [];
    let currentEnd = -Infinity;

    for (const block of sortedBlocks) {
        const visualEndMs = getVisualEndMs(block);
        if (!current.length || block.startMs < currentEnd) {
            current.push(block);
            currentEnd = Math.max(currentEnd, visualEndMs);
        } else {
            clusters.push(current);
            current = [block];
            currentEnd = visualEndMs;
        }
    }

    if (current.length) clusters.push(current);
    return clusters;
}

function layoutCluster(cluster) {
    if (cluster.length === 1) {
        return [{ ...cluster[0], lane: 0, totalCols: 1 }];
    }

    const laneEnds = [];
    const laid = cluster.map((block) => {
        const visualEndMs = getVisualEndMs(block);
        let lane = laneEnds.findIndex((endMs) => block.startMs >= endMs);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(visualEndMs);
        } else {
            laneEnds[lane] = visualEndMs;
        }
        return { ...block, lane };
    });

    const totalCols = Math.max(1, laneEnds.length);
    return laid.map((block) => ({ ...block, totalCols }));
}

function layoutBlocks(blocks) {
    if (!blocks.length) return [];
    const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    return getOverlapClusters(sorted)
        .flatMap(layoutCluster)
        .sort((a, b) => a.startMs - b.startMs || a.lane - b.lane);
}

function getUnionDuration(blocks) {
    if (!blocks.length) return 0;
    const intervals = blocks
        .filter((block) => block.endMs > block.startMs)
        .map((block) => ({ startMs: block.startMs, endMs: block.endMs }))
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    let totalMs = 0;
    let currentStart = null;
    let currentEnd = null;

    for (const interval of intervals) {
        if (currentStart === null) {
            currentStart = interval.startMs;
            currentEnd = interval.endMs;
            continue;
        }

        if (interval.startMs <= currentEnd) {
            currentEnd = Math.max(currentEnd, interval.endMs);
        } else {
            totalMs += currentEnd - currentStart;
            currentStart = interval.startMs;
            currentEnd = interval.endMs;
        }
    }

    if (currentStart !== null) totalMs += currentEnd - currentStart;
    return Math.floor(totalMs / 1000);
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------
function createBlockMap(weekDates) {
    return new Map(weekDates.map((dateStr) => [dateStr, []]));
}

function taskDateKey(taskId, dateStr) {
    return `${taskId}::${dateStr}`;
}

function getDeletedTaskDates(logs) {
    const latestByDate = new Map();
    for (const log of logs) {
        if (!log?.task_id || !log.target_date || !DATE_MEMBERSHIP_ACTIONS.has(log.action_type)) continue;
        const key = taskDateKey(log.task_id, log.target_date);
        const timestamp = Number(log.timestamp) || 0;
        const current = latestByDate.get(key);
        if (!current || timestamp >= current.timestamp) {
            latestByDate.set(key, { action: log.action_type, timestamp });
        }
    }
    return new Set(
        [...latestByDate.entries()]
            .filter(([, value]) => value.action === 'DELETE')
            .map(([key]) => key),
    );
}

function sortBlockMap(blockMap) {
    for (const blocks of blockMap.values()) {
        blocks.sort((a, b) => a.startMs - b.startMs);
    }
    return blockMap;
}

function buildHammerBlockMap(weekDates) {
    const blockMap = createBlockMap(weekDates);
    const logs = getAllLogs();
    const deletedDates = getDeletedTaskDates(logs);
    const tasksById = new Map((getJSON('tasks') || []).map((task) => [task.id, task]));

    for (const log of logs) {
        const duration = Number(log?.duration_seconds) || 0;
        const endMs = Number(log?.timestamp) || 0;
        if (log?.action_type !== 'HAMMER' || duration <= 0 || endMs <= 0) continue;
        if (log.target_date && deletedDates.has(taskDateKey(log.task_id, log.target_date))) continue;

        const task = tasksById.get(log.task_id);
        const startMs = endMs - duration * 1000;
        for (const segment of splitIntervalByBJDate(startMs, endMs)) {
            const blocks = blockMap.get(segment.date);
            if (!blocks || (!log.target_date && deletedDates.has(taskDateKey(log.task_id, segment.date)))) continue;
            blocks.push({
                id: `${log.log_id}-${segment.date}-${segment.startMs}`,
                taskId: log.task_id,
                label: task?.content || '未知任务',
                startMs: segment.startMs,
                endMs: segment.endMs,
                duration: segment.durationSeconds,
            });
        }
    }

    return sortBlockMap(blockMap);
}

function buildAtomicBlockMap(weekDates) {
    const blockMap = createBlockMap(weekDates);
    const sessions = getJSON('atomic_sessions') || [];

    for (const session of sessions) {
        if (session?.status !== 'completed' || !session.started_at || !session.ended_at) continue;
        for (const segment of splitIntervalByBJDate(session.started_at, session.ended_at)) {
            const blocks = blockMap.get(segment.date);
            if (!blocks) continue;
            blocks.push({
                id: `${session.session_id}-${segment.date}-${segment.startMs}`,
                taskId: session.session_id,
                label: session.label,
                startMs: segment.startMs,
                endMs: segment.endMs,
                duration: segment.durationSeconds,
            });
        }
    }

    return sortBlockMap(blockMap);
}

// ---------------------------------------------------------------------------
// TimeBlock
// ---------------------------------------------------------------------------
function TimeBlock({ block, dateStr, isAtomic, startHour }) {
    const col   = isAtomic ? atomicColor(block.label) : taskColor(block.taskId);
    const hPx   = secToH(block.duration);
    const topPx = msToTop(block.startMs, dateStr, startHour);

    const TINY  = MIN_BLOCK_H; // < 22px pill only
    const SHORT = 38; // 22–38px → label only

    const fmt = (ms) => {
        return formatTimeBJ(ms);
    };

    const totalCols = Math.max(1, block.totalCols || 1);
    const colWidth = `${100 / totalCols}%`;
    const colLeft  = `${(100 / totalCols) * (block.lane || 0)}%`;
    const visH     = Math.max(hPx, TINY);
    const horizontalStyle = totalCols > 1
        ? { left: `calc(${colLeft} + 2px)`, width: `calc(${colWidth} - 4px)` }
        : { left: '6px', width: 'calc(100% - 12px)' };

    return (
        <div
            className="wv-block"
            style={{
                top: `${topPx}px`, height: `${visH}px`,
                ...horizontalStyle,
                background: col.bg, borderColor: col.border, color: col.text,
            }}
            title={`${block.label}\n${fmt(block.startMs)} → ${fmt(block.endMs)}\n${fmtDuration(block.duration)}`}
        >
            {visH >= TINY && visH < SHORT && (
                <div className="wv-block-label wv-block-label-sm">{block.label}</div>
            )}
            {visH >= SHORT && (
                <>
                    <div className="wv-block-label">{block.label}</div>
                    <div className="wv-block-time">{fmt(block.startMs)}–{fmt(block.endMs)}</div>
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// DayColumn
// ---------------------------------------------------------------------------
function DayColumn({ dateStr, weekdayLabel, isToday, mode, startHour, rangeH, blocks }) {
    const laid = useMemo(() => layoutBlocks(blocks), [blocks]);
    const totalSec = useMemo(() => getUnionDuration(blocks), [blocks]);
    const monthDay = dateStr.slice(5);

    return (
        <div className={`wv-day-col ${isToday ? 'wv-today' : ''}`}>
            <div className="wv-day-header">
                <div className="wv-day-name">{weekdayLabel}</div>
                <div className="wv-day-date">{monthDay}</div>
                <div className={`wv-day-total ${totalSec > 0 ? 'has-time' : ''}`}>
                    {totalSec > 0 ? fmtDuration(totalSec) : '—'}
                </div>
            </div>
            <div className="wv-day-body" style={{ height: `${rangeH}px` }}>
                {laid.map((b) => (
                    <TimeBlock key={b.id} block={b} dateStr={dateStr}
                        isAtomic={mode === 'atomic'} startHour={startHour} />
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// WeekView — main component
// ---------------------------------------------------------------------------
export default function WeekView({ initialDate, onClose }) {
    const [anchorDate, setAnchorDate] = useState(initialDate || getTodayBJ());
    const [mode, setMode]             = useState('hammer');

    const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
    const today     = getTodayBJ();
    const blockMap = useMemo(() => (
        mode === 'atomic'
            ? buildAtomicBlockMap(weekDates)
            : buildHammerBlockMap(weekDates)
    ), [weekDates, mode]);

    const prevWeek = () => setAnchorDate((d) => shiftDate(d, -7));
    const nextWeek = () => setAnchorDate((d) => shiftDate(d, 7));
    const goToday  = () => setAnchorDate(getTodayBJ());

    // Dynamic time range — recalculated when week or mode changes
    const { startHour, endHour } = useMemo(() => calcTimeRange(weekDates, blockMap), [weekDates, blockMap]);
    const rangeH = (endHour - startHour) * HOUR_H;
    const hours  = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

    // Weekly total
    const weekTotal = useMemo(() => weekDates.reduce((sum, d) => {
        const blocks = getDateBlocks(blockMap, d);
        return sum + getUnionDuration(blocks);
    }, 0), [weekDates, blockMap]);

    const firstDate  = parseDateStr(weekDates[0]);
    const monthLabel = `${firstDate.getFullYear()}年 ${firstDate.getMonth() + 1}月`;

    return (
        <div className="wv-overlay">
            {/* ── Top bar ── */}
            <div className="wv-topbar">
                <div className="wv-topbar-left">
                    <CalendarDays size={16} className="wv-topbar-icon" />
                    <span className="wv-month-label">{monthLabel}</span>
                    <div className="wv-nav-btns">
                        <button className="wv-nav-btn" onClick={prevWeek}><ChevronLeft size={16} /></button>
                        <button className="wv-nav-btn wv-today-btn" onClick={goToday}>本周</button>
                        <button className="wv-nav-btn" onClick={nextWeek}><ChevronRight size={16} /></button>
                    </div>
                </div>

                <div className="wv-topbar-center">
                    <div className="wv-mode-toggle">
                        <button className={`wv-mode-btn ${mode === 'hammer' ? 'active' : ''}`} onClick={() => setMode('hammer')}>⏱ 日程</button>
                        <button className={`wv-mode-btn ${mode === 'atomic' ? 'active' : ''}`} onClick={() => setMode('atomic')}>⚛ 原子</button>
                    </div>
                </div>

                <div className="wv-topbar-right">
                    <span className="wv-week-total">
                        <span className="wv-range-hint">{startHour}:00 – {endHour}:00</span>
                        &nbsp;·&nbsp; 周合计：<strong>{fmtDuration(weekTotal)}</strong>
                    </span>
                    <button className="wv-close-btn" onClick={onClose}><X size={18} /></button>
                </div>
            </div>

            {/* ── Grid ── */}
            <div className="wv-scroll-outer">
                <div className="wv-scroll-inner" style={{ height: `${rangeH + HEADER_H}px` }}>

                    {/* Sticky time axis */}
                    <div className="wv-time-axis">
                        <div className="wv-day-header" />
                        {hours.map((h) => (
                            <div key={h} className="wv-hour-label"
                                style={{ top: `${HEADER_H + (h - startHour) * HOUR_H - 9}px` }}>
                                {`${String(h).padStart(2,'0')}:00`}
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    <div className="wv-days-area">
                        {/* Hour grid lines */}
                        {hours.map((h) => (
                            <div key={h} className="wv-hour-line"
                                style={{ top: `${HEADER_H + (h - startHour) * HOUR_H}px` }} />
                        ))}

                        {weekDates.map((d, i) => (
                            <DayColumn
                                key={d} dateStr={d} weekdayLabel={CN_DAYS[i]}
                                isToday={d === today} mode={mode}
                                blocks={getDateBlocks(blockMap, d)}
                                startHour={startHour} rangeH={rangeH}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
