import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './components/ThemeContext.jsx';
import ThemeSwitcher from './components/ThemeSwitcher.jsx';
import { Sparkles } from 'lucide-react';
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

function AppContent() {
  const todayStr = getTodayBJ();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [tasks, setTasks] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRollover, setShowRollover] = useState(false);
  const [rolloverCandidates, setRolloverCandidates] = useState([]);
  const [showPlanFuture, setShowPlanFuture] = useState(false);
  const [showEdge, setShowEdge] = useState(() => {
    const stored = getJSON('show_edge');
    return stored !== null ? stored : true;
  });

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setTasks(getTasksForDate(selectedDate));
  }, [selectedDate, refreshKey]);

  useEffect(() => {
    const dismissedDate = getJSON(ROLLOVER_DISMISS_KEY);
    if (dismissedDate === todayStr) return;
    const candidates = getPendingRolloverCandidates();
    if (candidates.length > 0) {
      setRolloverCandidates(candidates);
      setShowRollover(true);
    }
  }, [todayStr]);

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
      <Sidebar
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
        onPlanFuture={() => setShowPlanFuture(true)}
        refreshKey={refreshKey}
      />

      <div className="w-px my-6" style={{ background: 'var(--th-divider)' }} />

      {/* Page Edge Vignette Glow */}
      {showEdge && <div className="page-edge-glow" />}

      <main className="flex-1 h-full overflow-y-auto py-6 px-8">
        {/* Top right controls */}
        <div className="flex items-center justify-end gap-1 mb-2">
          <button
            onClick={() => {
              const next = !showEdge;
              setShowEdge(next);
              setJSON('show_edge', next);
            }}
            className={`p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all
              ${showEdge ? 'text-accent' : 'text-text-muted'}`}
            title={showEdge ? 'Hide edge glow' : 'Show edge glow'}
          >
            <Sparkles size={18} />
          </button>
          <ThemeSwitcher />
        </div>

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

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
