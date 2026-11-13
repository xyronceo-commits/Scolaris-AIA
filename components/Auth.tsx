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
  KeyRound,
  X 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EmailVerification } from './EmailVerification';
import KorsIQLogo from './KorsIQLogo';

export type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'reset_password';

interface AuthProps {
  onAuthSuccess: () => void;
  onCancel?: () => void;
  initialMode?: AuthMode;
  sessionExpiredMsg?: string | null;
  isDirectRecovery?: boolean;
  onRecoveryComplete?: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Auth: React.FC<AuthProps> = ({ 
  onAuthSuccess, 
  onCancel,
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
        onCancel={onCancel}
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-8 px-4 sm:px-6 relative overflow-y-auto font-sans text-slate-900">
      <motion.div 
        layout="position"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10 my-auto"
      >
        {onCancel && (
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setFullName('');
                onCancel();
              }}
              className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-sm transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer min-h-[44px]"
              title="Cancel and return to home page"
              aria-label="Cancel and return to home page"
            >
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-slate-900 text-white rounded-xl shadow-xs mb-3">
            {mode === 'forgot_password' || mode === 'reset_password' ? (
              <KeyRound size={32} className="text-blue-400" />
            ) : (
              <KorsIQLogo variant="icon" size={42} onDark />
            )}
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight mb-1">
            {mode === 'signin' 
              ? 'Welcome Back' 
              : mode === 'signup' 
              ? 'Create Your Account'
              : mode === 'forgot_password'
              ? 'Forgot Password'
              : 'Reset Password'}
          </h1>
          <p className="text-slate-400 font-semibold text-xs">
            {mode === 'forgot_password' || mode === 'reset_password' 
              ? 'Account Recovery' 
              : 'Global Academic Workspace'}
          </p>
        </div>

        {/* Session Expiry Banner */}
        {sessionExpiredMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2.5 shadow-xs"
          >
            <ShieldAlert size={18} className="text-amber-600 shrink-0" />
            <p className="text-xs font-medium text-amber-900 leading-tight">
              {sessionExpiredMsg}
            </p>
          </motion.div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-md p-6 sm:p-8 transition-all">
          
          {/* Header Controls: Tabs for signin/signup OR back link for password recovery */}
          {mode === 'signin' || mode === 'signup' ? (
            <div className="flex p-1 bg-slate-100 rounded-lg mb-6 relative">
              <div className="absolute inset-1 grid grid-cols-2 pointer-events-none">
                <motion.div
                  layout
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  className="bg-white rounded-md shadow-xs h-full w-full"
                  style={{
                    gridColumnStart: mode === 'signin' ? 1 : 2
                  }}
                />
              </div>
              
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
                className={`relative z-10 flex-1 py-2 rounded-md font-semibold text-xs text-center transition-colors duration-200 cursor-pointer ${
                  mode === 'signin' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                className={`relative z-10 flex-1 py-2 rounded-md font-semibold text-xs text-center transition-colors duration-200 cursor-pointer ${
                  mode === 'signup' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
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
              <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">
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
                  className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-left mb-2"
                >
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-emerald-800 leading-snug">
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
                  className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-left"
                >
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-rose-700 leading-snug">
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
                      <label className="text-xs font-medium text-slate-600 ml-0.5">
                        Full Name
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full h-11 bg-white border border-slate-200 rounded-lg px-3.5 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                          placeholder="e.g. Alex Morgan"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Email Address */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 ml-0.5">
                      Email Address
                    </label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 bg-white border border-slate-200 rounded-lg px-3.5 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      placeholder="name@university.edu"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between ml-0.5">
                      <label className="text-xs font-medium text-slate-600">
                        Password
                      </label>
                      {mode === 'signup' ? (
                        <span className="text-[10px] text-slate-400">
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
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer hover:underline"
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
                        className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
                      <label className="text-xs font-medium text-slate-600 ml-0.5">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input 
                          type={showConfirmPassword ? "text" : "password"} 
                          required={mode === 'signup'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                          title={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                          agreeTerms 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'border-slate-300 bg-white group-hover:border-slate-400'
                        }`}>
                          {agreeTerms && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <span className="text-[11px] text-slate-500 font-normal leading-relaxed">
                          I agree to the{' '}
                          <span className="text-blue-600 font-semibold hover:underline">Terms of Service</span>
                          {' '}and{' '}
                          <span className="text-blue-600 font-semibold hover:underline">Privacy Policy</span>.
                        </span>
                      </label>
                    </motion.div>
                  )}
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{mode === 'signin' ? 'Signing In...' : 'Registering Account...'}</span>
                    </div>
                  ) : (
                    <>
                      <span>{mode === 'signin' ? 'Sign In to Workspace' : 'Create Scholarly Account'}</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* VIEW B: FORGOT PASSWORD REQUEST (STEP 1) */}
            {mode === 'forgot_password' && (
              <form onSubmit={handleForgotPasswordRequest} className="space-y-4" noValidate>
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-medium text-slate-600 ml-0.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-9 pr-3.5 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      placeholder="name@university.edu"
                    />
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal ml-0.5 pt-0.5 leading-relaxed">
                    Enter the email associated with your account. We will send a 6-digit recovery code to reset your password.
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending Recovery Code...</span>
                    </div>
                  ) : (
                    <>
                      <span>Send Recovery Code</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
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
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer hover:underline"
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
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between text-xs">
                    <div className="truncate">
                      <span className="text-slate-500 font-normal">Resetting: </span>
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
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs shrink-0 ml-2 cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {/* 6-Digit OTP Recovery Code Input (if not a direct recovery link session) */}
                  {!isDirectRecovery && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between ml-0.5">
                        <label className="text-xs font-medium text-slate-600">
                          6-Digit Recovery Code
                        </label>
                        <button
                          type="button"
                          disabled={cooldown > 0 || isResending}
                          onClick={handleResendRecoveryCode}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1"
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
                          className="w-full h-11 bg-white border border-slate-200 rounded-lg px-4 text-center text-lg font-mono tracking-[0.3em] font-bold outline-none text-slate-900 placeholder-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                          placeholder="000000"
                          autoComplete="one-time-code"
                        />
                      </div>
                    </div>
                  )}

                  {/* New Password */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between ml-0.5">
                      <label className="text-xs font-medium text-slate-600">
                        New Password
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Min. 8 chars (letters &amp; numbers)
                      </span>
                    </div>
                    <div className="relative">
                      <input 
                        type={showNewPassword ? "text" : "password"} 
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 ml-0.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input 
                        type={showConfirmNewPassword ? "text" : "password"} 
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 text-xs font-normal text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                        title={showConfirmNewPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 group mt-4 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating Password...</span>
                    </div>
                  ) : (
                    <>
                      <span>Save New Password &amp; Sign In</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
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
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all bg-white hover:bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
          >
            {mode === 'signin' 
              ? "Don't have an account? Sign up" 
              : mode === 'signup'
              ? "Already registered? Sign in"
              : "Remember your password? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
