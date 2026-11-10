import React, { useState } from 'react';
import { 
  BarChart3, 
  Clock, 
  FileText, 
  Users, 
  Folder, 
  Check, 
  Plus, 
  Bell, 
  X,
  Shield,
  HelpCircle,
  FileCheck
} from 'lucide-react';
import KorsIQLogo from './KorsIQLogo';

interface LandingPageProps {
  onStart: () => void;
  onSignIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart, onSignIn }) => {
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | 'contact' | 'about' | null>(null);
  const [activeScreenshot, setActiveScreenshot] = useState<'overview' | 'hub' | 'studio'>('overview');

  const screenshots: Record<'overview' | 'hub' | 'studio', { label: string; src: string; alt: string; path: string }> = {
    overview: {
      label: 'Overview',
      src: '/screenshots/overview.png',
      alt: 'KorsIQ Overview workspace showing priorities, study schedule, course snapshot, and recent documents',
      path: 'korsiq.app/overview'
    },
    hub: {
      label: 'Study Hub',
      src: '/screenshots/study-hub.png',
      alt: 'KorsIQ Study Hub showing course workbenches and discipline-tailored AI study chat',
      path: 'korsiq.app/study-hub'
    },
    studio: {
      label: 'Academic Studio',
      src: '/screenshots/studio.png',
      alt: 'KorsIQ Academic Studio showing structured academic planning, section drafting, and Word/PDF export',
      path: 'korsiq.app/studio'
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 font-sans text-[#111827] dark:text-slate-100 selection:bg-[#EFF6FF] selection:text-[#2563EB]">
      {/* 1. Header / Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-[#E5E7EB] dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KorsIQLogo variant="full" size={32} />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-[#5B6472] dark:text-slate-300 hover:text-[#111827] dark:hover:text-white rounded-lg transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onStart}
              className="px-4 sm:px-5 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors min-h-[44px] flex items-center justify-center shadow-xs cursor-pointer"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="pt-12 sm:pt-16 pb-12 px-4 sm:px-6 max-w-4xl mx-auto text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-bold text-[#111827] dark:text-white tracking-tight leading-[1.15] max-w-3xl mx-auto">
          Study smarter. Stay organised.{' '}
          <span className="text-[#2563EB]">Produce better academic work.</span>
        </h1>

        <p className="mt-4 sm:mt-5 text-base sm:text-lg text-[#5B6472] dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
          Your courses, CGPA, study plan and coursework in one calm workspace.
        </p>

        {/* Hero CTA buttons */}
        <div className="mt-6 sm:mt-8 flex flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onStart}
            className="w-auto px-6 py-2.5 text-sm sm:text-base font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors min-h-[44px] flex items-center justify-center shadow-xs cursor-pointer"
          >
            Get started
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="w-auto px-6 py-2.5 text-sm sm:text-base font-medium text-[#111827] dark:text-slate-200 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
          >
            Sign in
          </button>
        </div>

        {/* Real Product Screenshots inside Browser Frame */}
        <div className="mt-10 sm:mt-12 text-left">
          {/* Screen Switcher Tabs */}
          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            {(['overview', 'hub', 'studio'] as const).map((key) => {
              const item = screenshots[key];
              const isSelected = activeScreenshot === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveScreenshot(key)}
                  className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold min-h-[44px] transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
            {/* Browser Frame Top Bar */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="px-3 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {screenshots[activeScreenshot].path}
              </div>
              <div className="w-10" />
            </div>

            {/* Real Screenshot Image */}
            <img
              src={screenshots[activeScreenshot].src}
              alt={screenshots[activeScreenshot].alt}
              loading="lazy"
              width={1920}
              height={1200}
              className="w-full h-auto block bg-white dark:bg-slate-950"
            />
          </div>
        </div>
      </section>

      {/* 3. Section: "What's inside" */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto border-t border-[#E5E7EB] dark:border-slate-800">
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">What's inside</h2>
          <p className="text-sm sm:text-base text-[#5B6472] dark:text-slate-400 mt-1">Five tools, one calm workspace.</p>
        </div>

        {/* 5 Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1 */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center mb-4">
                <BarChart3 size={20} />
              </div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white mb-2">A CGPA you can trust</h3>
              <p className="text-sm text-[#5B6472] dark:text-slate-300 leading-relaxed">
                Exact calculation from your units and grades. AI explains it, never works it out.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center mb-4">
                <Clock size={20} />
              </div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white mb-2">A plan you approve</h3>
              <p className="text-sm text-[#5B6472] dark:text-slate-300 leading-relaxed">
                A realistic study timetable. Nothing is scheduled until you say yes.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center mb-4">
                <FileText size={20} />
              </div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white mb-2">Academic Studio</h3>
              <p className="text-sm text-[#5B6472] dark:text-slate-300 leading-relaxed">
                Outline, draft and export, one section at a time.
              </p>
            </div>
          </div>
        </div>

        {/* Second Row: 2 Cards Centered */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 max-w-3xl mx-auto">
          {/* Card 4 */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center mb-4">
                <Users size={20} />
              </div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white mb-2">Private circles</h3>
              <p className="text-sm text-[#5B6472] dark:text-slate-300 leading-relaxed">
                Study with friends. Files are visible only to members.
              </p>
            </div>
          </div>

          {/* Card 5 */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] flex items-center justify-center mb-4">
                <Folder size={20} />
              </div>
              <h3 className="text-base font-bold text-[#111827] dark:text-white mb-2">Your resource library</h3>
              <p className="text-sm text-[#5B6472] dark:text-slate-300 leading-relaxed">
                Handouts and notes in one place, ready for practice and summaries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Callout Banner: "AI helps inside each task. You stay in control." */}
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto rounded-lg bg-[#EFF6FF] dark:bg-blue-950/40 border border-[#2563EB]/20 p-8 sm:p-10 text-center">
          <h3 className="text-lg sm:text-xl font-bold text-[#1746A2] dark:text-blue-300">
            AI helps inside each task. You stay in control.
          </h3>
          <p className="mt-2 text-sm sm:text-base text-[#5B6472] dark:text-slate-300 max-w-2xl mx-auto">
            You approve every outline and plan, and you are responsible for what you submit.
          </p>
        </div>
      </section>

      {/* 5. Section: "Simple pricing" */}
      <section id="pricing" className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto border-t border-[#E5E7EB] dark:border-slate-800">
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">Simple pricing</h2>
          <p className="text-sm sm:text-base text-[#5B6472] dark:text-slate-400 mt-1">Start free. Move up when you need more.</p>
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Card 1: Free */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-[#E5E7EB] dark:border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#111827] dark:text-white">Free</h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 mt-0.5">Get organised.</p>
              
              <div className="mt-4 mb-6">
                <span className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">₦0</span>
                <span className="text-xs text-[#5B6472] dark:text-slate-400 ml-1">/ month</span>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs sm:text-sm text-[#111827] dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>CGPA and course tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Study timetable</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Limited AI help</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                onClick={onStart}
                className="w-full py-2.5 px-4 text-sm font-medium text-[#111827] dark:text-white bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-lg transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
              >
                Start free
              </button>
            </div>
          </div>

          {/* Card 2: Plus (Highlighted with single primary button per spec) */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-[#2563EB] p-6 flex flex-col justify-between shadow-sm relative">
            <div>
              <h3 className="text-lg font-bold text-[#111827] dark:text-white">Plus</h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 mt-0.5">Study smarter.</p>

              <div className="mt-4 mb-6">
                <span className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">₦7,500</span>
                <span className="text-xs text-[#5B6472] dark:text-slate-400 ml-1">/ month</span>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs sm:text-sm text-[#111827] dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>More AI help</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Lite Studio and exports</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Create circles</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <a
                href="https://paystack.shop/pay/c-mcwwacc8"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors min-h-[44px] flex items-center justify-center shadow-xs cursor-pointer text-center"
              >
                Choose Plus
              </a>
            </div>
          </div>

          {/* Card 3: KorsIQ Premium (Renamed from Academic Studio) */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-[#E5E7EB] dark:border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#111827] dark:text-white">KorsIQ Premium</h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 mt-0.5">Research, write and produce.</p>

              <div className="mt-4 mb-6">
                <span className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">₦15,000</span>
                <span className="text-xs text-[#5B6472] dark:text-slate-400 ml-1">/ month</span>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs sm:text-sm text-[#111827] dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Full Studio workspace</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Version history</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-[#2563EB] shrink-0" />
                  <span>Highest AI allowance</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <a
                href="https://paystack.shop/pay/asaup43dpk"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 text-sm font-medium text-[#111827] dark:text-white bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-lg transition-colors min-h-[44px] flex items-center justify-center cursor-pointer text-center"
              >
                Choose Premium
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Section: "Ready to get organised?" */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 text-center max-w-3xl mx-auto border-t border-[#E5E7EB] dark:border-slate-800">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-white">Ready to get organised?</h2>
        <p className="mt-2 text-sm sm:text-base text-[#5B6472] dark:text-slate-300">
          Create an account and add your first courses.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onStart}
            className="w-full sm:w-auto px-8 py-3 text-sm sm:text-base font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors min-h-[44px] flex items-center justify-center shadow-xs cursor-pointer"
          >
            Get started free
          </button>
        </div>
      </section>

      {/* 7. Footer (Responsive: multi-column on mobile, sleek one-line on desktop matching v5 spec) */}
      <footer className="border-t border-[#E5E7EB] dark:border-slate-800 py-8 sm:py-10 px-4 sm:px-6 bg-slate-50/50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto">
          {/* Mobile Footer Section (Matches Page 2 of v5 spec) */}
          <div className="md:hidden space-y-6 mb-8 pb-8 border-b border-[#E5E7EB] dark:border-slate-800">
            {/* Brand column */}
            <div className="space-y-2">
              <KorsIQLogo variant="full" size={26} />
              <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed max-w-sm">
                Your academic workspace: organise, learn and produce better work.
              </p>
            </div>

            {/* Links Columns */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              {/* Product */}
              <div>
                <h4 className="text-xs font-semibold text-[#111827] dark:text-white uppercase tracking-wider mb-2.5">Product</h4>
                <ul className="space-y-2 text-xs text-[#5B6472] dark:text-slate-400">
                  <li>
                    <button 
                      type="button" 
                      onClick={() => scrollToSection('features')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      Features
                    </button>
                  </li>
                  <li>
                    <button 
                      type="button" 
                      onClick={() => scrollToSection('pricing')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      Pricing
                    </button>
                  </li>
                </ul>
              </div>

              {/* Company */}
              <div>
                <h4 className="text-xs font-semibold text-[#111827] dark:text-white uppercase tracking-wider mb-2.5">Company</h4>
                <ul className="space-y-2 text-xs text-[#5B6472] dark:text-slate-400">
                  <li>
                    <button 
                      type="button" 
                      onClick={() => setActiveModal('about')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      About us
                    </button>
                  </li>
                  <li>
                    <button 
                      type="button" 
                      onClick={() => setActiveModal('contact')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      Contact
                    </button>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="text-xs font-semibold text-[#111827] dark:text-white uppercase tracking-wider mb-2.5">Legal</h4>
                <ul className="space-y-2 text-xs text-[#5B6472] dark:text-slate-400">
                  <li>
                    <button 
                      type="button" 
                      onClick={() => setActiveModal('terms')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      Terms
                    </button>
                  </li>
                  <li>
                    <button 
                      type="button" 
                      onClick={() => setActiveModal('privacy')}
                      className="hover:text-[#2563EB] transition-colors cursor-pointer"
                    >
                      Privacy
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Sleek Footer Line (Matches Page 1 of v5 spec on desktop & copyright on mobile) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5B6472] dark:text-slate-400">
            <p>© 2026 KorsIQ</p>
            <div className="hidden md:flex items-center gap-6">
              <button 
                type="button" 
                onClick={() => setActiveModal('privacy')}
                className="hover:text-[#111827] dark:hover:text-white transition-colors cursor-pointer"
              >
                Privacy
              </button>
              <button 
                type="button" 
                onClick={() => setActiveModal('terms')}
                className="hover:text-[#111827] dark:hover:text-white transition-colors cursor-pointer"
              >
                Terms
              </button>
              <button 
                type="button" 
                onClick={() => setActiveModal('contact')}
                className="hover:text-[#111827] dark:hover:text-white transition-colors cursor-pointer"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Accessible Modals for Company & Legal Info */}
      {activeModal && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 p-6 max-w-md w-full shadow-xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {activeModal === 'privacy' && <Shield size={18} className="text-[#2563EB]" />}
                {activeModal === 'terms' && <FileCheck size={18} className="text-[#2563EB]" />}
                {activeModal === 'contact' && <HelpCircle size={18} className="text-[#2563EB]" />}
                {activeModal === 'about' && <KorsIQLogo variant="icon" size={18} />}
                <h3 className="text-base font-bold text-[#111827] dark:text-white capitalize">
                  {activeModal === 'privacy' && 'Privacy Policy'}
                  {activeModal === 'terms' && 'Terms of Service'}
                  {activeModal === 'contact' && 'Contact KorsIQ Support'}
                  {activeModal === 'about' && 'About KorsIQ'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close dialog"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs sm:text-sm text-[#5B6472] dark:text-slate-300 space-y-3 leading-relaxed">
              {activeModal === 'privacy' && (
                <>
                  <p>KorsIQ is committed to protecting your academic data and personal privacy.</p>
                  <p>Your uploaded lecture materials, drafts, and notes remain your intellectual property and are never shared publicly or used to train public models without consent.</p>
                </>
              )}
              {activeModal === 'terms' && (
                <>
                  <p>KorsIQ provides academic assistance tools designed to support your coursework and study habits.</p>
                  <p>Students remain responsible for their academic submissions and for complying with their institution's integrity and honor codes.</p>
                </>
              )}
              {activeModal === 'contact' && (
                <>
                  <p>Need help or have questions about KorsIQ for your university?</p>
                  <p className="font-medium text-[#111827] dark:text-white">Email support: <a href="mailto:support@korsiq.com" className="text-[#2563EB] underline">support@korsiq.com</a></p>
                  <p>We typically respond within 24 hours on academic days.</p>
                </>
              )}
              {activeModal === 'about' && (
                <>
                  <p>KorsIQ (tagline: "Outsmart Your Syllabus.") is a calm, focused academic workspace built specifically for university students.</p>
                  <p>From deterministic CGPA tracking and approved study timetables to the section-by-section Academic Studio, KorsIQ puts you in control of your academic journey.</p>
                </>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-[#2563EB] text-white text-xs font-medium rounded-lg hover:bg-[#1D4ED8] transition-colors min-h-[36px]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
