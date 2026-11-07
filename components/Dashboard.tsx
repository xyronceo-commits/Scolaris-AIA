import React, { useState, useEffect } from 'react';
import { UserProfile, Course, StudySession, AcademicDocument, CGPASemester } from '../types';
import { DAYS } from '../constants';
import { getCurrentUserId } from '../lib/supabase';
import { DBService } from '../services/db';
import {
  FileText,
  Calendar,
  Clock,
  ArrowRight,
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  BookOpen
} from 'lucide-react';

interface DashboardProps {
  profile: UserProfile;
  courses: Course[];
  schedule: StudySession[];
  onOpenHub: (courseId: string) => void;
  onNavigate?: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  courses,
  schedule,
  onOpenHub,
  onNavigate
}) => {
  const userId = getCurrentUserId() || '';
  const dayIndex = new Date().getDay();
  const today = DAYS[dayIndex === 0 ? 6 : dayIndex - 1] || 'Monday';

  // Load real academic documents
  const [recentDocs, setRecentDocs] = useState<AcademicDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // Completed task tracking (in memory / local)
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('korsiq_completed_tasks_today');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleTaskCompletion = (taskId: string) => {
    setCompletedTaskIds(prev => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      try {
        localStorage.setItem('korsiq_completed_tasks_today', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save task completion:', err);
      }
      return next;
    });
  };

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

  // Today's priorities
  const todaysTasks = schedule.filter((s) => s.day === today);

  // Real upcoming deadlines
  const upcomingDeadlines: { id: string; title: string; courseCode?: string; date: string }[] = [];
  if (profile.semesterEnd) {
    upcomingDeadlines.push({
      id: 'semester-end',
      title: 'Semester Final Examinations',
      date: new Date(profile.semesterEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    });
  }
  // If recent documents have deadlines or titles
  recentDocs.forEach((doc) => {
    if (doc.targetWordCount && doc.currentWordCount < doc.targetWordCount) {
      upcomingDeadlines.push({
        id: `doc-${doc.id}`,
        title: `${doc.title} Draft Target`,
        date: 'In progress'
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

  return (
    <div className="space-y-6">
      {/* 1. Header: Greeting, Date, and Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E7EB] dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-xs sm:text-sm text-[#5B6472] dark:text-slate-400 mt-0.5">
            {formattedDate}
          </p>
        </div>

        {/* Desktop Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate?.('schedule')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 hover:border-slate-400 text-xs font-medium text-[#111827] dark:text-slate-200 rounded-lg min-h-[44px] transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>+ Task</span>
          </button>
          <button
            onClick={() => onNavigate?.('courses')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>+ Course</span>
          </button>
        </div>
      </div>

      {/* Mobile Course Snapshot Single Line Collapsed per Spec */}
      <div className="lg:hidden p-3 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg text-xs font-medium text-[#111827] dark:text-white flex items-center justify-between">
        <span>Current CGPA {currentCGPA > 0 ? currentCGPA.toFixed(2) : '0.00'} · Target {targetCGPA > 0 ? targetCGPA.toFixed(2) : '0.00'}</span>
        <button
          onClick={() => onNavigate?.('calculator')}
          className="text-[#2563EB] text-xs font-semibold cursor-pointer"
        >
          View Planner →
        </button>
      </div>

      {/* 2. Two Columns Layout on Desktop, Single Column on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ================= LEFT COLUMN ================= */}
        <div className="space-y-6">
          {/* Today's Priorities */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Today's priorities
              </h2>
              <span className="text-xs text-[#5B6472] dark:text-slate-400">
                {today}
              </span>
            </div>

            {todaysTasks.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {todaysTasks.map((task) => {
                  const course = getCourse(task.courseId);
                  const isDone = !!completedTaskIds[task.id];
                  return (
                    <div
                      key={task.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                    >
                      <button
                        onClick={() => toggleTaskCompletion(task.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer min-h-[44px] flex-1 items-center"
                        aria-label={`Mark task ${course?.code || 'Task'} as ${isDone ? 'incomplete' : 'complete'}`}
                      >
                        {isDone ? (
                          <CheckCircle2 size={18} className="text-[#2563EB] shrink-0" />
                        ) : (
                          <Circle size={18} className="text-[#5B6472] hover:text-[#111827] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${isDone ? 'line-through text-[#5B6472]' : 'text-[#111827] dark:text-white'}`}>
                            {course?.code ? `${course.code} · ${task.mode}` : task.mode}
                          </p>
                          <p className="text-[11px] text-[#5B6472] truncate">
                            {course?.title || task.topic || 'Revision Session'}
                          </p>
                        </div>
                      </button>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs text-[#5B6472] dark:text-slate-400">
                          {task.duration} min
                        </span>
                        {task.startTime && (
                          <p className="text-[10px] text-[#5B6472]">{task.startTime}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#5B6472] dark:text-slate-400 space-y-2">
                <Clock size={24} className="mx-auto text-[#5B6472] stroke-1" />
                <p className="font-medium text-[#111827] dark:text-slate-200">No tasks scheduled for today</p>
                <p className="text-[11px]">Generate or plan sessions in your study timetable.</p>
                <button
                  onClick={() => onNavigate?.('schedule')}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#2563EB] bg-[#EFF6FF] rounded-lg hover:bg-blue-100 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Plus size={14} />
                  <span>+ Add task</span>
                </button>
              </div>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Upcoming deadlines
              </h2>
              <Calendar size={16} className="text-[#5B6472]" />
            </div>

            {upcomingDeadlines.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {upcomingDeadlines.map((dl) => (
                  <div
                    key={dl.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-medium text-[#111827] dark:text-white truncate">
                      {dl.title}
                    </span>
                    <span className="font-medium text-[#2563EB] bg-[#EFF6FF] dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded text-[11px] shrink-0">
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
          {/* Study Schedule */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Study schedule
              </h2>
              <button
                onClick={() => onNavigate?.('timetable')}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              >
                Full schedule →
              </button>
            </div>

            {schedule.length > 0 ? (
              <div className="space-y-2">
                {schedule.slice(0, 3).map((sess) => {
                  const course = getCourse(sess.courseId);
                  return (
                    <div
                      key={sess.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#111827] dark:text-white">
                          {sess.day} · {course?.code || 'Session'}
                        </p>
                        <p className="text-[11px] text-[#5B6472] truncate">
                          {sess.mode} ({sess.duration} mins)
                        </p>
                      </div>
                      <button
                        onClick={() => onOpenHub(sess.courseId)}
                        className="text-[#2563EB] hover:text-[#1D4ED8] p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
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
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4">
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
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Recent documents
              </h2>
              <button
                onClick={() => onNavigate?.('studio')}
                className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              >
                Open Studio →
              </button>
            </div>

            {isLoadingDocs ? (
              <div className="py-6 text-center text-xs text-[#5B6472]">Loading recent documents...</div>
            ) : recentDocs.length > 0 ? (
              <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => onNavigate?.('studio')}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs hover:text-[#2563EB] cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText size={16} className="text-[#2563EB] shrink-0" />
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
                  className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Start writing in Studio →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
