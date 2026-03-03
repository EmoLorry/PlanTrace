import { useState, useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    CalendarPlus,
    Download,
} from 'lucide-react';
import {
    getDateRangeBJ,
    getTodayBJ,
    getDayName,
    isPast,
    isToday,
    shiftDate,
} from '../store/dateUtils.js';
import { getDateStatus, getPendingCountForDate } from '../store/taskStore.js';
import { exportBackup } from '../store/storage.js';

export default function Sidebar({ selectedDate, onDateSelect, onPlanFuture, refreshKey }) {
    const [offset, setOffset] = useState(0); // days offset for navigation

    const todayStr = getTodayBJ();

    const dates = useMemo(() => {
        const pastDays = 7 - offset;
        const futureDays = 6 + offset;
        // Shift the range center
        if (offset <= 0) {
            return getDateRangeBJ(7 + Math.abs(offset), 6);
        } else {
            return getDateRangeBJ(7, 6 + offset);
        }
    }, [offset]);

    // Simpler: always 14-day window starting from (today - 7 + offset)
    const visibleDates = useMemo(() => {
        const result = [];
        const base = shiftDate(todayStr, offset * 14);
        for (let i = -7; i <= 6; i++) {
            result.push(shiftDate(todayStr, i + offset * 14));
        }
        return result;
    }, [offset, todayStr]);

    const navigateBack = () => setOffset((o) => o - 1);
    const navigateForward = () => setOffset((o) => o + 1);
    const goToToday = () => {
        setOffset(0);
        onDateSelect(todayStr);
    };

    function getDotClass(dateStr) {
        const status = getDateStatus(dateStr);
        if (status === 'empty') return null;

        const past = isPast(dateStr);
        if (past) {
            return status === 'all_completed' ? 'dot-green' : 'dot-grey';
        }
        // Current or future
        return status === 'has_pending' ? 'dot-blue' : status === 'all_completed' ? 'dot-green' : null;
    }

    return (
        <aside className="w-[220px] min-w-[220px] h-full flex flex-col py-6 px-3 gap-3">
            {/* Logo / Title */}
            <div className="px-3 mb-2">
                <h1 className="text-lg font-semibold tracking-tight text-white/90">
                    PlanTrace
                </h1>
                <p className="text-xs text-white/40 mt-0.5">Daily Progress Tracker</p>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-between px-2 mb-1">
                <button
                    onClick={navigateBack}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
                    title="Earlier dates"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={goToToday}
                    className="text-[11px] font-medium text-accent/80 hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-white/8"
                >
                    Today
                </button>
                <button
                    onClick={navigateForward}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
                    title="Later dates"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Date Cards */}
            <div className="flex-1 overflow-y-auto space-y-1.5 px-1">
                {visibleDates.map((dateStr, i) => {
                    const isSelected = dateStr === selectedDate;
                    const isTodayDate = isToday(dateStr);
                    const isPastDate = isPast(dateStr);
                    const day = dateStr.split('-')[2];
                    const dayName = getDayName(dateStr);
                    const dotClass = getDotClass(dateStr);
                    const pendingCount = getPendingCountForDate(dateStr);

                    return (
                        <button
                            key={dateStr}
                            onClick={() => onDateSelect(dateStr)}
                            className={`
                relative w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200
                animate-fade-in
                ${isSelected
                                    ? 'glass bg-white/15! border-white/25! shadow-lg shadow-accent/5'
                                    : 'hover:bg-white/8 border border-transparent'
                                }
                ${isTodayDate ? 'ring-1 ring-accent/30' : ''}
              `}
                            style={{ animationDelay: `${i * 30}ms` }}
                        >
                            {/* Glow Dot */}
                            {dotClass && (
                                <span
                                    className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full animate-pulse-glow ${dotClass}`}
                                />
                            )}

                            <div className="flex items-baseline gap-2">
                                <span className={`text-xl font-semibold leading-none ${isSelected ? 'text-white' : isPastDate ? 'text-white/35' : 'text-white/75'
                                    }`}>
                                    {day}
                                </span>
                                <span className={`text-xs font-medium ${isSelected ? 'text-white/70' : isPastDate ? 'text-white/25' : 'text-white/40'
                                    }`}>
                                    {dayName}
                                </span>
                            </div>

                            {isTodayDate && (
                                <span className="text-[9px] font-semibold uppercase tracking-widest text-accent/70 mt-0.5 block">
                                    Today
                                </span>
                            )}

                            {pendingCount > 0 && !isSelected && (
                                <span className="text-[10px] text-white/30 mt-0.5 block">
                                    {pendingCount} pending
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Bottom Actions */}
            <div className="space-y-1.5 mx-1">
                <button
                    onClick={onPlanFuture}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl glass-subtle
                        text-white/50 hover:text-white/80 hover:bg-white/10 transition-all text-sm"
                >
                    <CalendarPlus size={16} />
                    <span className="font-medium">Plan Future</span>
                </button>
                <button
                    onClick={exportBackup}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl glass-subtle
                        text-white/50 hover:text-white/80 hover:bg-white/10 transition-all text-sm"
                >
                    <Download size={16} />
                    <span className="font-medium">Export Data</span>
                </button>
            </div>
        </aside>
    );
}
