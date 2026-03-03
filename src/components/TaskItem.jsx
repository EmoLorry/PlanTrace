import { useState, useRef } from 'react';
import { Hammer, Trash2 } from 'lucide-react';
import { isToday, formatTimeBJ } from '../store/dateUtils.js';
import { getHammerCount } from '../store/actionLogStore.js';

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
            {/* Pen body (faded) */}
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                strokeLinejoin="round" opacity="0.3" />
            {/* Check mark overlay */}
            <path d="M6 13l4 4 8-10"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round" className="animate-check-draw" />
        </svg>
    );
}

export default function TaskItem({ task, selectedDate, onComplete, onHammer, onDelete }) {
    const [isHammering, setIsHammering] = useState(false);
    const hammerRef = useRef(null);

    const isTodayDate = isToday(selectedDate);
    const isCompleted = task.status === 'completed';
    const isPending = task.status === 'pending';
    const hammerCount = getHammerCount(task.id, selectedDate);

    const handleHammer = () => {
        if (!isTodayDate || !isPending) return;
        setIsHammering(true);
        onHammer(task.id);
        setTimeout(() => setIsHammering(false), 350);
    };

    const handleComplete = () => {
        if (!isTodayDate || !isPending) return;
        onComplete(task.id);
    };

    const handleDelete = () => {
        onDelete(task.id);
    };

    return (
        <div className={`group glass-subtle flex items-center gap-3 px-4 py-3.5 transition-all duration-200
      hover:bg-white/8 animate-fade-in
      ${isCompleted ? 'opacity-50' : ''}
    `}>
            {/* Status Icon */}
            <button
                onClick={handleComplete}
                disabled={!isTodayDate || isCompleted}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all
          ${isCompleted
                        ? 'text-green cursor-default'
                        : isTodayDate
                            ? 'text-white/40 hover:text-accent hover:bg-accent/10 cursor-pointer'
                            : 'text-white/20 cursor-not-allowed'
                    }
        `}
                title={isCompleted ? 'Completed' : isTodayDate ? 'Mark complete' : 'Can only complete today\'s tasks'}
            >
                {isCompleted ? <CheckIcon className="w-5 h-5" /> : <PenIcon className="w-5 h-5" />}
            </button>

            {/* Task Content */}
            <div className="flex-1 min-w-0">
                <p className={`text-sm leading-relaxed ${isCompleted ? 'line-through text-white/35' : 'text-white/85'
                    }`}>
                    {task.content}
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-white/20">
                        {formatTimeBJ(task.created_at)}
                    </span>
                    {hammerCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber/60 bg-amber/8 px-1.5 py-0.5 rounded-full">
                            <Hammer size={9} />
                            {hammerCount}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Hammer Button */}
                {isPending && isTodayDate && (
                    <button
                        onClick={handleHammer}
                        className={`p-1.5 rounded-lg hover:bg-amber/15 text-white/30 hover:text-amber transition-all
              ${isHammering ? 'animate-hammer' : ''}`}
                        title="I worked on this today"
                    >
                        <Hammer size={15} />
                    </button>
                )}

                {/* Delete Button */}
                <button
                    onClick={handleDelete}
                    className="p-1.5 rounded-lg hover:bg-red/15 text-white/30 hover:text-red transition-all"
                    title="Delete task"
                >
                    <Trash2 size={15} />
                </button>
            </div>
        </div>
    );
}
