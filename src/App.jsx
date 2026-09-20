import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './components/ThemeContext.jsx';
import ThemeSwitcher from './components/ThemeSwitcher.jsx';
import TraceStar from './pages/TraceStar/ThreeDTraceView.jsx';
import { CircleHelp, Sparkles, Star, BookOpen, CalendarDays, RefreshCw } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import TaskList from './components/TaskList.jsx';
import RolloverModal from './components/RolloverModal.jsx';
import PlanFutureModal from './components/PlanFutureModal.jsx';
import AtomicTimer from './components/AtomicTimer.jsx';
import DiaryModal from './components/DiaryModal.jsx';
import WeekView from './components/WeekView.jsx';
import UpdateModal from './components/UpdateModal.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
import { checkUpdateStatus } from './store/versionStore.js';
import { markOnboardingSeen, shouldAutoShowOnboarding } from './store/onboardingStore.js';
import { getTodayBJ } from './store/dateUtils.js';
import { getJSON, initFileStorage, setJSON } from './store/storage.js';
import {
  getTasksForDate,
  createTask,
  editTaskContent,
  completeTask,
  deleteTask,
  hammerTask,
  addTimeSpent,
  rolloverTask,
  getPendingRolloverCandidates,
} from './store/taskStore.js';


const ROLLOVER_DISMISS_KEY = 'rollover_dismissed';

