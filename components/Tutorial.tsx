
import React, { useState } from 'react';
import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, X, ArrowRight, Sparkles, Zap, BrainCircuit, MessageSquare, LayoutGrid, Calendar, BookOpen, GraduationCap } from 'lucide-react';

interface TutorialProps {
  onComplete: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Scolaris AI",
      description: "The next generation of academic intelligence. Let's briefly show you how to master your university life.",
      icon: <div className="p-8 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl shadow-slate-900/20"><GraduationCap size={48} /></div>,
      color: "from-slate-900 to-slate-800",
      accent: "text-blue-500",
      feature: "Dashboard"
    },
    {
      title: "Intelligent Course Import",
      description: "Navigate to 'Courses' to paste your syllabus text. Our AI extracts units, deadlines, and weightings automatically.",
      icon: <div className="p-8 bg-blue-600 text-white rounded-[2.5rem] shadow-xl shadow-blue-500/20"><BookOpen size={48} /></div>,
      color: "from-blue-600 to-indigo-600",
      accent: "text-emerald-400",
      feature: "Course Management"
    },
    {
      title: "Adaptive Study Plans",
      description: "Check 'Schedule' for a personalized roadmap. Scolaris prioritizes harder units and spaces out revision sessions.",
      icon: <div className="p-8 bg-emerald-600 text-white rounded-[2.5rem] shadow-xl shadow-emerald-500/20"><Calendar size={48} /></div>,
      color: "from-emerald-600 to-teal-600",
      accent: "text-amber-400",
      feature: "Smart Scheduling"
    },
    {
      title: "The Multimodal Study Hub",
      description: "Upload PDFs to generate executive summaries, interactive flashcards, or even a mini-podcast explaining complex topics.",
      icon: <div className="p-8 bg-amber-500 text-white rounded-[2.5rem] shadow-xl shadow-amber-500/20"><BrainCircuit size={48} /></div>,
      color: "from-amber-500 to-orange-500",
      accent: "text-blue-600",
      feature: "AI Research Hub"
    },
    {
      title: "Collaborative Research Circles",
      description: "Join 'Circles' to share notes and brainstorm with peers. All group discussions are enhanced by our resident AI assistant.",
      icon: <div className="p-8 bg-rose-600 text-white rounded-[2.5rem] shadow-xl shadow-rose-500/20"><MessageSquare size={48} /></div>,
      color: "from-rose-600 to-pink-600",
      accent: "text-white",
      feature: "Knowledge Sharing"
    }
  ];

  const next = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      onComplete();
    }
  };

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-500">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-4xl w-full bg-white rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col md:flex-row relative"
      >
        {/* Left Side: Visual/Feature Indicator */}
        <div className={`w-full md:w-2/5 bg-gradient-to-br ${current.color} p-12 flex flex-col justify-between relative overflow-hidden`}>
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
           
           <div className="relative z-10">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Protocol: {current.feature}</div>
              <div className="h-1 w-12 bg-white/20 rounded-full mb-12" />
           </div>

           <div className="relative z-10 flex justify-center py-12">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={step}
                  initial={{ opacity: 0, rotate: -15, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 15, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  {current.icon}
                </motion.div>
              </AnimatePresence>
           </div>

           <div className="relative z-10">
              <p className={`text-xs font-bold uppercase tracking-widest ${current.accent}`}>Scolaris Neural Network</p>
              <div className="flex gap-2 mt-4">
                 {steps.map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-10 bg-white' : 'w-2 bg-white/20'}`} 
                    />
                 ))}
              </div>
           </div>
        </div>

        {/* Right Side: Content & Actions */}
        <div className="w-full md:w-3/5 p-10 md:p-16 flex flex-col justify-between relative bg-white">
           <button 
            onClick={onComplete}
            className="absolute top-8 right-8 p-3 text-slate-300 hover:text-rose-500 transition-colors group"
            title="Dismiss Guide"
           >
              <X size={24} className="group-hover:rotate-90 transition-transform" />
           </button>

           <div className="space-y-12">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                   <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 tracking-tight leading-tight italic">
                     {current.title}
                   </h2>
                   <p className="text-lg text-slate-500 font-medium leading-relaxed">
                     {current.description}
                   </p>
                </motion.div>
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-4">
                 <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 italic text-[11px] text-slate-400 font-medium">
                   "Leveraging collective intelligence for academic excellence."
                 </div>
                 <div className="relative overflow-hidden rounded-3xl border border-slate-100 flex items-center justify-center bg-white p-6 group">
                    <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Sparkles size={24} className="text-slate-200 group-hover:text-blue-500 transition-all group-hover:scale-125" />
                 </div>
              </div>
           </div>

           <div className="pt-12 flex items-center gap-6">
              <button 
                onClick={next}
                className={`flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-blue-700 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 overflow-hidden group`}
              >
                 {step === steps.length - 1 ? "Initialize Experience" : "Next Module"}
                 <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
              </button>
              
              {step > 0 && (
                <button 
                  onClick={() => setStep(s => s - 1)}
                  className="w-14 h-14 rounded-2xl border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                >
                   <ChevronRight size={24} className="rotate-180" />
                </button>
              )}
           </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Tutorial;
