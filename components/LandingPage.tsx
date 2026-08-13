import React from 'react';
import { ICONS } from '../constants';
import { ArrowRight, Star } from 'lucide-react';

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
          <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-lg">
             <div className="font-serif font-bold text-sm">S</div>
          </div>
          <span className="font-serif font-bold text-lg tracking-tight">Scolaris</span>
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-50/50 rounded-full blur-[100px] pointer-events-none -z-10" />
        
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-100 rounded-full animate-in slide-in-from-top-4 duration-700">
             <div className="w-1 h-1 bg-blue-600 rounded-full animate-pulse" />
             <span className="text-[7px] font-bold text-blue-700 uppercase tracking-[0.2em]">AI-powered academic productivity</span>
          </div>

          <h1 className="text-2xl md:text-4xl font-serif font-bold tracking-tighter text-slate-900 leading-[1.1] animate-in fade-in zoom-in duration-1000">
            Study smarter,<br />not harder.
          </h1>

          <p className="text-xs md:text-sm text-slate-500 font-medium max-w-xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            Scolaris is your AI-powered study companion — from smart schedules and instant flashcards to collaborative study circles and CGPA tracking.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
             <button 
               onClick={onStart}
               className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-slate-200"
             >
               Start for Free <ArrowRight size={14} />
             </button>
             <button 
               onClick={() => onSignIn()} // Assuming this might be used for direct dashboard access too if we added a direct dashboard skip in LandingPage? 
               // Actually the user said "add a button that takes user directly to dashboard" - maybe they want it on the landing page too.
               className="w-full sm:w-auto px-6 py-2.5 bg-white text-slate-900 border border-slate-200 rounded-xl font-bold text-[11px] hover:bg-slate-50 transition-all shadow-sm"
             >
               Sign In
             </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-slate-400 font-bold text-[9px] uppercase tracking-widest animate-in fade-in duration-1000 delay-700">
             <Star size={10} className="fill-blue-500 text-blue-500" />
             Free & Open for Students <span className="opacity-30 mx-2 text-lg leading-none">•</span> Unlimited AI Academic Studio
          </div>
        </div>

        {/* Feature Cards Grid (Compact) */}
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-1000">
           {[
             { title: 'AI Hub', desc: 'Instant summaries & flashcards', icon: ICONS.StudyHub, color: 'text-blue-600', bg: 'bg-blue-50' },
             { title: 'Schedule', desc: 'AI personalized study plans', icon: ICONS.Schedule, color: 'text-indigo-600', bg: 'bg-indigo-50' },
             { title: 'Circles', desc: 'Real-time collaborative hubs', icon: ICONS.Groups, color: 'text-emerald-600', bg: 'bg-emerald-50' },
             { title: 'Analytics', desc: 'Track visual productivity data', icon: ICONS.Analytics, color: 'text-purple-600', bg: 'bg-purple-50' }
           ].map((feature, i) => (
             <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-100 hover:-translate-y-1 transition-all group">
                <div className={`w-10 h-10 ${feature.bg} ${feature.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                   {React.cloneElement(feature.icon as React.ReactElement, { size: 18 } as any)}
                </div>
                <h3 className="text-sm font-serif font-bold text-slate-900 mb-1">{feature.title}</h3>
                <p className="text-slate-400 font-medium text-[10px] leading-tight">{feature.desc}</p>
             </div>
           ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-slate-100 max-w-7xl mx-auto overflow-hidden">
         <div className="flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
            <div className="space-y-4">
               <div className="flex items-center justify-center md:justify-start gap-3">
                  <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-bold text-sm">S</div>
                  <span className="font-serif font-bold text-xl">Scolaris AI</span>
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
            <p className="text-xs text-slate-400 font-medium">© 2024 Scolaris AI Studio. All rights reserved.</p>
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
