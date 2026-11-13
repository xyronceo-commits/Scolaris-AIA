import React, { useState } from 'react';
import { StudySession, Course } from '../types';
import { DAYS, DIFFICULTY_COLORS } from '../constants';
import { 
  ArrowRight, 
  RotateCcw, 
  PenTool, 
  BookOpen, 
  Clock, 
  Layers, 
  Award, 
  BookMarked, 
  Calendar, 
  Download, 
  ExternalLink, 
  Copy, 
  Check, 
  X
} from 'lucide-react';

interface ScheduleViewProps {
  schedule: StudySession[];
  courses: Course[];
  onOpenHub?: (courseId: string) => void;
}

const MODE_METADATA = {
  'Deep Dive': {
    color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100/50',
    icon: BookOpen,
    desc: 'Uninterrupted deeply-focused creative workflow',
    accentColor: 'text-blue-600',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/80',
    glowColor: '',
    tag: 'Deep Dive'
  },
  'Review': {
    color: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/50',
    icon: RotateCcw,
    desc: 'Spaced repetition & concept synthesis evaluation',
    accentColor: 'text-amber-600 border-amber-200',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200/80',
    glowColor: '',
    tag: 'Review'
  },
  'Practice': {
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/50',
    icon: PenTool,
    desc: 'Interactive problems, code challenges, & exercises',
    accentColor: 'text-emerald-600',
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    glowColor: '',
    tag: 'Practice'
  },
  'Reading': {
    color: 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100/50',
    icon: BookOpen,
    desc: 'Syllabus literature, readings, & source material scanning',
    accentColor: 'text-sky-600',
    badgeColor: 'bg-sky-50 text-sky-800 border-sky-200/80',
    glowColor: '',
    tag: 'Reading'
  }
};

const getModeMeta = (mode: string) => {
  const norm = Object.keys(MODE_METADATA).find(
    k => k.toLowerCase() === mode?.toLowerCase()
  ) as keyof typeof MODE_METADATA;
  return norm ? MODE_METADATA[norm] : {
    color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/50',
    icon: BookMarked,
    desc: 'General learning and evaluation objective',
    accentColor: 'text-slate-600',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
    glowColor: '',
    tag: mode || 'General'
  };
};

