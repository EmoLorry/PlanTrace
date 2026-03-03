import { useState } from 'react';
import { X, ArrowRight, BellOff } from 'lucide-react';

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
            style={{ backgroundColor: 'var(--th-modal-overlay)' }}>
            <div className="glass w-full max-w-md p-6 animate-modal-in"
                style={{ background: 'var(--th-modal-bg)', backdropFilter: 'blur(28px) saturate(200%)' }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h3 className="text-[17px] font-semibold text-text-primary">
                            Unfinished Business
                        </h3>
                        <p className="text-xs text-text-muted mt-1">
                            {candidates.length} pending task{candidates.length > 1 ? 's' : ''} from the past week
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-black/5 text-text-muted hover:text-text-secondary transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Select All */}
                <button
                    onClick={selectAll}
                    className="text-xs font-medium text-accent hover:text-accent/80 mb-3 transition-colors"
                >
                    {selected.size === candidates.length ? 'Deselect All' : 'Select All'}
                </button>

                {/* Task List */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto mb-5 pr-1">
                    {candidates.map((task) => {
                        const isSelected = selected.has(task.id);
                        const lastDate = task.active_dates[task.active_dates.length - 1];
                        return (
                            <button
                                key={task.id}
                                onClick={() => toggleSelect(task.id)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200
                                    ${isSelected
                                        ? 'bg-accent-light border border-accent/20'
                                        : 'hover:bg-black/3 border border-transparent'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all
                                        ${isSelected
                                            ? 'border-accent bg-accent'
                                            : 'border-text-muted/40'
                                        }
                                    `}>
                                        {isSelected && (
                                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                                                <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2"
                                                    strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-text-primary truncate">{task.content}</p>
                                        <p className="text-[10px] text-text-muted mt-0.5">
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
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-text-muted
                            hover:text-text-secondary hover:bg-black/4 transition-all"
                    >
                        <BellOff size={14} />
                        Don't show today
                    </button>

                    <button
                        onClick={handleInherit}
                        disabled={selected.size === 0}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all
                            ${selected.size > 0
                                ? 'bg-accent text-white hover:bg-accent/85'
                                : 'bg-black/5 text-text-muted cursor-not-allowed'
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
