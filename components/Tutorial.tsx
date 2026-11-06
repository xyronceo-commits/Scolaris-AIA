import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, X, ArrowRight, Sparkles, BookOpen, Calendar, BrainCircuit, MessageSquare, GraduationCap } from 'lucide-react';

interface TutorialProps {
  onComplete: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to KorsIQ",
      description: "A centralized academic workspace designed for university students to master courses, study schedules, and research projects.",
      icon: <GraduationCap size={28} className="text-blue-600" />,
      feature: "Platform Overview"
    },
    {
      title: "Smart Course & Syllabus Import",
      description: "Add courses manually or paste your syllabus text. KorsIQ extracts credits, topics, and difficulties automatically.",
      icon: <BookOpen size={28} className="text-blue-600" />,
      feature: "Course Management"
    },
    {
      title: "Balanced Study Timetable",
      description: "Receive optimized weekly study sessions calibrated against credit difficulty, upcoming tests, and personal target CGPA.",
      icon: <Calendar size={28} className="text-blue-600" />,
      feature: "Timetable & Calendar"
    },
    {
      title: "Multimodal Study Hub",
      description: "Upload PDFs and slides to generate executive summaries, active recall flashcards, practice quizzes, and audio overviews.",
      icon: <BrainCircuit size={28} className="text-blue-600" />,
      feature: "Study Hub & AI Tools"
    },
    {
      title: "Private Circles & Academic Studio",
      description: "Collaborate in study circles with invite codes, or write research projects section-by-section with Academic Studio.",
      icon: <MessageSquare size={28} className="text-blue-600" />,
      feature: "Circles & Academic Studio"
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-xl w-full bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden relative"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Quick Guide: {current.feature}</span>
          </div>
          <button 
            onClick={onComplete}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
            title="Skip Guide"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            {current.icon}
          </div>

          <AnimatePresence mode="wait">
            <motion.div 
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {current.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {current.description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Stepper Progress */}
          <div className="pt-2">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-blue-600' : 'w-2 bg-slate-200'}`} 
                />
              ))}
            </div>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Step {step + 1} of {steps.length}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
          {step > 0 ? (
            <button 
              onClick={() => setStep(s => s - 1)}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            >
              Previous
            </button>
          ) : (
            <button 
              onClick={onComplete}
              className="h-9 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              Skip
            </button>
          )}

          <button 
            onClick={next}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            {step === steps.length - 1 ? "Get Started" : "Continue"}
            <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Tutorial;
