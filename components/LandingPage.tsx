import React from 'react';
import { ICONS } from '../constants';
import { ArrowRight, Star } from 'lucide-react';
import KorsIQLogo from './KorsIQLogo';

interface LandingPageProps {
  onStart: () => void;
  onSignIn: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onSignIn }) => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100 overflow-hidden">
      {/* Navigation */}
      <nav className="h-16 flex items-center justify-between px-6 md:px-10 max-w-7xl mx-auto relative z-50">
        <div className="flex items-center gap-2">
          <KorsIQLogo variant="full" size={40} />
        </div>
        <div className="flex items-center gap-4">
           <button onClick={onSignIn} className="hidden md:block font-bold text-[10px] text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-widest">Sign In</button>
           <button 
             onClick={onStart}
             className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
           >
             Get Started
           </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative pt-6 pb-12 px-6 overflow-hidden">
        {/* Background elements */}
        
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-2xl md:text-4xl font-serif font-bold tracking-tight text-slate-900 leading-[1.1] animate-in fade-in zoom-in duration-700">
            Outsmart Your<br />Syllabus.
          </h1>

          <p className="text-xs md:text-sm text-slate-500 font-normal max-w-xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-500">
            KorsIQ is your AI-powered study companion — from smart schedules and instant flashcards to collaborative study circles and CGPA tracking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <button 
               onClick={onStart}
               className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xs cursor-pointer"
             >
               Start for Free <ArrowRight size={14} />
             </button>
             <button 
               onClick={() => onSignIn()}
               className="w-full sm:w-auto px-5 py-2.5 bg-white text-slate-800 border border-slate-200 rounded-lg font-semibold text-xs hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
             >
               Sign In
             </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
             <Star size={10} className="fill-blue-600 text-blue-600" />
             Free &amp; Open for Students <span className="opacity-30 mx-2 text-lg leading-none">•</span> Unlimited AI Academic Studio
          </div>
        </div>

        {/* Feature Cards Grid (Compact) */}
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
           {[
             { title: 'Academic Studio', desc: 'Section-by-section papers', icon: ICONS.StudyHub, color: 'text-blue-600', bg: 'bg-blue-50' },
             { title: 'Schedule Planner', desc: 'AI personalized timetable', icon: ICONS.Schedule, color: 'text-blue-600', bg: 'bg-blue-50' },
             { title: 'Private Circles', desc: 'Invite codes & note sharing', icon: ICONS.Groups, color: 'text-emerald-700', bg: 'bg-emerald-50' },
             { title: 'CGPA Intelligence', desc: 'Target tracking & 5.0 scale', icon: ICONS.Analytics, color: 'text-blue-700', bg: 'bg-blue-50' }
           ].map((feature, i) => (
             <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all group">
                <div className={`w-9 h-9 ${feature.bg} ${feature.color} rounded-lg flex items-center justify-center mb-3`}>
                   {React.cloneElement(feature.icon as React.ReactElement, { size: 16 } as any)}
                </div>
                <h3 className="text-sm font-serif font-bold text-slate-900 mb-1">{feature.title}</h3>
                <p className="text-slate-500 font-normal text-[11px] leading-tight">{feature.desc}</p>
             </div>
           ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-slate-100 max-w-7xl mx-auto overflow-hidden">
         <div className="flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
            <div className="space-y-4">
               <div className="flex items-center justify-center md:justify-start gap-3">
                  <KorsIQLogo variant="full" size={40} />
               </div>
               <p className="text-slate-400 font-medium text-sm max-w-xs">Built for the next generation of academic excellence.</p>
            </div>
            <div className="flex gap-12">
               <div className="space-y-6">
                  <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Product</h4>
                  <ul className="space-y-4 text-sm text-slate-500 font-medium">
                     <li><a href="#" className="hover:text-blue-600 transition-colors">Features</a></li>
                     <li><a href="#" className="hover:text-blue-600 transition-colors">Study Circles</a></li>
                     <li><a href="#" className="hover:text-blue-600 transition-colors">AI Studio</a></li>
                  </ul>
               </div>
               <div className="space-y-6">
                  <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Connect</h4>
                  <ul className="space-y-4 text-sm text-slate-500 font-medium">
                     <li><a href="#" className="hover:text-blue-600 transition-colors">Twitter</a></li>
                     <li><a href="#" className="hover:text-blue-600 transition-colors">Discord</a></li>
                     <li><a href="#" className="hover:text-blue-600 transition-colors">Support</a></li>
                  </ul>
               </div>
            </div>
         </div>
         <div className="mt-20 pt-10 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-xs text-slate-400 font-medium">© 2026 KorsIQ. All rights reserved.</p>
            <div className="flex gap-8 text-xs text-slate-400 font-medium">
               <a href="#" className="hover:text-slate-900 transition-colors">Privacy Policy</a>
               <a href="#" className="hover:text-slate-900 transition-colors">Terms of Service</a>
            </div>
         </div>
      </footer>
    </div>
  );
};

export default LandingPage;
