import React, { useState } from 'react';
import { StudySession, Course } from '../types';
import { DAYS, DIFFICULTY_COLORS } from '../constants';
import { 
  ArrowRight, 
  Brain, 
  RotateCcw, 
  PenTool, 
  BookOpen, 
  Clock, 
  Sparkles,
  Layers,
  Award,
  BookMarked
} from 'lucide-react';

interface ScheduleViewProps {
  schedule: StudySession[];
  courses: Course[];
  onOpenHub?: (courseId: string) => void;
}

const MODE_METADATA = {
  'Deep Dive': {
    color: 'bg-indigo-50 border-indigo-150 text-indigo-700 hover:bg-indigo-100/30',
    icon: Brain,
    desc: 'Uninterrupted deeply-focused creative workflow',
    accentColor: 'text-indigo-600',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100/80',
    glowColor: 'shadow-[0_0_15px_rgba(99,102,241,0.15)]',
    tag: 'Deep Dive'
  },
  'Review': {
    color: 'bg-amber-50 border-amber-150 text-amber-750 hover:bg-amber-100/30',
    icon: RotateCcw,
    desc: 'Spaced repetition & concept synthesis evaluation',
    accentColor: 'text-amber-600 border-amber-200',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-100/80',
    glowColor: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    tag: 'Review'
  },
  'Practice': {
    color: 'bg-emerald-50 border-emerald-150 text-emerald-750 hover:bg-emerald-100/30',
    icon: PenTool,
    desc: 'Interactive problems, code challenges, & exercises',
    accentColor: 'text-emerald-600',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100/80',
    glowColor: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    tag: 'Practice'
  },
  'Reading': {
    color: 'bg-sky-50 border-sky-150 text-sky-750 hover:bg-sky-100/30',
    icon: BookOpen,
    desc: 'Syllabus literature, readings, & source material scanning',
    accentColor: 'text-sky-600',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-100/80',
    glowColor: 'shadow-[0_0_15px_rgba(14,165,233,0.15)]',
    tag: 'Reading'
  }
};

const getModeMeta = (mode: string) => {
  const norm = Object.keys(MODE_METADATA).find(
    k => k.toLowerCase() === mode?.toLowerCase()
  ) as keyof typeof MODE_METADATA;
  return norm ? MODE_METADATA[norm] : {
    color: 'bg-slate-50 border-slate-150 text-slate-700 hover:bg-slate-100/30',
    icon: BookMarked,
    desc: 'General learning and evaluation objective',
    accentColor: 'text-slate-600',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-100/80',
    glowColor: '',
    tag: mode || 'General'
  };
};

