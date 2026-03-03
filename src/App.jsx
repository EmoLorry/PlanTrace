import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import TaskList from './components/TaskList.jsx';
import RolloverModal from './components/RolloverModal.jsx';
import PlanFutureModal from './components/PlanFutureModal.jsx';
import { getTodayBJ } from './store/dateUtils.js';
import { getJSON, setJSON } from './store/storage.js';
import {
  getTasksForDate,
  createTask,
  completeTask,
  deleteTask,
  hammerTask,
  rolloverTask,
  getPendingRolloverCandidates,
} from './store/taskStore.js';

const ROLLOVER_DISMISS_KEY = 'rollover_dismissed';

export default function App() {
  const todayStr = getTodayBJ();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [tasks, setTasks] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRollover, setShowRollover] = useState(false);
  const [rolloverCandidates, setRolloverCandidates] = useState([]);
  const [showPlanFuture, setShowPlanFuture] = useState(false);

  // Force re-read tasks from storage
  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Load tasks for selected date
  useEffect(() => {
    setTasks(getTasksForDate(selectedDate));
  }, [selectedDate, refreshKey]);

  // Check rollover on mount
  useEffect(() => {
    const dismissedDate = getJSON(ROLLOVER_DISMISS_KEY);
    if (dismissedDate === todayStr) return;

    const candidates = getPendingRolloverCandidates();
    if (candidates.length > 0) {
      setRolloverCandidates(candidates);
      setShowRollover(true);
    }
  }, [todayStr]);

  // Handlers
  const handleAddTask = useCallback((content, dateStr) => {
    const targetDate = dateStr || selectedDate;
    createTask(content, targetDate);
    refresh();
  }, [selectedDate, refresh]);

  const handleComplete = useCallback((taskId) => {
    completeTask(taskId);
    refresh();
  }, [refresh]);

  const handleHammer = useCallback((taskId) => {
    hammerTask(taskId);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback((taskId) => {
    deleteTask(taskId, selectedDate);
    refresh();
  }, [selectedDate, refresh]);

  const handleRollover = useCallback((taskIds) => {
    taskIds.forEach((id) => rolloverTask(id));
    setShowRollover(false);
    // Switch to today if not already
    setSelectedDate(todayStr);
    refresh();
  }, [todayStr, refresh]);

  const handleRolloverDismiss = useCallback(() => {
    setJSON(ROLLOVER_DISMISS_KEY, todayStr);
    setShowRollover(false);
  }, [todayStr]);

  const handleDateSelect = useCallback((dateStr) => {
    setSelectedDate(dateStr);
  }, []);

  return (
    <div className="h-full w-full flex">
      {/* Sidebar */}
      <Sidebar
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
        onPlanFuture={() => setShowPlanFuture(true)}
        refreshKey={refreshKey}
      />

      {/* Divider */}
      <div className="w-px bg-white/8 my-6" />

      {/* Main Content */}
      <main className="flex-1 h-full overflow-y-auto py-6 px-8">
        <div className="max-w-2xl mx-auto">
          <Toolbar
            selectedDate={selectedDate}
            onAddTask={(content) => handleAddTask(content)}
          />
          <TaskList
            tasks={tasks}
            selectedDate={selectedDate}
            onComplete={handleComplete}
            onHammer={handleHammer}
            onDelete={handleDelete}
          />
        </div>
      </main>

      {/* Modals */}
      {showRollover && (
        <RolloverModal
          candidates={rolloverCandidates}
          onRollover={handleRollover}
          onDismissToday={handleRolloverDismiss}
          onClose={() => setShowRollover(false)}
        />
      )}

      {showPlanFuture && (
        <PlanFutureModal
          onAddTask={handleAddTask}
          onClose={() => setShowPlanFuture(false)}
        />
      )}
    </div>
  );
}
