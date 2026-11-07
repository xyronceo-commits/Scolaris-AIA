import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Mail, 
  KeyRound, 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  RefreshCw,
  Lock
} from 'lucide-react';
import KorsIQLogo from './KorsIQLogo';

interface AdminLoginProps {
  onLoginSuccess: (adminToken: string, user: { uid?: string; email: string; role: string; fullName?: string; expiresAt?: number }) => void;
  onBackToStudentPortal: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  onBackToStudentPortal,
}) => {
  // Step 1: 'email' (manual entry only, never autofilled)
  // Step 2: 'otp' (6-digit verification)
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // OTP Countdown Timer (10 minutes = 600s)
  const [countdown, setCountdown] = useState(600);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  useEffect(() => {
    let resendTimer: NodeJS.Timeout;
    if (step === 'otp' && resendCooldown > 0) {
      resendTimer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(resendTimer);
  }, [step, resendCooldown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Step 1: Request Security OTP
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setDevOtpHint(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please manually enter a valid administrator email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch OTP. Access denied.');
      }

      setStep('otp');
      setCountdown(data.expiresInSeconds || 600);
      setResendCooldown(60);
      setInfoMessage('A 6-digit One-Time Password has been dispatched to your authorised admin address.');
      
      if (data.devOtp) {
        setDevOtpHint(data.devOtp);
      }
    } catch (err: any) {
      setError(err?.message || 'Access denied: Unable to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP & Activate 12-Hour Session
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const cleanCode = otp.trim();
    if (cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
      setError('Please enter the complete 6-digit numeric OTP code.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: cleanCode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Invalid or expired OTP code.');
      }

      // Persist 12-hour session
      const sessionPayload = {
        token: data.adminToken,
        user: data.user,
        savedAt: Date.now(),
        expiresAt: data.user.expiresAt || (Date.now() + 12 * 3600 * 1000)
      };

      try {
        localStorage.setItem('korsiq_admin_session', JSON.stringify(sessionPayload));
        sessionStorage.setItem('scolaris_admin_token', data.adminToken);
        sessionStorage.setItem('scolaris_admin_user', JSON.stringify(data.user));
      } catch (storageErr) {
        console.warn('Storage persistence warning:', storageErr);
      }

      onLoginSuccess(data.adminToken, data.user);
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 bg-slate-950 text-white relative overflow-hidden rounded-3xl my-4 border border-slate-800 shadow-2xl">
      {/* Subtle Background Ambience */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6 p-6 sm:p-10 bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-inner">
        {/* Header Section */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-slate-800/90 text-blue-400 border border-slate-700/80 shadow-md mb-1">
            <KorsIQLogo variant="icon" size={32} onDark />
          </div>
          <h1 className="text-2xl font-serif font-bold text-white tracking-tight">
            KorsIQ Administration
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
            Two-Factor Authorised Personnel Gateway
          </p>
        </div>

        {/* Informative Security Notice */}
        <div className="px-3 py-2 bg-blue-950/40 border border-blue-800/40 rounded-xl text-blue-300 text-xs flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Sessions remain authenticated for up to 12 hours. Manual email entry is required.</span>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs font-medium flex items-center gap-2.5 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Success / Info Alert Box */}
        {infoMessage && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs font-medium flex items-center gap-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-snug">{infoMessage}</span>
          </div>
        )}

        {/* Dev OTP Helper in Non-Production */}
        {devOtpHint && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs font-mono flex items-center justify-between">
            <span>Dev Security Code: <strong>{devOtpHint}</strong></span>
            <button
              type="button"
              onClick={() => setOtp(devOtpHint)}
              className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-1 rounded cursor-pointer"
            >
              Fill Code
            </button>
          </div>
        )}

        {/* STEP 1: Manual Email Entry */}
        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-4" autoComplete="off">
            <div className="space-y-1.5">
              <label 
                htmlFor="admin-email-input"
                className="text-xs font-bold text-slate-300 uppercase tracking-wider block"
              >
                Administrator Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="admin-email-input"
                  type="email"
                  name="korsiq_admin_manual_email"
                  required
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter registered admin email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Primary Super Admin: <span className="font-mono text-slate-300">buildsafe247@gmail.com</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg hover:shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Request Security OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: 6-Digit OTP Code Verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5" autoComplete="off">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label 
                  htmlFor="admin-otp-input"
                  className="font-bold text-slate-300 uppercase tracking-wider block"
                >
                  6-Digit OTP Code
                </label>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span className={countdown < 60 ? 'text-rose-400 font-bold' : ''}>
                    {formatTime(countdown)}
                  </span>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="admin-otp-input"
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-center font-mono text-xl tracking-[0.4em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Code sent to: <strong className="text-slate-200">{email}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                >
                  Change Email
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.trim().length !== 6 || countdown <= 0}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg hover:shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating Session Token...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Verify & Enter Admin Console</span>
                </>
              )}
            </button>

            {/* Resend Option */}
            <div className="text-center pt-1">
              <button
                type="button"
                disabled={loading || resendCooldown > 0}
                onClick={() => handleRequestOtp()}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>
                  {resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : 'Resend New OTP Code'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Footer Navigation */}
        <div className="pt-3 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={onBackToStudentPortal}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Student Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;