import { useState } from 'react';
import { Plus } from 'lucide-react';
import { getFullDateDisplay, isToday } from '../store/dateUtils.js';

export default function Toolbar({ selectedDate, onAddTask }) {
    const [input, setInput] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim()) {
            onAddTask(input.trim());
            setInput('');
            setIsExpanded(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setInput('');
            setIsExpanded(false);
        }
    };

    return (
        <div className="px-1 mb-6">
            {/* Date Display */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-2xl font-semibold text-white/90 tracking-tight">
                        {getFullDateDisplay(selectedDate)}
                    </h2>
                    {isToday(selectedDate) && (
                        <span className="inline-block mt-1 text-[11px] font-semibold uppercase tracking-widest
              text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                            Current Day
                        </span>
                    )}
                </div>
            </div>

            {/* Add Task */}
            <form onSubmit={handleSubmit} className="relative">
                <div className={`glass-subtle flex items-center gap-2 px-4 py-3 transition-all duration-200
          ${isExpanded ? 'ring-1 ring-accent/30 bg-white/8!' : 'hover:bg-white/8'}`}
                >
                    <Plus size={18} className="text-white/30 shrink-0" />
                    <input
                        type="text"
                        placeholder="Add a new task..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onFocus={() => setIsExpanded(true)}
                        onBlur={() => !input && setIsExpanded(false)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent outline-none text-sm text-white/90
              placeholder:text-white/25 font-light"
                    />
                    {isExpanded && input.trim() && (
                        <button
                            type="submit"
                            className="px-3 py-1 rounded-lg bg-accent/20 text-accent text-xs font-medium
                hover:bg-accent/30 transition-colors shrink-0"
                        >
                            Add
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
