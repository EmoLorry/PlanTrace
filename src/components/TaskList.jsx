import TaskItem from './TaskItem.jsx';
import { ClipboardList } from 'lucide-react';

export default function TaskList({ tasks, selectedDate, onComplete, onHammer, onDelete }) {
    const sorted = [...tasks].sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return a.created_at - b.created_at;
    });

    const pendingCount = sorted.filter((t) => t.status === 'pending').length;
    const completedCount = sorted.filter((t) => t.status === 'completed').length;

    if (sorted.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                <ClipboardList size={48} strokeWidth={1} className="mb-4 opacity-40" />
                <p className="text-sm font-light">No tasks for this day</p>
                <p className="text-xs mt-1 text-text-muted/60">Add one above to get started</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center gap-4 px-1 text-xs text-text-muted">
                {pendingCount > 0 && (
                    <span>{pendingCount} pending</span>
                )}
                {completedCount > 0 && (
                    <span className="text-green/70">{completedCount} completed</span>
                )}
            </div>

            {/* Task Items */}
            <div className="space-y-2">
                {sorted.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        selectedDate={selectedDate}
                        onComplete={onComplete}
                        onHammer={onHammer}
                        onDelete={onDelete}
                    />
                ))}
            </div>
        </div>
    );
}
