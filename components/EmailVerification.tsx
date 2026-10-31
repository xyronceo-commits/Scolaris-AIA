import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowRight, RefreshCw, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ScolarisLogo from './ScolarisLogo';

interface EmailVerificationProps {
  email: string;
  /** Called after the OTP is accepted. The auth listener in App picks up the new session. */
  onVerified: () => void;
  onBack: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export const EmailVerification: React.FC<EmailVerificationProps> = ({ email, onVerified, onBack }) => {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const token = code.replace(/\s+/g, '');
    if (token.length < 6) {
      setError('Enter the full code from your email.');
      return;
    }

    setIsVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
      if (verifyError) {
        const msg = verifyError.message.toLowerCase();
        if (msg.includes('expired') || msg.includes('invalid')) {
          setError('That code is incorrect or has expired. Check the code or request a new one.');
        } else {
          setError(verifyError.message);
        }
        return;
      }
      onVerified();
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setError('Unable to verify the code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setMessage(null);
    setIsResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
      if (resendError) {
        setError(
          resendError.status === 429
            ? 'Too many requests. Please wait a moment before requesting another code.'
            : resendError.message
        );
        return;
      }
      setMessage(`A new code has been sent to ${email}.`);
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      console.error('Resend OTP error:', err);
      setError("We couldn't send a new code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/30 blur-[120px] rounded-full" />
      </div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3.5 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 mb-4">
            <ScolarisLogo variant="icon" size={32} colorClass="text-white" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-950 tracking-tight italic mb-1">Verify Your Email</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">Scolaris Academic Security</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/30 p-6 md:p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-indigo-50/50">
            <Mail size={30} />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-serif font-bold text-slate-900">Enter Your Code</h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              We sent a verification code to <span className="font-bold text-slate-900">{email}</span>. Enter it below to activate your Scolaris account.
            </p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-left">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-rose-700 leading-snug">{error}</p>
            </motion.div>
          )}

          {message && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-2.5 text-left">
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-emerald-800 leading-snug">{message}</p>
            </motion.div>
          )}

          <form onSubmit={handleVerify} className="space-y-3 pt-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9\s]/g, ''))}
              placeholder="123456"
              className="w-full h-14 bg-slate-50 border border-slate-200/85 rounded-xl px-4 text-center text-2xl font-bold tracking-[0.4em] outline-none text-slate-800 transition-all duration-200 placeholder-slate-300 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
            />

            <button
              type="submit"
              disabled={isVerifying || code.replace(/\s+/g, '').length < 6}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Verify &amp; Continue</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="w-full h-11 bg-slate-50 hover:bg-slate-100 disabled:opacity-60 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              {isResending ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw size={12} />
                  <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors py-1"
            >
              <ArrowLeft size={12} />
              <span>Use a different email</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default EmailVerification;
