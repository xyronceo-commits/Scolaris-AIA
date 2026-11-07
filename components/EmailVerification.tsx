import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowRight, RefreshCw, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import KorsIQLogo from './KorsIQLogo';

interface EmailVerificationProps {
  email: string;
  /** Called after the OTP is accepted. The auth listener in App picks up the new session. */
  onVerified: () => void;
  onBack: () => void;
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export const EmailVerification: React.FC<EmailVerificationProps> = ({ email, onVerified, onBack }) => {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isVerifyingRef = useRef(false);

  // Format countdown like 0:42 per spec
  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${remSecs.toString().padStart(2, '0')}`;
  };

  // Focus the first input field on initial render
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) clearInterval(timer);
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const verifyToken = useCallback(async (token: string) => {
    if (isVerifyingRef.current) return;
    if (token.length !== OTP_LENGTH) {
      setError(`Please enter all ${OTP_LENGTH} digits of your verification code.`);
      return;
    }

    if (failedAttempts >= 3) {
      setError('Too many attempts. Wait 5 minutes before trying again.');
      return;
    }

    isVerifyingRef.current = true;
    setIsVerifying(true);
    setError(null);
    setMessage(null);

    try {
      // 1. Primary signup verification
      let { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      // 2. Fallback to 'email' otp type if signup type is rejected due to session status
      if (verifyError) {
        const errMsg = verifyError.message.toLowerCase();
        if (errMsg.includes('type') || errMsg.includes('token_type') || verifyError.status === 400) {
          const fallback = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email'
          });
          if (!fallback.error) {
            verifyError = null;
          }
        }
      }

      if (verifyError) {
        setFailedAttempts((prev) => prev + 1);
        const msg = verifyError.message.toLowerCase();
        if (failedAttempts + 1 >= 3) {
          setError('Too many attempts. Wait 5 minutes before trying again.');
        } else if (msg.includes('expired') || msg.includes('token has expired')) {
          setError('That code has expired. We sent a new one.');
          supabase.auth.resend({ type: 'signup', email }).catch(() => {});
        } else {
          setError("That code didn't match. Try again.");
        }
        return;
      }

      // Verification successful! Trigger callback
      onVerified();
    } catch (err: any) {
      console.error('OTP verification request failed:', err);
      setError('Unable to verify the code right now. Please check your internet connection and try again.');
    } finally {
      setIsVerifying(false);
      isVerifyingRef.current = false;
    }
  }, [email, failedAttempts, onVerified]);

  const handleInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const sanitized = rawVal.replace(/\D/g, '');

    if (!sanitized) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const newDigits = [...digits];
    // If user typed multiple characters or browser autofilled into single input
    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, OTP_LENGTH).split('');
      for (let i = 0; i < OTP_LENGTH; i++) {
        if (chars[i]) newDigits[i] = chars[i];
      }
      setDigits(newDigits);
      const nextFocus = Math.min(chars.length, OTP_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();

      const fullToken = newDigits.join('');
      if (fullToken.length === OTP_LENGTH) {
        verifyToken(fullToken);
      }
      return;
    }

    newDigits[index] = sanitized;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input position
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all six positions are filled
    const fullToken = newDigits.join('');
    if (fullToken.length === OTP_LENGTH) {
      verifyToken(fullToken);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // Clear current position
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      } else if (index > 0) {
        // Move to previous position and clear it
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!paste) return;

    const newDigits = [...digits];
    for (let i = 0; i < OTP_LENGTH; i++) {
      newDigits[i] = paste[i] || '';
    }
    setDigits(newDigits);
    setError(null);

    if (paste.length === OTP_LENGTH) {
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      verifyToken(paste);
    } else {
      inputRefs.current[paste.length]?.focus();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyToken(digits.join(''));
  };

  const handleResend = async () => {
    if (isResending || cooldown > 0) return;
    setError(null);
    setMessage(null);
    setIsResending(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (resendError) {
        if (resendError.status === 429) {
          setError('Too many requests. Please wait a moment before requesting another code.');
        } else {
          setError(resendError.message || 'Failed to resend code. Please try again.');
        }
        return;
      }

      setMessage(`A fresh 6-digit code has been sent to ${email}.`);
      setDigits(Array(OTP_LENGTH).fill(''));
      setCooldown(RESEND_COOLDOWN_SECONDS);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      console.error('Resend OTP error:', err);
      setError('Unable to send a new code. Please check your network and try again.');
    } finally {
      setIsResending(false);
    }
  };

  const isComplete = digits.every((d) => d.length === 1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 relative font-sans text-[#111827] dark:text-white">
      {/* KorsIQ Logo top left per Spec */}
      <div className="absolute top-6 left-6">
        <KorsIQLogo size={28} />
      </div>

      <div className="max-w-md w-full space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-sm p-6 sm:p-8 text-center space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-[#111827] dark:text-white">Verify your email</h1>
            <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed">
              We sent a 6-digit code to <strong className="text-[#111827] dark:text-white break-all">{email}</strong>.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-left">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-rose-700 leading-snug">{error}</p>
            </div>
          )}

          {message && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-left">
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-emerald-800 leading-snug">{message}</p>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-4 pt-1">
            {/* Six single-digit input boxes */}
            <div className="flex items-center justify-center gap-2 sm:gap-2.5">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isVerifying}
                  onChange={(e) => handleInputChange(idx, e)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  aria-label={`Digit ${idx + 1}`}
                  className={`w-10 h-12 sm:w-11 sm:h-12 text-center text-xl font-bold font-mono rounded-lg border outline-none transition-all ${
                    digit
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#111827] ring-2 ring-[#2563EB]/20'
                      : 'border-[#E5E7EB] bg-white text-[#111827] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20'
                  }`}
                />
              ))}
            </div>

            {/* Single Primary Action Button per Spec */}
            <button
              type="submit"
              disabled={isVerifying || !isComplete}
              className="w-full h-11 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed min-h-[44px]"
            >
              {isVerifying ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <>
                  <span>Verify and continue</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {/* Resend: Resend code in 0:42 / Resend code */}
            <div className="flex items-center justify-center min-h-[36px]">
              {cooldown > 0 ? (
                <span className="text-xs text-[#5B6472]">
                  Resend code in {formatCountdown(cooldown)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer min-h-[44px] flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={isResending ? 'animate-spin' : ''} />
                  <span>{isResending ? 'Sending...' : 'Resend code'}</span>
                </button>
              )}
            </div>
          </form>

          {/* Back: Use a different email */}
          <div className="pt-2 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B6472] hover:text-[#111827] dark:hover:text-white transition-colors min-h-[44px] cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Use a different email</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
