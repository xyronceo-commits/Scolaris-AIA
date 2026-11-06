import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  BookOpen, 
  Sparkles, 
  Building2, 
  Target, 
  Compass, 
  Layers, 
  HelpCircle 
} from 'lucide-react';
import { UserProfile, SubscriptionTier } from '../types';
import { AVATAR_OPTIONS, UserAvatar } from './UserAvatar';
import ScolarisLogo from './ScolarisLogo';

interface OnboardingProps {
  userEmail: string;
  initialProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
}

const ACADEMIC_LEVELS = [
  { id: '100L / Freshman', label: '100L / Freshman (Year 1)' },
  { id: '200L / Sophomore', label: '200L / Sophomore (Year 2)' },
  { id: '300L / Junior', label: '300L / Junior (Year 3)' },
  { id: '400L / Senior', label: '400L / Senior (Year 4)' },
  { id: '500L / Final Year', label: '500L / Final Year (Year 5)' },
  { id: 'Postgraduate / Masters / PhD', label: 'Postgraduate / Masters / PhD' },
];

const PRIMARY_GOALS = [
  'Achieve First Class / 4.0+ GPA',
  'Master Complex Coursework Concepts',
  'Prepare for Upcoming Exams & Tests',
  'Build Consistent Daily Study Habits',
  'Condense Dense Syllabi & Lecture Slides'
];

const STUDY_STYLES = [
  { id: 'Active Recall & Quizzes', label: 'Active Recall & Quizzes', desc: 'Self-testing with interactive practice questions' },
  { id: 'Deep Focus & Summaries', label: 'Deep Focus & Summaries', desc: 'Condensing textbooks and lectures into concise outlines' },
  { id: 'Flashcards & Spaced Repetition', label: 'Flashcards & Spaced Repetition', desc: 'Memorising definitions and formulas regularly' },
  { id: 'Audio Podcasts & Discussion', label: 'Audio & Study Circles', desc: 'Audio breakdowns and collaborative peer queries' }
];

const ASSISTANCE_OPTIONS = [
  'Exam Preparation',
  'Lecture Note Condensation',
  'Complex Problem Solving',
  'Formula & Definition Recall',
  'Study Schedule Discipline',
  'Coursework Retention'
];

