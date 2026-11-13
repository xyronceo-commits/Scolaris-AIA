import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, RotateCcw, Coffee, BookOpen, Volume2 } from 'lucide-react';

const PomodoroTimer: React.FC = () => {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  
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
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Pomodoro Timer</h1>
          <p className="text-xs text-slate-500 mt-0.5">Structured study intervals designed to maximize retention.</p>
        </div>
        
        {/* Mode selector pills */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button 
            onClick={setWorkMode}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'work' 
                ? 'bg-white text-slate-900 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Study (25m)
          </button>
          <button 
            onClick={setBreakMode}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'break' 
                ? 'bg-white text-slate-900 font-semibold shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Break (5m)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Clock Area */}
        <div className="lg:col-span-8 flex flex-col items-center justify-center bg-white p-8 sm:p-12 rounded-xl border border-slate-200 shadow-2xs relative">
          <div className="flex flex-col items-center gap-8 my-4">
            <div className="relative">
              <svg className="w-56 h-56 sm:w-64 sm:h-64 transform -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  className="stroke-slate-100 stroke-[6px] fill-none"
                />
                <motion.circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  className={`stroke-[6px] fill-none ${mode === 'work' ? 'stroke-blue-600' : 'stroke-emerald-600'}`}
                  strokeDasharray="100 100"
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - progress }}
                  transition={{ duration: 1, ease: "linear" }}
                  pathLength="100"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold text-slate-400 mb-1">
                  {mode === 'work' ? 'Study Block' : 'Short Break'}
                </span>
                <span className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-tight font-mono tabular-nums">
                  {formatTime(minutes, seconds)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button 
                onClick={resetTimer}
                className="h-10 px-4 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 text-xs font-medium transition-colors"
                title="Reset timer"
              >
                <RotateCcw size={15} className="mr-1.5" />
                Reset
              </button>
              <button 
                onClick={toggleTimer}
                className={`h-10 px-6 rounded-lg flex items-center justify-center text-xs font-semibold text-white transition-all shadow-xs active:scale-[0.98] ${
                  isActive 
                    ? 'bg-slate-900 hover:bg-black' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isActive ? (
                  <>
                    <Pause size={15} className="mr-1.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play size={15} className="mr-1.5 fill-current" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Info & Ambient Audio */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-semibold text-slate-500">Session Progress</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <BookOpen size={14} className="text-blue-600" />
                  <span className="text-[11px] font-medium">Completed</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{sessionsCompleted}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <Coffee size={14} className="text-emerald-600" />
                  <span className="text-[11px] font-medium">Focus Time</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{sessionsCompleted * 25}m</p>
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-xs text-blue-900 leading-relaxed">
              <p className="font-medium">Pomodoro Principle</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                25 minutes of deep focus followed by 5 minutes of rest keeps mental fatigue low and memory encoding high.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-500">Study Soundscapes</h4>
              <Volume2 size={14} className="text-slate-400" />
            </div>
            
            <div className="space-y-1.5">
              {[
                { name: 'Lo-Fi Chill Beats', desc: '40-60 BPM rhythms' },
                { name: 'Gentle Rain & Thunder', desc: 'Calming white noise' },
                { name: 'Library Ambiance', desc: 'Subtle acoustic focus' }
              ].map(sound => {
                const isPlaying = activeSound === sound.name;
                return (
                  <button 
                    key={sound.name}
                    onClick={() => setActiveSound(isPlaying ? null : sound.name)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ${
                      isPlaying 
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900' 
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium">{sound.name}</p>
                      <p className="text-[10px] text-slate-500">{sound.desc}</p>
                    </div>
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold ${
                      isPlaying ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isPlaying ? <Pause size={11} /> : <Play size={11} className="translate-x-0.5 fill-current" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
