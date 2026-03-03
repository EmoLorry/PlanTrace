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
    const [offset, setOffset] = useState(0);
    const todayStr = getTodayBJ();

    const visibleDates = useMemo(() => {
        const result = [];
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
        return status === 'has_pending' ? 'dot-blue' : status === 'all_completed' ? 'dot-green' : null;
    }

    return (
        <aside
            className="w-[230px] min-w-[230px] h-full flex flex-col py-5 px-3 gap-2 transition-all duration-300"
            style={{
                background: 'var(--th-sidebar-bg)',
                backdropFilter: 'blur(20px) saturate(180%)',
            }}
        >
            {/* Logo */}
            <div className="px-3 mb-1">
                <h1 className="text-[17px] font-semibold tracking-tight text-text-primary">
                    PlanTrace
                </h1>
                <p className="text-[11px] text-text-muted mt-0.5">Daily Progress Tracker</p>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between px-2 mb-0.5">
                <button
                    onClick={navigateBack}
                    className="p-1.5 rounded-lg hover:bg-black/5 transition-colors text-text-muted hover:text-text-secondary"
                    title="Earlier dates"
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    onClick={goToToday}
                    className="text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors px-2.5 py-1 rounded-lg hover:bg-accent-light"
                >
                    Today
                </button>
                <button
                    onClick={navigateForward}
                    className="p-1.5 rounded-lg hover:bg-black/5 transition-colors text-text-muted hover:text-text-secondary"
                    title="Later dates"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Date Cards */}
            <div className="flex-1 overflow-y-auto space-y-1 px-1">
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
                                    ? 'shadow-sm'
                                    : 'border border-transparent'
                                }
                                ${isTodayDate && !isSelected ? 'ring-1 ring-accent/20' : ''}
                            `}
                            style={{
                                animationDelay: `${i * 25}ms`,
                                ...(isSelected ? {
                                    background: 'var(--th-card-selected)',
                                    boxShadow: 'var(--th-card-selected-shadow)',
                                    border: '1px solid var(--th-glass-border)'
                                } : {})
                            }}
                        >
                            {/* Status Dot */}
                            {dotClass && (
                                <span
                                    className={`absolute top-2.5 right-2.5 w-[7px] h-[7px] rounded-full animate-pulse-glow ${dotClass}`}
                                />
                            )}

                            <div className="flex items-baseline gap-2">
                                <span className={`text-xl font-semibold leading-none ${isSelected ? 'text-text-primary' : isPastDate ? 'text-text-muted' : 'text-text-primary/70'
                                    }`}>
                                    {day}
                                </span>
                                <span className={`text-xs font-medium ${isSelected ? 'text-text-secondary' : isPastDate ? 'text-text-muted/60' : 'text-text-muted'
                                    }`}>
                                    {dayName}
                                </span>
                            </div>

                            {isTodayDate && (
                                <span className="text-[9px] font-semibold uppercase tracking-widest text-accent mt-0.5 block">
                                    Today
                                </span>
                            )}

                            {pendingCount > 0 && !isSelected && (
                                <span className="text-[10px] text-text-muted mt-0.5 block">
                                    {pendingCount} pending
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Bottom Actions */}
            <div className="space-y-1 mx-1">
                <button
                    onClick={onPlanFuture}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl
                        text-text-secondary hover:text-text-primary hover:bg-black/4 transition-all text-sm"
                >
                    <CalendarPlus size={15} />
                    <span className="font-medium">Plan Future</span>
                </button>
                <button
                    onClick={exportBackup}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl
                        text-text-secondary hover:text-text-primary hover:bg-black/4 transition-all text-sm"
                >
                    <Download size={15} />
                    <span className="font-medium">Export Data</span>
                </button>
            </div>
        </aside>
    );
}
