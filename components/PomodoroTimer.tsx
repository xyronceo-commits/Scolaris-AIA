
import React, { useState, useEffect, useRef } from 'react';
import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, Coffee, BookOpen, Bell } from 'lucide-react';

const PomodoroTimer: React.FC = () => {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        if (seconds > 0) {
          setSeconds(seconds - 1);
        } else if (minutes > 0) {
          setMinutes(minutes - 1);
          setSeconds(59);
        } else {
          // Timer finished
          handleTimerEnd();
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, minutes, seconds]);

  const handleTimerEnd = () => {
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Play sound if possible
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {});

    if (mode === 'work') {
      setSessionsCompleted(prev => prev + 1);
      setMode('break');
      setMinutes(5);
    } else {
      setMode('work');
      setMinutes(25);
    }
    setSeconds(0);
  };

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setMode('work');
    setMinutes(25);
    setSeconds(0);
  };

  const setWorkMode = () => {
    setIsActive(false);
    setMode('work');
    setMinutes(25);
    setSeconds(0);
  };

  const setBreakMode = () => {
    setIsActive(false);
    setMode('break');
    setMinutes(5);
    setSeconds(0);
  };

  const formatTime = (m: number, s: number) => {
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = mode === 'work' 
    ? ((25 * 60 - (minutes * 60 + seconds)) / (25 * 60)) * 100
    : ((5 * 60 - (minutes * 60 + seconds)) / (5 * 60)) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="px-3 py-1 bg-red-50 border border-red-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-red-700 inline-block mb-2">Deep Work Protocol</div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 tracking-tight leading-none">Focus Timer</h1>
          <p className="text-slate-500 font-medium text-base">Master your attention span with the Pomodoro technique.</p>
        </div>
        
        <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
           <button 
             onClick={setWorkMode}
             className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${mode === 'work' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
           >
             Focus
           </button>
           <button 
             onClick={setBreakMode}
             className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${mode === 'break' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
           >
             Break
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col items-center justify-center bg-white p-12 md:p-24 rounded-[4rem] border border-slate-100 shadow-sm relative overflow-hidden">
           {/* Subtle Background Pattern */}
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
           
           <div className="relative z-10 flex flex-col items-center gap-12">
              <div className="relative">
                 <svg className="w-64 h-64 md:w-80 md:h-80 transform -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="48%"
                      className="stroke-slate-100 stroke-[4px] fill-none"
                    />
                    <motion.circle
                      cx="50%"
                      cy="50%"
                      r="48%"
                      className={`stroke-[6px] fill-none ${mode === 'work' ? 'stroke-red-500' : 'stroke-blue-500'}`}
                      strokeDasharray="100 100"
                      initial={{ strokeDashoffset: 100 }}
                      animate={{ strokeDashoffset: 100 - progress }}
                      transition={{ duration: 1, ease: "linear" }}
                      pathLength="100"
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-2">Remaining</span>
                    <span className="text-7xl md:text-8xl font-serif font-bold text-slate-900 tracking-tighter tabular-nums">
                      {formatTime(minutes, seconds)}
                    </span>
                 </div>
              </div>

              <div className="flex items-center gap-6">
                 <button 
                   onClick={resetTimer}
                   className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 border border-slate-100 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-90"
                 >
                   <RotateCcw size={24} />
                 </button>
                 <button 
                   onClick={toggleTimer}
                   className={`w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-xl ${
                     isActive 
                       ? 'bg-slate-900 text-white hover:bg-black' 
                       : (mode === 'work' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700')
                   }`}
                 >
                   {isActive ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="translate-x-1" />}
                 </button>
                 <div className="w-16 h-16 hidden md:block" /> {/* Spacing balance */}
              </div>
           </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-xl font-serif font-bold text-slate-900 tracking-tight">Session Stats</h3>
              <div className="space-y-6">
                 <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shrink-0">
                       <BookOpen size={18} />
                    </div>
                    <div>
                       <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Sessions Completed</p>
                       <p className="text-2xl font-bold text-slate-900">{sessionsCompleted}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shrink-0">
                       <Coffee size={18} />
                    </div>
                    <div>
                       <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Total Focus Time</p>
                       <p className="text-2xl font-bold text-slate-900">{sessionsCompleted * 25} min</p>
                    </div>
                 </div>
              </div>
              
              <div className="pt-8 border-t border-slate-50">
                 <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex items-center gap-2 text-red-600">
                       <Bell size={14} className="animate-bounce" />
                       <span className="text-[10px] font-bold uppercase tracking-widest">Scientific Insight</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed italic">
                      Taking short breaks helps your brain process and encode the information you just studied.
                    </p>
                 </div>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[3rem] text-white space-y-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full translate-x-10 -translate-y-10" />
              <div className="space-y-1">
                 <h4 className="font-serif font-bold text-lg">Focus Soundscapes</h4>
                 <p className="text-xs text-slate-400">Enhance concentration with ambient audio.</p>
              </div>
              <div className="space-y-2">
                 {['Lofi Study', 'Rainfall', 'White Noise'].map(sound => (
                   <button 
                     key={sound}
                     className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/10 transition-colors group/item"
                   >
                     <span className="text-xs font-semibold">{sound}</span>
                     <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center group-hover/item:bg-white/20 transition-colors">
                        <Play size={10} fill="white" />
                     </div>
                   </button>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
