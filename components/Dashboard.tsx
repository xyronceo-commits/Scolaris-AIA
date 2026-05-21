
import React from 'react';
import { UserProfile, Course, StudySession } from '../types';
import { ICONS, DAYS, DIFFICULTY_COLORS } from '../constants';
import { Globe, ArrowRight } from 'lucide-react';

interface DashboardProps {
  profile: UserProfile;
  courses: Course[];
  schedule: StudySession[];
  onOpenHub: (courseId: string) => void;
  onUpgrade: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ profile, courses, schedule, onOpenHub, onUpgrade }) => {
  const today = DAYS[new Date().getDay() - 1] || 'Monday';
  const todaysTasks = schedule.filter(s => s.day === today);
  
  const getCourse = (id: string) => courses.find(c => c.id === id);

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Header Section */}
      <div className="space-y-0.5">
        <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight">
          Hey, {profile.name.split(' ')[0]}!
        </h1>
        <p className="text-slate-500 font-medium text-sm italic">Ready to crush today's goals?</p>
      </div>

      {/* Stats Cards - Matches Screenshot 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Daily Focus</span>
           <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900 tracking-tight">{todaysTasks.length}</span>
              <span className="text-slate-500 font-medium text-sm italic">sessions</span>
           </div>
        </div>
        
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow relative overflow-hidden group">
           <div className="flex justify-between items-start">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Study Hubs</span>
              <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                 {ICONS.StudyHub}
              </div>
           </div>
           <span className="text-3xl font-bold text-slate-900">{courses.length}</span>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
           <div className="flex justify-between items-start">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Semester</span>
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                 {ICONS.Calendar}
              </div>
           </div>
           <span className="text-3xl font-bold text-slate-900">100%</span>
        </div>
      </div>

      {/* Today's Focus */}
      <section className="space-y-4 pt-2">
         <h2 className="text-xl font-serif font-bold text-slate-900 tracking-tight">Today's Focus</h2>
         {todaysTasks.length > 0 ? (
           <div className="space-y-3">
              {todaysTasks.map((task, idx) => {
                const course = getCourse(task.courseId);
                return (
                  <div key={idx} className="bg-white p-4 md:p-6 rounded-[1.5rem] border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 transition-all group hover:border-blue-100 shadow-sm">
                     <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                           {ICONS.Courses}
                        </div>
                        <div className="space-y-0.5 text-center md:text-left">
                           <h4 className="text-lg font-serif font-bold text-slate-900 tracking-tight">{course?.code} — {course?.title}</h4>
                           <div className="flex items-center justify-center md:justify-start gap-2">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[8px] font-bold uppercase tracking-widest">{task.mode}</span>
                              <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                 {ICONS.Clock} {task.duration} min
                              </span>
                           </div>
                        </div>
                     </div>
                     <button 
                       onClick={() => onOpenHub(task.courseId)}
                       className="text-blue-600 hover:translate-x-1 transition-transform"
                     >
                       <ArrowRight size={20} />
                     </button>
                  </div>
                );
              })}
           </div>
         ) : (
           <div className="bg-white p-12 rounded-[2rem] border border-dashed border-slate-200 text-center flex flex-col items-center">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                 {ICONS.CheckCircle}
              </div>
              <p className="text-slate-500 font-medium text-sm italic opacity-60">No focus sessions scheduled for today. Take it easy!</p>
           </div>
         )}
      </section>

      {/* Recent Hubs - Matches Screenshot 1 */}
      <section className="space-y-4 pt-2">
         <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold text-slate-900 tracking-tight">Recent Hubs</h2>
            <button className="text-slate-400 hover:text-slate-900 transition-colors">
               <ArrowRight size={18} />
            </button>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.slice(0, 3).map((course) => (
               <div 
                 key={course.id} 
                 onClick={() => onOpenHub(course.id)}
                 className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:border-blue-100 transition-all cursor-pointer space-y-4 group"
               >
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 group-hover:scale-110 transition-transform text-sm">
                     {ICONS.StudyHub}
                  </div>
                  <div className="space-y-0.5">
                     <h4 className="font-serif font-bold text-slate-900 text-base tracking-tight uppercase leading-none">{course.code}</h4>
                     <p className="text-slate-500 font-medium text-[10px] italic truncate">{course.title}</p>
                  </div>
                  <div className="flex gap-2">
                     <span className={`px-2 py-0.5 rounded-full border text-[7px] font-bold uppercase tracking-widest ${DIFFICULTY_COLORS[course.difficulty || 'Medium']}`}>
                        {course.difficulty}
                     </span>
                     <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-400 rounded-full text-[7px] font-bold uppercase tracking-widest">
                        {course.units} units
                     </span>
                  </div>
               </div>
            ))}
         </div>
      </section>
    </div>
  );
};

export default Dashboard;