export const Onboarding: React.FC<OnboardingProps> = ({ 
  userEmail, 
  initialProfile, 
  onComplete 
}) => {
  const [step, setStep] = useState<number>(1);
  const [direction, setDirection] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form state pre-populated with any existing registration data
  const [formData, setFormData] = useState({
    name: initialProfile?.name || '',
    avatarIcon: initialProfile?.avatarIcon || 'graduation-cap',
    university: initialProfile?.university || '',
    major: initialProfile?.major || '',
    department: initialProfile?.department || '',
    level: initialProfile?.level || ACADEMIC_LEVELS[0].id,
    age: initialProfile?.age || 20,
    semesterEnd: initialProfile?.semesterEnd || new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString().split('T')[0],
    targetCGPA: initialProfile?.targetCGPA || 4.5,
    academicGoals: initialProfile?.academicGoals || PRIMARY_GOALS[0],
    studyStyle: initialProfile?.studyStyle || STUDY_STYLES[0].id,
    assistanceAreas: initialProfile?.assistanceAreas || [ASSISTANCE_OPTIONS[0], ASSISTANCE_OPTIONS[1]],
  });

  const nextStep = () => {
    setValidationError(null);

    // Validation per step
    if (step === 1) {
      if (!formData.name.trim() || formData.name.trim().length < 2) {
        setValidationError('Please enter your full name (minimum 2 characters).');
        return;
      }
    } else if (step === 2) {
      if (!formData.university.trim()) {
        setValidationError('Please provide your university or academic institution.');
        return;
      }
      if (!formData.major.trim()) {
        setValidationError('Please enter your course of study or major.');
        return;
      }
      if (!formData.level) {
        setValidationError('Please select your current academic year or level.');
        return;
      }
    }

    setDirection(1);
    setStep((s) => Math.min(s + 1, 3));
  };

  const prevStep = () => {
    setValidationError(null);
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const toggleAssistanceArea = (area: string) => {
    setFormData((prev) => {
      const exists = prev.assistanceAreas.includes(area);
      return {
        ...prev,
        assistanceAreas: exists
          ? prev.assistanceAreas.filter((a) => a !== area)
          : [...prev.assistanceAreas, area],
      };
    });
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.academicGoals) {
      setValidationError('Please select your primary academic goal.');
      return;
    }

    setIsSubmitting(true);

    const completedProfile: UserProfile = {
      name: formData.name.trim(),
      email: userEmail,
      university: formData.university.trim(),
      level: formData.level,
      age: formData.age || 20,
      semesterEnd: formData.semesterEnd,
      targetCGPA: formData.targetCGPA || 4.5,
      avatarIcon: formData.avatarIcon || 'graduation-cap',
      onboarded: true,
      tutorialSeen: false,
      isPro: true,
      tier: 'scholar' as SubscriptionTier,
      notifications: {
        messages: true,
        sessions: true,
        aiContent: true,
      },
      major: formData.major.trim(),
      department: formData.department.trim(),
      academicGoals: formData.academicGoals,
      studyStyle: formData.studyStyle,
      assistanceAreas: formData.assistanceAreas,
    };

    onComplete(completedProfile);
  };

  const variants = {
    enter: (d: number) => ({
      x: d > 0 ? 30 : -30,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (d: number) => ({
      zIndex: 0,
      x: d < 0 ? 30 : -30,
      opacity: 0,
    }),
  };

  const totalSteps = 3;
  const progressPercent = Math.round((step / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col items-center justify-center py-8 px-4 sm:px-6 relative overflow-y-auto font-sans text-slate-900 selection:bg-indigo-100">
      {/* Subtle Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/30 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/30 blur-[130px] rounded-full" />
      </div>

      <div className="max-w-xl w-full relative z-10 my-auto">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3.5 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 mb-3">
            <ScolarisLogo variant="icon" size={32} colorClass="text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">
            Welcome to Scolaris AI
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            Step {step} of {totalSteps} — {step === 1 ? 'Personal Profile' : step === 2 ? 'Academic Context' : 'Study Preferences'}
          </p>
        </div>

        {/* Progress Tracker Bar */}
        <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden mb-6">
          <div 
            className="h-full bg-indigo-600 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-xl shadow-slate-200/40 p-6 sm:p-8 relative">
          
          {/* Step Pill Indicator */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center border border-indigo-100">
                {step}
              </span>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {step === 1 && 'Personal Information'}
                {step === 2 && 'Academic Profile'}
                {step === 3 && 'Learning Preferences'}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              {progressPercent}% COMPLETE
            </span>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 mb-5 bg-rose-50 border border-rose-200/80 rounded-2xl text-xs font-semibold text-rose-700 flex items-center gap-2"
            >
              <span>{validationError}</span>
            </motion.div>
          )}

          <form onSubmit={step === 3 ? handleFinalSubmit : (e) => { e.preventDefault(); nextStep(); }}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-6"
              >
                {/* ---------------- STEP 1: PERSONAL INFORMATION ---------------- */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Alex Morgan"
                        className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                      />
                      <p className="text-[11px] text-slate-400 ml-1 italic">
                        This is the name your professors, study groups, and AI tutors will address you by.
                      </p>
                    </div>

                    {/* Profile Avatar Selection (Optional) */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Scholar Avatar <span className="text-slate-400 font-normal lowercase">(optional)</span>
                        </label>
                        <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">
                          Choose an icon
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-4 sm:grid-cols-4 gap-2.5 pt-1">
                        {AVATAR_OPTIONS.map((opt) => {
                          const isSelected = formData.avatarIcon === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setFormData({ ...formData, avatarIcon: opt.id })}
                              className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-2 ring-indigo-600/10'
                                  : 'border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${opt.bgClass}`}>
                                {opt.icon}
                              </div>
                              <span className="text-[10px] font-bold text-slate-700 truncate w-full">
                                {opt.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Semester End Date / Exam Target Period */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                          Current Semester End Date <span className="text-slate-400 font-normal lowercase">(optional)</span>
                        </label>
                        <input
                          type="date"
                          value={formData.semesterEnd}
                          onChange={(e) => setFormData({ ...formData, semesterEnd: e.target.value })}
                          className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 transition-all cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                          Age <span className="text-slate-400 font-normal lowercase">(optional)</span>
                        </label>
                        <input
                          type="number"
                          min="14"
                          max="100"
                          value={formData.age || ''}
                          onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value, 10) || 0 })}
                          placeholder="20"
                          className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ---------------- STEP 2: ACADEMIC PROFILE ---------------- */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Institution / University <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={formData.university}
                        onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                        placeholder="e.g. University of Lagos, Oxford, MIT"
                        className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                          Course of Study / Major <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.major}
                          onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                          placeholder="e.g. Computer Science, Law"
                          className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                          Department / Faculty <span className="text-slate-400 font-normal lowercase">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.department}
                          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                          placeholder="e.g. Physical Sciences"
                          className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                        />
                      </div>
                    </div>

                    {/* Academic Level */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Current Academic Level <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ACADEMIC_LEVELS.map((lvl) => {
                          const isSelected = formData.level === lvl.id;
                          return (
                            <button
                              key={lvl.id}
                              type="button"
                              onClick={() => setFormData({ ...formData, level: lvl.id })}
                              className={`p-3 rounded-xl border text-left flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 shadow-xs'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              <span>{lvl.label}</span>
                              {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ---------------- STEP 3: STUDY PREFERENCES ---------------- */}
                {step === 3 && (
                  <div className="space-y-5">
                    {/* Primary Goal */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Primary Academic Goal <span className="text-rose-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {PRIMARY_GOALS.map((goal) => {
                          const isSelected = formData.academicGoals === goal;
                          return (
                            <button
                              key={goal}
                              type="button"
                              onClick={() => setFormData({ ...formData, academicGoals: goal })}
                              className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 shadow-xs'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span>{goal}</span>
                              {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preferred Study Style */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Preferred Study Style <span className="text-slate-400 font-normal lowercase">(optional)</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {STUDY_STYLES.map((style) => {
                          const isSelected = formData.studyStyle === style.id;
                          return (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => setFormData({ ...formData, studyStyle: style.id })}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 shadow-xs'
                                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-800">{style.label}</span>
                                {isSelected && <Check size={13} className="text-indigo-600" />}
                              </div>
                              <p className="text-[10px] text-slate-500 leading-snug">{style.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Assistance Areas (Multi-select badges) */}
                    <div className="space-y-2 pt-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Where do you need the most support? <span className="text-slate-400 font-normal lowercase">(select all that apply)</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ASSISTANCE_OPTIONS.map((area) => {
                          const isSelected = formData.assistanceAreas.includes(area);
                          return (
                            <button
                              key={area}
                              type="button"
                              onClick={() => toggleAssistanceArea(area)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {isSelected && <Check size={12} />}
                              <span>{area}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation & Action Buttons */}
            <div className="flex items-center gap-3 pt-6 mt-6 border-t border-slate-100">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={isSubmitting}
                  className="px-5 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-12 bg-slate-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Finalizing Setup...</span>
                    </div>
                  ) : (
                    <>
                      <span>Complete Setup &amp; Enter Dashboard</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
