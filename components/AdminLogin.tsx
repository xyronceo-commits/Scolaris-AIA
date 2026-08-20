import React, { useState } from 'react';
import { Shield, Lock, Mail, ArrowLeft, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import ScolarisLogo from './ScolarisLogo';

interface AdminLoginProps {
  onLoginSuccess: (adminToken: string, user: { uid?: string; email: string; role: string }) => void;
  onBackToStudentPortal: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  onBackToStudentPortal,
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Incorrect administrator password.');
      }

      // If customToken returned, sign in with Firebase Auth for rules evaluation
      if (data.customToken) {
        try {
          await signInWithCustomToken(auth, data.customToken);
        } catch (fbErr) {
          console.warn('Firebase Custom Token sign-in warning:', fbErr);
        }
      }

      // Store session token in sessionStorage for administrator session lifecycle
      sessionStorage.setItem('scolaris_admin_token', data.adminToken);
      sessionStorage.setItem('scolaris_admin_user', JSON.stringify(data.user));

      onLoginSuccess(data.adminToken, data.user);
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 bg-slate-900/95 rounded-3xl my-4 text-white relative overflow-hidden shadow-2xl border border-slate-800">
      {/* Background Subtle Gradient Highlights */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-8 p-6 sm:p-10">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-slate-800 text-white border border-slate-700 shadow-lg mb-2">
            <ScolarisLogo variant="icon" size={36} colorClass="text-indigo-400" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-white tracking-tight">
            Scolaris AI Admin
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
            Secure Administrator Portal
          </p>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs font-medium flex items-center gap-3 animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Admin Key / Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full pl-10 pr-4 py-3.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg hover:shadow-blue-600/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating Admin...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Access Admin Console</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Navigation */}
        <div className="pt-4 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={onBackToStudentPortal}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
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
