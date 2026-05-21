import React, { useState } from 'react';
import { ICONS } from '../constants';
import { ArrowRight, Trash2 } from 'lucide-react';

const CGPACalculator: React.FC = () => {
  const [semesters, setSemesters] = useState<Array<{ id: number; label: string; gpa: number }>>([]);
  const [targetCGPA, setTargetCGPA] = useState(4.50);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGpa, setNewGpa] = useState('');

  const currentCGPA = semesters.length > 0 
    ? semesters.reduce((acc, curr) => acc + curr.gpa, 0) / semesters.length 
    : 0;

  const handleAddSemester = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newGpa) return;
    setSemesters([...semesters, { 
      id: Date.now(), 
      label: newLabel, 
      gpa: parseFloat(newGpa) 
    }]);
    setNewLabel('');
    setNewGpa('');
    setShowAdd(false);
  };

  const removeSemester = (id: number) => {
    setSemesters(semesters.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="space-y-0.5">
        <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight leading-none">GPA Calculator</h1>
        <p className="text-slate-500 font-medium text-sm italic mt-1 font-serif">Track and project your academic performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Current CGPA</span>
           <span className="text-4xl font-bold text-slate-900 tracking-tighter">{currentCGPA.toFixed(2)}</span>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow border-indigo-100 bg-indigo-50/10">
           <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest italic">Targeted CGPA</span>
           <span className="text-4xl font-bold text-indigo-600 tracking-tighter">{targetCGPA.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-2xl font-serif font-bold text-slate-900 tracking-tight">Your CGPA list</h2>
              <button 
                onClick={() => setShowAdd(!showAdd)}
                className="text-indigo-600 font-bold text-sm hover:underline"
              >
                {showAdd ? 'Cancel' : 'Add New'}
              </button>
           </div>
           
           {showAdd && (
             <form onSubmit={handleAddSemester} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 animate-in slide-in-from-top-4 flex flex-col sm:flex-row gap-4">
                <input 
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                  placeholder="Semester Label (e.g. Year 2 Sem 1)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  required
                />
                 <input 
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  className="w-full sm:w-24 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                  placeholder="GPA"
                  value={newGpa}
                  onChange={e => setNewGpa(e.target.value)}
                  required
                />
                <button type="submit" className="bg-slate-900 hover:bg-slate-950 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">Add</button>
             </form>
           )}

           <div className="space-y-4">
              {semesters.length === 0 ? (
                <div className="bg-white p-12 rounded-[2rem] border border-dashed border-slate-200 text-center flex flex-col items-center">
                   <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                      {ICONS.Calendar}
                   </div>
                   <p className="text-slate-500 font-medium text-sm italic opacity-60">No academic periods tracked yet. Click <span className="font-bold text-indigo-600 cursor-pointer hover:underline" onClick={() => setShowAdd(true)}>"Add New"</span> above to start.</p>
                </div>
              ) : (
                semesters.map((sem) => (
                  <div key={sem.id} className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-150 shadow-sm flex items-center justify-between group hover:border-slate-200 transition-all">
                     <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          {ICONS.Calendar}
                        </div>
                        <div className="space-y-0.5">
                           <h4 className="text-lg font-serif font-bold text-slate-900 tracking-tight">{sem.label}</h4>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest tracking-[0.1em]">Academic Period</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-8">
                        <span className="text-2xl font-bold text-slate-900">{sem.gpa.toFixed(2)}</span>
                        <button 
                          onClick={() => removeSemester(sem.id)}
                          className="text-slate-300 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50/50"
                        >
                           <Trash2 size={16} />
                        </button>
                     </div>
                  </div>
                ))
              )}
           </div>
        </div>

        <div className="lg:col-span-5">
           <div className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-10 shadow-2xl relative overflow-hidden sticky top-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full pointer-events-none" />
              <div className="space-y-2 relative z-10">
                 <h3 className="text-2xl font-serif font-bold text-white tracking-tight">Your Academic Summary</h3>
                 <p className="text-slate-400 font-medium text-sm italic">Detailed breakdown of your progress toward the {targetCGPA} goal.</p>
              </div>

              <div className="space-y-6 relative z-10">
                 {[
                   { label: 'Current Performance', value: currentCGPA > 0 ? (currentCGPA >= 4.50 ? 'First Class' : 'Second Class Upper') : 'No Data yet', color: 'text-emerald-400' },
                   { label: 'Required for Target', value: currentCGPA > 0 ? '4.65+ per sem' : '—', color: 'text-indigo-400' },
                   { label: 'Total Semesters', value: `${semesters.length} Semesters`, color: 'text-slate-400' }
                 ].map((stat, i) => (
                   <div key={i} className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</span>
                      <span className={`text-sm font-bold uppercase tracking-wider ${stat.color}`}>{stat.value}</span>
                   </div>
                 ))}
              </div>

              <button className="w-full py-5 bg-white text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl relative z-10">
                 Download Report
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CGPACalculator;
