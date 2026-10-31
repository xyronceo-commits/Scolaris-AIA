import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, AlertCircle, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailVerification } from './EmailVerification';
import ScolarisLogo from './ScolarisLogo';

interface AuthProps {
  onAuthSuccess: () => void;
  initialMode?: 'signin' | 'signup';
  sessionExpiredMsg?: string | null;
}

export const Auth: React.FC<AuthProps> = ({ 
  onAuthSuccess, 
  initialMode = 'signin',
  sessionExpiredMsg
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  // When set, the user must enter the OTP sent to this address
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const formatAuthError = (err: any): string => {
    if (!err) return 'An error occurred during authentication.';
    const code: string = err.code || '';
    const msg: string = err.message || '';

    if (code === 'invalid_credentials' || msg.toLowerCase().includes('invalid login credentials')) {
      return 'Email or password is incorrect.';
    }
    if (code === 'user_already_exists' || code === 'email_exists') {
      return 'An account already exists with this email address. Please sign in instead.';
    }
    if (code === 'weak_password') {
      return 'That password is too weak. Use at least 8 characters with a mix of letters and numbers.';
    }
    if (code === 'validation_failed' || code === 'email_address_invalid') {
      return 'Please enter a valid email address.';
    }
    if (err.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }
    return msg || 'Authentication issue occurred.';
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters long.');
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (signUpError) throw signUpError;

        // Supabase returns an obfuscated user with no identities when the email is already registered
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('An account already exists with this email address. Please sign in instead.');
          return;
        }

        if (data.session) {
          // Email confirmation is switched off in the project: user is already signed in
          onAuthSuccess();
        } else {
          // Normal path: a one-time code has been emailed
          setPendingEmail(cleanEmail);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          if (signInError.code === 'email_not_confirmed') {
            // Account exists but was never verified: send a fresh code and show the OTP screen
            await supabase.auth.resend({ type: 'signup', email: cleanEmail }).catch(() => {});
            setPendingEmail(cleanEmail);
            return;
          }
          throw signInError;
        }
        onAuthSuccess();
      }
    } catch (err: any) {
      console.error('Email Auth error:', err);
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <EmailVerification
        email={pendingEmail}
        onVerified={onAuthSuccess}
        onBack={() => {
          setPendingEmail(null);
          setPassword('');
          setConfirmPassword('');
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center py-8 px-4 sm:px-6 md:p-8 relative overflow-y-auto font-sans text-slate-900">
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
          <div className="inline-flex items-center justify-center p-3.5 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 mb-4 hover:scale-105 transition-transform duration-300">
            <ScolarisLogo variant="icon" size={38} colorClass="text-white" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">
            {mode === 'signin' ? 'Welcome Back' : 'Create Scholarly Space'}
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            Global Academic Network
          </p>
        </div>

        {/* Session Expiry Banner */}
        {sessionExpiredMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-3 shadow-sm"
          >
            <ShieldAlert size={20} className="text-amber-600 shrink-0" />
            <p className="text-xs font-semibold text-amber-900 leading-tight">
              {sessionExpiredMsg}
            </p>
          </motion.div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/30 p-6 md:p-8 transition-all duration-300">
          
          {/* Header Tabs */}
          <div className="flex p-1 bg-slate-100/80 rounded-2xl mb-6 relative">
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
                mode === 'signin' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 ${
                mode === 'signup' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form Area */}
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5"
                >
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-rose-700 leading-snug">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-3.5 text-left">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                    placeholder="name@university.edu"
                  />
                </div>

                <div className="space-y-1">
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
                    className="space-y-1"
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
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group mt-4"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-all bg-white/50 hover:bg-white px-5 py-2 rounded-full border border-slate-200/80 shadow-sm active:scale-95"
          >
            {mode === 'signin' ? "Not a member? Create an account" : "Already registered? Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