function AppContent() {
  const navigate = useNavigate();
  const todayStr = getTodayBJ();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [_refreshKey, setRefreshKey] = useState(0);
  const [showRollover, setShowRollover] = useState(false);
  const [rolloverCandidates, setRolloverCandidates] = useState([]);
  const [showPlanFuture, setShowPlanFuture] = useState(false);
  const [showDiary,      setShowDiary]      = useState(false);
  const [showWeekView,   setShowWeekView]   = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [updateManifest, setUpdateManifest] = useState(null);  // remote version info
  const [updateIsManual, setUpdateIsManual] = useState(false); // triggered by button?
  const [showEdge, setShowEdge] = useState(() => {
    const stored = getJSON('show_edge');
    return stored !== null ? stored : true;
  });

  // Auto version check on mount — 1s delay, silent on error
  useEffect(() => {
    const t = setTimeout(async () => {
      const result = await checkUpdateStatus({ force: false });
      if (result.status === 'update') setUpdateManifest(result.manifest);
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (shouldAutoShowOnboarding()) setShowOnboarding(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateIsManual(true);
    const result = await checkUpdateStatus({ force: true });
    if (result.status === 'update') {
      setUpdateManifest(result.manifest);
    } else if (result.status === 'unreachable') {
      alert('暂时无法连接到更新服务器，请检查 GitHub/jsDelivr 网络访问后再试。');
    } else {
      alert(`PlanTrace 已是最新版本 ✓\n当前版本：v${result.localVersion}\n远端版本：v${result.remoteVersion || '未知'}`);
    }
  };

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const tasks = getTasksForDate(selectedDate);

  useEffect(() => {
    const timer = setTimeout(() => {
      const dismissedDate = getJSON(ROLLOVER_DISMISS_KEY);
      if (dismissedDate === todayStr) return;
      const candidates = getPendingRolloverCandidates();
      if (candidates.length > 0) {
        setRolloverCandidates(candidates);
        setShowRollover(true);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [todayStr]);

  const handleAddTask = useCallback((content, dateStr) => {
    const targetDate = dateStr || selectedDate;
    createTask(content, targetDate);
    refresh();
  }, [selectedDate, refresh]);

  const handleEditContent = useCallback((taskId, newContent) => {
    editTaskContent(taskId, newContent);
    refresh();
  }, [refresh]);

  const handleComplete = useCallback((taskId) => {
    completeTask(taskId);
    refresh();
  }, [refresh]);

  const handleTimerStop = useCallback((taskId, seconds) => {
    const todayStr2 = getTodayBJ();
    addTimeSpent(taskId, todayStr2, seconds);
    hammerTask(taskId, seconds);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback((taskId) => {
    deleteTask(taskId, selectedDate);
    refresh();
  }, [selectedDate, refresh]);

  const handleRollover = useCallback((taskIds) => {
    taskIds.forEach((id) => rolloverTask(id));
    setJSON(ROLLOVER_DISMISS_KEY, todayStr); // 继承完成后自动记录今日不再提醒
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
    navigate('/');
  }, [navigate]);

  const handleCloseOnboarding = useCallback(() => {
    markOnboardingSeen();
    setShowOnboarding(false);
  }, []);

  return (
    <Routes>
      <Route path="/" element={
        <div className="h-full w-full flex">
          <Sidebar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            onPlanFuture={() => setShowPlanFuture(true)}
          />

          <div className="w-px my-6" style={{ background: 'var(--th-divider)' }} />

          {/* Page Edge Vignette Glow */}
          {showEdge && <div className="page-edge-glow" />}

          <main className="flex-1 h-full overflow-y-auto py-6 px-8 relative">
            {/* Top-right icon controls */}
            <div className="flex items-center justify-end gap-1 mb-2">
              <button
                onClick={() => setShowOnboarding(true)}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-muted hover:text-accent"
                title="新手指引 / Quick guide"
                aria-label="新手指引"
              >
                <CircleHelp size={18} />
              </button>
              <button
                onClick={handleCheckUpdate}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-muted hover:text-sky-400"
                title="检查更新 / Check for updates"
                aria-label="检查更新"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={() => setShowDiary(true)}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-muted hover:text-amber-400"
                title="日记"
              >
                <BookOpen size={18} />
              </button>
              <button
                onClick={() => setShowWeekView(true)}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-muted hover:text-emerald-400"
                title="周日程"
              >
                <CalendarDays size={18} />
              </button>
              <button
                onClick={() => navigate('/tracestar')}
                className="p-2 rounded-xl hover:bg-[var(--th-hover)] transition-all text-text-muted hover:text-indigo-400"
                title="TraceStar"
              >
                <Star size={18} />
              </button>
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

            {/* Two-column body */}
            <div className="main-page-grid">
              {/* Left: tasks (Toolbar completely original) */}
              <div className="main-task-col">
                <Toolbar
                  selectedDate={selectedDate}
                  onAddTask={(content) => handleAddTask(content)}
                />
                <TaskList
                  tasks={tasks}
                  selectedDate={selectedDate}
                  onComplete={handleComplete}
                  onEditContent={handleEditContent}
                  onTimerStop={handleTimerStop}
                  onDelete={handleDelete}
                />
              </div>

              {/* Right: Atomic Timer, top aligned with "Add task" input */}
              <div className="main-atomic-col">
                <AtomicTimer selectedDate={selectedDate} />
              </div>
            </div>
          </main>


          {showRollover && (
            <RolloverModal
              candidates={rolloverCandidates}
              onRollover={handleRollover}
              onDismissToday={handleRolloverDismiss}
              onClose={() => {
                setJSON(ROLLOVER_DISMISS_KEY, todayStr); // X关闭也记录今日不再提醒
                setShowRollover(false);
              }}
            />
          )}

          {showPlanFuture && (
            <PlanFutureModal
              onAddTask={handleAddTask}
              onClose={() => setShowPlanFuture(false)}
            />
          )}

          {showDiary && (
            <DiaryModal
              selectedDate={selectedDate}
              onClose={() => setShowDiary(false)}
            />
          )}

          {showWeekView && (
            <WeekView
              initialDate={selectedDate}
              onClose={() => setShowWeekView(false)}
            />
          )}

          {updateManifest && (
            <UpdateModal
              manifest={updateManifest}
              isManual={updateIsManual}
              onClose={() => { setUpdateManifest(null); setUpdateIsManual(false); }}
              onSkip={() => { setUpdateManifest(null); setUpdateIsManual(false); }}
            />
          )}

          <AnimatePresence>
            {showOnboarding && (
              <OnboardingModal onClose={handleCloseOnboarding} />
            )}
          </AnimatePresence>
        </div>
      } />
      <Route path="/tracestar" element={<TraceStar />} />
    </Routes>
  );
}

function DataBootstrap({ children }) {
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    initFileStorage()
      .then(() => { if (alive) setState('ready'); })
      .catch(() => { if (alive) setState('ready'); });
    return () => { alive = false; };
  }, []);

  if (state !== 'ready') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-sm tracking-wide">Loading PlanTrace data...</div>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <DataBootstrap>
      <ThemeProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ThemeProvider>
    </DataBootstrap>
  );
}
