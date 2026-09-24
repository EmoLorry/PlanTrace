import TaskItem from './TaskItem.jsx';
import { ClipboardList } from 'lucide-react';
import { getAllLogs } from '../store/actionLogStore.js';
import { isTaskCompletedOnDate } from '../store/taskStore.js';

export default function TaskList({ tasks, selectedDate, onComplete, onEditContent, onTimerStop, onDelete }) {
    const logs = getAllLogs();
    const isCompletedOnSelectedDate = (task) => isTaskCompletedOnDate(task, selectedDate, logs);
    const sorted = [...tasks].sort((a, b) => {
        const aCompleted = isCompletedOnSelectedDate(a);
        const bCompleted = isCompletedOnSelectedDate(b);
        if (aCompleted && !bCompleted) return 1;
        if (!aCompleted && bCompleted) return -1;
        return a.created_at - b.created_at;
    });

    const pendingCount = sorted.filter((task) => !isCompletedOnSelectedDate(task)).length;
    const completedCount = sorted.filter((task) => isCompletedOnSelectedDate(task)).length;

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
                        onEditContent={onEditContent}
                        onTimerStop={onTimerStop}
                        onDelete={onDelete}
                    />
                ))}
            </div>
        </div>
    );
}
