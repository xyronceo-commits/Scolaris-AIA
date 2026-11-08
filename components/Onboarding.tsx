import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowRight, 
  Check, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { UserProfile, Course, Difficulty, SubscriptionTier } from '../types';
import { DBService } from '../services/db';
import { getCurrentUserId } from '../lib/supabase';
import KorsIQLogo from './KorsIQLogo';
import UniversitySelector from './UniversitySelector';
import SubscriptionCheckoutModal from './SubscriptionCheckoutModal';

interface OnboardingProps {
  userEmail: string;
  initialProfile?: UserProfile | null;
  onComplete: (profile: UserProfile) => void;
}

const ACADEMIC_LEVELS = [
  '100L / Year 1',
  '200L / Year 2',
  '300L / Year 3',
  '400L / Year 4',
  '500L / Year 5',
  'Postgraduate'
];

const GRADING_SCALES = [
  { id: '5.0', label: '5.0 (Standard Nigerian)' },
  { id: '4.0', label: '4.0 (US style)' },
  { id: '7.0', label: '7.0 (UI style)' },
  { id: 'other', label: 'Other' }
];

interface CourseRow {
  id: string;
  code: string;
  units: number;
  title: string;
}

export const Onboarding: React.FC<OnboardingProps> = ({ 
  userEmail, 
  initialProfile, 
  onComplete 
}) => {
  // Step 1: Academic profile, Step 2: Add your courses, Step 3: Choose a plan
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPaidPlanNotice, setShowPaidPlanNotice] = useState(false);

  // Form State
  const [name, setName] = useState(initialProfile?.name || '');
  const [university, setUniversity] = useState(initialProfile?.university || '');
  const [department, setDepartment] = useState(initialProfile?.department || initialProfile?.major || '');
  const [level, setLevel] = useState(initialProfile?.level || ACADEMIC_LEVELS[0]);
  const [gradingScale, setGradingScale] = useState(initialProfile?.gradingScale || '5.0');
  const [targetCGPA, setTargetCGPA] = useState<string>(
    initialProfile?.targetCGPA ? String(initialProfile.targetCGPA) : '4.50'
  );

  // Subscription Checkout Modal State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'plus' | 'studio'>('plus');
  const [userTier, setUserTier] = useState<SubscriptionTier>(initialProfile?.tier || 'free');
  const [isPro, setIsPro] = useState<boolean>(initialProfile?.isPro || false);

  // Courses State: Starts with 3 rows per spec
  const [courses, setCourses] = useState<CourseRow[]>([
    { id: '1', code: '', units: 3, title: '' },
    { id: '2', code: '', units: 3, title: '' },
    { id: '3', code: '', units: 3, title: '' }
  ]);

  // Selected Plan: Free preselected per spec
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'plus' | 'studio'>('free');

  const userId = getCurrentUserId() || userEmail;

  // Handle Step 1 -> Step 2
  const handleProfileContinue = (e?: React.FormEvent) => {
    e?.preventDefault();
    setValidationError(null);
    if (!name.trim()) {
      setValidationError('Please enter your full name.');
      return;
    }
    setStep(2);
  };

  const handleAddCourseRow = () => {
    setCourses(prev => [
      ...prev,
      { id: String(Date.now()), code: '', units: 3, title: '' }
    ]);
  };

  const handleRemoveCourseRow = (id: string) => {
    if (courses.length <= 1) return;
    setCourses(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateCourseRow = (id: string, field: keyof CourseRow, value: any) => {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Handle Step 2 -> Step 3
  const handleSaveCourses = async () => {
    setIsSubmitting(true);
    setValidationError(null);

    try {
      const validCourses = courses.filter(c => c.code.trim().length > 0);
      for (const c of validCourses) {
        const newCourse: Course = {
          id: `crs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: c.code.trim().toUpperCase(),
          title: c.title.trim() || c.code.trim().toUpperCase(),
          units: Number(c.units) || 3,
          difficulty: Difficulty.MEDIUM
        };
        await DBService.addCourse(userId, newCourse);
      }
      setStep(3);
    } catch (err) {
      console.error('Error saving courses during onboarding:', err);
      // Non-blocking, advance to step 3
      setStep(3);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Step 3 -> Finish
  const handleFinishOnboarding = () => {
    const completedProfile: UserProfile = {
      name: name.trim() || 'Student',
      email: userEmail,
      university: university.trim(),
      department: department.trim(),
      major: department.trim(),
      level: level,
      age: initialProfile?.age || 20,
      semesterEnd: initialProfile?.semesterEnd || new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString().split('T')[0],
      targetCGPA: parseFloat(targetCGPA) || 4.5,
      gradingScale: Number(gradingScale) || 5.0,
      avatarIcon: initialProfile?.avatarIcon || 'graduation-cap',
      onboarded: true,
      tutorialSeen: true,
      isPro: isPro,
      tier: userTier,
      notifications: initialProfile?.notifications || {
        messages: true,
        sessions: true,
        aiContent: true,
        browserPush: false
      }
    };

    onComplete(completedProfile);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 relative font-sans text-[#111827] dark:text-white">
      {/* Top Header: Logo left, Skip right for steps 1 and 2 */}
      <div className="w-full max-w-xl flex items-center justify-between pb-6">
        <KorsIQLogo size={28} />
        {step < 3 && (
          <button
            type="button"
            onClick={() => {
              setValidationError(null);
              setStep((s) => (s + 1) as 2 | 3);
            }}
            className="text-xs font-semibold text-[#5B6472] hover:text-[#111827] dark:hover:text-white cursor-pointer min-h-[44px] px-2 flex items-center"
          >
            Skip for now
          </button>
        )}
      </div>

      <div className="w-full max-w-xl space-y-6">
        {/* Simple 3-Segment Progress Bar per Spec: Profile, Courses, Plan */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className={`h-1.5 rounded-full ${step >= 1 ? 'bg-[#2563EB]' : 'bg-[#E5E7EB] dark:bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full ${step >= 2 ? 'bg-[#2563EB]' : 'bg-[#E5E7EB] dark:bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full ${step >= 3 ? 'bg-[#2563EB]' : 'bg-[#E5E7EB] dark:bg-slate-800'}`} />
          </div>
          <div className="flex justify-between text-[11px] font-semibold text-[#5B6472]">
            <span className={step >= 1 ? 'text-[#2563EB]' : ''}>Profile</span>
            <span className={step >= 2 ? 'text-[#2563EB]' : ''}>Courses</span>
            <span className={step >= 3 ? 'text-[#2563EB]' : ''}>Plan</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* STEP 1: Academic Profile                                  */}
        {/* ========================================================= */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-6 sm:p-8 space-y-5 shadow-xs">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-[#111827] dark:text-white">Tell us about your studies</h1>
              <p className="text-xs text-[#5B6472] leading-relaxed">
                KorsIQ tunes its AI, planner and circles to your university.
              </p>
            </div>

            {validationError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-xs font-medium">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleProfileContinue} className="space-y-4 max-w-md">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111827] dark:text-white">
                  Full name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Oluwaseun Adeleke"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111827] dark:text-white">
                  University or institution *
                </label>
                <UniversitySelector
                  value={university}
                  onChange={(val) => setUniversity(val)}
                  placeholder="Select or search your institution..."
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111827] dark:text-white">
                  Department or programme
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#111827] dark:text-white">
                    Current level / year
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                  >
                    {ACADEMIC_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#111827] dark:text-white">
                    Grading scale
                  </label>
                  <select
                    value={gradingScale}
                    onChange={(e) => setGradingScale(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                  >
                    {GRADING_SCALES.map((gs) => (
                      <option key={gs.id} value={gs.id}>{gs.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111827] dark:text-white">
                  Target CGPA (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="7"
                  value={targetCGPA}
                  onChange={(e) => setTargetCGPA(e.target.value)}
                  placeholder="e.g. 4.50"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer shadow-sm"
                >
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2: Add Your Courses                                 */}
        {/* ========================================================= */}
        {step === 2 && (
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-6 sm:p-8 space-y-5 shadow-xs">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-[#111827] dark:text-white">Add your courses for this semester</h1>
              <p className="text-xs text-[#5B6472] leading-relaxed">
                You can add more later. We will build your planner and study hub from these.
              </p>
            </div>

            <div className="space-y-3">
              {courses.map((row, idx) => (
                <div key={row.id} className="flex items-center gap-2">
                  <div className="w-32 shrink-0">
                    <input
                      type="text"
                      placeholder="Code (e.g. CSC 301)"
                      value={row.code}
                      onChange={(e) => handleUpdateCourseRow(row.id, 'code', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px] font-semibold uppercase"
                    />
                  </div>
                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={row.units}
                      onChange={(e) => handleUpdateCourseRow(row.id, 'units', Number(e.target.value))}
                      className="w-full px-2 py-2 text-center bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                      title="Credit Units"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="Title (e.g. Operating Systems)"
                      value={row.title}
                      onChange={(e) => handleUpdateCourseRow(row.id, 'title', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-xs outline-none focus:border-[#2563EB] min-h-[44px]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={courses.length <= 1}
                    onClick={() => handleRemoveCourseRow(row.id)}
                    className="p-2 text-[#5B6472] hover:text-rose-600 disabled:opacity-30 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label={`Remove course row ${idx + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAddCourseRow}
                className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer min-h-[44px] flex items-center gap-1"
              >
                <Plus size={14} />
                <span>+ Add another course</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-semibold text-[#5B6472] hover:text-[#111827] cursor-pointer min-h-[44px] px-2 flex items-center"
              >
                I'll add courses later
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveCourses}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer shadow-sm disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Saving courses...' : 'Save and continue'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 3: Choose a Plan                                     */}
        {/* ========================================================= */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-xl font-bold text-[#111827] dark:text-white">Pick the plan that fits your semester</h1>
              <p className="text-xs text-[#5B6472] leading-relaxed">
                Start free. Upgrade whenever you need more room to write or collaborate.
              </p>
            </div>

            {/* Three plan cards side by side (stacked on mobile) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Free */}
              <div
                className={`bg-white dark:bg-slate-900 rounded-lg p-5 border flex flex-col justify-between space-y-4 transition-all shadow-xs ${
                  selectedPlan === 'free'
                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                    : 'border-[#E5E7EB] dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-base text-[#111827] dark:text-white">Free</h3>
                    <p className="text-xs text-[#5B6472] mt-0.5">Get organized and start studying.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦0</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Up to 5 courses</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Basic CGPA calculator</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>100 MB file storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Public study circles</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('free')}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold cursor-pointer min-h-[44px] transition-colors ${
                    selectedPlan === 'free'
                      ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                      : 'border border-[#E5E7EB] text-[#111827] hover:bg-slate-50'
                  }`}
                >
                  Continue with Free
                </button>
              </div>

              {/* Card 2: Plus */}
              <div
                className={`bg-white dark:bg-slate-900 rounded-lg p-5 border flex flex-col justify-between space-y-4 transition-all shadow-xs relative ${
                  selectedPlan === 'plus'
                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                    : 'border-[#E5E7EB] dark:border-slate-800'
                }`}
              >
                <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-[#2563EB] text-white text-[10px] font-bold uppercase rounded tracking-wider">
                  Popular
                </div>
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-base text-[#111827] dark:text-white">Plus</h3>
                    <p className="text-xs text-[#5B6472] mt-0.5">For students who want the AI edge.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦7,500</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Unlimited courses and timetable</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Scenario CGPA projection</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>2 GB file storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Private circles with invite codes</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>200 monthly AI study credits</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutPlan('plus');
                    setCheckoutModalOpen(true);
                  }}
                  className="w-full py-2.5 border border-[#E5E7EB] hover:bg-slate-50 text-[#111827] dark:text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px]"
                >
                  {userTier === 'plus' ? 'Plus Plan Active' : 'Choose Plus'}
                </button>
              </div>

              {/* Card 3: KorsIQ Premium (Renamed from Academic Studio) */}
              <div
                className={`bg-white dark:bg-slate-900 rounded-lg p-5 border flex flex-col justify-between space-y-4 transition-all shadow-xs ${
                  selectedPlan === 'studio'
                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                    : 'border-[#E5E7EB] dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="font-bold text-base text-[#111827] dark:text-white">KorsIQ Premium</h3>
                    <p className="text-xs text-[#5B6472] mt-0.5">Research, write and produce. Full Studio.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦15,000</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Everything in Plus</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Academic Studio editor</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Real-source citation chips</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Word (.docx) &amp; PDF export</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>1,000 AI credits, 10 GB storage</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutPlan('studio');
                    setCheckoutModalOpen(true);
                  }}
                  className="w-full py-2.5 border border-[#E5E7EB] hover:bg-slate-50 text-[#111827] dark:text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px]"
                >
                  {userTier === 'studio' ? 'KorsIQ Premium Active' : 'Choose Premium'}
                </button>
              </div>
            </div>

            {/* Single Primary Action Button below cards per Spec */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleFinishOnboarding}
                className="w-full py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer shadow-sm"
              >
                <span>{userTier === 'free' ? 'Continue with Free' : `Go to dashboard (${userTier === 'studio' ? 'Academic Studio' : 'Plus'})`}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subscription Checkout & Verification Modal */}
      <SubscriptionCheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        initialPlan={checkoutPlan}
        currentProfile={{
          name,
          email: userEmail,
          university,
          department,
          level,
          age: 20,
          semesterEnd: '',
          onboarded: false,
          tutorialSeen: false,
          isPro: isPro,
          tier: userTier,
          notifications: { messages: true, sessions: true, aiContent: true }
        }}
        onSubscriptionUpdated={(upd) => {
          setUserTier(upd.tier);
          setIsPro(upd.isPro);
          setSelectedPlan(upd.tier === 'studio' ? 'studio' : 'plus');
        }}
      />
    </div>
  );
};

export default Onboarding;
