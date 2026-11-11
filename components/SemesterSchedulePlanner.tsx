import React, { useState, useEffect, useMemo } from 'react';
import { Course, UserProfile, AcademicTask, StudySession } from '../types';
import { GeminiService } from '../services/gemini';
import { DBService } from '../services/db';
import { getCurrentUserId } from '../lib/supabase';
import {
  calculateRequiredSemesterGpa,
  calculateExamScoreNeeded,
  runCgpaTargetAnalysis,
  DEFAULT_GRADING_SCALE,
  GradingScale,
  CourseInput,
  CgpaAnalysisResult
} from '../lib/cgpaEngine';
import {
  generateReadingSchedule,
  rescheduleItem,
  rescheduleOverdueItems,
  SemesterScheduleSettings,
  CourseScheduleConfig,
  StudyPlanItem,
  ScheduleChangeLogEntry,
  GeneratedScheduleResult
} from '../lib/scheduleEngine';
import {
  Calendar,
  BookOpen,
  Award,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  RefreshCw,
  Sliders,
  Layers,
  ArrowRight,
  TrendingUp,
  Sparkles,
  HelpCircle,
  History,
  Check,
  CalendarCheck
} from 'lucide-react';

interface SemesterSchedulePlannerProps {
  profile: UserProfile;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  schedule: StudySession[];
  setSchedule: React.Dispatch<React.SetStateAction<StudySession[]>>;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  addNotification?: (type: any, title?: any, message?: any, link?: any) => void;
}

export type PlannerSubTab = 'outlines' | 'settings' | 'schedule' | 'cgpa';

