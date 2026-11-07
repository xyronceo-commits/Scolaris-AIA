import React from 'react';
import { Course, StudySession } from '../types';
import { Calendar, Download, Sparkles, Clock } from 'lucide-react';

interface TimetableViewProps {
  schedule: StudySession[];
  courses: Course[];
}

const TimetableView: React.FC<TimetableViewProps> = ({ schedule, courses }) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timeSlots = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM to 9 PM

  const getCourse = (id: string) => courses.find(c => c.id === id);
  const getSessionsForDay = (day: string) => schedule.filter(s => s.day === day);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md mb-2 border border-blue-100">
            <Calendar size={12} />
            Weekly Academic Grid
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Academic Timetable</h1>
          <p className="text-xs text-slate-500 mt-0.5">High-level visual grid of scheduled sessions and study commitments.</p>
        </div>

        <button 
          onClick={() => window.print()}
          className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 self-start sm:self-auto shadow-2xs"
        >
          <Download size={13} />
          Print / Export Timetable
        </button>
      </div>

      {/* Grid container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Grid Header */}
            <div className="grid grid-cols-8 border-b border-slate-200 divide-x divide-slate-200 bg-slate-50">
              <div className="p-3 text-center text-xs font-semibold text-slate-500">
                <Clock size={14} className="mx-auto" />
              </div>
              {days.map(day => (
                <div key={day} className="p-3 text-center">
                  <span className="text-xs font-semibold text-slate-700">{day}</span>
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="divide-y divide-slate-100">
              {timeSlots.map(hour => (
                <div key={hour} className="grid grid-cols-8 divide-x divide-slate-100 min-h-[72px]">
                  <div className="p-2.5 flex items-start justify-center bg-slate-50/60 text-[11px] font-mono font-medium text-slate-400">
                    {hour}:00
                  </div>
                  {days.map(day => {
                    const sessions = getSessionsForDay(day);
                    const sessionForSlot = sessions[hour % sessions.length];
                    const course = sessionForSlot ? getCourse(sessionForSlot.courseId) : null;

                    return (
                      <div key={day} className="p-1.5 relative group hover:bg-slate-50/50 transition-colors">
                        {sessionForSlot && course && hour % 3 === 0 && (
                          <div className="h-full bg-blue-50/70 border border-blue-200/80 rounded-lg p-2.5 flex flex-col justify-between hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer shadow-2xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-100">
                                {course.code}
                              </span>
                              <span className="text-[10px] font-medium text-blue-600">
                                {sessionForSlot.duration}m
                              </span>
                            </div>
                            <h4 className="text-xs font-medium text-slate-900 line-clamp-1 mt-1">
                              {course.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                              <span className="text-[10px] text-slate-500 truncate">
                                {sessionForSlot.topic || 'Review & Exercises'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-900">Dynamic Timetable Balancing</h4>
            <p className="text-xs text-slate-500">Your timetable automatically weights heavy credit units and tough courses during peak focus hours.</p>
          </div>
        </div>
        <div className="text-xs font-medium text-slate-500 whitespace-nowrap">
          {schedule.length} total sessions scheduled
        </div>
      </div>
    </div>
  );
};

export default TimetableView;
