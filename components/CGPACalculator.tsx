import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { Trash2, Edit2, Check, Target, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';

interface CGPACalculatorProps {
  profile?: UserProfile | null;
  onUpdateProfile?: (profile: UserProfile) => void;
}

const CGPACalculator: React.FC<CGPACalculatorProps> = ({ profile, onUpdateProfile }) => {
  const [semesters, setSemesters] = useState<Array<{ id: number; label: string; gpa: number }>>(() => {
    const saved = localStorage.getItem('scolaris_cgpa_semesters');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const getInitialTarget = () => {
    if (profile?.targetCGPA !== undefined) return profile.targetCGPA;
    const local = localStorage.getItem('scolaris_target_cgpa');
    if (local) {
      const parsed = parseFloat(local);
      if (!isNaN(parsed)) return parsed;
    }
    return 4.50;
  };

  const [targetCGPA, setTargetCGPA] = useState<number>(getInitialTarget);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTargetInput, setTempTargetInput] = useState<string>(getInitialTarget().toFixed(2));
  const [targetSavedSuccess, setTargetSavedSuccess] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGpa, setNewGpa] = useState('');

  // Sync state if profile targetCGPA updates externally
  useEffect(() => {
    if (profile?.targetCGPA !== undefined) {
      setTargetCGPA(profile.targetCGPA);
      setTempTargetInput(profile.targetCGPA.toFixed(2));
    }
  }, [profile?.targetCGPA]);

  // Persist semesters to localStorage
  const updateSemesters = (newSemesters: Array<{ id: number; label: string; gpa: number }>) => {
    setSemesters(newSemesters);
    localStorage.setItem('scolaris_cgpa_semesters', JSON.stringify(newSemesters));
  };

  const currentCGPA = semesters.length > 0 
    ? semesters.reduce((acc, curr) => acc + curr.gpa, 0) / semesters.length 
    : 0;

  const handleSaveTargetCGPA = (valToSave?: number) => {
    const rawVal = valToSave !== undefined ? valToSave : parseFloat(tempTargetInput);
    if (isNaN(rawVal)) return;
    const clamped = Math.min(5.00, Math.max(0.00, parseFloat(rawVal.toFixed(2))));
    
    setTargetCGPA(clamped);
    setTempTargetInput(clamped.toFixed(2));
    setIsEditingTarget(false);
    localStorage.setItem('scolaris_target_cgpa', clamped.toString());

    if (profile && onUpdateProfile) {
      onUpdateProfile({
        ...profile,
        targetCGPA: clamped
      });
    }

    setTargetSavedSuccess(true);
    setTimeout(() => setTargetSavedSuccess(false), 2500);
  };

  const handleAddSemester = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newGpa) return;
    const gpaVal = parseFloat(newGpa);
    if (isNaN(gpaVal) || gpaVal < 0 || gpaVal > 5.0) return;

    const nextSemesters = [...semesters, { 
      id: Date.now(), 
      label: newLabel.trim(), 
      gpa: Math.min(5.00, Math.max(0, parseFloat(gpaVal.toFixed(2))))
    }];
    updateSemesters(nextSemesters);
    setNewLabel('');
    setNewGpa('');
    setShowAdd(false);
  };

  const removeSemester = (id: number) => {
    const nextSemesters = semesters.filter(s => s.id !== id);
    updateSemesters(nextSemesters);
  };

  const getPerformanceLabel = (gpa: number) => {
    if (gpa >= 4.50) return 'First Class Honors';
    if (gpa >= 3.50) return 'Second Class Upper';
    if (gpa >= 2.40) return 'Second Class Lower';
    if (gpa >= 1.50) return 'Third Class';
    return 'Pass / Needs Improvement';
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight leading-none">GPA Calculator</h1>
          <p className="text-slate-500 font-medium text-sm italic mt-1 font-serif">Track and project your academic performance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current CGPA Card */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-sm flex flex-col justify-between h-auto min-h-[9.5rem] hover:shadow-md transition-shadow">
           <div className="flex justify-between items-center">
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Current CGPA</span>
             <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
               {semesters.length} {semesters.length === 1 ? 'Semester' : 'Semesters'}
             </span>
           </div>
           <div className="flex items-baseline justify-between mt-2">
             <span className="text-4xl font-bold text-slate-900 tracking-tighter">{currentCGPA.toFixed(2)}</span>
             <span className="text-xs font-semibold text-slate-500">{currentCGPA > 0 ? getPerformanceLabel(currentCGPA) : 'No Data'}</span>
           </div>
        </div>

        {/* Targeted CGPA Card (Editable) */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-150 shadow-sm flex flex-col justify-between h-auto min-h-[9.5rem] hover:shadow-md transition-all border-indigo-100 bg-indigo-50/10 relative overflow-hidden group">
           <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest italic flex items-center gap-1.5">
                <Target size={12} />
                Targeted CGPA
                {targetSavedSuccess && (
                  <span className="text-[9px] text-emerald-600 font-bold normal-case not-italic bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-in fade-in flex items-center gap-1">
                    <Check size={10} /> Saved
                  </span>
                )}
              </span>

              {!isEditingTarget ? (
                <button 
                  type="button"
                  onClick={() => {
                    setTempTargetInput(targetCGPA.toFixed(2));
                    setIsEditingTarget(true);
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100/70 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-all uppercase tracking-wider"
                  title="Edit target CGPA goal"
                >
                  <Edit2 size={11} />
                  <span>Edit Goal</span>
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={() => setIsEditingTarget(false)}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-full transition-all uppercase tracking-wider"
                >
                  Cancel
                </button>
              )}
           </div>

           {!isEditingTarget ? (
             <div className="flex items-baseline justify-between mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-indigo-600 tracking-tighter">{targetCGPA.toFixed(2)}</span>
                  <span className="text-xs font-medium text-indigo-400 font-sans">Goal</span>
                </div>
                <button 
                  onClick={() => {
                    setTempTargetInput(targetCGPA.toFixed(2));
                    setIsEditingTarget(true);
                  }}
                  className="text-[10px] text-indigo-500 font-bold hover:underline opacity-80 group-hover:opacity-100"
                >
                  Click to change
                </button>
             </div>
           ) : (
             <div className="mt-3 space-y-3 animate-in fade-in duration-300">
               <div className="flex items-center gap-2">
                 <input 
                   type="number"
                   step="0.01"
                   min="0.00"
                   max="5.00"
                   value={tempTargetInput}
                   onChange={(e) => setTempTargetInput(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       e.preventDefault();
                       handleSaveTargetCGPA();
                     }
                   }}
                   className="w-28 bg-white border border-indigo-300 rounded-xl px-3 py-1.5 text-lg font-bold text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-inner"
                   placeholder="4.50"
                   autoFocus
                 />
                 <button 
                   type="button"
                   onClick={() => handleSaveTargetCGPA()}
                   className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-1"
                 >
                   <Check size={14} />
                   Save Goal
                 </button>
               </div>
               
               <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                 <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider shrink-0">Quick Presets:</span>
                 {[3.50, 4.00, 4.25, 4.50, 4.75, 5.00].map((preset) => (
                   <button
                     key={preset}
                     type="button"
                     onClick={() => handleSaveTargetCGPA(preset)}
                     className="text-[10px] font-bold text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg transition-all shrink-0"
                   >
                     {preset.toFixed(2)}
                   </button>
                 ))}
               </div>
             </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-2xl font-serif font-bold text-slate-900 tracking-tight">Your CGPA list</h2>
              <button 
                type="button"
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
                  className="w-full sm:w-28 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold"
                  placeholder="GPA (0-5.0)"
                  value={newGpa}
                  onChange={e => setNewGpa(e.target.value)}
                  required
                />
                <button type="submit" className="bg-slate-900 hover:bg-slate-950 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md">Add</button>
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
                          type="button"
                          onClick={() => removeSemester(sem.id)}
                          className="text-slate-300 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50/50"
                          title="Remove semester"
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
                 <p className="text-slate-400 font-medium text-sm italic">Detailed breakdown of your progress toward your {targetCGPA.toFixed(2)} goal.</p>
              </div>

              <div className="space-y-6 relative z-10">
                 {[
                   { 
                     label: 'Current Performance', 
                     value: currentCGPA > 0 ? getPerformanceLabel(currentCGPA) : 'No Data yet', 
                     color: currentCGPA >= targetCGPA ? 'text-emerald-400' : 'text-slate-200' 
                   },
                   { 
                     label: 'Target Goal', 
                     value: `${targetCGPA.toFixed(2)} CGPA`, 
                     color: 'text-indigo-400' 
                   },
                   { 
                     label: 'Goal Status', 
                     value: currentCGPA > 0 ? (currentCGPA >= targetCGPA ? 'Target Achieved! 🎉' : `${(targetCGPA - currentCGPA).toFixed(2)} pts needed`) : 'Pending data', 
                     color: currentCGPA >= targetCGPA ? 'text-emerald-400' : 'text-amber-400' 
                   },
                   { 
                     label: 'Total Semesters Tracked', 
                     value: `${semesters.length} Semesters`, 
                     color: 'text-slate-400' 
                   }
                 ].map((stat, i) => (
                   <div key={i} className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</span>
                      <span className={`text-sm font-bold uppercase tracking-wider ${stat.color}`}>{stat.value}</span>
                   </div>
                 ))}
              </div>

              <div className="pt-2 relative z-10">
                <button 
                  type="button"
                  onClick={() => {
                    setTempTargetInput(targetCGPA.toFixed(2));
                    setIsEditingTarget(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2"
                >
                  <Edit2 size={14} />
                  Adjust Target Goal
                </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CGPACalculator;
