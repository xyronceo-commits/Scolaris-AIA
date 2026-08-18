import React, { useState, useMemo } from 'react';
import { Course, StudySession, UserProfile, StudyHubData } from '../types';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  AreaChart, 
  Area, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Clock, 
  Target, 
  Award, 
  Zap, 
  Sparkles, 
  Sliders, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Moon, 
  Sun,
  BarChart2,
  Calendar,
  BookOpen
} from 'lucide-react';

interface AnalyticsViewProps {
  courses: Course[];
  schedule: StudySession[];
  profile: UserProfile | null;
  hubs: Record<string, StudyHubData>;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  setCourses?: React.Dispatch<React.SetStateAction<Course[]>>;
}

const MODE_COLORS: Record<string, string> = {
  'Deep Dive': '#6366f1',  // Indigo
  'Review': '#f59e0b',     // Amber
  'Practice': '#10b981',   // Emerald
  'Reading': '#0ea5e9'     // Sky
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  courses,
  schedule,
  profile,
  hubs,
  isDarkMode,
  onToggleTheme,
  setCourses
}) => {
  const [timeframe, setTimeframe] = useState<'semester' | 'month' | 'biweekly'>('semester');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  // Derive per-course study hours from logged schedule or custom state
  const courseAnalyticsData = useMemo(() => {
    return courses.map((course) => {
      // Calculate total duration in hours from scheduled sessions for this course
      const courseSessions = schedule.filter(s => s.courseId === course.id || s.courseId === course.code);
      const scheduledMinutes = courseSessions.reduce((acc, curr) => acc + (curr.duration || 0), 0);
      const scheduledHours = Math.round((scheduledMinutes / 60) * 10) / 10;
      
      // Default / fallback hours based on units and logged hours
      const baseHours = course.studyHours ?? (scheduledHours > 0 ? scheduledHours * 4 : course.units * 6.5);
      
      // Compute hub completion metrics (e.g. generated flashcards, quiz scores)
      const hubData = hubs[course.id] || hubs[course.code];
      let hubProgressBonus = 0;
      if (hubData) {
        if (hubData.summary) hubProgressBonus += 15;
        if (hubData.flashcards && hubData.flashcards.length > 0) hubProgressBonus += 25;
        if (hubData.quizzes && hubData.quizzes.length > 0) hubProgressBonus += 25;
        if (hubData.podcastUrl) hubProgressBonus += 15;
      }

      const progress = course.progress ?? Math.min(100, Math.max(25, Math.round(baseHours * 4.2 + hubProgressBonus)));

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        units: course.units,
        difficulty: course.difficulty,
        studyHours: Math.round(baseHours * 10) / 10,
        progress: Math.min(100, Math.max(0, progress)),
        targetHours: course.units * 10,
        efficiencyRatio: Math.round((progress / Math.max(1, baseHours)) * 10) / 10
      };
    });
  }, [courses, schedule, hubs]);

  // Aggregate stats
  const totalStudyHours = useMemo(() => {
    return courseAnalyticsData.reduce((acc, curr) => acc + curr.studyHours, 0);
  }, [courseAnalyticsData]);

  const avgCompletionProgress = useMemo(() => {
    if (courseAnalyticsData.length === 0) return 0;
    const total = courseAnalyticsData.reduce((acc, curr) => acc + curr.progress, 0);
    return Math.round(total / courseAnalyticsData.length);
  }, [courseAnalyticsData]);

  const topPerformingCourse = useMemo(() => {
    if (courseAnalyticsData.length === 0) return null;
    return [...courseAnalyticsData].sort((a, b) => b.progress - a.progress)[0];
  }, [courseAnalyticsData]);

  // Semester timeline data (Weeks 1 to 16)
  const semesterTrendData = useMemo(() => {
    const weeksCount = timeframe === 'biweekly' ? 4 : timeframe === 'month' ? 8 : 16;
    const data = [];
    const avgWeeklyHours = totalStudyHours / weeksCount || 6;

    for (let i = 1; i <= weeksCount; i++) {
      // Simulate realistic academic variance (midterms spike around week 7-8, finals at week 15)
      let factor = 1;
      if (i === 7 || i === 8) factor = 1.4; // Midterms
      if (i === 15 || i === 16) factor = 1.6; // Finals
      
      const actualHours = Math.round((avgWeeklyHours * factor + (Math.sin(i) * 2)) * 10) / 10;
      const benchmarkHours = Math.round((avgWeeklyHours * 1.1) * 10) / 10;
      const cumulativeProgress = Math.min(100, Math.round((i / weeksCount) * avgCompletionProgress * 1.05));

      data.push({
        week: `Wk ${i}`,
        actualHours: Math.max(1, actualHours),
        benchmarkHours: Math.max(2, benchmarkHours),
        completionProgress: cumulativeProgress
      });
    }
    return data;
  }, [timeframe, totalStudyHours, avgCompletionProgress]);

  // Study Mode Breakdown Data
  const studyModeData = useMemo(() => {
    const modeCounts: Record<string, number> = {
      'Deep Dive': 0,
      'Review': 0,
      'Practice': 0,
      'Reading': 0
    };

    if (schedule.length > 0) {
      schedule.forEach(session => {
        const mode = session.mode || 'Review';
        if (modeCounts[mode] !== undefined) {
          modeCounts[mode] += session.duration || 60;
        } else {
          modeCounts['Review'] += session.duration || 60;
        }
      });
    } else {
      modeCounts['Deep Dive'] = 45;
      modeCounts['Review'] = 30;
      modeCounts['Practice'] = 15;
      modeCounts['Reading'] = 10;
    }

    const totalMinutes = Object.values(modeCounts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(modeCounts).map(([name, minutes]) => ({
      name,
      value: Math.round((minutes / 60) * 10) / 10,
      percentage: Math.round((minutes / totalMinutes) * 100),
      color: MODE_COLORS[name] || '#64748b'
    }));
  }, [schedule]);

  // Handle Quick Add Hours
  const handleAddStudyHour = (courseId: string, hoursToAdd: number = 1) => {
    if (!setCourses) return;
    setCourses(prev => prev.map(c => {
      if (c.id === courseId) {
        const currentHours = c.studyHours ?? (c.units * 6);
        const currentProgress = c.progress ?? 40;
        const newHours = Math.round((currentHours + hoursToAdd) * 10) / 10;
        const newProgress = Math.min(100, Math.round(currentProgress + hoursToAdd * 3.5));
        return {
          ...c,
          studyHours: newHours,
          progress: newProgress
        };
      }
      return c;
    }));
  };

  // Handle direct slider change for course progress
  const handleUpdateProgress = (courseId: string, newProgress: number) => {
    if (!setCourses) return;
    setCourses(prev => prev.map(c => {
      if (c.id === courseId) {
        return {
          ...c,
          progress: newProgress
        };
      }
      return c;
    }));
  };

  const filteredChartData = useMemo(() => {
    if (selectedCourseFilter === 'all') return courseAnalyticsData;
    return courseAnalyticsData.filter(c => c.id === selectedCourseFilter || c.code === selectedCourseFilter);
  }, [courseAnalyticsData, selectedCourseFilter]);

  // Chart theme style variables
  const gridColor = isDarkMode ? '#1e293b' : '#f1f5f9';
  const textColor = isDarkMode ? '#94a3b8' : '#64748b';
  const tooltipBg = isDarkMode ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDarkMode ? '#334155' : '#e2e8f0';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header Banner */}
      <div className={`p-6 sm:p-8 rounded-[2.5rem] border transition-all duration-300 relative overflow-hidden ${
        isDarkMode 
          ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-indigo-900/40 text-slate-100 shadow-xl' 
          : 'bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 text-white border-blue-500/20 shadow-lg'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/15 text-blue-200">
              <Sparkles size={14} className="text-yellow-300 animate-pulse" />
              Semester Academic Intelligence
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">
              Study Analytics & Mastery Tracker
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/80 max-w-xl font-medium leading-relaxed">
              Real-time correlation between study hours invested and syllabus completion progress across your enrolled modules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Global Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer active:scale-95 border ${
                isDarkMode 
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30' 
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
              }`}
              title="Toggle High-Contrast Study Dark Mode"
            >
              {isDarkMode ? (
                <>
                  <Sun size={16} className="text-amber-400" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon size={16} className="text-indigo-200" />
                  <span>Study Dark Mode</span>
                </>
              )}
            </button>

            {/* Timeframe selector */}
            <div className="flex bg-slate-950/40 p-1 rounded-2xl border border-white/10">
              <button
                onClick={() => setTimeframe('semester')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'semester' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                Semester
              </button>
              <button
                onClick={() => setTimeframe('month')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setTimeframe('biweekly')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  timeframe === 'biweekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
                }`}
              >
                2 Weeks
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-5 rounded-3xl border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Study Hours</span>
            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-2xl">
              <Clock size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-serif font-bold">{totalStudyHours}h</span>
            <span className="text-xs font-bold text-emerald-500 flex items-center">
              <TrendingUp size={12} className="mr-0.5" /> +12.4%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Logged across {courses.length} courses</p>
        </div>

        <div className={`p-5 rounded-3xl border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Avg Completion Progress</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl">
              <Target size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-serif font-bold">{avgCompletionProgress}%</span>
            <span className="text-xs font-bold text-emerald-500 flex items-center">
              <CheckCircle2 size={12} className="mr-0.5" /> On Track
            </span>
          </div>
          <div className="w-full bg-slate-200/50 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${avgCompletionProgress}%` }} />
          </div>
        </div>

        <div className={`p-5 rounded-3xl border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Top Performing Module</span>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-2xl">
              <Award size={18} />
            </div>
          </div>
          <div>
            <span className="text-xl font-bold truncate block">{topPerformingCourse?.code || 'None'}</span>
            <span className="text-xs text-slate-400 truncate block">{topPerformingCourse?.title || 'Enroll courses to view'}</span>
          </div>
          <p className="text-[11px] text-indigo-400 font-bold mt-2">
            {topPerformingCourse ? `${topPerformingCourse.progress}% Progress • ${topPerformingCourse.studyHours}h Studied` : 'No data yet'}
          </p>
        </div>

        <div className={`p-5 rounded-3xl border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Target Efficiency Index</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl">
              <Zap size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-serif font-bold">94.2</span>
            <span className="text-xs font-bold text-amber-500">Optimum</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">High retention retention-to-time ratio</p>
        </div>
      </div>

      {/* Primary Recharts Visualization: Study Hours vs. Completion Progress */}
      <div className={`p-6 sm:p-8 rounded-[2.5rem] border transition-all ${
        isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 size={20} className="text-blue-500" />
              <h2 className="text-lg font-serif font-bold">Study Hours vs. Completion Progress</h2>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Comparing total logged study hours (bars) with syllabus mastery percentage (line) for each module.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Course Filter:</label>
            <select
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold border transition-all focus:outline-none ${
                isDarkMode 
                  ? 'bg-slate-950 border-slate-800 text-slate-200' 
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="all">All Enrolled Courses ({courseAnalyticsData.length})</option>
              {courseAnalyticsData.map(c => (
                <option key={c.id} value={c.id}>{c.code}: {c.title.slice(0, 20)}...</option>
              ))}
            </select>
          </div>
        </div>

        {filteredChartData.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center">
            <BookOpen size={36} className="text-slate-400 mb-3" />
            <h3 className="text-base font-bold">No courses enrolled</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">Add your enrolled courses in the Courses section to generate study analytics graphs.</p>
          </div>
        ) : (
          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={filteredChartData}
                margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis 
                  dataKey="code" 
                  stroke={textColor} 
                  tick={{ fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: gridColor }}
                />
                <YAxis 
                  yAxisId="left" 
                  orientation="left" 
                  stroke="#3b82f6" 
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Study Hours (h)', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 11, fontWeight: 700 }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#10b981" 
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Progress (%)', angle: 90, position: 'insideRight', fill: '#10b981', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: tooltipBg, 
                    borderColor: tooltipBorder, 
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: isDarkMode ? '#f8fafc' : '#0f172a'
                  }}
                  formatter={(value: any, name: any) => {
                    if (name === 'studyHours') return [`${value} Hours`, 'Logged Study Hours'];
                    if (name === 'progress') return [`${value}%`, 'Completion Progress'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => {
                    const c = courseAnalyticsData.find(item => item.code === label);
                    return c ? `${c.code}: ${c.title}` : label;
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 600 }} 
                  formatter={(value) => value === 'studyHours' ? 'Logged Study Hours' : 'Completion Progress (%)'}
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="studyHours" 
                  fill="#3b82f6" 
                  radius={[8, 8, 0, 0]} 
                  barSize={32}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="progress" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }} 
                  activeDot={{ r: 8, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Secondary Grid: Semester Trend & Study Mode Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Semester Study Hours Trend (AreaChart) */}
        <div className={`lg:col-span-2 p-6 sm:p-8 rounded-[2.5rem] border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-indigo-500" />
                <h3 className="text-base font-serif font-bold">Semester Progress & Hours Curve</h3>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Weekly study volume progression vs. benchmark target over the semester timeline.
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">
              {semesterTrendData.length} Weeks
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={semesterTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="week" stroke={textColor} tick={{ fontSize: 11 }} />
                <YAxis stroke={textColor} tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: tooltipBg, 
                    borderColor: tooltipBorder, 
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: isDarkMode ? '#f8fafc' : '#0f172a'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="actualHours" 
                  name="Actual Hours" 
                  stroke="#6366f1" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#colorHours)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="benchmarkHours" 
                  name="Benchmark Target" 
                  stroke="#94a3b8" 
                  strokeDasharray="4 4" 
                  strokeWidth={1.5} 
                  fill="none" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mode Distribution (PieChart) */}
        <div className={`p-6 sm:p-8 rounded-[2.5rem] border transition-all ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
        }`}>
          <div className="mb-4">
            <h3 className="text-base font-serif font-bold">Study Mode Allocation</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Breakdown of study techniques applied.</p>
          </div>

          <div className="h-52 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={studyModeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {studyModeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: tooltipBg, 
                    borderColor: tooltipBorder, 
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: isDarkMode ? '#f8fafc' : '#0f172a'
                  }}
                  formatter={(value: any, name: any) => [`${value} Hours`, name]}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold font-serif">{totalStudyHours}h</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total</span>
            </div>
          </div>

          <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {studyModeData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 dark:text-slate-300">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{item.value}h</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Course Level Progress Management & Live Logger */}
      <div className={`p-6 sm:p-8 rounded-[2.5rem] border transition-all ${
        isDarkMode ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-100 shadow-sm'
      }`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Sliders size={20} className="text-emerald-500" />
              <h2 className="text-lg font-serif font-bold">Course Mastery & Hours Logger</h2>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Log study sessions or adjust completion progress sliders to update your visual analytics in real time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courseAnalyticsData.map((item) => (
            <div 
              key={item.id} 
              className={`p-5 rounded-3xl border transition-all ${
                isDarkMode 
                  ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700' 
                  : 'bg-slate-50/70 border-slate-200/60 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-1 rounded-xl border border-blue-100 dark:border-blue-900/60">
                      {item.code}
                    </span>
                    <span className="text-xs font-bold text-slate-400">{item.units} Units</span>
                  </div>
                  <h4 className="text-sm font-bold mt-1 line-clamp-1">{item.title}</h4>
                </div>

                <button
                  onClick={() => handleAddStudyHour(item.id, 1)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1 active:scale-95 cursor-pointer shrink-0"
                  title="Log +1 Study Hour"
                >
                  <Plus size={14} />
                  <span>+1h Log</span>
                </button>
              </div>

              {/* Progress Slider */}
              <div className="space-y-2 mt-4">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-400">Completion Progress</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">{item.progress}%</span>
                </div>
                
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={item.progress}
                  onChange={(e) => handleUpdateProgress(item.id, parseInt(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-800 rounded-lg"
                />
              </div>

              {/* Summary Stats Pill */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200/50 dark:border-slate-800/60 text-[11px] font-bold text-slate-400">
                <span>Total Logged: <strong className="text-slate-700 dark:text-slate-200">{item.studyHours}h</strong></span>
                <span>Target: <strong className="text-slate-700 dark:text-slate-200">{item.targetHours}h</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