const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule, courses, onOpenHub }) => {
  const [selectedModeFilter, setSelectedModeFilter] = useState<string | null>(null);

  const getCourse = (id: string) => courses.find(c => c.id === id);

  // Computations for breakdown stats
  const totalSessionsCount = schedule.length;
  const totalStudyMinutes = schedule.reduce((sum, s) => sum + s.duration, 0);

  const modeCounts = Object.keys(MODE_METADATA).reduce((acc, currentMode) => {
    acc[currentMode] = schedule.filter(
      s => s.mode?.toLowerCase() === currentMode.toLowerCase()
    ).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      
      {/* Dynamic Header Section */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-slate-100 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-slate-900">
            Weekly Schedule
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium font-sans">
            Your personalized AI study plan with calibrated learning modes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-slate-500 text-xs font-semibold">
          <span className="bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
            <Layers size={13} className="text-slate-400" />
            <span>{totalSessionsCount} Planned Sessions</span>
          </span>
          <span className="bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
            <Clock size={13} className="text-slate-400" />
            <span>{(totalStudyMinutes / 60).toFixed(1)} hrs allocated</span>
          </span>
        </div>
      </div>

      {/* Mode Filters & Breakdown Stats Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Calibrate View / Mode Highlight Intensity
          </span>
          {selectedModeFilter && (
            <button 
              onClick={() => setSelectedModeFilter(null)}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider"
            >
              Clear Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(MODE_METADATA).map(([modeName, info]) => {
            const count = modeCounts[modeName] || 0;
            const isSelected = selectedModeFilter === modeName;
            const IconComponent = info.icon;
            
            return (
              <button
                key={modeName}
                onClick={() => setSelectedModeFilter(isSelected ? null : modeName)}
                className={`p-4 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group/filter cursor-pointer ${
                  isSelected 
                    ? `${info.badgeColor} ${info.glowColor} ring-2 ring-indigo-500/10` 
                    : 'bg-white border-slate-100 hover:border-slate-200 shadow-2xs hover:shadow-xs'
                }`}
              >
                {/* Background ambient accent circle */}
                <span className={`absolute -right-6 -bottom-6 w-16 h-16 rounded-full opacity-[0.03] group-hover/filter:scale-110 transition-transform ${
                  isSelected ? 'bg-indigo-500 opacity-[0.1]' : 'bg-slate-400'
                }`} />

                <div className="flex items-start justify-between">
                  <span className={`p-2 rounded-xl transition-all ${
                    isSelected ? info.badgeColor : 'bg-slate-50 text-slate-500 group-hover/filter:bg-slate-100'
                  }`}>
                    <IconComponent size={16} className={isSelected && modeName === 'Deep Dive' ? 'animate-pulse' : ''} />
                  </span>
                  
                  <span className="text-2xl font-black tracking-tight text-slate-700 font-serif">
                    {count}
                  </span>
                </div>

                <div className="mt-3">
                  <h4 className="text-xs font-bold text-slate-800 tracking-tight leading-none mb-1">
                    {modeName}
                  </h4>
                  <p className="text-[9px] text-slate-400 font-sans leading-normal line-clamp-1">
                    {info.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Days & Study Slots Schedule */}
      <div className="space-y-8">
        {DAYS.map((dayName) => {
          // Filter sessions planned for this day
          const daySessions = schedule.filter(s => s.day === dayName);
          
          // Apply search-mode filters if active
          const filteredSessions = selectedModeFilter 
            ? daySessions.filter(s => s.mode?.toLowerCase() === selectedModeFilter.toLowerCase())
            : daySessions;

          // If a mode filter is applied but this day has none, we skip or show a subtle placeholder, but to keep view tight we only render active days
          if (selectedModeFilter && filteredSessions.length === 0 && daySessions.length > 0) {
            return null; // Don't show the day when there's an active filter and it has no items
          }

          return (
            <div key={dayName} className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{dayName.toUpperCase()}</h3>
                <span className="h-px bg-slate-100 flex-1" />
                <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
                  {daySessions.length} sessions
                </span>
              </div>

              <div className="space-y-3">
                {daySessions.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-150 bg-slate-50/[0.15] rounded-3xl text-center text-slate-400 text-xs font-medium italic">
                    🔋 Safe rest day. No study sessions allocated.
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="p-5 border border-slate-100 bg-slate-50/20 rounded-2xl text-center text-slate-400 text-xs font-medium italic">
                    No "{selectedModeFilter}" items assigned for today.
                  </div>
                ) : (
                  filteredSessions.map((session, sIdx) => {
                    const course = getCourse(session.courseId);
                    const modeMeta = getModeMeta(session.mode);
                    const IconComponent = modeMeta.icon;

                    return (
                      <div 
                        key={session.id || `${session.courseId}-${sIdx}`}
                        onClick={() => onOpenHub && onOpenHub(session.courseId)}
                        className={`bg-white p-4 sm:p-5 rounded-[2rem] border border-slate-100 hover:border-slate-200/80 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group/card cursor-pointer`}
                      >
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          {/* Rich visually distinguished mode icon box */}
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 ${modeMeta.badgeColor} ${modeMeta.glowColor} group-hover/card:scale-105`}>
                            <IconComponent size={18} className={session.mode === 'Deep Dive' ? 'animate-pulse' : ''} />
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-150 px-2.5 py-0.5 rounded-lg shrink-0">
                                {course?.code || 'CS'}
                              </span>
                              
                              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest border shrink-0 ${modeMeta.badgeColor}`}>
                                {session.mode}
                              </span>

                              {course?.difficulty && (
                                <span className="text-[8px] font-bold uppercase tracking-widest border border-slate-100 text-slate-400 px-1.5 py-0.5 rounded-lg">
                                  {course.difficulty} difficulty
                                </span>
                              )}
                            </div>

                            <h4 className="text-base font-serif font-bold text-slate-900 tracking-tight leading-snug truncate pr-3 group-hover/card:text-indigo-600 transition-colors">
                              {course?.title || 'Course syllabus loadout'}
                            </h4>
                          </div>
                        </div>

                        {/* Timing and hub interaction controls */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-50 shrink-0">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl font-sans">
                            <Clock size={13} className="text-slate-400" />
                            <span>{session.duration} minutes</span>
                          </span>

                          <button 
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering card click twice
                              onOpenHub && onOpenHub(session.courseId);
                            }}
                            title="Interactive research hub: open flashcards & summaries"
                            className="bg-slate-50 group-hover/card:bg-indigo-600 border border-slate-150 group-hover/card:border-indigo-600 text-slate-500 group-hover/card:text-white p-2 sm:p-2.5 rounded-xl transition-all select-none active:scale-90 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span className="hidden group-hover/card:inline text-[9px] font-bold uppercase tracking-widest pl-1.5 duration-200">Study Hub</span>
                            <ArrowRight size={14} className="group-hover/card:translate-x-0.5 transition-transform" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleView;
