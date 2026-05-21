
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ICONS } from '../constants';
import { GraduationCap, ArrowRight, Github, Mail, Sparkles, Check, Chrome, X, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DBService } from '../services/db';
import { SubscriptionTier } from '../types';

interface AuthProps {
  onAuth: (profile: any) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuth }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        localStorage.setItem('scolaris_is_signup', 'true');
      } else {
        localStorage.setItem('scolaris_is_signup', 'false');
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        
        localStorage.setItem('scolaris_is_signup', 'true');
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
              university: '',
              level: 'Undergraduate',
              age: 20
            }
          }
        });
        if (error) throw error;
        
        if (data.user) {
          const profile = {
            name: email.split('@')[0],
            email,
            university: '',
            level: 'Undergraduate',
            age: 20,
            onboarded: false,
            tutorialSeen: false,
            tier: 'free' as SubscriptionTier,
            isPro: false,
            notifications: { messages: true, sessions: true, aiContent: true },
            semesterEnd: ''
          };
          await DBService.saveProfile(data.user.id, profile);
        }
        setMode('verify');
      } else {
        localStorage.setItem('scolaris_is_signup', 'false');
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        
        if (data.user) {
          const dbProfile = await DBService.getProfile(data.user.id);
          onAuth(dbProfile || {
            name: data.user.user_metadata?.full_name || email.split('@')[0],
            email: email,
            university: data.user.user_metadata?.university || '',
            level: data.user.user_metadata?.level || 'Undergraduate',
            age: data.user.user_metadata?.age || 18,
            onboarded: true,
            tutorialSeen: true,
            tier: 'free' as SubscriptionTier,
            isPro: false,
            notifications: { messages: true, sessions: true, aiContent: true },
            semesterEnd: ''
          });
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || 'Verification or credentials issue.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-start md:justify-center py-8 px-4 sm:px-6 md:p-8 relative overflow-y-auto">
      {/* Custom styles for professional slim scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

      {/* Background Ornaments */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/30 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        layout="position"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10 my-auto"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 mb-4 relative hover:scale-105 transition-transform duration-300">
             <div className="font-serif font-black text-xl italic selection:bg-slate-800">S</div>
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">
            {mode === 'verify' ? 'Confirm Identity' : mode === 'signin' ? 'Welcome Back' : 'Create Scholarly Space'}
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            {mode === 'verify' ? 'Verification Code Sent to Email' : 'Global Academic Network'}
          </p>
        </div>

        {/* Auth Navigation Header Control (Go Back or Quick Switch) */}
        {mode !== 'verify' && (
          <div className="flex items-center justify-between px-2 mb-3">
            <button 
              onClick={() => {
                const target = mode === 'signup' ? 'signin' : 'signup';
                setMode(target);
                setError(null);
              }}
              className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-colors bg-white/60 hover:bg-white backdrop-blur-md pl-3.5 pr-4 py-2 rounded-full border border-slate-200/80 shadow-sm active:scale-95"
            >
              <ArrowLeft size={11} className="text-slate-400" />
              <span>Go to {mode === 'signup' ? 'Sign In' : 'Sign Up'}</span>
            </button>
            <span className="text-[9px] font-mono font-bold text-slate-300 select-none">SECURITY CODES : OK</span>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/30 p-6 md:p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-200/40">
          
          {/* Header Segmented Tabs */}
          {mode !== 'verify' && (
            <div className="flex p-1 bg-slate-100/80 rounded-2xl mb-6 relative">
              {/* Sliding background indicator */}
              <div className="absolute inset-1 grid grid-cols-2 pointer-events-none">
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  className="bg-white rounded-xl shadow-sm h-full w-full"
                  style={{
                    gridColumnStart: mode === 'signin' ? 1 : 2
                  }}
                />
              </div>
              
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); }}
                className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 ${
                  mode === 'signin' 
                    ? 'text-slate-900' 
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 ${
                  mode === 'signup' 
                    ? 'text-slate-900' 
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Core Content View */}
          <div className="custom-scrollbar pr-1">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <X size={12} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold text-rose-600 uppercase tracking-tight">Authentication Error</p>
                      <p className="text-xs font-semibold text-slate-700 leading-relaxed text-left">
                        {error}
                      </p>
                    </div>
                  </div>
                  
                  {(error.includes('apiKey') || error.includes('credentials') || error.includes('URL') || error.includes('invalid') || error.includes('config')) && (
                    <div className="p-3 bg-white rounded-xl border border-rose-100/50 space-y-1.5 shadow-inner text-left">
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Configuration Checklist:</p>
                      <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                        Please verify that <span className="font-bold text-slate-800">VITE_SUPABASE_URL</span> and <span className="font-bold text-slate-800">VITE_SUPABASE_ANON_KEY</span> are properly initialized in your environment.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
              
              {mode === 'verify' ? (
                <motion.div 
                  key="verify"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 text-center py-4"
                >
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-blue-50/50">
                    <Mail size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-serif font-bold text-slate-900">Verify your email</h3>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed px-2">
                      We've sent a verification link to <span className="text-slate-900 font-bold">{email}</span>. 
                      Please click the link to activate your account.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-4">
                    <button 
                      onClick={() => setMode('signin')}
                      className="w-full h-12 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-[0.98] shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      <span>Check completed & Sign In</span>
                      <ArrowRight size={13} />
                    </button>
                    <button 
                      onClick={() => { setMode('signup'); setError(null); }}
                      className="inline-flex items-center justify-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors py-2"
                    >
                      <ArrowLeft size={10} />
                      <span>Entered wrong email? Go back</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <button 
                    onClick={handleGoogleAuth}
                    disabled={isLoading}
                    className="w-full h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-[0.98] shadow-sm group font-medium"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Chrome size={15} className="text-slate-400 group-hover:text-slate-950 transition-colors" />
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider group-hover:text-slate-950">Continue with Google</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px bg-slate-100 flex-1" />
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest select-none">or use email</span>
                    <div className="h-px bg-slate-100 flex-1" />
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div className="space-y-4 text-left">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                          <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                            placeholder="name@email.com"
                          />
                      </div>

                      <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                          <div className="relative">
                            <input 
                              type={showPassword ? "text" : "password"} 
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl pl-4 pr-11 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
                              title={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                      </div>

                      {mode === 'signup' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-1.5"
                        >
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                            <div className="relative">
                              <input 
                                type={showConfirmPassword ? "text" : "password"} 
                                required={mode === 'signup'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl pl-4 pr-11 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                                placeholder="••••••••"
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none"
                                title={showConfirmPassword ? "Hide password" : "Show password"}
                              >
                                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                        </motion.div>
                      )}
                    </div>

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg hover:shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-2 group mt-5"
                    >
                        {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : mode === 'signin' ? 'Sign In with Email' : 'Create Account'}
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-6 text-center">
           <button 
            onClick={() => {
              const target = mode === 'signin' ? 'signup' : 'signin';
              setMode(target);
              setError(null);
            }}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-all bg-white/50 hover:bg-white px-5 py-2.5 rounded-full border border-slate-200/80 shadow-sm active:scale-95"
           >
             {mode === 'signin' ? "Not a member? Join Scolaris" : "Already registered? Sign In"}
           </button>
        </div>

        {/* Status Indicators */}
        <div className="mt-8 flex items-center justify-center gap-6 opacity-30 hover:opacity-60 transition-opacity duration-300 pointer-events-none select-none">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-slate-500" />
            <span className="text-[8px] font-bold uppercase tracking-widest">Privacy First</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check size={11} className="text-slate-500" />
            <span className="text-[8px] font-bold uppercase tracking-widest">End-to-End</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;

