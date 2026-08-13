import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowRight, RefreshCw, LogOut, Check, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { sendEmailVerification } from 'firebase/auth';

interface EmailVerificationProps {
  userEmail: string;
  onVerified: () => void;
  onSignOut: () => void;
}

export const EmailVerification: React.FC<EmailVerificationProps> = ({
  userEmail,
  onVerified,
  onSignOut
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleCheckVerification = async () => {
    setIsChecking(true);
    setError(null);
    setMessage(null);

    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          onVerified();
        } else {
          setError("Your email hasn't been verified yet. Please check your inbox and try again.");
        }
      } else {
        setError("Session expired. Please sign in again.");
        onSignOut();
      }
    } catch (err: any) {
      console.error('Verification check error:', err);
      setError('Unable to confirm verification state. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    setError(null);
    setMessage(null);

    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setMessage(`A fresh verification email has been sent to ${userEmail}. Please check your inbox.`);
      } else {
        setError("Session expired. Please sign in again.");
      }
    } catch (err: any) {
      console.error('Resend verification error:', err);
      if (err.code === 'auth/too-many-requests') {
        setError('We couldn\'t send the verification email due to too many requests. Please wait a moment and try again.');
      } else {
        setError('We couldn\'t send the verification email. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/30 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 mb-4 hover:scale-105 transition-transform duration-300">
            <div className="font-serif font-black text-xl italic">S</div>
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">
            Verify Your Email
          </h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
            Scolaris Academic Security
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/30 p-6 md:p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-indigo-50/50">
            <Mail size={30} />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-serif font-bold text-slate-900">Check Your Inbox</h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              We've sent a verification link to <span className="font-bold text-slate-900">{userEmail}</span>. Check your inbox and click the link to verify your Scolaris account.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-left"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-700 leading-snug">
                {error}
              </p>
            </motion.div>
          )}

          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-2.5 text-left"
            >
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-emerald-800 leading-snug">
                {message}
              </p>
            </motion.div>
          )}

          <div className="space-y-3 pt-2">
            <button
              onClick={handleCheckVerification}
              disabled={isChecking}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isChecking ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>I've verified my email</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <button
              onClick={handleResendVerification}
              disabled={isResending}
              className="w-full h-11 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              {isResending ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw size={12} />
                  <span>Resend verification email</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors py-1"
            >
              <LogOut size={12} />
              <span>Sign in with a different email</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
