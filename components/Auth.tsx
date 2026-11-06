import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldAlert, 
  CheckCircle2, 
  Mail, 
  ArrowLeft, 
  RefreshCw, 
  KeyRound 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailVerification } from './EmailVerification';
import KorsIQLogo from './KorsIQLogo';

export type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'reset_password';

interface AuthProps {
  onAuthSuccess: () => void;
  initialMode?: AuthMode;
  sessionExpiredMsg?: string | null;
  isDirectRecovery?: boolean;
  onRecoveryComplete?: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Auth: React.FC<AuthProps> = ({ 
  onAuthSuccess, 
  initialMode = 'signin',
  sessionExpiredMsg,
  isDirectRecovery = false,
  onRecoveryComplete
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  
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
  
  // Password Reset Specific State
  const [resetEmail, setResetEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  // When set, user is routed to the dedicated 6-digit OTP verification screen
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Cooldown countdown for resending recovery codes
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

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
    if (msg.toLowerCase().includes('token') && (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid'))) {
      return 'The recovery code entered is incorrect or has expired. Please request a new code.';
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
    setSuccessMessage(null);

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

  // STEP 1: Request Password Reset Instructions & Code
  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = (email || resetEmail).trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email format (e.g. name@university.edu).');
      return;
    }

    setIsLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });

      if (resetErr) throw resetErr;

      setResetEmail(cleanEmail);
      setCooldown(60);
      setSuccessMessage(`We have sent a 6-digit recovery code to ${cleanEmail}. Enter it below to set your new password.`);
      setMode('reset_password');
    } catch (err: any) {
      console.error('Password reset request error:', err);
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Recovery Code
  const handleResendRecoveryCode = async () => {
    if (cooldown > 0 || isResending) return;
    const targetEmail = (resetEmail || email).trim().toLowerCase();
    if (!targetEmail) {
      setError('Please enter your email address to resend the code.');
      return;
    }

    setIsResending(true);
    setError(null);
    try {
      const { error: resendErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin,
      });
      if (resendErr) throw resendErr;
      setSuccessMessage('A fresh recovery code has been sent to your email.');
      setCooldown(60);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setIsResending(false);
    }
  };

  // STEP 2: Verify Recovery Code and Save New Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanOtp = otpCode.trim();
    const targetEmail = (resetEmail || email).trim().toLowerCase();

    if (!isDirectRecovery) {
      if (!cleanOtp) {
        setError('Please enter the 6-digit recovery code sent to your email.');
        return;
      }
      if (cleanOtp.length !== 6) {
        setError('Please enter all 6 digits of the recovery code.');
        return;
      }
    }

    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('New password must contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match. Please verify both entries.');
      return;
    }

    setIsLoading(true);
    try {
      if (!isDirectRecovery) {
        // Step A: Verify recovery OTP
        let { error: verifyError } = await supabase.auth.verifyOtp({
          email: targetEmail,
          token: cleanOtp,
          type: 'recovery',
        });

        // Step A fallback: type 'email' if recovery token type mapping differs
        if (verifyError) {
          const fallback = await supabase.auth.verifyOtp({
            email: targetEmail,
            token: cleanOtp,
            type: 'email',
          });
          if (!fallback.error) {
            verifyError = null;
          }
        }

        if (verifyError) throw verifyError;
      }

      // Step B: Set new password for the authenticated recovery session
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      if (onRecoveryComplete) {
        onRecoveryComplete();
      }

      // Sign out temporary recovery session so user signs in cleanly with fresh credentials
      await supabase.auth.signOut().catch(() => {});

      // Switch back to sign in with success feedback
      setSuccessMessage('Password updated successfully! Please sign in with your new password.');
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setOtpCode('');
    } catch (err: any) {
      console.error('Password reset submit error:', err);
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
        setError('The 6-digit recovery code is invalid or has expired. Please request a new code.');
      } else {
        setError(formatAuthError(err));
      }
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
            {mode === 'forgot_password' || mode === 'reset_password' ? (
              <KeyRound size={36} className="text-indigo-400" />
            ) : (
              <KorsIQLogo variant="icon" size={48} onDark />
            )}
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">
            {mode === 'signin' 
              ? 'Welcome Back' 
              : mode === 'signup' 
              ? 'Create Scholarly Space'
              : mode === 'forgot_password'
              ? 'Forgot Password'
              : 'Reset Password'}
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            {mode === 'forgot_password' || mode === 'reset_password' 
              ? 'Account Recovery' 
              : 'Global Academic Network'}
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
          
