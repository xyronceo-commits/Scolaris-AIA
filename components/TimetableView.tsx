
import React from 'react';
import { Course, StudySession } from '../types';
import { ICONS } from '../constants';

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
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-emerald-700 inline-block mb-2">Weekly Layout</div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 tracking-tight leading-none">Timetable</h1>
          <p className="text-slate-500 font-medium text-base">A comprehensive grid view of your academic week.</p>
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            {/* Grid Header */}
            <div className="grid grid-cols-8 border-b border-slate-100 divide-x divide-slate-100">
              <div className="p-6 bg-slate-50/50"></div>
              {days.map(day => (
                <div key={day} className="p-6 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{day}</span>
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="divide-y divide-slate-100">
              {timeSlots.map(hour => (
                <div key={hour} className="grid grid-cols-8 divide-x divide-slate-100 min-h-[100px]">
                  <div className="p-4 flex items-start justify-center bg-slate-50/30 text-[10px] font-bold text-slate-400">
                    {hour}:00
                  </div>
                  {days.map(day => {
                    const sessions = getSessionsForDay(day);
                    // This is a simplified grid placement since schedule doesn't have exact hours
                    // In a real app, you'd map session times to grid rows.
                    // For now, we'll just show if there are sessions on that day.
                    const dayIndex = days.indexOf(day);
                    const sessionForSlot = sessions[hour % sessions.length];
                    const course = sessionForSlot ? getCourse(sessionForSlot.courseId) : null;

                    return (
                      <div key={day} className="p-2 relative group hover:bg-slate-50/50 transition-colors">
                        {sessionForSlot && course && hour % 3 === 0 && (
                          <div className="h-full bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2 cursor-pointer hover:shadow-md transition-all">
                            <div className="flex justify-between items-start">
                              <span className="text-[8px] font-bold bg-white px-2 py-0.5 rounded-full border border-blue-100 text-blue-700 uppercase tracking-widest">
                                {course.code}
                              </span>
                            </div>
                            <h4 className="text-[11px] font-bold text-slate-900 leading-tight line-clamp-2">{course.title}</h4>
                            <div className="flex items-center gap-1.5 pt-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                               <span className="text-[9px] text-slate-500 font-medium">{sessionForSlot.duration}m Focus</span>
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

      <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
         <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-emerald-600 shadow-sm border border-slate-100">
               {ICONS.Info}
            </div>
            <div>
               <h4 className="font-bold text-slate-900">Adaptive Scheduling</h4>
               <p className="text-sm text-slate-500">Your timetable automatically adjusts based on course intensity and difficulty.</p>
            </div>
         </div>
         <button className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all whitespace-nowrap">
            Export to PDF
         </button>
      </div>
    </div>
  );
};

export default TimetableView;
