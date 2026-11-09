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

  // Dashboard active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'subscriptions' | 'circles' | 'audit'>('overview');

  // Dashboard data states
  const [overviewData, setOverviewData] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [subsList, setSubsList] = useState<any[]>([]);
  const [circlesList, setCirclesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Manual grant modal
  const [grantUserId, setGrantUserId] = useState('');
  const [grantTier, setGrantTier] = useState<'plus' | 'studio' | 'free'>('plus');
  const [isGranting, setIsGranting] = useState(false);

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
        } else if (activeTab === 'subscriptions') {
          const res = await adminFetch('/api/admin/subscriptions');
          if (res.success) setSubsList(res.subscriptions);
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
  }, [adminSession, activeTab, userSearch]);

  // Handle Manual Tier Grant
  const handleGrantTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId) return;
    setIsGranting(true);
    try {
      const res = await adminFetch('/api/admin/subscriptions/grant-tier', {
        method: 'POST',
        body: JSON.stringify({ userId: grantUserId, targetTier: grantTier })
      });
      if (res.success) {
        alert(res.message);
        setGrantUserId('');
        // refresh users and subscriptions
        const updatedUsers = await adminFetch('/api/admin/users');
        if (updatedUsers.success) setUsersList(updatedUsers.users);
      } else {
        alert(res.error || 'Failed to grant tier.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error executing grant.');
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
        {/* Navigation Tabs */}
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
            onClick={() => setActiveTab('subscriptions')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'subscriptions' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <CreditCard size={15} />
            <span>Subscriptions &amp; Paystack</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Registered Users</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{overviewData.totalUsers}</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Paid Subscriptions</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overviewData.activeSubscriptions}</p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Revenue This Month</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  ₦{(overviewData.monthRevenue || 0).toLocaleString()}
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Study Circles</p>
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
                          <button
                            onClick={() => {
                              setGrantUserId(u.id);
                              setGrantTier(u.tier === 'studio' ? 'free' : 'plus');
                            }}
                            className="text-blue-600 dark:text-blue-400 font-semibold hover:underline min-h-[44px] flex items-center cursor-pointer"
                          >
                            Manage Tier
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUBSCRIPTIONS */}
        {!isDataLoading && activeTab === 'subscriptions' && (
          <div className="space-y-6">
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
                            s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
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

        {/* TAB 5: AUDIT LOG */}
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