const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule, courses, onOpenHub }) => {
  const [selectedModeFilter, setSelectedModeFilter] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState(false);

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

  // iCal (.ics) file generator
  const handleExportICS = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);

    const dayOffsets: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };
    const daySessionCounts: Record<string, number> = {};

    const pad = (n: number) => n < 10 ? '0' + n : '' + n;
    const formatDateISO = (d: Date) => {
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    };

    let icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KorsIQ//Study Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:KorsIQ Study Schedule',
      `X-WR-TIMEZONE:${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}`
    ];

    schedule.forEach((session, index) => {
      const course = getCourse(session.courseId);
      const dayName = session.day || 'Monday';
      const offset = dayOffsets[dayName] !== undefined ? dayOffsets[dayName] : 0;
      
      const sessionNum = (daySessionCounts[dayName] || 0);
      daySessionCounts[dayName] = sessionNum + 1;

      const sessionDate = new Date(monday);
      sessionDate.setDate(monday.getDate() + offset);
      const startHour = 9 + (sessionNum * 2);
      sessionDate.setHours(startHour, 0, 0, 0);

      const endDate = new Date(sessionDate.getTime() + (session.duration || 60) * 60 * 1000);

      const title = `${course?.code || 'Course'}: ${session.topic || course?.title || 'Study Session'} (${session.mode || 'Review'})`;
      const description = `KorsIQ Academic Study Session\\nCourse: ${course?.code || ''} - ${course?.title || ''}\\nTopic: ${session.topic || 'Core Concept Review'}\\nTechnique: ${session.technique || 'Active Recall'}\\nDuration: ${session.duration} minutes.`;

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:korsiq-session-${index}-${Date.now()}@korsiq.ai`,
        `DTSTAMP:${formatDateISO(now)}`,
        `DTSTART:${formatDateISO(sessionDate)}`,
        `DTEND:${formatDateISO(endDate)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${dayName.substring(0, 2).toUpperCase()}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        `DESCRIPTION:KorsIQ Reminder: Your ${course?.code || 'study'} session starts in 30 minutes. Focus: ${session.topic || 'Core Concept Review'}.`,
        'END:VALARM',
        'END:VEVENT'
      );
    });

    icsLines.push('END:VCALENDAR');
    const icsContent = icsLines.join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'korsiq_study_schedule.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const createGoogleCalendarUrl = (session: StudySession) => {
    const course = getCourse(session.courseId);
    const dayOffsets: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);

    const offset = dayOffsets[session.day] !== undefined ? dayOffsets[session.day] : 0;
    const sessionDate = new Date(monday);
    sessionDate.setDate(monday.getDate() + offset);
    sessionDate.setHours(10, 0, 0, 0);

    const endDate = new Date(sessionDate.getTime() + (session.duration || 60) * 60 * 1000);

    const pad = (n: number) => n < 10 ? '0' + n : '' + n;
    const formatGCalDate = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

    const title = encodeURIComponent(`${course?.code || 'Course'}: ${session.topic || course?.title || 'Study Session'} (${session.mode || 'Review'})`);
    const details = encodeURIComponent(`KorsIQ Academic Study Session\nCourse: ${course?.code || ''} - ${course?.title || ''}\nTopic: ${session.topic || 'Core Concept Mastery'}\nReading Technique: ${session.technique || 'Active Recall'}\nDuration: ${session.duration} mins\nMode: ${session.mode}`);
    const dates = `${formatGCalDate(sessionDate)}/${formatGCalDate(endDate)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dates}&recur=RRULE:FREQ=WEEKLY`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 max-w-7xl mx-auto">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">
            Weekly Schedule
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal font-sans">
            Your personalized AI study plan with calibrated learning modes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-xs font-semibold">
          <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs">
            <Layers size={13} className="text-slate-400" />
            <span>{totalSessionsCount} Planned Sessions</span>
          </span>
          <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs">
            <Clock size={13} className="text-slate-400" />
            <span>{(totalStudyMinutes / 60).toFixed(1)} hrs allocated</span>
          </span>
          <button
            onClick={() => setShowExportModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            <Calendar size={13} />
            <span>Export Schedule</span>
          </button>
        </div>
      </div>

      {/* Mode Filters & Breakdown Stats Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-slate-500">
            Filter by study mode
          </span>
          {selectedModeFilter && (
            <button 
              onClick={() => setSelectedModeFilter(null)}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Object.entries(MODE_METADATA).map(([modeName, info]) => {
            const count = modeCounts[modeName] || 0;
            const isSelected = selectedModeFilter === modeName;
            const IconComponent = info.icon;
            
            return (
              <button
                key={modeName}
                onClick={() => setSelectedModeFilter(isSelected ? null : modeName)}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-400' 
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className={`p-1.5 rounded-md ${
                    isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <IconComponent size={15} />
                  </span>
                  
                  <span className="text-xl font-bold tracking-tight text-slate-800 font-mono">
                    {count}
                  </span>
                </div>

                <div className="mt-2.5">
                  <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-none mb-1">
                    {modeName}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-sans leading-normal line-clamp-1">
                    {info.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Days & Study Slots Schedule */}
      <div className="space-y-6">
        {DAYS.map((dayName) => {
          const daySessions = schedule.filter(s => s.day === dayName);
          const filteredSessions = selectedModeFilter 
            ? daySessions.filter(s => s.mode?.toLowerCase() === selectedModeFilter.toLowerCase())
            : daySessions;

          if (selectedModeFilter && filteredSessions.length === 0 && daySessions.length > 0) {
            return null;
          }

          return (
            <div key={dayName} className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold text-slate-700">{dayName}</h3>
                <span className="h-px bg-slate-200 flex-1" />
                <span className="text-xs text-slate-400 font-medium font-mono">
                  {daySessions.length} sessions
                </span>
              </div>

              <div className="space-y-2.5">
                {daySessions.length === 0 ? (
                  <div className="p-6 border border-dashed border-slate-200 bg-white rounded-lg text-center text-slate-400 text-xs font-medium">
                    Rest day. No study sessions allocated.
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="p-4 border border-slate-200 bg-white rounded-lg text-center text-slate-400 text-xs font-medium">
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
                        className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group/card cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 w-full sm:w-auto">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${modeMeta.badgeColor}`}>
                            <IconComponent size={16} />
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shrink-0">
                                {course?.code || 'CS'}
                              </span>
                              
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${modeMeta.badgeColor}`}>
                                {session.mode}
                              </span>

                              {course?.difficulty && (
                                <span className="text-xs font-medium border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                                  {course.difficulty}
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-serif font-bold text-slate-900 tracking-tight leading-snug truncate pr-3 group-hover/card:text-blue-600 transition-colors">
                              {course?.title || 'Course syllabus loadout'}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                          <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md font-sans">
                            <Clock size={12} className="text-slate-400" />
                            <span>{session.duration} mins</span>
                          </span>

                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenHub && onOpenHub(session.courseId);
                            }}
                            title="Interactive research hub: open flashcards & summaries"
                            className="bg-slate-50 group-hover/card:bg-blue-600 border border-slate-200 group-hover/card:border-blue-600 text-slate-600 group-hover/card:text-white px-2.5 py-1 rounded-md transition-all flex items-center justify-center gap-1 cursor-pointer text-xs font-semibold"
                          >
                            <span>Study Hub</span>
                            <ArrowRight size={13} className="group-hover/card:translate-x-0.5 transition-transform" />
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

      {/* Export Schedule Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 space-y-5 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <Calendar size={16} />
                  </span>
                  <h3 className="text-base font-serif font-bold text-slate-900">Export Study Schedule</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Sync your KorsIQ study plan directly with Apple Calendar, Google Calendar, or Outlook.
                </p>
              </div>

              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Main Export Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* Option 1: Download .ics File */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Download size={15} />
                  </div>
                  <h4 className="font-serif font-bold text-slate-900 text-xs">Download iCal (.ics) File</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Standard iCalendar file. Compatible with Apple Calendar, Google Calendar, Outlook, and mobile apps.
                  </p>
                </div>
                <button
                  onClick={handleExportICS}
                  className="w-full mt-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download .ics</span>
                </button>
              </div>

              {/* Option 2: Direct Google Calendar Instructions */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <ExternalLink size={15} />
                  </div>
                  <h4 className="font-serif font-bold text-slate-900 text-xs">Google Calendar Import</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Download the .ics file, then in Google Calendar go to <strong>Settings &rarr; Import &amp; Export</strong> to batch add sessions!
                  </p>
                </div>
                <a
                  href="https://calendar.google.com/calendar/r/settings/export"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full mt-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer text-center"
                >
                  <ExternalLink size={13} />
                  <span>Google Calendar</span>
                </a>
              </div>

            </div>

            {/* Quick Add Individual Google Calendar Links */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-semibold text-slate-500">
                Add sessions to Google Calendar
              </h4>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {schedule.map((session, idx) => {
                  const course = getCourse(session.courseId);
                  const gcalUrl = createGoogleCalendarUrl(session);

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs font-sans gap-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-700 uppercase bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">
                          {session.day?.substring(0,3)}
                        </span>
                        <span className="font-medium text-slate-900 truncate text-xs">
                          {course?.code || 'CS'}: {course?.title || 'Session'}
                        </span>
                        <span className="text-slate-400 text-[10px] hidden sm:inline">
                          ({session.mode})
                        </span>
                      </div>

                      <a
                        href={gcalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] flex items-center gap-1 shrink-0 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                      >
                        <span>Add</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleView;