export const SemesterSchedulePlanner: React.FC<SemesterSchedulePlannerProps> = ({
  profile,
  courses,
  setCourses,
  schedule,
  setSchedule,
  onUpdateProfile,
  addNotification
}) => {
  const [activeSubTab, setActiveSubTab] = useState<PlannerSubTab>('cgpa');

  // --------------------------------------------------------------------------
  // 1. OUTLINE UPLOAD & AI PARSER STATE (3 credits, idempotent)
  // --------------------------------------------------------------------------
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [outlineInputMode, setOutlineInputMode] = useState<'upload' | 'paste'>('upload');
  const [pastedOutlineText, setPastedOutlineText] = useState<string>('');
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [isParsingOutline, setIsParsingOutline] = useState<boolean>(false);
  const [outlineParseError, setOutlineParseError] = useState<string | null>(null);
  const [parsedOutlineData, setParsedOutlineData] = useState<any | null>(null);
  const [outlineHistory, setOutlineHistory] = useState<Record<string, any>>({});

  // --------------------------------------------------------------------------
  // 2. SEMESTER SETTINGS STATE
  // --------------------------------------------------------------------------
  const todayIso = new Date().toISOString().split('T')[0];
  const [semesterDates, setSemesterDates] = useState({
    startDate: todayIso,
    endDate: new Date(Date.now() + 105 * 24 * 3600 * 1000).toISOString().split('T')[0], // ~15 weeks
    examStartDate: new Date(Date.now() + 84 * 24 * 3600 * 1000).toISOString().split('T')[0], // ~12 weeks
    studyDays: [1, 2, 3, 4, 5], // Mon-Fri
    hoursPerDay: 3,
    preferredTime: 'evening' as 'morning' | 'afternoon' | 'evening' | 'night'
  });

  // Per-course difficulty ratings (1 to 5) & CA values
  const [courseConfigs, setCourseConfigs] = useState<Record<string, { difficulty: number; caScore: number; caMax: number; examWeight: number }>>(() => {
    const initial: Record<string, { difficulty: number; caScore: number; caMax: number; examWeight: number }> = {};
    for (const c of courses) {
      initial[c.id] = {
        difficulty: c.difficulty === 'Hard' ? 4 : c.difficulty === 'Easy' ? 2 : 3,
        caScore: 22,
        caMax: 30,
        examWeight: 70
      };
    }
    return initial;
  });

  // Keep configs in sync if courses change
  useEffect(() => {
    setCourseConfigs(prev => {
      const next = { ...prev };
      for (const c of courses) {
        if (!next[c.id]) {
          next[c.id] = {
            difficulty: c.difficulty === 'Hard' ? 4 : c.difficulty === 'Easy' ? 2 : 3,
            caScore: 22,
            caMax: 30,
            examWeight: 70
          };
        }
      }
      return next;
    });
  }, [courses]);

  // --------------------------------------------------------------------------
  // 3. READING SCHEDULE STATE (Deterministic)
  // --------------------------------------------------------------------------
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedScheduleResult | null>(null);
  const [scheduleChangeLog, setScheduleChangeLog] = useState<ScheduleChangeLogEntry[]>([]);
  const [scheduleViewMode, setScheduleViewMode] = useState<'week' | 'day'>('week');
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number>(1);
  const [isSyncingTasks, setIsSyncingTasks] = useState<boolean>(false);
  const [syncedTasksCount, setSyncedTasksCount] = useState<number>(0);

  // --------------------------------------------------------------------------
  // 4. CGPA TARGET ENGINE STATE (Deterministic)
  // --------------------------------------------------------------------------
  const [currentCgpaInput, setCurrentCgpaInput] = useState<number>(() => {
    return typeof (profile as any)?.cgpa === 'number' && (profile as any).cgpa > 0 ? (profile as any).cgpa : 3.80;
  });
  const [creditsEarnedInput, setCreditsEarnedInput] = useState<number>(() => {
    return typeof (profile as any)?.totalCredits === 'number' && (profile as any).totalCredits > 0 ? (profile as any).totalCredits : 60;
  });
  const [targetCgpaInput, setTargetCgpaInput] = useState<number>(4.00);
  const [selectedScenario, setSelectedScenario] = useState<'safe' | 'balanced' | 'stretch'>('balanced');
  const [customGradingScale, setCustomGradingScale] = useState<GradingScale>(DEFAULT_GRADING_SCALE);
  const [showGradingScaleModal, setShowGradingScaleModal] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // LIVE CGPA ENGINE COMPUTATION
  // --------------------------------------------------------------------------
  const cgpaCoursesInput: CourseInput[] = useMemo(() => {
    return courses.map(c => {
      const cfg = courseConfigs[c.id] || { difficulty: 3, caScore: 20, caMax: 30, examWeight: 70 };
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        units: c.units || 3,
        difficulty: cfg.difficulty,
        caScore: cfg.caScore,
        caMax: cfg.caMax,
        examWeight: cfg.examWeight,
        isPassFail: c.units === 0
      };
    });
  }, [courses, courseConfigs]);

  const cgpaAnalysis: CgpaAnalysisResult = useMemo(() => {
    return runCgpaTargetAnalysis(
      currentCgpaInput,
      creditsEarnedInput,
      targetCgpaInput,
      cgpaCoursesInput,
      customGradingScale
    );
  }, [currentCgpaInput, creditsEarnedInput, targetCgpaInput, cgpaCoursesInput, customGradingScale]);

  // --------------------------------------------------------------------------
  // AI COURSE OUTLINE PARSER HANDLER (Deducts 3 credits, refunds on error)
  // --------------------------------------------------------------------------
  const handleParseOutline = async () => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
    const currentCourse = courses.find(c => c.id === selectedCourseId) || courses[0];

    setIsParsingOutline(true);
    setOutlineParseError(null);

    const requestId = `outline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      let fileBase64: string | undefined;
      let fileName: string | undefined;
      let fileType: string | undefined;

      if (outlineInputMode === 'upload' && outlineFile) {
        fileName = outlineFile.name;
        fileType = outlineFile.type;
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const b64 = res.includes('base64,') ? res.split('base64,')[1] : res;
            resolve(b64);
          };
          reader.onerror = () => reject(new Error('Failed to read file into memory'));
          reader.readAsDataURL(outlineFile);
        });
      }

      const res = await GeminiService.parseCourseOutline({
        text: outlineInputMode === 'paste' ? pastedOutlineText : undefined,
        fileBase64,
        fileName,
        fileType,
        requestId,
        courseCode: currentCourse?.code,
        units: currentCourse?.units
      });

      if (!res.success || !res.parsed) {
        setOutlineParseError(res.error || 'Failed to extract topics from syllabus.');
        return;
      }

      setParsedOutlineData(res.parsed);
      if (currentCourse) {
        setOutlineHistory(prev => ({
          ...prev,
          [currentCourse.id]: res.parsed
        }));
      }

      if (addNotification) {
        addNotification('success', 'Outline Parsed', `Extracted ${res.parsed.topics?.length || 0} topics for ${res.parsed.courseCode}.`);
      }
    } catch (err: any) {
      console.error('Outline parse error:', err);
      setOutlineParseError(err?.message || 'Error processing syllabus.');
    } finally {
      setIsParsingOutline(false);
    }
  };

  // --------------------------------------------------------------------------
  // GENERATE SCHEDULE HANDLER (Deterministic in lib/, 0 credits)
  // --------------------------------------------------------------------------
  const handleGenerateSchedule = () => {
    const courseConfigsList: CourseScheduleConfig[] = courses.map(c => {
      const parsed = outlineHistory[c.id];
      const cfg = courseConfigs[c.id] || { difficulty: 3, caScore: 20, caMax: 30, examWeight: 70 };

      const topics = parsed?.topics?.map((t: any, idx: number) => ({
        id: `t_${c.id}_${idx}`,
        outlineId: `out_${c.id}`,
        courseCode: c.code,
        weekNumber: t.weekNumber || (idx + 1),
        title: t.title,
        description: t.description,
        isFlagged: Boolean(t.isFlagged)
      })) || [
        { id: `t_${c.id}_1`, outlineId: `out_${c.id}`, courseCode: c.code, weekNumber: 1, title: `${c.code} Core Fundamentals` },
        { id: `t_${c.id}_2`, outlineId: `out_${c.id}`, courseCode: c.code, weekNumber: 2, title: `${c.code} Advanced Concepts` },
        { id: `t_${c.id}_3`, outlineId: `out_${c.id}`, courseCode: c.code, weekNumber: 3, title: `${c.code} Practical Application` }
      ];

      const assessments = parsed?.assessments?.map((a: any, idx: number) => ({
        id: `a_${c.id}_${idx}`,
        courseCode: c.code,
        title: a.title || 'Midterm Assessment',
        type: a.type || 'test',
        dueDate: a.dueDate || undefined,
        weightPercent: a.weightPercent || 20
      })) || [];

      return {
        courseId: c.id,
        code: c.code,
        title: c.title,
        units: c.units || 3,
        difficulty: cfg.difficulty,
        topics,
        assessments
      };
    });

    const settings: SemesterScheduleSettings = {
      startDate: semesterDates.startDate,
      endDate: semesterDates.endDate,
      examStartDate: semesterDates.examStartDate,
      studyDays: semesterDates.studyDays,
      hoursPerDay: semesterDates.hoursPerDay,
      preferredTime: semesterDates.preferredTime,
      revisionWeeks: 2.5
    };

    const result = generateReadingSchedule(settings, courseConfigsList);
    setGeneratedSchedule(result);
    setScheduleChangeLog(result.changeLog);
    setActiveSubTab('schedule');
  };

  // --------------------------------------------------------------------------
  // ADAPTIVE RESCHEDULING (Skip / Reschedule)
  // --------------------------------------------------------------------------
  const handleItemAction = (itemId: string, action: 'done' | 'skip') => {
    if (!generatedSchedule) return;

    if (action === 'done') {
      const updated = generatedSchedule.items.map(item => {
        if (item.id === itemId) return { ...item, status: 'completed' as const };
        return item;
      });
      setGeneratedSchedule({ ...generatedSchedule, items: updated });
      return;
    }

    if (action === 'skip') {
      // Find next free study day
      const targetItem = generatedSchedule.items.find(i => i.id === itemId);
      if (!targetItem) return;

      const currentDate = new Date(targetItem.scheduledDate + 'T12:00:00Z');
      currentDate.setUTCDate(currentDate.getUTCDate() + 2); // Shift by 2 days
      const newDateStr = currentDate.toISOString().split('T')[0];

      const { updatedItems, changeLogEntry } = rescheduleItem(
        generatedSchedule.items,
        itemId,
        newDateStr,
        'Item marked skipped by student'
      );

      setGeneratedSchedule({ ...generatedSchedule, items: updatedItems });
      if (changeLogEntry) {
        setScheduleChangeLog(prev => [changeLogEntry, ...prev]);
      }
    }
  };

  // --------------------------------------------------------------------------
  // SYNC UPCOMING STUDY BLOCKS TO ACADEMIC TASKS
  // --------------------------------------------------------------------------
  const handleSyncToPlanner = async () => {
    if (!generatedSchedule || generatedSchedule.items.length === 0) return;
    const userId = getCurrentUserId() || (profile as any)?.id;
    if (!userId) return;

    setIsSyncingTasks(true);
    let count = 0;

    try {
      const upcoming = generatedSchedule.items
        .filter(item => item.status === 'pending' && item.scheduledDate >= todayIso)
        .slice(0, 15); // Sync next 15 upcoming sessions

      for (const item of upcoming) {
        await DBService.createTask(userId, {
          title: `[${item.itemType.toUpperCase()}] ${item.courseCode}: ${item.topicTitle}`,
          description: `Scheduled ${item.durationMinutes} min ${item.itemType} block for ${item.courseCode}.`,
          category: 'revision',
          dueDate: item.scheduledDate,
          dueTime: item.startTime,
          priority: item.itemType === 'practice' || item.itemType === 'revision' ? 'high' : 'medium',
          reminder: 'at_time',
          completed: false,
          courseId: item.courseId
        });
        count++;
      }

      setSyncedTasksCount(count);
      if (addNotification) {
        addNotification('success', 'Planner Updated', `Synced ${count} study sessions directly into your Academic Tasks.`);
      }
    } catch (err) {
      console.warn('Sync tasks error:', err);
    } finally {
      setIsSyncingTasks(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                Academic Architect
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic Model · Zero Hallucination
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Semester Outline, Reading Schedule & CGPA Target Plan
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Turn your university syllabi into an adaptive reading schedule and calculate exact per-course exam score targets mathematically.
            </p>
          </div>

          <button
            onClick={handleGenerateSchedule}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 min-h-[44px]"
          >
            <Sparkles size={16} />
            <span>Re-Generate Reading Schedule</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setActiveSubTab('cgpa')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors min-h-[40px] flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'cgpa'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Award size={15} />
            <span>CGPA Target Engine</span>
          </button>

          <button
            onClick={() => setActiveSubTab('outlines')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors min-h-[40px] flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'outlines'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FileText size={15} />
            <span>Course Outlines ({Object.keys(outlineHistory).length}/{courses.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('schedule')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors min-h-[40px] flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'schedule'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Calendar size={15} />
            <span>Adaptive Schedule ({generatedSchedule?.items.length || 0} blocks)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('settings')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors min-h-[40px] flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'settings'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sliders size={15} />
            <span>Plan Settings</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CGPA TARGET ENGINE                                             */}
      {/* ===================================================================== */}
      {activeSubTab === 'cgpa' && (
        <div className="space-y-6">
          {/* Top Inputs & Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Current CGPA */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Current CGPA
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="5.00"
                value={currentCgpaInput}
                onChange={e => setCurrentCgpaInput(parseFloat(e.target.value) || 0)}
                className="w-full text-2xl font-black text-slate-900 dark:text-white bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-blue-600 outline-none pb-1"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Cumulative points prior to this semester</span>
            </div>

            {/* 2. Earned Credit Units */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Credits Earned So Far
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="300"
                value={creditsEarnedInput}
                onChange={e => setCreditsEarnedInput(parseInt(e.target.value, 10) || 0)}
                className="w-full text-2xl font-black text-slate-900 dark:text-white bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-blue-600 outline-none pb-1"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Total units passed in previous semesters</span>
            </div>

            {/* 3. Target Cumulative CGPA */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Target Cumulative CGPA
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="5.00"
                value={targetCgpaInput}
                onChange={e => setTargetCgpaInput(parseFloat(e.target.value) || 0)}
                className="w-full text-2xl font-black text-blue-600 dark:text-blue-400 bg-transparent border-b border-blue-200 dark:border-blue-800 focus:border-blue-600 outline-none pb-1"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Your overall graduation goal</span>
            </div>

            {/* 4. Required Semester GPA */}
            <div className={`border rounded-xl p-4 shadow-sm ${
              cgpaAnalysis.isReachable
                ? 'bg-blue-50/50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900'
                : 'bg-red-50/50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
            }`}>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1">
                  Required Semester GPA
                </label>
                {!cgpaAnalysis.isReachable && (
                  <span className="text-[10px] font-bold text-red-600 uppercase bg-red-100 dark:bg-red-950 px-1.5 py-0.5 rounded">
                    Unreachable
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {cgpaAnalysis.requiredSemesterGpa.toFixed(2)}
                <span className="text-xs font-normal text-slate-500 ml-1">/ 5.00</span>
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                {cgpaAnalysis.isReachable
                  ? `Across ${cgpaAnalysis.semesterUnits} registered credit units this semester`
                  : `Max reachable CGPA: ${cgpaAnalysis.maxReachableCgpa.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Unreachable Warning or Guidance Alert */}
          {!cgpaAnalysis.isReachable ? (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-red-900 dark:text-red-200">
                <span className="font-bold">Target is mathematically unreachable this semester:</span> Target CGPA of {targetCgpaInput.toFixed(2)} requires a semester GPA of <strong>{cgpaAnalysis.requiredSemesterGpa.toFixed(2)}</strong>, which exceeds the maximum achievable 5.00. The highest reachable cumulative CGPA this semester with straight A's (5.00 GPA) is <strong>{cgpaAnalysis.maxReachableCgpa.toFixed(2)}</strong>. Course targets below reflect the best possible plan toward this maximum.
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <span className="font-bold">Target Analysis:</span> {cgpaAnalysis.guidanceMessage}
              </div>
            </div>
          )}

          {/* Scenario Switcher (Safe Minimum, Balanced, Stretch) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Course Target Distribution Scenarios
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick a strategy based on your risk tolerance and workload preference.
                </p>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(['safe', 'balanced', 'stretch'] as const).map(scenarioKey => (
                  <button
                    key={scenarioKey}
                    onClick={() => setSelectedScenario(scenarioKey)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize cursor-pointer ${
                      selectedScenario === scenarioKey
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {scenarioKey === 'safe' ? 'Safe Minimum' : scenarioKey}
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario Description */}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span>{cgpaAnalysis.scenarios[selectedScenario].description}</span>
              <span className="font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                Projected CGPA: {cgpaAnalysis.scenarios[selectedScenario].projectedCgpa.toFixed(2)}
              </span>
            </div>

            {/* Per-Course Breakdown Table with Live CA Inputs */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="pb-3 pr-3">Course</th>
                    <th className="pb-3 px-2">Units</th>
                    <th className="pb-3 px-2">Difficulty</th>
                    <th className="pb-3 px-2">Target Grade</th>
                    <th className="pb-3 px-2 min-w-[130px]">CA Score (So far)</th>
                    <th className="pb-3 px-2">Exam Weight</th>
                    <th className="pb-3 px-2 min-w-[110px]">Exam Needed</th>
                    <th className="pb-3 pl-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cgpaAnalysis.scenarios[selectedScenario].targets.map(target => {
                    const cfg = courseConfigs[target.courseId] || { difficulty: 3, caScore: 20, caMax: 30, examWeight: 70 };

                    return (
                      <tr key={target.courseId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        {/* Course Code & Title */}
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900 dark:text-white">{target.code}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]">{target.title}</div>
                        </td>

                        {/* Units */}
                        <td className="py-3 px-2 font-bold font-mono text-slate-700 dark:text-slate-300">
                          {target.units}
                        </td>

                        {/* Difficulty Selector */}
                        <td className="py-3 px-2">
                          <select
                            value={cfg.difficulty}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              setCourseConfigs(prev => ({
                                ...prev,
                                [target.courseId]: { ...prev[target.courseId], difficulty: val }
                              }));
                            }}
                            className="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            <option value={1}>1 (Easy)</option>
                            <option value={2}>2</option>
                            <option value={3}>3 (Med)</option>
                            <option value={4}>4</option>
                            <option value={5}>5 (Hard)</option>
                          </select>
                        </td>

                        {/* Target Grade Badge */}
                        <td className="py-3 px-2">
                          <span className={`inline-block px-2.5 py-1 rounded font-black text-xs ${
                            target.targetGrade === 'A'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : target.targetGrade === 'B'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          }`}>
                            {target.targetGrade} ({target.gradeThreshold}%)
                          </span>
                        </td>

                        {/* Live CA Input */}
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max={cfg.caMax}
                              value={cfg.caScore}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setCourseConfigs(prev => ({
                                  ...prev,
                                  [target.courseId]: { ...prev[target.courseId], caScore: val }
                                }));
                              }}
                              className="w-14 text-center font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 text-slate-900 dark:text-white"
                            />
                            <span className="text-slate-500 font-mono text-[11px]">/ {cfg.caMax}</span>
                          </div>
                        </td>

                        {/* Exam Weight */}
                        <td className="py-3 px-2 text-slate-600 dark:text-slate-400 font-mono">
                          {cfg.examWeight}%
                        </td>

                        {/* Exam Needed */}
                        <td className="py-3 px-2">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {target.status === 'secured' ? '0%' : `${target.examScoreNeededPercent}%`}
                          </span>
                        </td>

                        {/* Status Message */}
                        <td className="py-3 pl-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            target.status === 'secured'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200'
                              : target.status === 'impossible'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200'
                              : target.status === 'stretch'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                          }`}>
                            {target.statusMessage}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: COURSE OUTLINES (Upload & AI Parser)                           */}
      {/* ===================================================================== */}
      {activeSubTab === 'outlines' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Course Outline / Syllabus Extraction
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Upload a syllabus (PDF, Word, or photo) or paste text. Costs 3 AI credits; incomplete fields are flagged honestly rather than invented.
            </p>

            {/* Course Selector */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Select Course:</label>
              {courses.map(course => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    selectedCourseId === course.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {course.code}
                  {outlineHistory[course.id] && ' ✓'}
                </button>
              ))}
            </div>

            {/* Ingestion Mode Switcher */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setOutlineInputMode('upload')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  outlineInputMode === 'upload' ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
                }`}
              >
                Upload File (PDF / Image / DOCX)
              </button>
              <button
                onClick={() => setOutlineInputMode('paste')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  outlineInputMode === 'paste' ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'text-slate-500'
                }`}
              >
                Paste Outline Text
              </button>
            </div>

            {outlineInputMode === 'upload' ? (
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center">
                <Upload className="mx-auto text-slate-400 mb-2" size={32} />
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  Select a syllabus file (Clean PDF, clear photo/scan, or Word document)
                </p>
                <input
                  type="file"
                  accept=".pdf,image/*,.docx,.doc,.txt"
                  onChange={e => setOutlineFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-600 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
            ) : (
              <textarea
                rows={6}
                value={pastedOutlineText}
                onChange={e => setPastedOutlineText(e.target.value)}
                placeholder="Paste the syllabus or weekly lecture topics here..."
                className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600 font-mono"
              />
            )}

            {outlineParseError && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {outlineParseError}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Cost: 3 AI Credits · Automatic refund if parsing fails
              </span>
              <button
                onClick={handleParseOutline}
                disabled={isParsingOutline}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                {isParsingOutline ? <RefreshCw className="animate-spin" size={15} /> : <FileText size={15} />}
                <span>{isParsingOutline ? 'Analyzing Syllabus...' : 'Analyze Outline (3 Credits)'}</span>
              </button>
            </div>
          </div>

          {/* Parsed Outline Review Card with Flagged Fields */}
          {parsedOutlineData && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {parsedOutlineData.courseCode}: {parsedOutlineData.courseTitle}
                  </h4>
                  <span className="text-xs text-slate-500">
                    Units: {parsedOutlineData.units} {parsedOutlineData.isUnitsFlagged && '⚠️ (Estimated)'}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  Review & Confirm
                </span>
              </div>

              {/* Weekly Topics List with Flags */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Weekly Topics</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {parsedOutlineData.topics?.map((topic: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs ${
                        topic.isFlagged
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white mb-1">
                        <span>Week {topic.weekNumber}: {topic.title}</span>
                        {topic.isFlagged && (
                          <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded">
                            Flagged
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">{topic.description}</p>
                      {topic.flagReason && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                          ⚠️ {topic.flagReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ADAPTIVE READING SCHEDULE                                      */}
      {/* ===================================================================== */}
      {activeSubTab === 'schedule' && (
        <div className="space-y-6">
          {!generatedSchedule ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
              <Calendar className="mx-auto text-slate-400 mb-3" size={40} />
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                No Schedule Generated Yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                Click below to calculate read-ahead blocks, reviews, mock practices, and revision phases mapped to your semester timeline.
              </p>
              <button
                onClick={handleGenerateSchedule}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer min-h-[44px]"
              >
                Generate Adaptive Schedule Now
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Schedule Control Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScheduleViewMode('week')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                      scheduleViewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Week View
                  </button>
                  <button
                    onClick={() => setScheduleViewMode('day')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                      scheduleViewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    All Blocks ({generatedSchedule.items.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncToPlanner}
                    disabled={isSyncingTasks}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    {isSyncingTasks ? <RefreshCw className="animate-spin" size={14} /> : <CalendarCheck size={14} />}
                    <span>{isSyncingTasks ? 'Syncing...' : 'Add to My Planner'}</span>
                  </button>
                </div>
              </div>

              {/* Overdue Items Banner if any */}
              {generatedSchedule.items.some(i => i.status === 'pending' && i.scheduledDate < todayIso) && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <Clock className="text-amber-600 shrink-0" size={18} />
                    <span>You have overdue reading sessions. Click below to adaptively push them into upcoming free study slots.</span>
                  </div>
                  <button
                    onClick={() => {
                      const { updatedItems, changes } = rescheduleOverdueItems(generatedSchedule.items, todayIso, semesterDates.studyDays);
                      setGeneratedSchedule({ ...generatedSchedule, items: updatedItems });
                      if (changes.length > 0) {
                        setScheduleChangeLog(prev => [...changes, ...prev]);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg cursor-pointer shrink-0"
                  >
                    Auto-Reschedule Overdue
                  </button>
                </div>
              )}

              {/* Week-by-Week Cards */}
              <div className="space-y-4">
                {Object.values(generatedSchedule.weeklySummary).map(w => {
                  const weekItems = generatedSchedule.items.filter(i => i.weekNumber === w.weekNumber);

                  return (
                    <div key={w.weekNumber} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 dark:text-white text-sm">
                            Week {w.weekNumber}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({w.startDate} - {w.endDate})
                          </span>
                          {w.isRevisionPhase && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              Revision Phase
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {Math.round(w.totalMinutes / 60)}h study time
                        </span>
                      </div>

                      {/* Items inside this week */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {weekItems.map(item => (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                              item.status === 'completed'
                                ? 'bg-emerald-50/30 border-emerald-200 opacity-60'
                                : item.status === 'rescheduled'
                                ? 'bg-blue-50/20 border-blue-200'
                                : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                                  {item.courseCode}
                                </span>
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  item.itemType === 'read-ahead'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                    : item.itemType === 'review'
                                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                    : item.itemType === 'practice'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                }`}>
                                  {item.itemType}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {item.scheduledDate} · {item.durationMinutes}m
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {item.topicTitle}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleItemAction(item.id, 'done')}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 rounded cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                                title="Mark Completed"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button
                                onClick={() => handleItemAction(item.id, 'skip')}
                                className="p-1.5 text-slate-400 hover:text-amber-600 rounded cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center text-[10px] font-bold"
                                title="Skip and reschedule"
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Change Log Drawer / Section */}
              {scheduleChangeLog.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <History size={16} className="text-slate-500" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Adaptive Change Log (What Moved and Why)
                    </h4>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {scheduleChangeLog.map(log => (
                      <div key={log.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        <span>
                          <strong>{log.courseCode}</strong>: {log.topicTitle} moved from <span className="line-through">{log.fromDate}</span> to <strong>{log.toDate}</strong>
                        </span>
                        <span className="text-[10px] text-slate-400 italic shrink-0 ml-2">{log.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: PLAN SETTINGS                                                  */}
      {/* ===================================================================== */}
      {activeSubTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            Semester Parameters & Availability
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Semester Start Date
              </label>
              <input
                type="date"
                value={semesterDates.startDate}
                onChange={e => setSemesterDates({ ...semesterDates, startDate: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Semester End Date
              </label>
              <input
                type="date"
                value={semesterDates.endDate}
                onChange={e => setSemesterDates({ ...semesterDates, endDate: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Examination Period Starts
              </label>
              <input
                type="date"
                value={semesterDates.examStartDate}
                onChange={e => setSemesterDates({ ...semesterDates, examStartDate: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Preferred Study Hours per Day
              </label>
              <input
                type="number"
                min="1"
                max="8"
                step="0.5"
                value={semesterDates.hoursPerDay}
                onChange={e => setSemesterDates({ ...semesterDates, hoursPerDay: parseFloat(e.target.value) || 3 })}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Preferred Study Time
              </label>
              <select
                value={semesterDates.preferredTime}
                onChange={e => setSemesterDates({ ...semesterDates, preferredTime: e.target.value as any })}
                className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="morning">Morning (08:30)</option>
                <option value="afternoon">Afternoon (14:00)</option>
                <option value="evening">Evening (18:00)</option>
                <option value="night">Night (21:00)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerateSchedule}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer min-h-[44px]"
          >
            Save Settings & Recalculate Schedule
          </button>
        </div>
      )}
    </div>
  );
};

export default SemesterSchedulePlanner;
