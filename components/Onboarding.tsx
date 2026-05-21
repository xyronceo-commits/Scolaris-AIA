
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, SubscriptionTier } from '../types';
import { ICONS } from '../constants';

interface OnboardingProps {
  userEmail: string;
  onComplete: (profile: UserProfile) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ userEmail, onComplete }) => {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    university: '',
    level: 'Freshman',
    age: 20,
    semesterEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString().split('T')[0],
    tier: 'free' as SubscriptionTier
  });

  const nextStep = () => {
    setDirection(1);
    setStep(s => s + 1);
  };
  const prevStep = () => {
    setDirection(-1);
    setStep(s => s - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      name: formData.name,
      email: userEmail,
      university: formData.university,
      level: formData.level,
      age: formData.age,
      semesterEnd: formData.semesterEnd,
      onboarded: true,
      tutorialSeen: false,
      isPro: formData.tier !== 'free',
      tier: formData.tier,
      notifications: {
        messages: true,
        sessions: true,
        aiContent: true
      }
    });
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  const totalSteps = 4;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 overflow-hidden relative selection:bg-blue-100">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none animate-pulse"></div>
      
      <div className="max-w-sm w-full bg-white p-6 rounded-[2rem] relative z-10 border border-slate-100 shadow-xl overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-slate-900"></div>
        
        <div className="mb-4 text-center space-y-3">
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1 max-w-[140px] w-full">
              {[1, 2, 3, 4].map(i => (
                <div 
                  key={i} 
                  className={`h-0.5 flex-1 rounded-full transition-all duration-700 ${
                    step >= i 
                      ? 'bg-blue-700' 
                      : 'bg-slate-100'
                  }`} 
                />
              ))}
            </div>
            <div className="flex items-center justify-between w-full px-2">
              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                Step {step} <span className="opacity-40">/</span> {totalSteps}
              </p>
              <button 
                type="button"
                onClick={() => onComplete({
                  name: formData.name || 'Guest Scholar',
                  email: userEmail,
                  university: formData.university || 'Global University',
                  level: formData.level,
                  age: formData.age || 20,
                  semesterEnd: formData.semesterEnd || new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString().split('T')[0],
                  onboarded: true,
                  tutorialSeen: false,
                  isPro: false,
                  tier: 'free',
                  notifications: { messages: true, sessions: true, aiContent: true }
                })}
                className="text-[8px] font-bold text-blue-600 uppercase tracking-widest hover:underline"
              >
                Skip 
              </button>
            </div>
          </div>
          
          <h1 className="text-xl font-serif font-bold tracking-tight text-slate-900 leading-none">Scolaris</h1>
          <p className="text-slate-500 font-medium text-[11px] italic">Your personal academic studio.</p>
        </div>

        <form onSubmit={handleSubmit} className="relative min-h-[280px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="space-y-6"
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-bold text-blue-700 uppercase tracking-widest ml-1">Introduction</label>
                    <p className="text-xs text-slate-500 font-medium italic ml-1">What should we call you in your workspace?</p>
                    <input
                      required
                      autoFocus
                      type="text"
                      placeholder="FULL NAME"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-lg font-bold text-slate-900 placeholder:text-slate-200 uppercase tracking-tight"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={nextStep} 
                    disabled={!formData.name}
                    className="w-full bg-blue-700 text-white font-bold py-4 rounded-xl hover:bg-blue-800 transition-all disabled:opacity-50 shadow-md text-xs uppercase tracking-widest"
                  >
                    Get Started <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-bold text-blue-700 uppercase tracking-widest ml-1">Academic Context</label>
                    <p className="text-xs text-slate-500 font-medium italic ml-1">Establishing your primary study location.</p>
                    <input
                      required
                      type="text"
                      placeholder="UNIVERSITY NAME"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-sm text-slate-900 placeholder:text-slate-200 uppercase tracking-tight"
                      value={formData.university}
                      onChange={e => setFormData({ ...formData, university: e.target.value })}
                    />
                    <div className="space-y-2">
                       <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Age</label>
                       <input
                        required
                        type="number"
                        min="16"
                        max="100"
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-sm text-slate-900 tracking-widest"
                        value={formData.age || ''}
                        onChange={e => setFormData({ ...formData, age: e.target.value === '' ? '' as any : parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button type="button" onClick={prevStep} className="flex-1 bg-white border border-slate-100 py-4 rounded-xl hover:bg-slate-50 transition-all font-bold uppercase tracking-widest text-[9px] text-slate-400">Back</button>
                    <button 
                      type="button" 
                      onClick={nextStep} 
                      disabled={!formData.university}
                      className="flex-[2] bg-blue-700 text-white font-bold py-4 rounded-xl hover:bg-blue-800 transition-all disabled:opacity-50 text-xs shadow-md uppercase tracking-widest"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-bold text-blue-700 uppercase tracking-widest ml-1">Study Level</label>
                    <p className="text-xs text-slate-500 font-medium italic ml-1">Tailoring the studio to your current academic year.</p>
                    <div className="relative">
                      <select
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-sm text-slate-900 uppercase tracking-tighter appearance-none cursor-pointer"
                        value={formData.level}
                        onChange={e => setFormData({ ...formData, level: e.target.value })}
                      >
                        {['Freshman', 'Sophomore', 'Junior', 'Senior', 'Post-Grad'].map(l => (
                          <option key={l} value={l} className="bg-white">{l.toUpperCase()}</option>
                        ))}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        {ICONS.ChevronDown}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] text-slate-400 font-bold ml-1 uppercase tracking-[0.2em]">Semester End Date</span>
                      <input
                        required
                        type="date"
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-sm text-slate-900 appearance-none cursor-pointer tracking-widest"
                        value={formData.semesterEnd}
                        onChange={e => setFormData({ ...formData, semesterEnd: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button type="button" onClick={prevStep} className="flex-1 bg-white border border-slate-100 py-4 rounded-xl hover:bg-slate-50 transition-all font-bold uppercase tracking-widest text-[9px] text-slate-400">Back</button>
                    <button 
                      type="button" 
                      onClick={nextStep} 
                      disabled={!formData.semesterEnd}
                      className="flex-[2] bg-blue-700 text-white font-bold py-4 rounded-xl hover:bg-blue-800 transition-all disabled:opacity-50 text-xs shadow-md uppercase tracking-widest"
                    >
                      Calibrate
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div className="text-center space-y-1">
                    <label className="text-[9px] font-bold text-blue-700 uppercase tracking-widest">Pricing Plan</label>
                    <h3 className="text-lg font-serif font-bold text-slate-900 tracking-tight">Select Your Academic Tier</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'free', name: 'Explorer', price: '$0', features: ['2 Courses', 'AI Summaries'], color: 'bg-slate-50' },
                      { id: 'scholar', name: 'Elite Scholar', price: '$29', features: ['Unlimited Courses', 'AI Exam Prep'], color: 'bg-blue-50' },
                      { id: 'sage', name: 'Academic Sage', price: '$59', features: ['AI Seminar Podcasts🎙️', 'Study Circles'], color: 'bg-indigo-50' }
                    ].map(tier => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setFormData({...formData, tier: tier.id as SubscriptionTier})}
                        className={`text-left p-4 rounded-xl border-2 transition-all relative overflow-hidden group ${
                          formData.tier === tier.id 
                            ? 'border-blue-600 bg-white' 
                            : 'border-slate-100 hover:border-slate-200 bg-white/50'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1 relative z-10">
                          <span className="font-bold text-sm text-slate-900 tracking-tight">{tier.name}</span>
                          <span className={`text-lg font-bold ${formData.tier === tier.id ? 'text-blue-700' : 'text-slate-400'}`}>{tier.price}<span className="text-[8px] font-medium tracking-normal opacity-50">/mo</span></span>
                        </div>
                        <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest relative z-10">{tier.features.join(' • ')}</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4 pt-2">
                    <button type="button" onClick={prevStep} className="flex-1 bg-white border border-slate-100 py-4 rounded-xl hover:bg-slate-50 transition-all font-bold uppercase tracking-widest text-[9px] text-slate-400">Back</button>
                    <button 
                      type="submit" 
                      className="flex-[2] bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all shadow-md text-xs uppercase tracking-widest"
                    >
                      Complete Setup
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </form>
      </div>
    </div>
  );
};

export default Onboarding;
