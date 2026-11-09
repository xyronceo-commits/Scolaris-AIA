import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  ShieldCheck, 
  AlertCircle, 
  Clock, 
  ArrowRight, 
  Lock,
  ExternalLink,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { UserProfile, SubscriptionPlanType } from '../types';
import { getAccessToken, getCurrentUserId } from '../lib/supabase';
import { BETA_PLAN_LIMITS } from '../constants';

interface SubscriptionCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: 'plus' | 'studio';
  currentProfile: UserProfile;
  onSubscriptionUpdated: (updatedProfile: UserProfile) => void;
}

export const SubscriptionCheckoutModal: React.FC<SubscriptionCheckoutModalProps> = ({
  isOpen,
  onClose,
  initialPlan = 'plus',
  currentProfile,
  onSubscriptionUpdated
}) => {
  const [selectedPlan, setSelectedPlan] = useState<'plus' | 'studio'>(initialPlan);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'confirm' | 'status'>('select');
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    description: string;
  } | null>(null);

  const uid = getCurrentUserId() || (currentProfile as any)?.id || '';
  const pendingRefStorageKey = uid ? `scolaris_pending_payment_ref_${uid}` : '';
  const pendingPlanStorageKey = uid ? `scolaris_pending_payment_plan_${uid}` : '';

  useEffect(() => {
    setSelectedPlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    if (!isOpen || !pendingRefStorageKey) return;
    try {
      const savedRef = localStorage.getItem(pendingRefStorageKey);
      if (savedRef && !paymentRef) {
        setPaymentRef(savedRef);
      }
    } catch {}
  }, [isOpen, pendingRefStorageKey]);

  if (!isOpen) return null;

  const planInfo = selectedPlan === 'studio' ? BETA_PLAN_LIMITS.studio : BETA_PLAN_LIMITS.plus;

  const getHeaders = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  // Step 1: Initialize transaction with backend FIRST (inserts payment_transactions row), then redirect to Paystack
  const handleInitiatePayment = async () => {
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/subscription/initialize', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan: selectedPlan })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.reference) {
        setStatusMessage({
          type: 'error',
          title: 'Could Not Start Checkout',
          description: data.error || 'Failed to initialize payment session with Paystack. Please try again.'
        });
        setStep('status');
        return;
      }

      setPaymentRef(data.reference);
      try {
        if (pendingRefStorageKey) localStorage.setItem(pendingRefStorageKey, data.reference);
        if (pendingPlanStorageKey) localStorage.setItem(pendingPlanStorageKey, selectedPlan);
      } catch {}

      if (data.authorizationUrl) {
        setAuthUrl(data.authorizationUrl);
        // Navigate to Paystack checkout URL so Paystack redirects back to our callback_url (?payment=return&reference=...)
        window.location.href = data.authorizationUrl;
        return;
      }

      setStep('confirm');
    } catch (err: any) {
      console.error('Payment initialization error:', err);
      setStatusMessage({
        type: 'error',
        title: 'Connection Error',
        description: err?.message || 'Could not reach the payment server. Please check your connection and try again.'
      });
      setStep('status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Verify payment on backend securely
  const handleVerifyPayment = async (overrideRef?: string) => {
    setIsProcessing(true);
    setStatusMessage(null);

    const ref = (overrideRef !== undefined ? overrideRef : (paymentRef || '')).trim();

    try {
      const headers = await getHeaders();
      const res = await fetch('/api/subscription/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reference: ref || undefined,
          email: currentProfile?.email,
          plan: selectedPlan
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        // Payment failed, pending, or underpaid
        const reason = data.status || 'unverified';
        setStatusMessage({
          type: reason === 'pending' ? 'warning' : 'error',
          title: reason === 'pending' ? 'Payment Pending' : 'Payment Not Verified',
          description: data.error || data.message || 'Payment could not be verified yet. If you recently paid on Paystack, please paste your Transaction Reference from your Paystack receipt/email and retry.'
        });
        setStep('status');
        return;
      }

      try {
        if (pendingRefStorageKey) localStorage.removeItem(pendingRefStorageKey);
        if (pendingPlanStorageKey) localStorage.removeItem(pendingPlanStorageKey);
      } catch {}

      // Successful verified payment!
      const updatedProfile: UserProfile = {
        ...currentProfile,
        tier: data.tier || selectedPlan,
        isPro: true,
        subscriptionTier: data.tier || selectedPlan,
        subscriptionStatus: 'active',
        paymentStatus: 'paid',
        subscriptionEnd: data.currentPeriodEnd || ''
      };

      onSubscriptionUpdated(updatedProfile);

      setStatusMessage({
        type: 'success',
        title: 'Subscription Activated!',
        description: `Your account is now upgraded to ${data.tier === 'studio' ? 'KorsIQ Premium' : 'KorsIQ Plus'}. All features and limits are unlocked!`
      });
      setStep('status');
    } catch (err: any) {
      console.error('Verification error:', err);
      setStatusMessage({
        type: 'error',
        title: 'Verification Error',
        description: err.message || 'Unable to connect to verification service. Please check your network and retry.'
      });
      setStep('status');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-left my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB]">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111827] dark:text-white">
                {step === 'select' ? 'Choose Your Subscription' : step === 'confirm' ? 'Verify Payment' : 'Subscription Status'}
              </h2>
              <p className="text-[11px] text-[#5B6472] dark:text-slate-400">
                Official KorsIQ Academic Upgrade
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[#5B6472] hover:text-[#111827] dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* STEP 1: Plan Selection */}
        {step === 'select' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Plus Option */}
              <button
                type="button"
                onClick={() => setSelectedPlan('plus')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] ${
                  selectedPlan === 'plus'
                    ? 'border-[#2563EB] bg-[#EFF6FF]/60 dark:bg-blue-950/30 ring-2 ring-[#2563EB]/20'
                    : 'border-[#E5E7EB] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#111827] dark:text-white">Plus</span>
                    {selectedPlan === 'plus' && <Check size={14} className="text-[#2563EB]" />}
                  </div>
                  <p className="text-[11px] text-[#5B6472] dark:text-slate-400 mt-1">Study smarter. AI edge.</p>
                </div>
                <div className="pt-3">
                  <span className="text-base font-bold text-[#111827] dark:text-white">₦7,500</span>
                  <span className="text-[10px] text-[#5B6472]"> / month</span>
                </div>
              </button>

              {/* Studio Option */}
              <button
                type="button"
                onClick={() => setSelectedPlan('studio')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-h-[140px] relative ${
                  selectedPlan === 'studio'
                    ? 'border-[#2563EB] bg-[#EFF6FF]/60 dark:bg-blue-950/30 ring-2 ring-[#2563EB]/20'
                    : 'border-[#E5E7EB] dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="absolute -top-2 right-3 px-1.5 py-0.2 bg-[#2563EB] text-white text-[9px] font-bold rounded">
                  Recommended
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#111827] dark:text-white">KorsIQ Premium</span>
                    {selectedPlan === 'studio' && <Check size={14} className="text-[#2563EB]" />}
                  </div>
                  <p className="text-[11px] text-[#5B6472] dark:text-slate-400 mt-1">Full research &amp; writing suite.</p>
                </div>
                <div className="pt-3">
                  <span className="text-base font-bold text-[#111827] dark:text-white">₦15,000</span>
                  <span className="text-[10px] text-[#5B6472]"> / month</span>
                </div>
              </button>
            </div>

            {/* Plan Highlights */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2 border border-[#E5E7EB] dark:border-slate-800">
              <span className="text-[11px] font-bold text-[#111827] dark:text-white uppercase tracking-wider block">
                {selectedPlan === 'studio' ? 'KorsIQ Premium Package Includes' : 'Plus Package Includes'}
              </span>
              <ul className="space-y-1.5 text-xs text-[#5B6472] dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <Check size={13} className="text-[#2563EB] shrink-0" />
                  <span>{selectedPlan === 'studio' ? 'Full Academic Studio workspace with real citations' : 'Lite Studio & AI study assistants'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={13} className="text-[#2563EB] shrink-0" />
                  <span>{selectedPlan === 'studio' ? 'Word (.docx) & PDF manuscript direct export' : 'Scenario CGPA projections & unlimited courses'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={13} className="text-[#2563EB] shrink-0" />
                  <span>{selectedPlan === 'studio' ? '10 GB cloud storage & 200 monthly AI credits' : '2 GB cloud storage & 150 monthly AI credits'}</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#5B6472] dark:text-slate-400 pt-1">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>Payments processed securely in Nigerian Naira (NGN).</span>
            </div>

            {/* Action Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleInitiatePayment}
              className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs min-h-[44px] transition-colors"
            >
              <Lock size={13} />
              <span>{isProcessing ? 'Connecting...' : `Proceed to Pay ${planInfo.price}`}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* STEP 2: Confirm & Verify Payment */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-[#2563EB] tracking-wider">
                  Payment Verification
                </span>
                <span className="text-[11px] font-bold text-[#111827] dark:text-white uppercase">
                  {selectedPlan === 'studio' ? 'KorsIQ Premium (₦15,000)' : 'Plus (₦7,500)'}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[#5B6472] dark:text-slate-300 block mb-1">
                  Paystack Reference / Transaction ID:
                </label>
                <input
                  type="text"
                  value={paymentRef || ''}
                  onChange={(e) => setPaymentRef(e.target.value.trim())}
                  placeholder="Paste reference from Paystack receipt or email"
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-md text-[#111827] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <p className="text-[11px] text-[#5B6472] dark:text-slate-400">
                Account email: <strong className="text-[#111827] dark:text-white">{currentProfile?.email}</strong>
              </p>
            </div>

            <a
              href={authUrl || (selectedPlan === 'studio' ? 'https://paystack.shop/pay/asaup43dpk' : 'https://paystack.shop/pay/c-mcwwacc8')}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[#111827] dark:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
            >
              <span>Open Paystack Payment Gateway</span>
              <ExternalLink size={13} />
            </a>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleVerifyPayment()}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[44px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Verifying with Paystack gateway...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Verify Successful Payment</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleVerifyPayment('')}
                className="w-full py-2 text-xs font-semibold text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
              >
                Don't have reference? Check by Account Email
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep('select')}
              className="w-full py-2 text-xs font-semibold text-[#5B6472] hover:text-[#111827] cursor-pointer"
            >
              Choose different plan
            </button>
          </div>
        )}

        {/* STEP 3: Status Result */}
        {step === 'status' && statusMessage && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border space-y-1.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                  : statusMessage.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' ? (
                  <Check size={18} className="text-emerald-600 dark:text-emerald-400" />
                ) : statusMessage.type === 'warning' ? (
                  <Clock size={18} className="text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertCircle size={18} className="text-rose-600 dark:text-rose-400" />
                )}
                <h3 className="font-bold text-sm">{statusMessage.title}</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-90">{statusMessage.description}</p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs min-h-[44px]"
                >
                  Start Using {selectedPlan === 'studio' ? 'Academic Studio' : 'Plus'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setStep('confirm')}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[#111827] dark:text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={13} />
                    <span>Try Again</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#111827] dark:text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px]"
                  >
                    Stay on Free
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SubscriptionCheckoutModal;
