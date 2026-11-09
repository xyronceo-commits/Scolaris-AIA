import React, { useState, useEffect } from 'react';
import { UserProfile, Course, StudySession, AcademicDocument, CGPASemester, AcademicTask, TaskCategory } from '../types';
import { DAYS } from '../constants';
import { getCurrentUserId } from '../lib/supabase';
import { DBService } from '../services/db';
import TaskModal from './TaskModal';
import {
  FileText,
  Calendar,
  Clock,
  ArrowRight,
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  BookOpen,
  Edit2,
  Trash2,
  AlertTriangle,
  GraduationCap,
  Filter
} from 'lucide-react';

interface DashboardProps {
  profile: UserProfile;
  courses: Course[];
  schedule: StudySession[];
  onOpenHub: (courseId: string) => void;
  onNavigate?: (tab: any) => void;
  onTasksUpdated?: (tasks: AcademicTask[]) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  courses,
  schedule,
  onOpenHub,
  onNavigate,
  onTasksUpdated
}) => {
  // getCurrentUserId() can be briefly empty right after sign-in; the loaded profile has the same id
  const userId = getCurrentUserId() || profile?.id || '';
  const dayIndex = new Date().getDay();
  const today = DAYS[dayIndex === 0 ? 6 : dayIndex - 1] || 'Monday';
  const todayIso = new Date().toISOString().split('T')[0];

  // Load real academic documents
  const [recentDocs, setRecentDocs] = useState<AcademicDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // Real Academic Tasks
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<AcademicTask | null>(null);
  const [taskFilter, setTaskFilter] = useState<'today' | 'pending' | 'all' | 'completed'>('today');

  // Load real documents
  useEffect(() => {
    if (!userId) return;
    const fetchDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const docs = await DBService.getAcademicDocuments(userId);
        setRecentDocs(docs.slice(0, 4));
      } catch (err) {
        console.warn('Failed to load recent documents:', err);
      } finally {
        setIsLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [userId]);

  // Load real academic tasks
  const loadTasks = async () => {
    if (!userId) return;
    setIsLoadingTasks(true);
    try {
      const fetched = await DBService.getTasks(userId);
      setTasks(fetched);
      if (onTasksUpdated) onTasksUpdated(fetched);
    } catch (err) {
      console.warn('Failed to load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [userId]);

  const handleSaveTask = async (taskData: Omit<AcademicTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    // Throw instead of returning quietly: the task form shows this message and stays open,
    // rather than closing as if the task had been saved.
    if (!userId) throw new Error('We could not confirm your sign-in. Please refresh the page and try again.');
    if (taskToEdit) {
      await DBService.updateTask(userId, taskToEdit.id, taskData);
    } else {
      await DBService.createTask(userId, taskData);
    }
    await loadTasks();
  };

  const handleToggleTask = async (taskId: string) => {
    if (!userId) return;
    // Optimistic toggle
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined } : t));
    await DBService.toggleTaskCompleted(userId, taskId);
    await loadTasks();
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this academic task?')) return;
    if (!userId) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await DBService.deleteTask(userId, taskId);
    await loadTasks();
  };

  const handleEditTask = (task: AcademicTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setTaskToEdit(task);
    setIsTaskModalOpen(true);
  };

  const getCourse = (id: string) => courses.find((c) => c.id === id);

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formattedDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const firstName = profile?.name ? profile.name.trim().split(' ')[0] : 'Student';

  // Real CGPA values calculation
  const calculateCurrentCgpa = (): number => {
    try {
      const raw = localStorage.getItem('scolaris_cgpa_semesters');
      if (raw) {
        const semesters: CGPASemester[] = JSON.parse(raw);
        let totalQualityPoints = 0;
        let totalCredits = 0;
        for (const s of semesters) {
          for (const c of s.courses) {
            const u = Number(c.creditUnits) || 0;
            const points: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
            const pt = points[(c.grade || '').toUpperCase()] ?? 0;
            totalQualityPoints += pt * u;
            totalCredits += u;
          }
        }
        if (totalCredits > 0) return totalQualityPoints / totalCredits;
      }
    } catch {
      // fallback
    }
    return 0;
  };

  const currentCGPA = calculateCurrentCgpa();
  const targetCGPA = profile.targetCGPA ? Number(profile.targetCGPA) : 0.00;
  const totalCredits = courses.reduce((sum, c) => sum + (c.units || 0), 0);

  // Today's schedule study sessions
  const todaysSessions = schedule.filter((s) => s.day === today);

  // Filter tasks based on selected tab
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'today') {
      return t.dueDate === todayIso || (!t.completed && t.dueDate < todayIso);
    }
    if (taskFilter === 'pending') {
      return !t.completed;
    }
    if (taskFilter === 'completed') {
      return t.completed;
    }
    return true; // 'all'
  });

  // Real upcoming deadlines (semester end, documents, plus real academic tasks: assignments, exams, deadlines)
  const upcomingDeadlines: { id: string; title: string; courseCode?: string; date: string; isOverdue?: boolean; category?: string }[] = [];
  
  if (profile.semesterEnd) {
    upcomingDeadlines.push({
      id: 'semester-end',
      title: 'Semester Final Examinations',
      date: new Date(profile.semesterEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      category: 'exam'
    });
  }

  // Include uncompleted task deadlines and exams
  tasks
    .filter(t => !t.completed && (t.category === 'exam' || t.category === 'deadline' || t.category === 'assignment'))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)
    .forEach(t => {
      const course = t.courseId ? getCourse(t.courseId) : undefined;
      const isOverdue = t.dueDate < todayIso;
      const formattedDueDate = new Date(t.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      upcomingDeadlines.push({
        id: `task-${t.id}`,
        title: course?.code ? `${course.code}: ${t.title}` : t.title,
        courseCode: course?.code,
        date: isOverdue ? `Overdue (${formattedDueDate})` : formattedDueDate,
        isOverdue,
        category: t.category
      });
    });

  // Recent documents in-progress targets
  recentDocs.forEach((doc) => {
    if (doc.targetWordCount && doc.currentWordCount < doc.targetWordCount) {
      upcomingDeadlines.push({
        id: `doc-${doc.id}`,
        title: `${doc.title} Draft Target`,
        date: 'In progress',
        category: 'document'
      });
    }
  });

  const formatRelativeTime = (timestamp: string | number) => {
    const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (isNaN(ts) || ts <= 0) return 'Recently';
    const diffMs = Date.now() - ts;
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return 'Edited today';
    if (diffDays === 1) return 'Edited yesterday';
    return `Edited ${diffDays} days ago`;
  };

  const getCategoryBadge = (cat: TaskCategory) => {
    switch (cat) {
      case 'exam':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">Exam</span>;
      case 'assignment':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 border border-blue-200 dark:border-blue-900">Assignment</span>;
      case 'revision':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900">Revision</span>;
      case 'deadline':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900">Deadline</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Task</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with greeting and date */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E7EB] dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-[#5B6472] dark:text-slate-400 mt-0.5">
            {formattedDate}
          </p>
        </div>

        {/* Primary Action Button: Add Task */}
        <button
          onClick={() => {
            setTaskToEdit(null);
            setIsTaskModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>Add task</span>
        </button>
      </div>

      {/* 2. Two Columns Layout on Desktop, Single Column on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ================= LEFT COLUMN ================= */}
        <div className="space-y-6">
          {/* Today's Priorities & Academic Tasks */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                  Today's priorities &amp; tasks
                </h2>
                <span className="text-[11px] text-[#5B6472] dark:text-slate-400">
                  {today} · {filteredTasks.length} active
                </span>
              </div>
              <button
                onClick={() => {
                  setTaskToEdit(null);
                  setIsTaskModalOpen(true);
                }}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] dark:text-blue-400 flex items-center gap-1 cursor-pointer min-h-[44px] px-2"
              >
                <Plus size={14} />
                <span>Add task</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs overflow-x-auto no-scrollbar">
              {(['today', 'pending', 'all', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTaskFilter(tab)}
                  className={`flex-1 min-h-[36px] py-1.5 px-2.5 rounded-md text-center font-medium capitalize transition-colors whitespace-nowrap cursor-pointer ${
                    taskFilter === tab
                      ? 'bg-white dark:bg-slate-900 text-[#111827] dark:text-white shadow-xs font-semibold'
                      : 'text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-slate-200'
                  }`}
                >
                  {tab === 'today' ? "Today" : tab}
                </button>
              ))}
            </div>

            {/* Tasks List */}
            {isLoadingTasks ? (
              <div className="py-8 text-center text-xs text-[#5B6472] dark:text-slate-400">Loading academic tasks...</div>
            ) : filteredTasks.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {filteredTasks.map((task) => {
                  const course = task.courseId ? getCourse(task.courseId) : undefined;
                  const isDone = task.completed;
                  const isOverdue = !isDone && task.dueDate < todayIso;

                  return (
                    <div
                      key={task.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs group"
                    >
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer min-h-[44px] flex-1 items-center"
                        aria-label={`Mark task ${task.title} as ${isDone ? 'incomplete' : 'complete'}`}
                      >
                        {isDone ? (
                          <CheckCircle2 size={18} className="text-[#2563EB] dark:text-blue-400 shrink-0" />
                        ) : (
                          <Circle size={18} className="text-[#5B6472] dark:text-slate-500 hover:text-[#111827] dark:hover:text-slate-200 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`font-medium truncate ${isDone ? 'line-through text-[#5B6472] dark:text-slate-500' : 'text-[#111827] dark:text-slate-100'}`}>
                              {task.title}
                            </p>
                            {getCategoryBadge(task.category)}
                            {isOverdue && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#5B6472] dark:text-slate-400 truncate mt-0.5">
                            {course ? `${course.code} · ` : ''}Due: {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {task.dueTime ? `at ${task.dueTime}` : ''}
                          </p>
                        </div>
                      </button>

                      {/* Action buttons (Edit & Delete) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => handleEditTask(task, e)}
                          className="p-1.5 text-[#5B6472] dark:text-slate-400 hover:text-[#2563EB] dark:hover:text-blue-400 rounded min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer transition-colors"
                          title="Edit task"
                          aria-label={`Edit task ${task.title}`}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          className="p-1.5 text-[#5B6472] dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer transition-colors"
                          title="Delete task"
                          aria-label={`Delete task ${task.title}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#5B6472] dark:text-slate-400 space-y-2">
                <Clock size={24} className="mx-auto text-[#5B6472] dark:text-slate-500 stroke-1" />
                <p className="font-medium text-[#111827] dark:text-slate-200">
                  {taskFilter === 'completed' ? 'No completed tasks yet' : taskFilter === 'today' ? 'No tasks due today' : 'No academic tasks found'}
                </p>
                <p className="text-[11px]">Add assignments, revision goals, or exam dates to track.</p>
                <button
                  onClick={() => {
                    setTaskToEdit(null);
                    setIsTaskModalOpen(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 bg-[#EFF6FF] dark:bg-blue-950/60 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Plus size={14} />
                  <span>+ Add task</span>
                </button>
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Upcoming deadlines &amp; exams
              </h2>
              <Calendar size={16} className="text-[#5B6472] dark:text-slate-400" />
            </div>

            {upcomingDeadlines.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {upcomingDeadlines.map((dl) => (
                  <div
                    key={dl.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#111827] dark:text-white truncate">
                        {dl.title}
                      </p>
                    </div>
                    <span className={`font-medium px-2 py-0.5 rounded text-[11px] shrink-0 ${
                      dl.isOverdue
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        : dl.category === 'exam'
                        ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                        : 'bg-[#EFF6FF] dark:bg-blue-950 text-[#2563EB] dark:text-blue-300'
                    }`}>
                      {dl.date}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#5B6472] dark:text-slate-400">
                No upcoming deadlines recorded.
              </div>
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="space-y-6">
          {/* Study Schedule Sessions */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Study schedule
              </h2>
              <button
                onClick={() => onNavigate?.('timetable')}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] dark:text-blue-400 cursor-pointer"
              >
                Full schedule →
              </button>
            </div>

            {todaysSessions.length > 0 || schedule.length > 0 ? (
              <div className="space-y-2">
                {(todaysSessions.length > 0 ? todaysSessions : schedule.slice(0, 3)).map((sess) => {
                  const course = getCourse(sess.courseId);
                  return (
                    <div
                      key={sess.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#111827] dark:text-white">
                          {sess.day} · {course?.code || 'Session'}
                        </p>
                        <p className="text-[11px] text-[#5B6472] dark:text-slate-400 truncate">
                          {sess.mode} ({sess.duration} mins)
                        </p>
                      </div>
                      <button
                        onClick={() => onOpenHub(sess.courseId)}
                        className="text-[#2563EB] dark:text-blue-400 hover:text-[#1D4ED8] p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        title="Open study session"
                        aria-label={`Open study hub for ${course?.code || 'session'}`}
                      >
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#5B6472] dark:text-slate-400">
                No schedule generated yet. Click Study Planner to create one.
              </div>
            )}
          </div>

          {/* Desktop Course Snapshot per Spec */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Course snapshot
              </h2>
              <span className="text-xs text-[#5B6472] dark:text-slate-400">
                {courses.length} courses this semester ({totalCredits} units)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-1">
                <span className="text-[11px] text-[#5B6472] dark:text-slate-400 font-medium block">
                  Current CGPA
                </span>
                <span className="text-2xl font-bold text-[#111827] dark:text-white font-mono">
                  {currentCGPA > 0 ? currentCGPA.toFixed(2) : '0.00'}
                </span>
              </div>

              <div className="p-3 bg-[#EFF6FF] dark:bg-blue-950/40 rounded-lg space-y-1">
                <span className="text-[11px] text-[#2563EB] dark:text-blue-300 font-medium block">
                  Target CGPA
                </span>
                <span className="text-2xl font-bold text-[#2563EB] dark:text-blue-400 font-mono">
                  {targetCGPA > 0 ? targetCGPA.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Documents */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Recent documents
              </h2>
              <button
                onClick={() => onNavigate?.('studio')}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] dark:text-blue-400 cursor-pointer"
              >
                Open Studio →
              </button>
            </div>

            {isLoadingDocs ? (
              <div className="py-6 text-center text-xs text-[#5B6472] dark:text-slate-400">Loading recent documents...</div>
            ) : recentDocs.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => onNavigate?.('studio')}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs hover:text-[#2563EB] dark:hover:text-blue-400 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText size={16} className="text-[#2563EB] dark:text-blue-400 shrink-0" />
                      <span className="font-medium truncate text-[#111827] dark:text-slate-200">
                        {doc.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#5B6472] dark:text-slate-400 shrink-0">
                      {formatRelativeTime(doc.updatedAt || doc.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#5B6472] dark:text-slate-400 space-y-2">
                <p>No academic papers created yet.</p>
                <button
                  onClick={() => onNavigate?.('studio')}
                  className="text-xs font-semibold text-[#2563EB] hover:underline dark:text-blue-400 cursor-pointer"
                >
                  Start writing in Studio →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Creation & Editing Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskToEdit(null);
        }}
        onSave={handleSaveTask}
        taskToEdit={taskToEdit}
        courses={courses}
      />
    </div>
  );
};

export default Dashboard;
