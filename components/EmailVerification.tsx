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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isVerifyingRef = useRef(false);

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
        const msg = verifyError.message.toLowerCase();
        if (msg.includes('expired') || msg.includes('invalid') || msg.includes('token has expired') || msg.includes('bad code')) {
          setError('The 6-digit code entered is incorrect or has expired. Please check your email or request a new code.');
        } else if (verifyError.status === 429 || msg.includes('rate') || msg.includes('too many')) {
          setError('Too many verification attempts. Please wait a moment before trying again.');
        } else {
          setError(verifyError.message || 'Verification failed. Please check the code and try again.');
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
  }, [email, onVerified]);

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans text-slate-900">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-slate-900 text-white rounded-xl shadow-xs mb-3">
            <KorsIQLogo variant="icon" size={40} onDark />
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight mb-1">Verify Your Email</h1>
          <p className="text-slate-400 font-semibold text-xs">6-Digit Security Token</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-md p-6 sm:p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto ring-4 ring-blue-50">
            <Mail size={24} />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-serif font-bold text-slate-900">Enter Verification Code</h2>
            <p className="text-xs text-slate-500 font-normal leading-relaxed">
              We sent a 6-digit confirmation code to{' '}
              <span className="font-semibold text-slate-900 break-all">{email}</span>. Enter it below to activate your KorsIQ account.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-left"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-rose-700 leading-snug">{error}</p>
            </motion.div>
          )}

          {message && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-left"
            >
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-emerald-800 leading-snug">{message}</p>
            </motion.div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-4 pt-1">
            {/* 6 Separate Digit Input Boxes */}
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
                      ? 'border-blue-600 bg-blue-50/20 text-slate-900 ring-2 ring-blue-100'
                      : 'border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                  }`}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isVerifying || !isComplete}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Token...</span>
                </div>
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
              className="w-full h-10 bg-slate-50 hover:bg-slate-100 disabled:opacity-60 border border-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isResending ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <RefreshCw size={12} className={cooldown === 0 ? 'text-blue-600' : ''} />
                  <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend 6-Digit Code'}</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-1 cursor-pointer"
            >
              <ArrowLeft size={12} />
              <span>Use a different email or sign in</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default EmailVerification;
