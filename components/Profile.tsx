import React, { useState, useEffect } from 'react';
import { UserProfile, UserFile } from '../types';
import { ICONS, BETA_PLAN_LIMITS } from '../constants';
import { UserAvatar, AVATAR_OPTIONS } from './UserAvatar';
import { DBService } from '../services/db';
import { getCurrentUserId, getAccessToken, supabase } from '../lib/supabase';
import { 
  ArrowRight, 
  ArrowLeft,
  LogOut, 
  Cpu, 
  X, 
  Check, 
  AlertCircle,
  HardDrive,
  CreditCard,
  Crown,
  Bell
} from 'lucide-react';
import UniversitySelector from './UniversitySelector';
import SubscriptionCheckoutModal from './SubscriptionCheckoutModal';

interface ProfileProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onSignOut: () => void;
  onDelete: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ profile, setProfile, onSignOut, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'identity' | 'account'>('plan');
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showAvailableSoon, setShowAvailableSoon] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'plus' | 'studio'>('plus');
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [aiCreditsUsed, setAiCreditsUsed] = useState<number>(0);
  const [aiPeriodEnd, setAiPeriodEnd] = useState<string>(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  });

  // Manual Paystack receipt verification state
  const currentUid = getCurrentUserId() || (profile as any)?.id || '';
  const pendingRefKey = currentUid ? `scolaris_pending_payment_ref_${currentUid}` : '';
  const [receiptRefInput, setReceiptRefInput] = useState<string>(() => {
    try {
      return pendingRefKey ? (localStorage.getItem(pendingRefKey) || '') : '';
    } catch {
      return '';
    }
  });
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [receiptVerifyFeedback, setReceiptVerifyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleManualReceiptVerify = async (e?: React.FormEvent, useEmailLookup = false) => {
    if (e) e.preventDefault();
    const refToVerify = useEmailLookup ? '' : receiptRefInput.trim();
    if (!useEmailLookup && !refToVerify) {
      setReceiptVerifyFeedback({
        type: 'error',
        message: 'Paste your Paystack transaction reference from your email receipt.'
      });
      return;
    }

    setIsVerifyingReceipt(true);
    setReceiptVerifyFeedback(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/subscription/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          reference: refToVerify || undefined,
          email: profile.email
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setReceiptVerifyFeedback({
          type: 'error',
          message: data.error || data.message || 'Could not verify that payment reference. Check the reference on your Paystack receipt and try again.'
        });
        return;
      }

      try {
        if (pendingRefKey) localStorage.removeItem(pendingRefKey);
      } catch {}

      const updatedProfile: UserProfile = {
        ...profile,
        tier: data.tier || 'plus',
        isPro: true,
        subscriptionTier: data.tier || 'plus',
        subscriptionStatus: 'active',
        paymentStatus: 'paid',
        subscriptionEnd: data.currentPeriodEnd || profile.subscriptionEnd || ''
      };
      setProfile(updatedProfile);
      setEditedProfile(updatedProfile);
      setReceiptRefInput('');
      setReceiptVerifyFeedback({
        type: 'success',
        message: data.message || `Payment verified! Your plan is now ${data.tier === 'studio' ? 'KorsIQ Premium' : 'KorsIQ Plus'}.`
      });
    } catch (err: any) {
      setReceiptVerifyFeedback({
        type: 'error',
        message: err?.message || 'Unable to connect to verification server. Please try again.'
      });
    } finally {
      setIsVerifyingReceipt(false);
    }
  };

  useEffect(() => {
    setEditedProfile(profile);
  }, [profile]);

  useEffect(() => {
    const uid = getCurrentUserId() || profile.email;
    DBService.getUserFiles(uid)
      .then((files) => {
        setUserFiles(files);
      })
      .catch((err) => {
        console.error('Error fetching user files for storage calculation:', err);
      })
      .finally(() => {
        setIsLoadingFiles(false);
      });

    // Fetch real AI credit usage for the current billing period
    const loadAiCreditsUsage = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/usage/ai-credits', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.used === 'number') setAiCreditsUsed(data.used);
          if (data.periodEnd) setAiPeriodEnd(data.periodEnd);
          return;
        }
      } catch {}

      // Direct RLS-backed Supabase fallback
      try {
        const authUid = getCurrentUserId();
        if (authUid) {
          const now = new Date();
          const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
          const { data } = await supabase
            .from('ai_usage')
            .select('credits')
            .eq('user_id', authUid)
            .gte('created_at', periodStart);
          if (Array.isArray(data)) {
            const sum = data.reduce((acc: number, row: any) => acc + (Number(row.credits) || 1), 0);
            setAiCreditsUsed(sum);
          }
        }
      } catch {}
    };

    loadAiCreditsUsage();
  }, [profile.email, profile.tier, profile.subscriptionTier]);

  const handleSaveIdentity = async () => {
    setProfile(editedProfile);
    const uid = getCurrentUserId();
    if (uid) {
      await DBService.saveProfile(uid, editedProfile).catch(() => {});
    }
    setIsEditing(false);
  };

  const parseBytes = (fileSizeStr: string): number => {
    if (!fileSizeStr) return 0;
    const match = fileSizeStr.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    if (!match) {
      const raw = parseFloat(fileSizeStr);
      return isNaN(raw) ? 0 : raw;
    }
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return val * 1024 * 1024 * 1024;
    if (unit === 'MB') return val * 1024 * 1024;
    if (unit === 'KB') return val * 1024;
    return val;
  };

  // Real Storage Calculation
  const totalStorageBytes = userFiles.reduce((acc, f) => acc + parseBytes(f.fileSize), 0);
  const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(1);

  // Uploads this month
  const now = new Date();
  const uploadsThisMonth = userFiles.filter(f => {
    const d = new Date(f.uploadedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Plan limits mapping with full plus, studio, scholar, sage support
  const rawTier = (profile.subscriptionTier || profile.tier || 'free').toLowerCase();
  const planKey = (rawTier === 'studio' || rawTier === 'sage') 
    ? 'studio' 
    : (rawTier === 'plus' || rawTier === 'scholar') 
    ? 'plus' 
    : 'free';
  const currentPlan = BETA_PLAN_LIMITS[planKey] || BETA_PLAN_LIMITS.free;
  const storageLimitMB = (currentPlan.storageLimitBytes / (1024 * 1024)).toFixed(0);
  const storagePercent = Math.min(100, Math.round((totalStorageBytes / currentPlan.storageLimitBytes) * 100));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 max-w-4xl mx-auto font-sans text-[#111827] dark:text-white">
      {/* Top Header & Settings Tabs */}
      <div className="space-y-4 border-b border-[#E5E7EB] dark:border-slate-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#111827] dark:text-white">Settings</h1>
            <p className="text-xs text-[#5B6472]">Manage your plan, academic identity, and preferences</p>
          </div>

          {activeTab === 'identity' && (
            <button 
              type="button"
              onClick={() => isEditing ? handleSaveIdentity() : setIsEditing(true)}
              className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer min-h-[44px] ${
                isEditing 
                ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm' 
                : 'bg-white dark:bg-slate-800 text-[#111827] dark:text-white border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              {isEditing ? 'Save Changes' : 'Edit Profile'}
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg text-xs font-semibold max-w-md">
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`flex-1 py-2 px-3 rounded-md min-h-[36px] transition-colors cursor-pointer text-center ${
              activeTab === 'plan'
                ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                : 'text-[#5B6472] hover:text-[#111827] dark:hover:text-white'
            }`}
          >
            Plan and usage
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('identity')}
            className={`flex-1 py-2 px-3 rounded-md min-h-[36px] transition-colors cursor-pointer text-center ${
              activeTab === 'identity'
                ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                : 'text-[#5B6472] hover:text-[#111827] dark:hover:text-white'
            }`}
          >
            Academic identity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`flex-1 py-2 px-3 rounded-md min-h-[36px] transition-colors cursor-pointer text-center ${
              activeTab === 'account'
                ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                : 'text-[#5B6472] hover:text-[#111827] dark:hover:text-white'
            }`}
          >
            Account
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: Plan and Usage (Spec: Screen 6)                    */}
      {/* ========================================================= */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-[#111827] dark:text-white">Plan and usage</h2>
            <p className="text-xs text-[#5B6472]">Your plan, AI credits and storage</p>
          </div>

          {/* Desktop Two-Column / Mobile Stacked Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column (8 cols on desktop): Current Plan, Storage */}
            <div className="lg:col-span-8 space-y-4">
              {/* Current Plan Card */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] dark:border-slate-800">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-[#5B6472] uppercase tracking-wider">Current Plan</span>
                    <h3 className="text-lg font-bold text-[#111827] dark:text-white">{currentPlan.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPlansModal(true)}
                    className="px-3.5 py-2 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-[#111827] dark:text-white rounded-lg min-h-[44px] cursor-pointer"
                  >
                    Change plan
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">{currentPlan.price}</span>
                    {profile.isPro && profile.subscriptionEnd && (
                      <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                        Active · Renews {new Date(profile.subscriptionEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-[#5B6472] max-w-sm">
                    {currentPlan.tagline}
                  </p>
                </div>
              </div>

              {/* Storage Card */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive size={16} className="text-[#2563EB]" />
                    <h3 className="font-bold text-sm text-[#111827] dark:text-white">Storage</h3>
                  </div>
                  <span className="text-xs text-[#5B6472]">
                    {totalStorageMB} MB of {storageLimitMB} MB (beta)
                  </span>
                </div>

                {/* Storage Meter Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>

                <p className="text-xs text-[#5B6472]">
                  {uploadsThisMonth} upload{uploadsThisMonth === 1 ? '' : 's'} this month. Beta storage allowance.
                </p>
              </div>

              {/* AI Credits Card (Backed by real ai_usage metering) */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-[#2563EB]" />
                    <h3 className="font-bold text-sm text-[#111827] dark:text-white">AI credits</h3>
                  </div>
                  {currentPlan.aiCreditsAllowance > 0 ? (
                    <span className="text-xs text-[#5B6472]">
                      {aiCreditsUsed} of {currentPlan.aiCreditsAllowance} credits used this period
                    </span>
                  ) : (
                    <span className="text-xs text-[#5B6472]">Free plan</span>
                  )}
                </div>

                {currentPlan.aiCreditsAllowance > 0 ? (
                  <>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((aiCreditsUsed / currentPlan.aiCreditsAllowance) * 100))}%`
                        }}
                      />
                    </div>
                    <p className="text-xs text-[#5B6472]">
                      Resets on {new Date(aiPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-[#5B6472]">
                      AI credits are not included in Free.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPlansModal(true)}
                      className="px-3.5 py-2 border border-[#2563EB] text-[#2563EB] hover:bg-[#EFF6FF] dark:hover:bg-blue-950/40 rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer shrink-0"
                    >
                      Upgrade plan
                    </button>
                  </div>
                )}
              </div>

              {/* Have a receipt? Verify payment (Manual Recovery Box) */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[#2563EB]" />
                    <h3 className="font-bold text-sm text-[#111827] dark:text-white">Have a receipt? Verify payment</h3>
                  </div>
                </div>
                <p className="text-xs text-[#5B6472]">
                  Paid on Paystack and haven&apos;t seen your plan update? Paste the reference from your Paystack receipt below to verify and activate your subscription immediately.
                </p>
                <form onSubmit={(e) => handleManualReceiptVerify(e, false)} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={receiptRefInput}
                    onChange={(e) => setReceiptRefInput(e.target.value)}
                    placeholder="e.g. KQ_PLUS_... or Paystack reference"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-[#111827] dark:text-white min-h-[44px] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                  <button
                    type="submit"
                    disabled={isVerifyingReceipt}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer shrink-0 transition-colors"
                  >
                    {isVerifyingReceipt ? 'Verifying...' : 'Verify payment'}
                  </button>
                  <button
                    type="button"
                    disabled={isVerifyingReceipt}
                    onClick={() => handleManualReceiptVerify(undefined, true)}
                    className="px-3.5 py-2 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#111827] dark:text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer shrink-0 transition-colors"
                  >
                    Check by email
                  </button>
                </form>
                {receiptVerifyFeedback && (
                  <div
                    role="alert"
                    className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                      receiptVerifyFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {receiptVerifyFeedback.type === 'success' ? (
                      <Check size={15} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle size={15} className="text-rose-600 shrink-0" />
                    )}
                    <span>{receiptVerifyFeedback.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (4 cols on desktop): Quiet Upgrade Card */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between h-full">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-[#2563EB] uppercase tracking-wider">
                    Upgrade
                  </span>
                  <h3 className="font-bold text-base text-[#111827] dark:text-white">
                    Need more room to write?
                  </h3>
                  <p className="text-xs text-[#5B6472] leading-relaxed">
                    Upgrade to Plus or KorsIQ Premium for dissertation tools, larger file allowances, real citation chips, and formatted Word (.docx) export.
                  </p>
                </div>

                {/* Single Primary Button per Spec */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPlansModal(true)}
                    className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer shadow-sm"
                  >
                    <span>See plans</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Academic Identity (Profile Settings)              */}
      {/* ========================================================= */}
      {activeTab === 'identity' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="shrink-0">
                <UserAvatar 
                  avatarIcon={editedProfile.avatarIcon || profile.avatarIcon || 'graduation-cap'}
                  name={profile.name}
                  size="xl"
                  showStatus
                  isOnline
                />
              </div>
              <div className="space-y-1 w-full max-w-md">
                {isEditing ? (
                  <input 
                    type="text"
                    value={editedProfile.name}
                    onChange={e => setEditedProfile({...editedProfile, name: e.target.value})}
                    placeholder="Full name"
                    className="w-full text-base font-bold text-[#111827] dark:text-white border-b border-[#2563EB] focus:outline-none bg-transparent pb-0.5"
                  />
                ) : (
                  <h2 className="text-base font-bold text-[#111827] dark:text-white">{profile.name}</h2>
                )}
                {isEditing ? (
                  <div className="pt-1 w-full max-w-sm">
                    <UniversitySelector
                      value={editedProfile.university}
                      onChange={(u) => setEditedProfile({...editedProfile, university: u})}
                      placeholder="Select or search institution..."
                    />
                  </div>
                ) : (
                  <p className="text-[#5B6472] font-medium text-xs">{profile.university || 'University Student'}</p>
                )}
              </div>
            </div>

            {/* Avatar Icon Picker */}
            {isEditing && (
              <div className="pt-4 border-t border-[#E5E7EB] dark:border-slate-800 space-y-2.5">
                <label className="text-[10px] font-bold text-[#5B6472] uppercase tracking-wider block">
                  Profile Icon
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                  {AVATAR_OPTIONS.map((opt) => {
                    const isSelected = (editedProfile.avatarIcon || profile.avatarIcon || 'graduation-cap') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditedProfile({ ...editedProfile, avatarIcon: opt.id })}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg transition-all cursor-pointer min-h-[44px] ${
                          isSelected
                            ? 'bg-[#EFF6FF] border-2 border-[#2563EB]'
                            : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 border border-[#E5E7EB] dark:border-slate-700'
                        }`}
                        title={opt.name}
                      >
                        <UserAvatar avatarIcon={opt.id} size="sm" />
                        <span className="text-[9px] font-semibold text-[#5B6472] truncate w-full text-center mt-1">
                          {opt.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-[#E5E7EB] dark:border-slate-800">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B6472]">Email Address</p>
                <p className="text-xs font-semibold text-[#111827] dark:text-white truncate">{profile.email}</p>
              </div>
              <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-[#E5E7EB] dark:border-slate-800">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B6472]">Department</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedProfile.department || ''}
                    onChange={e => setEditedProfile({...editedProfile, department: e.target.value, major: e.target.value})}
                    className="text-xs font-semibold text-[#111827] dark:text-white bg-transparent border-b border-[#2563EB] outline-none w-full"
                    placeholder="e.g. Computer Science"
                  />
                ) : (
                  <p className="text-xs font-semibold text-[#111827] dark:text-white">{profile.department || profile.major || 'Not specified'}</p>
                )}
              </div>
              <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-[#E5E7EB] dark:border-slate-800">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B6472]">Level of Study</p>
                {isEditing ? (
                  <select 
                    value={editedProfile.level}
                    onChange={e => setEditedProfile({...editedProfile, level: e.target.value})}
                    className="text-xs font-semibold text-[#111827] dark:text-white bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-700 rounded px-2 py-1 outline-none cursor-pointer w-full"
                  >
                    <option>100L / Year 1</option>
                    <option>200L / Year 2</option>
                    <option>300L / Year 3</option>
                    <option>400L / Year 4</option>
                    <option>500L / Year 5</option>
                    <option>Postgraduate</option>
                  </select>
                ) : (
                  <p className="text-xs font-semibold text-[#111827] dark:text-white">{profile.level}</p>
                )}
              </div>
              <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-[#E5E7EB] dark:border-slate-800">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B6472]">Target CGPA</p>
                {isEditing ? (
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    max="5.00"
                    value={editedProfile.targetCGPA !== undefined ? editedProfile.targetCGPA : 0.00}
                    onChange={e => setEditedProfile({...editedProfile, targetCGPA: parseFloat(e.target.value) || 0})}
                    className="text-xs font-bold text-[#2563EB] bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-700 rounded px-2 py-0.5 outline-none w-24 font-mono"
                  />
                ) : (
                  <p className="text-xs font-bold text-[#2563EB] font-mono">{(profile?.targetCGPA ?? 0.00).toFixed(2)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: Preferences & Security                             */}
      {/* ========================================================= */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Notification Preferences */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold text-[#5B6472] uppercase tracking-wider">Preferences</h3>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-4">
              {[
                { id: 'messages', label: 'Group Messages', desc: 'Alerts for new discussions in study circles', value: profile.notifications?.messages ?? true },
                { id: 'sessions', label: 'Upcoming Sessions', desc: 'Reminders for your scheduled study times', value: profile.notifications?.sessions ?? true },
                { id: 'aiContent', label: 'AI Readiness', desc: 'Alerts when generated study materials are ready', value: profile.notifications?.aiContent ?? true },
                { id: 'taskReminders', label: 'Task & Exam Deadlines', desc: 'Alerts for upcoming assignments, revisions, and exams', value: profile.notifications?.taskReminders ?? true },
              ].map(notif => (
                <div key={notif.id} className="flex items-center justify-between py-1">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-semibold text-[#111827] dark:text-white">{notif.label}</h4>
                    <p className="text-[11px] text-[#5B6472] dark:text-slate-400">{notif.desc}</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setProfile({
                      ...profile,
                      notifications: {
                        messages: profile.notifications?.messages ?? true,
                        sessions: profile.notifications?.sessions ?? true,
                        aiContent: profile.notifications?.aiContent ?? true,
                        examReminders: profile.notifications?.examReminders ?? true,
                        taskReminders: profile.notifications?.taskReminders ?? true,
                        browserPush: profile.notifications?.browserPush ?? false,
                        [notif.id]: !notif.value
                      }
                    })}
                    className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer min-h-[24px] ${notif.value ? 'bg-[#2563EB]' : 'bg-slate-200 dark:bg-slate-700'}`}
                    aria-label={`Toggle ${notif.label}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-xs ${notif.value ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              ))}

              {/* Browser Push Permission Setting */}
              <div className="pt-3 border-t border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-[#111827] dark:text-white flex items-center gap-1.5">
                    <Bell size={13} className="text-[#2563EB]" />
                    <span>Browser Push Notifications</span>
                  </h4>
                  <p className="text-[11px] text-[#5B6472] dark:text-slate-400">
                    {typeof window !== 'undefined' && 'Notification' in window
                      ? Notification.permission === 'granted'
                        ? 'Active — Browser notifications are allowed'
                        : Notification.permission === 'denied'
                        ? 'Blocked — Enable in browser address bar permissions'
                        : 'Unconfigured — Request permission for background alerts'
                      : 'Not supported on this browser'}
                  </p>
                </div>
                {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const perm = await Notification.requestPermission();
                        if (perm === 'granted') {
                          setProfile({
                            ...profile,
                            notifications: { ...profile.notifications, browserPush: true }
                          });
                        }
                      } catch (err) {
                        console.warn('Permission request failed:', err);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 font-semibold text-xs rounded-lg border border-blue-200 dark:border-blue-900 min-h-[36px] hover:bg-blue-100 cursor-pointer"
                  >
                    Enable browser alerts
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Account Actions */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold text-[#5B6472] uppercase tracking-wider">Account Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button 
                type="button"
                onClick={onSignOut}
                className="w-full p-4 text-left bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg hover:border-slate-300 transition-all flex items-center justify-between shadow-xs cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-[#111827] dark:text-white rounded-lg flex items-center justify-center">
                    <LogOut size={15} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-[#111827] dark:text-white">Sign Out</h4>
                    <p className="text-[10px] text-[#5B6472]">End your current session</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-[#5B6472]" />
              </button>

              <button 
                type="button"
                onClick={() => { if (confirm('Are you sure you want to delete your account? All study records will be permanently removed.')) onDelete(); }}
                className="w-full p-4 text-left bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 rounded-lg hover:bg-rose-50/50 transition-all flex items-center justify-between shadow-xs cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-rose-50 dark:bg-rose-950/60 text-rose-600 rounded-lg flex items-center justify-center">
                    <X size={15} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-rose-700 dark:text-rose-400">Delete Account</h4>
                    <p className="text-[10px] text-rose-500">Permanently wipe all data</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-rose-400" />
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: Choose a Plan (Spec: 3 cards, Free preselected)  */}
      {/* ========================================================= */}
      {showPlansModal && (
        <div className="fixed inset-0 bg-[#111827]/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-3xl w-full p-6 space-y-5 shadow-xl text-left my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPlansModal(false)}
                  className="p-2 -ml-2 text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Back to settings"
                  title="Back to settings"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h3 className="font-bold text-lg text-[#111827] dark:text-white">Choose a plan</h3>
                  <p className="text-xs text-[#5B6472] dark:text-slate-400">Start free or upgrade for more room to write</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlansModal(false)}
                className="p-2 text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Free Card */}
              <div className="border border-[#2563EB] ring-2 ring-[#2563EB]/20 bg-white dark:bg-slate-900 rounded-lg p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-[#111827] dark:text-white">Free</h4>
                    <p className="text-xs text-[#5B6472] mt-0.5">Get organized and start studying.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦0</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Up to 5 courses</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Basic CGPA calculator</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>100 MB file storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Public study circles</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlansModal(false)}
                  className="w-full py-2.5 bg-[#2563EB] text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px]"
                >
                  Current Plan
                </button>
              </div>

              {/* Plus Card */}
              <div className="border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5 flex flex-col justify-between space-y-4 relative">
                <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-[#2563EB] text-white text-[10px] font-bold uppercase rounded tracking-wider">
                  Popular
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-[#111827] dark:text-white">Plus</h4>
                    <p className="text-xs text-[#5B6472] mt-0.5">For students who want the AI edge.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦7,500</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Unlimited courses &amp; timetable</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Scenario CGPA projection</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>2 GB file storage</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Private circles with invite codes</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>200 monthly AI study credits</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPlansModal(false);
                    setCheckoutPlan('plus');
                    setShowCheckoutModal(true);
                  }}
                  className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px] transition-colors"
                >
                  {profile.tier === 'plus' ? 'Current Plan' : 'Upgrade to Plus'}
                </button>
              </div>

              {/* KorsIQ Premium Card (Renamed from Academic Studio) */}
              <div className="border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-[#111827] dark:text-white">KorsIQ Premium</h4>
                    <p className="text-xs text-[#5B6472] mt-0.5">Full Studio workspace.</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-[#111827] dark:text-white">₦15,000</span>
                    <span className="text-xs text-[#5B6472]"> / month</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Everything in Plus</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Academic Studio editor</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Real-source citation chips</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>Word (.docx) &amp; PDF export</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-[#2563EB] shrink-0" />
                      <span>1,000 AI credits, 10 GB storage</span>
                    </li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPlansModal(false);
                    setCheckoutPlan('studio');
                    setShowCheckoutModal(true);
                  }}
                  className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px] transition-colors"
                >
                  {profile.tier === 'studio' ? 'Current Plan' : 'Upgrade to KorsIQ Premium'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Checkout Modal */}
      <SubscriptionCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        initialPlan={checkoutPlan}
        currentProfile={profile}
        onSubscriptionUpdated={(upd) => {
          if (setProfile) setProfile(upd);
          setEditedProfile(upd);
        }}
      />

      {/* Available Soon Modal per Open Decision 3 */}
      {showAvailableSoon && (
        <div className="fixed inset-0 bg-[#111827]/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-sm w-full p-6 space-y-4 shadow-xl text-left">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAvailableSoon(false);
                    setShowPlansModal(true);
                  }}
                  className="p-1 -ml-1 text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="Back to plans"
                  title="Back to plans"
                >
                  <ArrowLeft size={16} />
                </button>
                <h3 className="font-bold text-base text-[#111827] dark:text-white">
                  Available soon
                </h3>
              </div>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed">
                Paid plans are available soon. We've kept you on Free so your active studying remains uninterrupted.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAvailableSoon(false)}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
