import React, { useState, useEffect, useRef } from 'react';
import KorsIQLogo from './KorsIQLogo';
import { 
  ShieldCheck, 
  Mail, 
  ArrowRight, 
  Lock, 
  LogOut, 
  Users, 
  CreditCard, 
  MessageSquare, 
  FileText, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RotateCcw, 
  ChevronRight, 
  Calendar,
  DollarSign,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface AdminAppProps {
  onExit: () => void;
}

interface AdminSession {
  user: {
    id: string;
    email: string;
    role: string;
  };
  token: string;
  expiresAt: number; // 8 hours timestamp
}

export const AdminApp: React.FC<AdminAppProps> = ({ onExit }) => {
  // Session handling (8 hours max)
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => {
    try {
      const stored = sessionStorage.getItem('korsiq_admin_session');
      if (stored) {
        const parsed: AdminSession = JSON.parse(stored);
        if (parsed.expiresAt > Date.now() && parsed.token) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  // Auth flow states
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Dashboard active tab (6 tabs: Overview, Users, Payments, Circles, Credits, Audit log)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'payments' | 'circles' | 'credits' | 'audit'>('overview');

  // Dashboard data states
  const [overviewData, setOverviewData] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [subsList, setSubsList] = useState<any[]>([]);
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'pending' | 'paid' | 'failed' | 'abandoned'>('all');
  const [verifyingRef, setVerifyingRef] = useState<string | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [circlesList, setCirclesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Manual grant modal
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTier, setGrantTier] = useState<'plus' | 'studio' | 'free'>('plus');
  const [isGranting, setIsGranting] = useState(false);

  // Credits tab state
  const [creditsSearchUser, setCreditsSearchUser] = useState('');
  const [creditsUserInfo, setCreditsUserInfo] = useState<any>(null);
  const [creditsLedger, setCreditsLedger] = useState<any[]>([]);
  const [creditsDelta, setCreditsDelta] = useState<number>(20);
  const [creditsReason, setCreditsReason] = useState('Support bonus credits');
  const [isAdjustingCredits, setIsAdjustingCredits] = useState(false);
  const [creditsFeedback, setCreditsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown countdown effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Save session helper (8 hours)
  const saveSession = (user: any, token: string) => {
    const session: AdminSession = {
      user,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000 // 8 hours
    };
    sessionStorage.setItem('korsiq_admin_session', JSON.stringify(session));
    setAdminSession(session);
  };

  const handleSignOut = () => {
    sessionStorage.removeItem('korsiq_admin_session');
    setAdminSession(null);
    setAuthStep('email');
    setEmail('');
    setOtpDigits(['', '', '', '', '', '']);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  // 1. Submit Email for OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const resp = await fetch('/api/admin/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to request verification code.');
      }

      setStatusMessage(data.message || 'If this email is authorized, a 6-digit verification code has been sent.');
      setAuthStep('otp');
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error sending verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle OTP digit changes with paste support
  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) {
      // Paste handling
      const digits = val.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length > 0) {
        const next = [...otpDigits];
        digits.forEach((d, i) => {
          if (index + i < 6) next[index + i] = d;
        });
        setOtpDigits(next);
        const nextIdx = Math.min(5, index + digits.length);
        otpInputsRef.current[nextIdx]?.focus();
        if (digits.length === 6) {
          verifyOtpCode(digits.join(''));
        }
      }
      return;
    }

    const digit = val.replace(/\D/g, '');
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    const fullCode = next.join('');
    if (fullCode.length === 6) {
      verifyOtpCode(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  // 3. Verify OTP Code
  const verifyOtpCode = async (tokenCode?: string) => {
    const code = tokenCode || otpDigits.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter all 6 digits.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const resp = await fetch('/api/admin/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: code
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Invalid or expired 6-digit code.');
      }

      if (!data.session?.access_token) {
        throw new Error('Verification succeeded, but no session token was returned by the server.');
      }

      saveSession(data.user, data.session.access_token);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper for Authenticated Admin API calls
  const adminFetch = async (endpoint: string, options: RequestInit = {}) => {
    if (!adminSession?.token) throw new Error('Not authenticated');
    const headers = {
      ...((options.headers as any) || {}),
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminSession.token}`
    };
    const resp = await fetch(endpoint, { ...options, headers });
    if (resp.status === 401 || resp.status === 403) {
      handleSignOut();
      throw new Error('Admin session expired or access revoked.');
    }
    return await resp.json();
  };

  // Load Dashboard Data based on Active Tab
  useEffect(() => {
    if (!adminSession) return;

    const loadData = async () => {
      setIsDataLoading(true);
      try {
        if (activeTab === 'overview') {
          const res = await adminFetch('/api/admin/overview');
          if (res.success) setOverviewData(res.data);
        } else if (activeTab === 'users') {
          const res = await adminFetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}`);
          if (res.success) setUsersList(res.users);
        } else if (activeTab === 'payments') {
          const res = await adminFetch(`/api/admin/payments?status=${encodeURIComponent(paymentStatusFilter)}`);
          if (res.success) {
            setTransactionsList(res.transactions || []);
            setSubsList(res.subscriptions || []);
          }
        } else if (activeTab === 'circles') {
          const res = await adminFetch('/api/admin/circles');
          if (res.success) setCirclesList(res.circles);
        } else if (activeTab === 'audit') {
          const res = await adminFetch('/api/admin/audit-log');
          if (res.success) setAuditLogs(res.logs);
        }
      } catch (err) {
        console.warn('Admin data fetch warning:', err);
      } finally {
        setIsDataLoading(false);
      }
    };

    loadData();
  }, [adminSession, activeTab, userSearch, paymentStatusFilter]);

  const handleVerifyPaymentReference = async (reference: string) => {
    if (!reference || verifyingRef) return;
    setVerifyingRef(reference);
    setPaymentFeedback(null);
    try {
      const res = await adminFetch('/api/admin/payments/verify', {
        method: 'POST',
        body: JSON.stringify({ reference })
      });
      if (res.success) {
        setPaymentFeedback({ type: 'success', message: res.message || `Verified and activated ${reference}.` });
      } else {
        setPaymentFeedback({ type: 'error', message: res.error || `Could not verify ${reference}.` });
      }
      const refreshed = await adminFetch(`/api/admin/payments?status=${encodeURIComponent(paymentStatusFilter)}`);
      if (refreshed.success) {
        setTransactionsList(refreshed.transactions || []);
        setSubsList(refreshed.subscriptions || []);
      }
    } catch (err: any) {
      setPaymentFeedback({ type: 'error', message: err?.message || 'Error verifying reference.' });
    } finally {
      setVerifyingRef(null);
    }
  };

  const handleLookupCredits = async (e?: React.FormEvent, targetOverride?: string) => {
    if (e) e.preventDefault();
    const target = (targetOverride ?? creditsSearchUser).trim();
    if (!target) return;
    setIsDataLoading(true);
    setCreditsFeedback(null);
    try {
      const res = await adminFetch(`/api/admin/credits?user=${encodeURIComponent(target)}`);
      if (res.success) {
        setCreditsUserInfo({ ...res.user, ...res.credits });
        setCreditsLedger(res.ledger || []);
      } else {
        setCreditsUserInfo(null);
        setCreditsLedger([]);
        setCreditsFeedback({ type: 'error', message: res.error || 'User not found.' });
      }
    } catch (err: any) {
      setCreditsFeedback({ type: 'error', message: err?.message || 'Failed to look up user credits.' });
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = (creditsUserInfo?.id || creditsSearchUser).trim();
    if (!target || !creditsDelta) return;
    setIsAdjustingCredits(true);
    setCreditsFeedback(null);
    try {
      const res = await adminFetch('/api/admin/credits/adjust', {
        method: 'POST',
        body: JSON.stringify({
          user: target,
          delta: Number(creditsDelta),
          reason: creditsReason.trim() || 'Admin credit adjustment'
        })
      });
      if (res.success) {
        setCreditsFeedback({ type: 'success', message: res.message });
        await handleLookupCredits(undefined, target);
      } else {
        setCreditsFeedback({ type: 'error', message: res.error || 'Failed to adjust credits.' });
      }
    } catch (err: any) {
      setCreditsFeedback({ type: 'error', message: err?.message || 'Error adjusting credits.' });
    } finally {
      setIsAdjustingCredits(false);
    }
  };

  // Handle Manual Tier Grant
  const handleGrantTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId) return;
    setIsGranting(true);
    setPaymentFeedback(null);
    try {
      const res = await adminFetch('/api/admin/subscriptions/grant-tier', {
        method: 'POST',
        body: JSON.stringify({ userId: grantUserId, targetTier: grantTier })
      });
      if (res.success) {
        setPaymentFeedback({ type: 'success', message: res.message });
        setGrantUserId('');
        const refreshed = await adminFetch(`/api/admin/payments?status=${encodeURIComponent(paymentStatusFilter)}`);
        if (refreshed.success) {
          setTransactionsList(refreshed.transactions || []);
          setSubsList(refreshed.subscriptions || []);
        }
      } else {
        setPaymentFeedback({ type: 'error', message: res.error || 'Failed to grant tier.' });
      }
    } catch (err: any) {
      setPaymentFeedback({ type: 'error', message: err?.message || 'Error executing grant.' });
    } finally {
      setIsGranting(false);
    }
  };

  // -------------------------------------------------------------
  // VIEW A: ADMIN SIGN-IN SCREEN (OTP-ONLY)
  // -------------------------------------------------------------
  if (!adminSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <KorsIQLogo variant="full" size={32} />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900">
              <ShieldCheck size={12} />
              <span>Admin Portal</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {authStep === 'email' ? 'Administrator Access' : 'Enter 6-Digit Code'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {authStep === 'email' 
                ? 'Sign in via one-time verification code. Passwords are not used.'
                : `Enter the 6-digit code sent to ${email}`}
            </p>
          </div>

          {/* Feedback Banners */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && authStep === 'otp' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-blue-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* STEP 1: Email Only */}
          {authStep === 'email' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Authorized Administrator Email
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoFocus
                    placeholder="admin@korsiq.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                <span>Send Verification Code</span>
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onExit}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer min-h-[44px] px-3"
                >
                  &larr; Return to KorsIQ App
                </button>
              </div>
            </form>
          ) : (
            /* STEP 2: 6 Boxes OTP */
            <div className="space-y-5">
              <div className="flex justify-between gap-2 max-w-xs mx-auto">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpInputsRef.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-12 text-center font-mono text-lg font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => verifyOtpCode()}
                disabled={isLoading || otpDigits.join('').length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                <span>Verify & Enter Dashboard</span>
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep('email');
                    setErrorMessage(null);
                  }}
                  className="text-slate-500 hover:text-slate-900 dark:hover:text-white min-h-[44px] px-2 cursor-pointer"
                >
                  &larr; Change email
                </button>

                <button
                  type="button"
                  disabled={resendCooldown > 0 || isLoading}
                  onClick={handleRequestOtp}
                  className="text-blue-600 dark:text-blue-400 font-semibold disabled:opacity-50 min-h-[44px] px-2 cursor-pointer"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: ADMIN DASHBOARD (V1 SIMPLE & SECURE)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-white flex flex-col">
      {/* Top Admin Navigation Header */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <KorsIQLogo variant="full" size={28} />
          <span className="hidden sm:inline px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900">
            Admin v1
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">{adminSession.user.email}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{adminSession.user.role}</p>
          </div>

          <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 border border-slate-200 dark:border-slate-700 rounded-lg min-h-[44px] cursor-pointer"
            title="Open Student App"
          >
            <span>Student App</span>
            <ExternalLink size={13} />
          </button>

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300 rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer"
            title="Sign Out of Admin Session"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Admin Content Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Navigation Tabs (6 Tabs: Overview, Users, Payments, Circles, Credits, Audit log) */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={15} />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Users size={15} />
            <span>Users</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'payments' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <CreditCard size={15} />
            <span>Payments</span>
          </button>

          <button
            onClick={() => setActiveTab('circles')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'circles' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <MessageSquare size={15} />
            <span>Circles</span>
          </button>

          <button
            onClick={() => setActiveTab('credits')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'credits' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <DollarSign size={15} />
            <span>Credits</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            <span>Audit Log</span>
          </button>
        </div>

        {/* Loading Indicator */}
        {isDataLoading && (
          <div className="py-8 text-center">
            <Loader2 size={24} className="animate-spin text-blue-600 mx-auto" />
            <p className="text-xs text-slate-400 mt-2 font-semibold">Loading data...</p>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {!isDataLoading && activeTab === 'overview' && overviewData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Registered Users</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{overviewData.totalUsers}</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Subscriptions</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overviewData.activeSubscriptions}</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Pending Payments</p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{overviewData.pendingPayments ?? 0}</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Revenue This Month</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  ₦{(overviewData.monthRevenue || 0).toLocaleString()}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Study Circles</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{overviewData.totalCircles}</p>
              </div>
            </div>

            {/* Recent Audit Activities */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Security Audit Events</h3>
              <div className="space-y-2">
                {(overviewData.recentLogs || []).map((l: any) => (
                  <div key={l.id} className="text-xs flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{l.action}</span>
                    <span className="text-slate-400">{l.admin_email} &bull; {new Date(l.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USERS */}
        {!isDataLoading && activeTab === 'users' && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">University</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Tier</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {usersList.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{u.name || 'Unnamed'}</p>
                          <p className="text-slate-400 text-[11px]">{u.email}</p>
                          <p className="text-slate-400 font-mono text-[10px]">{u.id}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.university || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.department || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            u.tier === 'studio' ? 'bg-purple-50 text-purple-700' :
                            u.tier === 'plus' ? 'bg-blue-50 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {u.tier || 'free'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={u.is_pro ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                            {u.is_pro ? 'Paid Pro' : 'Free Tier'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                setGrantUserId(u.id);
                                setGrantTier(u.tier === 'studio' ? 'free' : 'plus');
                                setActiveTab('payments');
                              }}
                              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline min-h-[44px] flex items-center cursor-pointer"
                            >
                              Manage Tier
                            </button>
                            <button
                              onClick={() => {
                                setCreditsSearchUser(u.email || u.id);
                                setActiveTab('credits');
                                handleLookupCredits(undefined, u.email || u.id);
                              }}
                              className="text-slate-600 dark:text-slate-300 font-semibold hover:underline min-h-[44px] flex items-center cursor-pointer"
                            >
                              Credits
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENTS (Ledger + Verify now + Subscriptions + Manual Override) */}
        {!isDataLoading && activeTab === 'payments' && (
          <div className="space-y-6">
            {paymentFeedback && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  paymentFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                }`}
              >
                {paymentFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{paymentFeedback.message}</span>
              </div>
            )}

            {/* Payment Transactions Ledger */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment Transactions Ledger</h3>
                  <p className="text-xs text-slate-500">Verify pending Paystack transactions directly and activate plans</p>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', 'pending', 'paid', 'failed', 'abandoned'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPaymentStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize min-h-[36px] cursor-pointer ${
                        paymentStatusFilter === st
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">User / Email</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactionsList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                          No payment transactions found for this filter.
                        </td>
                      </tr>
                    ) : (
                      transactionsList.map((tx: any) => {
                        const amountNaira = tx.amount_naira || (tx.amount_kobo ? Number(tx.amount_kobo) / 100 : 0);
                        const isPending = tx.status === 'pending';
                        return (
                          <tr key={tx.id || tx.reference} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                              {tx.reference}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-slate-800 dark:text-slate-200">{tx.customer_email || '—'}</p>
                              <p className="font-mono text-[10px] text-slate-400">{tx.user_id || ''}</p>
                            </td>
                            <td className="px-4 py-3 font-semibold uppercase">{tx.plan || '—'}</td>
                            <td className="px-4 py-3 font-semibold">₦{Number(amountNaira).toLocaleString()}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                tx.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : tx.status === 'pending'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700'
                              }`}>
                                {tx.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {isPending ? (
                                <button
                                  type="button"
                                  disabled={verifyingRef === tx.reference}
                                  onClick={() => handleVerifyPaymentReference(tx.reference)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[36px] disabled:opacity-50 cursor-pointer"
                                >
                                  {verifyingRef === tx.reference ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <RotateCcw size={13} />
                                  )}
                                  <span>Verify now</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px]">{tx.gateway_response || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Manual Grant Box */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Manual Tier Grant / Override</h3>
              <form onSubmit={handleGrantTier} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  placeholder="Paste User ID (UUID)..."
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                />
                <select
                  value={grantTier}
                  onChange={(e: any) => setGrantTier(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                >
                  <option value="plus">Grant Plus Plan</option>
                  <option value="studio">Grant Studio Plan</option>
                  <option value="free">Revoke to Free Tier</option>
                </select>
                <button
                  type="submit"
                  disabled={isGranting || !grantUserId.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isGranting ? 'Updating...' : 'Execute Change'}
                </button>
              </form>
            </div>

            {/* Subscriptions Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Subscriptions Records</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {subsList.map((s: any) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-semibold uppercase">{s.plan_tier}</td>
                        <td className="px-4 py-3">{s.payment_provider || 'paystack'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            s.status === 'active' || s.status === 'manual_active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">₦{(s.amount_paid || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-400">{new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CIRCLES */}
        {!isDataLoading && activeTab === 'circles' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Circle Name</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Members</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {circlesList.map((c: any) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-semibold">{c.name}</td>
                      <td className="px-4 py-3 font-mono">{c.course}</td>
                      <td className="px-4 py-3 uppercase text-[10px]">{c.type || 'private'}</td>
                      <td className="px-4 py-3">{c.member_count || 1}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CREDITS */}
        {!isDataLoading && activeTab === 'credits' && (
          <div className="space-y-6">
            {creditsFeedback && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  creditsFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                }`}
              >
                {creditsFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{creditsFeedback.message}</span>
              </div>
            )}

            {/* Lookup User Credits */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Look up Student AI Credits</h3>
              <form onSubmit={(e) => handleLookupCredits(e)} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  placeholder="Enter student email or User ID (UUID)..."
                  value={creditsSearchUser}
                  onChange={(e) => setCreditsSearchUser(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer"
                >
                  Check Balance
                </button>
              </form>

              {creditsUserInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Student</p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{creditsUserInfo.email}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{creditsUserInfo.tier} plan</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Monthly Allowance</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{creditsUserInfo.allowance}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Net Used This Period</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{creditsUserInfo.used}</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                    <p className="text-[10px] font-bold uppercase text-blue-600">Credits Remaining</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{creditsUserInfo.balance}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Adjust Credits Form */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Grant or Deduct AI Credits</h3>
              <p className="text-xs text-slate-500">Use a positive number (e.g. +20) to grant bonus credits, or a negative number (e.g. -5) to deduct credits.</p>
              <form onSubmit={handleAdjustCredits} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Student email or UUID..."
                  value={creditsSearchUser}
                  onChange={(e) => setCreditsSearchUser(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                />
                <input
                  type="number"
                  required
                  value={creditsDelta}
                  onChange={(e) => setCreditsDelta(Number(e.target.value))}
                  placeholder="Credits delta (e.g. 20 or -5)"
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                />
                <input
                  type="text"
                  required
                  value={creditsReason}
                  onChange={(e) => setCreditsReason(e.target.value)}
                  placeholder="Reason for audit log..."
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs outline-none min-h-[44px]"
                />
                <button
                  type="submit"
                  disabled={isAdjustingCredits || !creditsSearchUser.trim() || !creditsDelta}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] disabled:opacity-50 cursor-pointer"
                >
                  {isAdjustingCredits ? 'Applying...' : 'Apply Credit Change'}
                </button>
              </form>
            </div>

            {/* Recent Credit Ledger Entries */}
            {creditsLedger.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent AI Credit Ledger Activity</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Delta</th>
                        <th className="px-4 py-3">Request ID</th>
                        <th className="px-4 py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {creditsLedger.map((entry: any) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 font-semibold">{entry.action}</td>
                          <td className={`px-4 py-3 font-bold ${Number(entry.delta) > 0 ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {Number(entry.delta) > 0 ? `+${entry.delta}` : entry.delta}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{entry.request_id || '—'}</td>
                          <td className="px-4 py-3 text-slate-400">{new Date(entry.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: AUDIT LOG */}
        {!isDataLoading && activeTab === 'audit' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Administrator</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((l: any) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{l.action}</td>
                      <td className="px-4 py-3">{l.admin_email}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-[11px] truncate max-w-xs">
                        {JSON.stringify(l.details || {})}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono">{l.ip_address || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApp;
