import React, { useState, useEffect } from 'react';
import { UserProfile, Course, StudySession, AcademicDocument } from '../types';
import { DAYS } from '../constants';
import { UserAvatar } from './UserAvatar';
import { getCurrentUserId } from '../lib/supabase';
import { DBService } from '../services/db';
import {
  FileText,
  Calendar,
  BookOpen,
  Calculator,
  Users,
  Clock,
  ArrowRight,
  Plus,
  BrainCircuit,
  CheckCircle2,
  AlertCircle
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
  const today = DAYS[new Date().getDay() - 1] || 'Monday';
  const todaysTasks = schedule.filter((s) => s.day === today);

  const getCourse = (id: string) => courses.find((c) => c.id === id);

  // Load real academic documents from DB
  const [recentDocs, setRecentDocs] = useState<AcademicDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

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

  // Next upcoming session calculation
  const getNextSession = () => {
    if (schedule.length === 0) return null;
    const targetDaysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const currentDayOfWeek = new Date().getDay();
    const currentDayIdx = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const dayToNum = (day: string) => targetDaysOrder.indexOf(day);

    const sorted = [...schedule].sort((a, b) => {
      const distA = (dayToNum(a.day) - currentDayIdx + 7) % 7;
      const distB = (dayToNum(b.day) - currentDayIdx + 7) % 7;
      return distA - distB;
    });

    return sorted[0];
  };

  const nextSession = getNextSession();
  const nextSessionCourse = nextSession ? getCourse(nextSession.courseId) : null;

  return (
    <div className="space-y-6 font-sans text-gray-900 pb-16 animate-in fade-in duration-300">
      {/* 1. Header: Welcome & Academic Metadata */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Welcome, {profile.name}
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {profile.tier === 'scholar' || profile.tier === 'sage' || profile.isPro ? 'Scholar Tier' : 'Student'}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-normal">
            {profile.university || 'University Student'}
            {profile.department ? ` • ${profile.department}` : ''}
            {profile.level ? ` • ${profile.level}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate?.('studio')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>New Academic Paper</span>
          </button>
          <button
            onClick={() => onNavigate?.('profile')}
            className="p-1 hover:ring-2 hover:ring-gray-200 rounded-full transition-all cursor-pointer"
            title="Profile & Settings"
          >
            <UserAvatar
              avatarIcon={profile.avatarIcon || 'graduation-cap'}
              name={profile.name}
              size="md"
            />
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Bar (Real Data Only) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-gray-500">Enrolled Courses</p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">{courses.length}</span>
            <BookOpen size={16} className="text-gray-400" />
          </div>
          <p className="text-[11px] text-gray-500">
            {courses.reduce((sum, c) => sum + (c.units || 0), 0)} total credit units
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-gray-500">Target CGPA</p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-600">
              {profile.targetCGPA ? Number(profile.targetCGPA).toFixed(2) : '0.00'}
            </span>
            <Calculator size={16} className="text-gray-400" />
          </div>
          <p className="text-[11px] text-gray-500">Academic goal target</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-gray-500">Today's Study Schedule</p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">{todaysTasks.length}</span>
            <Calendar size={16} className="text-gray-400" />
          </div>
          <p className="text-[11px] text-gray-500">
            {todaysTasks.length > 0 ? `${today} revision sessions` : 'No sessions today'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-gray-500">Academic Studio Papers</p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">{recentDocs.length}</span>
            <FileText size={16} className="text-gray-400" />
          </div>
          <p className="text-[11px] text-gray-500">Active drafts in workspace</p>
        </div>
      </div>

      {/* 3. Quick Action Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate?.('studio')}
          className="p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-gray-900 group-hover:text-blue-600">Academic Studio</p>
            <p className="text-[11px] text-gray-500">Draft papers &amp; theses</p>
          </div>
          <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
        </button>

        <button
          onClick={() => onNavigate?.('hub')}
          className="p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-gray-900 group-hover:text-blue-600">Study Assistant</p>
            <p className="text-[11px] text-gray-500">Course AI tutor &amp; quiz</p>
          </div>
          <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
        </button>

        <button
          onClick={() => onNavigate?.('calculator')}
          className="p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-gray-900 group-hover:text-blue-600">CGPA Tracker</p>
            <p className="text-[11px] text-gray-500">Grade &amp; target planning</p>
          </div>
          <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
        </button>

        <button
          onClick={() => onNavigate?.('groups')}
          className="p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-left transition-colors cursor-pointer flex items-center justify-between group"
        >
          <div>
            <p className="text-xs font-semibold text-gray-900 group-hover:text-blue-600">Study Circles</p>
            <p className="text-[11px] text-gray-500">Peer groups &amp; invites</p>
          </div>
          <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
        </button>
      </div>

      {/* 4. Two-Column Workspace (Upcoming Timetable & Recent Studio Documents) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column A: Timetable & Focus Tasks */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Today's Timetable ({today})
            </h2>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              View Full Schedule →
            </button>
          </div>

          {todaysTasks.length > 0 ? (
            <div className="space-y-2.5">
              {todaysTasks.map((task, idx) => {
                const course = getCourse(task.courseId);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{course?.code || 'ACAD'}</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                          {task.mode}
                        </span>
                      </div>
                      <p className="text-gray-500 truncate">{course?.title || task.courseId}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 flex items-center gap-1 justify-end">
                          <Clock size={12} className="text-gray-400" />
                          <span>{task.duration} min</span>
                        </p>
                        {task.startTime && <p className="text-[10px] text-gray-400">{task.startTime}</p>}
                      </div>
                      <button
                        onClick={() => onOpenHub(task.courseId)}
                        className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-blue-600 cursor-pointer"
                        title="Open Study Hub"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-gray-200 rounded-lg space-y-2">
              <Calendar size={24} className="mx-auto text-gray-400" />
              <p className="text-xs font-semibold text-gray-700">No study sessions scheduled for {today}</p>
              <p className="text-[11px] text-gray-500">
                Keep consistent study habits by setting regular focus blocks on your timetable.
              </p>
              <button
                onClick={() => onNavigate?.('schedule')}
                className="mt-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                + Add Session
              </button>
            </div>
          )}
        </div>

        {/* Column B: Recent Academic Studio Documents */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Recent Academic Documents
            </h2>
            <button
              onClick={() => onNavigate?.('studio')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Open Studio →
            </button>
          </div>

          {isLoadingDocs ? (
            <div className="p-8 text-center text-xs text-gray-400">Loading documents...</div>
          ) : recentDocs.length > 0 ? (
            <div className="space-y-2.5">
              {recentDocs.map((doc) => {
                const pct = Math.min(100, Math.round(((doc.currentWordCount || 0) / (doc.targetWordCount || 1)) * 100));
                return (
                  <div
                    key={doc.id}
                    onClick={() => onNavigate?.('studio')}
                    className="p-3 bg-gray-50 border border-gray-200 hover:border-blue-300 rounded-lg flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer group"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">
                          {doc.title}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded shrink-0">
                          {doc.docType.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span>{doc.currentWordCount.toLocaleString()} / {doc.targetWordCount.toLocaleString()} words</span>
                        <span>{pct}% complete</span>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 shrink-0" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-gray-200 rounded-lg space-y-2">
              <FileText size={24} className="mx-auto text-gray-400" />
              <p className="text-xs font-semibold text-gray-700">No academic papers created yet</p>
              <p className="text-[11px] text-gray-500">
                Plan and write structured assignments, term papers, research proposals, or final-year projects.
              </p>
              <button
                onClick={() => onNavigate?.('studio')}
                className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                + Create First Paper
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Enrolled Courses List */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Enrolled Academic Courses ({courses.length})
          </h2>
          <button
            onClick={() => onNavigate?.('courses')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Manage Courses →
          </button>
        </div>

        {courses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {courses.map((course) => (
              <div
                key={course.id}
                onClick={() => onOpenHub(course.id)}
                className="p-3.5 bg-gray-50 border border-gray-200 hover:border-blue-400 rounded-lg space-y-2 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 group-hover:text-blue-600">
                    {course.code}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500 px-1.5 py-0.5 rounded bg-white border border-gray-200">
                    {course.units} units
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate font-medium">{course.title}</p>
                <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400">
                  <span className="capitalize">{course.difficulty || 'Medium'} difficulty</span>
                  <span className="text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">Open Hub →</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-gray-500">
            No courses enrolled. Click "Manage Courses" to set up your semester curriculum.
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
