import { useState } from 'react';
import { X, CalendarPlus } from 'lucide-react';
import { getTodayBJ, shiftDate } from '../store/dateUtils.js';

export default function PlanFutureModal({ onAddTask, onClose }) {
    const [dateStr, setDateStr] = useState(shiftDate(getTodayBJ(), 7)); // default 1 week ahead
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
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="glass w-full max-w-sm p-6 animate-modal-in"
                style={{ background: 'rgba(20, 16, 48, 0.85)', backdropFilter: 'blur(24px)' }}>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <CalendarPlus size={20} className="text-accent/70" />
                        <h3 className="text-lg font-semibold text-white/90">Plan Ahead</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Date Picker */}
                    <div>
                        <label className="block text-xs text-white/40 mb-1.5">Select Date</label>
                        <input
                            type="date"
                            value={dateStr}
                            min={todayStr}
                            onChange={(e) => setDateStr(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl glass-subtle bg-white/5 text-sm text-white/80
                outline-none focus:ring-1 focus:ring-accent/30 transition-all
                [color-scheme:dark]"
                        />
                    </div>

                    {/* Task Content */}
                    <div>
                        <label className="block text-xs text-white/40 mb-1.5">Task</label>
                        <input
                            type="text"
                            placeholder="What needs to be done?"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            autoFocus
                            className="w-full px-3 py-2.5 rounded-xl glass-subtle bg-white/5 text-sm text-white/80
                placeholder:text-white/20 outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={!content.trim()}
                        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all
              ${content.trim()
                                ? 'bg-accent/20 text-accent hover:bg-accent/30'
                                : 'bg-white/5 text-white/20 cursor-not-allowed'
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
