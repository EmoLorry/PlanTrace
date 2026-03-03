import { useState } from 'react';
import { X, CalendarPlus } from 'lucide-react';
import { getTodayBJ, shiftDate } from '../store/dateUtils.js';

export default function PlanFutureModal({ onAddTask, onClose }) {
    const [dateStr, setDateStr] = useState(shiftDate(getTodayBJ(), 7));
    const [content, setContent] = useState('');
    const todayStr = getTodayBJ();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (content.trim() && dateStr >= todayStr) {
            onAddTask(content.trim(), dateStr);
            setContent('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'var(--th-modal-overlay)' }}>
            <div className="glass w-full max-w-sm p-6 animate-modal-in"
                style={{ background: 'var(--th-modal-bg)', backdropFilter: 'blur(28px) saturate(200%)' }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <CalendarPlus size={20} className="text-accent" />
                        <h3 className="text-[17px] font-semibold text-text-primary">Plan Ahead</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-black/5 text-text-muted hover:text-text-secondary transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Date Picker */}
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">Select Date</label>
                        <input
                            type="date"
                            value={dateStr}
                            min={todayStr}
                            onChange={(e) => setDateStr(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl text-sm text-text-primary
                                outline-none focus:ring-1 focus:ring-accent/25 transition-all"
                            style={{ background: 'var(--th-input-bg)', border: '1px solid var(--th-input-border)' }}
                        />
                    </div>

                    {/* Task Content */}
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">Task</label>
                        <input
                            type="text"
                            placeholder="What needs to be done?"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            autoFocus
                            className="w-full px-3 py-2.5 rounded-xl text-sm text-text-primary
                                placeholder:text-text-muted outline-none focus:ring-1 focus:ring-accent/25 transition-all"
                            style={{ background: 'var(--th-input-bg)', border: '1px solid var(--th-input-border)' }}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={!content.trim()}
                        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all
                            ${content.trim()
                                ? 'bg-accent text-white hover:bg-accent/85'
                                : 'bg-black/5 text-text-muted cursor-not-allowed'
                            }
                        `}
                    >
                        Schedule Task
                    </button>
                </form>
            </div>
        </div>
    );
}
