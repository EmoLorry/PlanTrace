import { useState } from 'react';
import { X, ArrowRight, BellOff } from 'lucide-react';
import { formatTimeBJ } from '../store/dateUtils.js';

export default function RolloverModal({ candidates, onRollover, onDismissToday, onClose }) {
    const [selected, setSelected] = useState(new Set());

    const toggleSelect = (taskId) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const selectAll = () => {
        if (selected.size === candidates.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(candidates.map((t) => t.id)));
        }
    };

    const handleInherit = () => {
        if (selected.size > 0) {
            onRollover(Array.from(selected));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="glass w-full max-w-md p-6 animate-modal-in"
                style={{ background: 'rgba(20, 16, 48, 0.85)', backdropFilter: 'blur(24px)' }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-semibold text-white/90">
                            Unfinished Business
                        </h3>
                        <p className="text-xs text-white/40 mt-1">
                            {candidates.length} pending task{candidates.length > 1 ? 's' : ''} from the past week
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Select All */}
                <button
                    onClick={selectAll}
                    className="text-xs text-accent/70 hover:text-accent mb-3 transition-colors"
                >
                    {selected.size === candidates.length ? 'Deselect All' : 'Select All'}
                </button>

                {/* Task List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-5 pr-1">
                    {candidates.map((task) => {
                        const isSelected = selected.has(task.id);
                        const lastDate = task.active_dates[task.active_dates.length - 1];
                        return (
                            <button
                                key={task.id}
                                onClick={() => toggleSelect(task.id)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200
                  ${isSelected
                                        ? 'bg-accent/15 border border-accent/30'
                                        : 'glass-subtle hover:bg-white/8 border border-transparent'
                                    }
                `}
                            >
                                <div className="flex items-center gap-3">
                                    {/* Checkbox */}
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all
                    ${isSelected
                                            ? 'border-accent bg-accent/20'
                                            : 'border-white/20'
                                        }
                  `}>
                                        {isSelected && (
                                            <svg className="w-2.5 h-2.5 text-accent" viewBox="0 0 12 12" fill="none">
                                                <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2"
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <p className="text-sm text-white/80 truncate">{task.content}</p>
                                        <p className="text-[10px] text-white/25 mt-0.5">
                                            Last active: {lastDate}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={onDismissToday}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white/35
              hover:text-white/55 hover:bg-white/5 transition-all"
                    >
                        <BellOff size={14} />
                        Don't show today
                    </button>

                    <button
                        onClick={handleInherit}
                        disabled={selected.size === 0}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
              transition-all
              ${selected.size > 0
                                ? 'bg-accent/20 text-accent hover:bg-accent/30'
                                : 'bg-white/5 text-white/20 cursor-not-allowed'
                            }
            `}
                    >
                        Inherit {selected.size > 0 ? `(${selected.size})` : ''}
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