          {/* Header Controls: Tabs for signin/signup OR back link for password recovery */}
          {mode === 'signin' || mode === 'signup' ? (
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
                onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 cursor-pointer ${
                  mode === 'signin' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                className={`relative z-10 flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-center transition-colors duration-200 cursor-pointer ${
                  mode === 'signup' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => { 
                  setMode('signin'); 
                  setError(null); 
                  setSuccessMessage(null); 
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back to Sign In</span>
              </button>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                {mode === 'forgot_password' ? 'Step 1 of 2' : 'Step 2 of 2'}
              </span>
            </div>
          )}

          {/* Form Area */}
          <div className="space-y-4">
            {/* Success Feedback Alert */}
            <AnimatePresence mode="wait">
              {successMessage && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-start gap-2.5 text-left mb-2"
                >
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-emerald-800 leading-snug">
                    {successMessage}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Feedback Alert */}
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

            {/* VIEW A: SIGN IN & SIGN UP FORMS */}
            {(mode === 'signin' || mode === 'signup') && (
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
                      {mode === 'signup' ? (
                        <span className="text-[9px] text-slate-400 font-medium">
                          Min. 8 chars (letters &amp; numbers)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setResetEmail(email.trim().toLowerCase());
                            setMode('forgot_password');
                            setError(null);
                            setSuccessMessage(null);
                          }}
                          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer hover:underline"
                        >
                          Forgot password?
                        </button>
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
            )}

            {/* VIEW B: FORGOT PASSWORD REQUEST (STEP 1) */}
            {mode === 'forgot_password' && (
              <form onSubmit={handleForgotPasswordRequest} className="space-y-4" noValidate>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl pl-10 pr-4 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                      placeholder="name@university.edu"
                    />
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal ml-1 pt-0.5 leading-relaxed">
                    Enter the email associated with your account. We will send a 6-digit recovery code to reset your password.
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Recovery Code...</span>
                    </div>
                  ) : (
                    <>
                      <span>Send Recovery Code</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email.trim().toLowerCase());
                      setMode('reset_password');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline"
                  >
                    Already have a 6-digit code? Enter code here →
                  </button>
                </div>
              </form>
            )}

            {/* VIEW C: SET NEW PASSWORD (STEP 2) */}
            {mode === 'reset_password' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4" noValidate>
                <div className="space-y-3.5 text-left">
                  {/* Target Account Display */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div className="truncate">
                      <span className="text-slate-400 font-medium">Resetting: </span>
                      <span className="font-semibold text-slate-800 truncate">
                        {resetEmail || email || 'Registered account'}
                      </span>
                    </div>
                    {!isDirectRecovery && (
                      <button
                        type="button"
                        onClick={() => { 
                          setMode('forgot_password'); 
                          setError(null); 
                          setSuccessMessage(null); 
                        }}
                        className="text-indigo-600 hover:text-indigo-700 font-bold text-[10px] uppercase tracking-wider shrink-0 ml-2 cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {/* 6-Digit OTP Recovery Code Input (if not a direct recovery link session) */}
                  {!isDirectRecovery && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          6-Digit Recovery Code
                        </label>
                        <button
                          type="button"
                          disabled={cooldown > 0 || isResending}
                          onClick={handleResendRecoveryCode}
                          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1"
                        >
                          {isResending ? (
                            <span>Resending...</span>
                          ) : cooldown > 0 ? (
                            <span>Resend in {cooldown}s</span>
                          ) : (
                            <>
                              <RefreshCw size={10} />
                              <span>Resend code</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="relative">
                        <input 
                          type="text" 
                          required
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-center text-lg font-mono tracking-[0.3em] font-bold outline-none text-slate-800 placeholder-slate-300 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                          placeholder="000000"
                          autoComplete="one-time-code"
                        />
                      </div>
                    </div>
                  )}

                  {/* New Password */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        New Password
                      </label>
                      <span className="text-[9px] text-slate-400 font-medium">
                        Min. 8 chars (letters &amp; numbers)
                      </span>
                    </div>
                    <div className="relative">
                      <input 
                        type={showNewPassword ? "text" : "password"} 
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl pl-4 pr-11 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input 
                        type={showConfirmNewPassword ? "text" : "password"} 
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full h-12 bg-slate-50 border border-slate-200/85 rounded-xl pl-4 pr-11 text-sm font-medium outline-none text-slate-700 transition-all duration-200 placeholder-slate-400 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showConfirmNewPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating Password...</span>
                    </div>
                  ) : (
                    <>
                      <span>Save New Password &amp; Sign In</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Switcher */}
        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => {
              if (mode === 'signin') {
                setMode('signup');
              } else {
                setMode('signin');
              }
              setError(null);
              setSuccessMessage(null);
            }}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest transition-all bg-white/50 hover:bg-white px-5 py-2 rounded-full border border-slate-200/80 shadow-sm active:scale-95 cursor-pointer"
          >
            {mode === 'signin' 
              ? "Not a member? Create an account" 
              : mode === 'signup'
              ? "Already registered? Sign In"
              : "Remember your password? Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
