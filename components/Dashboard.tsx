import React, { useState, useEffect } from 'react';
import { UserProfile, Course, StudySession, AcademicDocument, CGPASemester, AcademicTask, TaskCategory, Difficulty } from '../types';
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
  onUpdateProfile?: (updatedProfile: UserProfile) => void;
  onAddCourse?: (course: Course) => void;
}

const MAX_COURSES = 12;

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  courses,
  schedule,
  onOpenHub,
  onNavigate,
  onTasksUpdated,
  onUpdateProfile,
  onAddCourse
}) => {
  const userId = getCurrentUserId() || (profile as any)?.id || (profile as any)?.userId || '';
  const dayIndex = new Date().getDay();
  const today = DAYS[dayIndex === 0 ? 6 : dayIndex - 1] || 'Monday';
  const todayIso = new Date().toISOString().split('T')[0];

  // Quick "Add course" modal
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseUnits, setNewCourseUnits] = useState(3);
  const [courseError, setCourseError] = useState<string | null>(null);

  const closeCourseModal = () => {
    setIsCourseModalOpen(false);
    setNewCourseCode('');
    setNewCourseTitle('');
    setNewCourseUnits(3);
    setCourseError(null);
  };

  const handleAddCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCourseCode.trim().toUpperCase();
    const title = newCourseTitle.trim();
    if (!code || !title) {
      setCourseError('Enter a course code and title.');
      return;
    }
    if (courses.length >= MAX_COURSES) {
      setCourseError(`Course limit reached. You can add up to ${MAX_COURSES} courses.`);
      return;
    }
    if (courses.some(c => c.code.toUpperCase() === code)) {
      setCourseError(`${code} is already in your courses.`);
      return;
    }
    onAddCourse?.({
      id: crypto.randomUUID(),
      code,
      title,
      units: Number(newCourseUnits) || 3,
      difficulty: Difficulty.MEDIUM
    });
    closeCourseModal();
  };

  // Load real academic documents
  const [recentDocs, setRecentDocs] = useState<AcademicDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // Real Academic Tasks
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<AcademicTask | null>(null);
  const [taskFilter, setTaskFilter] = useState<'today' | 'pending' | 'all' | 'completed'>('today');

  // Inline department prompt for discipline-tailored AI
  const [departmentInput, setDepartmentInput] = useState('');
  const [isSavingDept, setIsSavingDept] = useState(false);
  const deptDismissKey = userId ? `scolaris_dept_prompt_dismissed_${userId}` : '';
  const [deptPromptDismissed, setDeptPromptDismissed] = useState<boolean>(() => {
    try {
      return !!deptDismissKey && localStorage.getItem(deptDismissKey) === '1';
    } catch {
      return false;
    }
  });
  const [deptSavedSuccess, setDeptSavedSuccess] = useState(false);
  const [deptSaveError, setDeptSaveError] = useState<string | null>(null);

  // Once a department exists on the profile, the banner never shows again.
  const hasMissingDepartment = !(profile?.department?.trim() || profile?.major?.trim());

  const dismissDeptPrompt = () => {
    setDeptPromptDismissed(true);
    try {
      if (deptDismissKey) localStorage.setItem(deptDismissKey, '1');
    } catch {
      /* storage unavailable */
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = departmentInput.trim();
    if (!value || !userId) return;
    setIsSavingDept(true);
    setDeptSaveError(null);
    try {
      const updated: UserProfile = { ...profile, department: value, major: value };
      // Single write; App's profile state is then updated so the banner stays hidden on remount.
      const result = await DBService.saveProfile(userId, updated);
      if (result?.error || (result as any)?.droppedExtendedFields) {
        setDeptSaveError("We couldn't save your department. Please try again or set it in Settings.");
        return;
      }
      onUpdateProfile?.(updated);
      setDeptSavedSuccess(true);
      setTimeout(() => setDeptSavedSuccess(false), 1800);
    } catch (err) {
      console.error('Failed to save department:', err);
      setDeptSaveError("We couldn't save your department. Please try again.");
    } finally {
      setIsSavingDept(false);
    }
  };

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

  const effectiveUid = userId || (profile as any)?.id || (profile as any)?.userId || '';

  const handleSaveTask = async (taskData: Omit<AcademicTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if (!effectiveUid) {
      console.warn('Cannot save task: User ID is unavailable.');
      return;
    }
    if (taskToEdit) {
      await DBService.updateTask(effectiveUid, taskToEdit.id, taskData);
    } else {
      await DBService.createTask(effectiveUid, taskData);
    }
    await loadTasks();
  };

  const handleToggleTask = async (taskId: string) => {
    if (!effectiveUid) return;
    // Optimistic toggle
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined } : t));
    await DBService.toggleTaskCompleted(effectiveUid, taskId);
    await loadTasks();
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this academic task?')) return;
    if (!effectiveUid) return;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await DBService.deleteTask(effectiveUid, taskId);
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

        {/* Actions on the same row as the greeting: Add task (primary) + Add course (secondary) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCourseModalOpen(true)}
            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 border border-[#2563EB] text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium rounded-lg min-h-[44px] transition-colors cursor-pointer"
          >
            <BookOpen size={16} />
            <span>Add course</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTaskToEdit(null);
              setIsTaskModalOpen(true);
            }}
            className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer"
          >
            <Plus size={16} />
            <span>Add task</span>
          </button>
        </div>
      </div>

      {/* Quick Add Course modal */}
      {isCourseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-course-title"
          onClick={closeCourseModal}
        >
          <form
            onSubmit={handleAddCourseSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl p-5 space-y-4"
          >
            <h2 id="add-course-title" className="text-base font-bold text-[#111827] dark:text-white">Add course</h2>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 text-xs font-medium text-[#5B6472] dark:text-slate-400 space-y-1">
                <span>Course code</span>
                <input
                  autoFocus
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="e.g. BLD301"
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded-lg min-h-[44px] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </label>
              <label className="text-xs font-medium text-[#5B6472] dark:text-slate-400 space-y-1">
                <span>Units</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={newCourseUnits}
                  onChange={(e) => setNewCourseUnits(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded-lg min-h-[44px] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-[#5B6472] dark:text-slate-400 space-y-1">
              <span>Course title</span>
              <input
                value={newCourseTitle}
                onChange={(e) => setNewCourseTitle(e.target.value)}
                placeholder="e.g. Advanced Construction Technology"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white rounded-lg min-h-[44px] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </label>
            {courseError && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{courseError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeCourseModal} className="px-4 min-h-[44px] text-sm font-medium text-[#5B6472] dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 min-h-[44px] text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg cursor-pointer">
                Save course
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inline Department Prompt for discipline-tailored AI */}
      {((hasMissingDepartment && !deptPromptDismissed) || deptSavedSuccess) && (
        <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-lg p-4 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                <GraduationCap size={15} className="text-[#2563EB]" />
                <span>Tailor AI to your course of study</span>
              </div>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80">
                Enter your department so all AI explanations, case studies, and exam hints match your discipline.
              </p>
            </div>
            {deptSavedSuccess ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={16} /> Saved!
              </span>
            ) : (
              <form onSubmit={handleSaveDepartment} className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={departmentInput}
                  onChange={(e) => setDepartmentInput(e.target.value)}
                  placeholder="e.g. Building Technology, Law, Nursing..."
                  className="w-full sm:w-64 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white min-h-[40px]"
                  required
                />
                <button
                  type="submit"
                  disabled={isSavingDept || !departmentInput.trim()}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-md transition-colors shrink-0 min-h-[40px] cursor-pointer"
                >
                  {isSavingDept ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={dismissDeptPrompt}
                  className="px-2 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 shrink-0 cursor-pointer min-h-[40px]"
                  title="Dismiss for now"
                >
                  Later
                </button>
              </form>
            )}
          </div>
          {deptSaveError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{deptSaveError}</p>
          )}
        </div>
      )}

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
