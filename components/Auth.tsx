import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, AlertCircle, Eye, EyeOff, ShieldAlert, CheckCircle2, Lock, Mail, User, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailVerification } from './EmailVerification';
import ScolarisLogo from './ScolarisLogo';

interface AuthProps {
  onAuthSuccess: () => void;
  initialMode?: 'signin' | 'signup';
  sessionExpiredMsg?: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  // When set, user is routed to the dedicated 6-digit OTP verification screen
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const formatAuthError = (err: any): string => {
    if (!err) return 'An error occurred during authentication.';
    const code: string = err.code || '';
    const msg: string = err.message || '';

    if (code === 'invalid_credentials' || msg.toLowerCase().includes('invalid login credentials')) {
      return 'Email or password is incorrect. Please check your details and try again.';
    }
    if (code === 'user_already_exists' || code === 'email_exists' || msg.toLowerCase().includes('user already registered')) {
      return 'An account already exists with this email address. Please sign in instead.';
    }
    if (code === 'weak_password' || msg.toLowerCase().includes('weak')) {
      return 'Password is too weak. Please use at least 8 characters with letters and numbers.';
    }
    if (code === 'validation_failed' || code === 'email_address_invalid' || msg.toLowerCase().includes('valid email')) {
      return 'Please enter a valid email address.';
    }
    if (err.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
      return 'Too many attempts. Please wait a moment before trying again.';
    }
    return msg || 'Authentication issue occurred.';
  };

  const validateForm = (): boolean => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return false;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email format (e.g. name@university.edu).');
      return false;
    }

    if (!password) {
      setError('Please enter your password.');
      return false;
    }

    if (mode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setError('Please enter your full name (minimum 2 characters).');
        return false;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return false;
      }
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        setError('Password must contain both letters and numbers.');
        return false;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please verify both entries.');
        return false;
      }
      if (!agreeTerms) {
        setError('Please accept the Terms of Service and Privacy Policy to continue.');
        return false;
      }
    }

    return true;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;

        // Supabase returns an obfuscated user with no identities when the email is already registered
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('An account already exists with this email address. Please sign in instead.');
          return;
        }

        // Email OTP is sent by Supabase. Always route to dedicated 6-digit OTP verification screen
        setPendingEmail(cleanEmail);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) {
          // If user exists but email has not been verified yet, trigger fresh OTP and route to verification
          if (
            signInError.code === 'email_not_confirmed' ||
            signInError.message.toLowerCase().includes('email not confirmed')
          ) {
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
              className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 cursor-pointer ${
                mode === 'signin' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 cursor-pointer ${
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
                  className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-left"
                >
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-rose-700 leading-snug">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleEmailAuth} className="space-y-4" noValidate>
              <div className="space-y-3.5 text-left">
                {/* Full Name for Sign Up */}
                {mode === 'signup' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1"
                  >
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                        placeholder="e.g. Alex Morgan"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Email Address */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                    placeholder="name@university.edu"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Password
                    </label>
                    {mode === 'signup' && (
                      <span className="text-[9px] text-slate-400 font-medium">
                        Min. 8 chars (letters &amp; numbers)
                      </span>
                    )}
                  </div>
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password for Sign Up */}
                {mode === 'signup' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1"
                  >
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Confirm Password
                    </label>
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
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Terms and Conditions Acceptance */}
                {mode === 'signup' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="pt-1"
                  >
                    <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                        agreeTerms 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'
                      }`}>
                        {agreeTerms && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        I agree to the{' '}
                        <span className="text-indigo-600 font-bold hover:underline">Terms of Service</span>
                        {' '}and{' '}
                        <span className="text-indigo-600 font-bold hover:underline">Privacy Policy</span>.
                      </span>
                    </label>
                  </motion.div>
                )}
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{mode === 'signin' ? 'Signing In...' : 'Registering Account...'}</span>
                  </div>
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Create Scholarly Account'}</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-all bg-white/50 hover:bg-white px-5 py-2 rounded-full border border-slate-200/80 shadow-sm active:scale-95 cursor-pointer"
          >
            {mode === 'signin' ? "Not a member? Create an account" : "Already registered? Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
