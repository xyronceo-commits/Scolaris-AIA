import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  CreditCard, 
  GraduationCap, 
  Bot, 
  FolderArchive, 
  MessageSquare, 
  Bell, 
  ShieldAlert, 
  ScrollText, 
  Settings, 
  LogOut, 
  RefreshCw, 
  Search, 
  Plus, 
  Trash2, 
  Ban, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  HardDrive, 
  ArrowLeft, 
  ChevronRight, 
  Menu, 
  X,
  Clock,
  Sparkles,
  DollarSign,
  TrendingUp,
  FileText,
  Calendar,
  Lock,
  Edit,
  Eye
} from 'lucide-react';
import KorsIQLogo from './KorsIQLogo';

export type AdminTab = 
  | 'overview' 
  | 'users' 
  | 'subscriptions' 
  | 'universities' 
  | 'ai-usage' 
  | 'files' 
  | 'circles' 
  | 'announcements' 
  | 'administrators' 
  | 'logs' 
  | 'settings';

interface AdminDashboardProps {
  adminToken: string;
  adminEmail: string;
  onSignOut: () => void;
  onBackToStudentWorkspace: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminToken,
  adminEmail,
  onSignOut,
  onBackToStudentWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Remaining Session Timer (12h session countdown)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(12 * 3600);

  // Platform Data
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [universities, setUniversities] = useState<any[]>([]);
  const [aiAnalytics, setAiAnalytics] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [circles, setCircles] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [administrators, setAdministrators] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [platformSettings, setPlatformSettings] = useState<any>({
    maintenanceMode: false,
    registrationsEnabled: true,
    noticeMessage: ''
  });

  // Filters & Searches
  const [userSearch, setUserSearch] = useState('');
  const [userTierFilter, setUserTierFilter] = useState('all');
  const [universitySearch, setUniversitySearch] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // Modals
  const [activeModal, setActiveModal] = useState<{
    type: 'suspend_user' | 'delete_user' | 'change_tier' | 'override_payment' | 'add_university' | 'add_announcement' | 'add_admin' | 'inspect_user';
    data?: any;
  } | null>(null);

  // Form states for modals
  const [modalReason, setModalReason] = useState('');
  const [modalTier, setModalTier] = useState('plus');
  const [modalUni, setModalUni] = useState({ name: '', abbreviation: '', state: 'Lagos', type: 'Federal' });
  const [modalAnnounce, setModalAnnounce] = useState({ title: '', message: '', targetGroup: 'all', priority: 'normal' });
  const [modalAdmin, setModalAdmin] = useState({ email: '', fullName: '', role: 'admin' });
  const [modalActionLoading, setModalActionLoading] = useState(false);

  const isSuperAdmin = adminEmail.toLowerCase() === 'buildsafe247@gmail.com';

  const formatRemainingTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onSignOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onSignOut]);

  // Main Data Loader
  const fetchDashboardData = async () => {
    setError(null);
    setRefreshing(true);
    const headers = { Authorization: `Bearer ${adminToken}` };

    try {
      const [
        statsRes,
        usersRes,
        subsRes,
        unisRes,
        aiRes,
        filesRes,
        circlesRes,
        annRes,
        logsRes,
        settingsRes
      ] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/subscriptions', { headers }),
        fetch('/api/admin/universities', { headers }),
        fetch('/api/admin/ai-analytics', { headers }),
        fetch('/api/admin/files', { headers }),
        fetch('/api/admin/circles', { headers }),
        fetch('/api/admin/announcements', { headers }),
        fetch('/api/admin/logs', { headers }),
        fetch('/api/admin/settings', { headers }),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        onSignOut();
        return;
      }

      const [
        statsData,
        usersData,
        subsData,
        unisData,
        aiData,
        filesData,
        circlesData,
        annData,
        logsData,
        settingsData
      ] = await Promise.all([
        statsRes.json().catch(() => ({})),
        usersRes.json().catch(() => ({})),
        subsRes.json().catch(() => ({})),
        unisRes.json().catch(() => ({})),
        aiRes.json().catch(() => ({})),
        filesRes.json().catch(() => ({})),
        circlesRes.json().catch(() => ({})),
        annRes.json().catch(() => ({})),
        logsRes.json().catch(() => ({})),
        settingsRes.json().catch(() => ({})),
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (usersData.success) setUsers(usersData.users || []);
      if (subsData.success) setSubscriptions(subsData.subscriptions || []);
      if (unisData.success) setUniversities(unisData.universities || []);
      if (aiData.success) setAiAnalytics(aiData.analytics);
      if (filesData.success) setFiles(filesData.files || []);
      if (circlesData.success) setCircles(circlesData.circles || []);
      if (annData.success) setAnnouncements(annData.announcements || []);
      if (logsData.success) setAuditLogs(logsData.logs || []);
      if (settingsData.success) setPlatformSettings(settingsData.settings);

      // Also fetch administrators if super admin
      if (isSuperAdmin) {
        const adminsRes = await fetch('/api/admin/administrators', { headers });
        if (adminsRes.ok) {
          const adminsData = await adminsRes.json();
          if (adminsData.success) setAdministrators(adminsData.administrators || []);
        }
      }
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      setError('Unable to synchronize data with backend server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [adminToken]);

  // Action Helpers
  const showSuccessBanner = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleSuspendUser = async () => {
    if (!activeModal?.data) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          userId: activeModal.data.uid,
          suspend: !activeModal.data.isSuspended,
          reason: modalReason || 'Administrator action'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update user status.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      setModalReason('');
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!activeModal?.data) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ userId: activeModal.data.uid })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete user.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Deletion failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleChangeTier = async () => {
    if (!activeModal?.data) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/change-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          userId: activeModal.data.uid,
          tier: modalTier,
          reason: modalReason || 'Administrative tier adjustment'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update tier.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      setModalReason('');
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Tier adjustment failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleAddUniversity = async () => {
    if (!modalUni.name.trim()) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/universities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          action: 'create',
          university: modalUni
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add university.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      setModalUni({ name: '', abbreviation: '', state: 'Lagos', type: 'Federal' });
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'University creation failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!modalAnnounce.title.trim() || !modalAnnounce.message.trim()) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(modalAnnounce)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to publish announcement.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      setModalAnnounce({ title: '', message: '', targetGroup: 'all', priority: 'normal' });
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Announcement publishing failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete announcement.');
      showSuccessBanner('Announcement removed.');
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
    }
  };

  const handleAddAdmin = async () => {
    if (!modalAdmin.email.trim()) return;
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/administrators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(modalAdmin)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to register administrator.');
      showSuccessBanner(data.message);
      setActiveModal(null);
      setModalAdmin({ email: '', fullName: '', role: 'admin' });
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setModalActionLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(platformSettings)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save settings.');
      showSuccessBanner('Platform settings saved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings.');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: string, source: string) => {
    if (!confirm('Delete this file permanently from platform storage?')) return;
    try {
      const res = await fetch('/api/admin/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ fileId, source, reason: 'Administrative moderation' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete file.');
      showSuccessBanner('File deleted.');
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete file.');
    }
  };

  const handleDeleteCircle = async (circleId: string) => {
    if (!confirm('Permanently delete this study circle?')) return;
    try {
      const res = await fetch('/api/admin/circles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ circleId, reason: 'Administrative moderation' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete study circle.');
      showSuccessBanner('Study circle removed.');
      fetchDashboardData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete study circle.');
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = userSearch.toLowerCase();
      const matchSearch = !q || (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.institution?.toLowerCase().includes(q));
      const matchTier = userTierFilter === 'all' || u.tier?.toLowerCase() === userTierFilter.toLowerCase();
      return matchSearch && matchTier;
    });
  }, [users, userSearch, userTierFilter]);

  // Navigation Items
  const navItems = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'users', label: 'User Accounts', icon: Users, count: users.length },
    { id: 'subscriptions', label: 'Subscriptions & Payments', icon: CreditCard, count: subscriptions.length },
    { id: 'universities', label: 'Nigerian Universities', icon: GraduationCap, count: universities.length },
    { id: 'ai-usage', label: 'AI Usage & Costs', icon: Bot },
    { id: 'files', label: 'Files & Storage', icon: HardDrive, count: files.length },
    { id: 'circles', label: 'Study Circles', icon: MessageSquare, count: circles.length },
    { id: 'announcements', label: 'Announcements', icon: Bell, count: announcements.length },
    ...(isSuperAdmin ? [{ id: 'administrators', label: 'Administrators', icon: ShieldAlert, count: administrators.length }] : []),
    { id: 'logs', label: 'Security & Logs', icon: ScrollText, count: auditLogs.length },
    ...(isSuperAdmin ? [{ id: 'settings', label: 'Platform Settings', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg md:hidden hover:bg-slate-800 cursor-pointer"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2.5">
            <KorsIQLogo variant="icon" size={26} onDark />
            <span className="font-serif font-bold text-lg text-white tracking-tight">KorsIQ Admin</span>
            {isSuperAdmin && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30">
                Super Admin
              </span>
            )}
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          {/* 12-Hour Session Expiry Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Clock size={13} className="text-blue-400" />
            <span>Session: <strong className="font-mono text-white">{formatRemainingTime(remainingSeconds)}</strong></span>
          </div>

          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-blue-400' : ''} />
          </button>

          <button
            type="button"
            onClick={onBackToStudentWorkspace}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer border border-slate-700/60"
          >
            <ArrowLeft size={13} />
            <span>Student App</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer font-medium"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Workspace with Desktop Sidebar & Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/60 p-3 shrink-0">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-blue-700/60 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-4 border-t border-slate-800/80 px-2">
            <div className="text-[11px] text-slate-500 flex flex-col gap-1">
              <span>Logged in as:</span>
              <span className="font-mono text-slate-300 truncate">{adminEmail}</span>
            </div>
          </div>
        </aside>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-sm flex">
            <div className="w-72 bg-slate-900 border-r border-slate-800 h-full p-4 flex flex-col space-y-1">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-2">
                <span className="font-serif font-bold text-white text-base">Menu</span>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as AdminTab);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </div>
                    {item.count !== undefined && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Tab Content Display Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Notifications / Alerts */}
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
                <X size={14} />
              </button>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Platform Overview</h2>
                <p className="text-xs text-slate-400">Real-time statistics sourced directly from Supabase database.</p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>Registered Users</span>
                    <Users size={16} className="text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {stats?.totalUsers ?? '...'}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold">{stats?.activeUsers ?? 0} active</span>
                    <span>(30d activity)</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>Subscriber Breakdown</span>
                    <CreditCard size={16} className="text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {stats?.plusUsers + stats?.studioUsers || 0}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>Free: <strong className="text-slate-200">{stats?.freeUsers ?? 0}</strong></span>
                    <span>|</span>
                    <span>Plus: <strong className="text-blue-400">{stats?.plusUsers ?? 0}</strong></span>
                    <span>|</span>
                    <span>Studio: <strong className="text-amber-400">{stats?.studioUsers ?? 0}</strong></span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>Verified Payments</span>
                    <DollarSign size={16} className="text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ₦{(stats?.totalRevenueNgn || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <span>{stats?.verifiedPaymentsCount ?? 0} verified transactions</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                    <span>AI Usage & Est. Cost</span>
                    <Bot size={16} className="text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ${stats?.ai?.estimatedCostUsd ?? '0.00'}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>{stats?.ai?.totalRequests ?? 0} requests</span>
                    <span>~₦{(stats?.ai?.estimatedCostNgn || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Secondary Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Content & Academic Assets</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <div className="text-slate-400">Courses Registered</div>
                      <div className="text-lg font-bold font-mono text-white mt-1">{stats?.totalCourses ?? 0}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <div className="text-slate-400">Study Hubs Active</div>
                      <div className="text-lg font-bold font-mono text-white mt-1">{stats?.totalStudyHubs ?? 0}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <div className="text-slate-400">Study Circles</div>
                      <div className="text-lg font-bold font-mono text-white mt-1">{stats?.totalStudyGroups ?? 0}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
                      <div className="text-slate-400">Storage Consumed</div>
                      <div className="text-lg font-bold font-mono text-white mt-1">{stats?.storageFormattedMB ?? '0.00'} MB</div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Recent Security & Admin Events</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {auditLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800/60 text-xs flex items-center justify-between">
                        <div className="space-y-0.5 truncate pr-2">
                          <div className="font-semibold text-slate-200">{log.event}</div>
                          <div className="text-[11px] text-slate-400 truncate">{log.details}</div>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. USER MANAGEMENT TAB */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">User Accounts Directory</h2>
                  <p className="text-xs text-slate-400">Search, filter, manage subscription tiers, and control account status.</p>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name, email, or university..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={userTierFilter}
                  onChange={(e) => setUserTierFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Plans</option>
                  <option value="free">Free Plan</option>
                  <option value="plus">Plus Plan</option>
                  <option value="studio">Academic Studio</option>
                </select>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">University & Level</th>
                      <th className="py-3 px-4">Plan Tier</th>
                      <th className="py-3 px-4">Academic Work</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No matching user accounts found.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.uid} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{user.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-300 max-w-[200px] truncate">{user.institution}</div>
                            <div className="text-[11px] text-slate-500">{user.level}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              user.tier === 'studio' 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : user.tier === 'plus'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {user.tier}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            <span>{user.courseCount} courses</span> • <span>{user.materialsCount} files</span>
                          </td>
                          <td className="py-3 px-4">
                            {user.isSuspended ? (
                              <span className="text-rose-400 text-[11px] font-semibold flex items-center gap-1">
                                <Ban size={12} /> Suspended
                              </span>
                            ) : (
                              <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                                <CheckCircle2 size={12} /> Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModal({ type: 'change_tier', data: user });
                                  setModalTier(user.tier || 'plus');
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                                title="Change Subscription Tier"
                              >
                                Tier
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveModal({ type: 'suspend_user', data: user })}
                                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                  user.isSuspended 
                                    ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30' 
                                    : 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                                }`}
                              >
                                {user.isSuspended ? 'Reactivate' : 'Suspend'}
                              </button>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setActiveModal({ type: 'delete_user', data: user })}
                                  className="p-1 rounded text-rose-400 hover:bg-rose-600/20 transition-colors cursor-pointer"
                                  title="Permanently Delete User"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. SUBSCRIPTIONS & PAYMENTS TAB */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Subscriptions & Payment Ledger</h2>
                  <p className="text-xs text-slate-400">Track verified transactions, failed payments, and audit manual overrides.</p>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Transaction / User</th>
                      <th className="py-3 px-4">Plan Package</th>
                      <th className="py-3 px-4">Amount (NGN)</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {subscriptions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No transactions or subscription records in database.
                        </td>
                      </tr>
                    ) : (
                      subscriptions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{sub.userName || 'Scholar'}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{sub.userEmail}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize font-semibold text-slate-200">{sub.plan}</span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            ₦{Number(sub.amount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {sub.reference}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              sub.status === 'verified' || sub.status === 'success' || sub.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {sub.paidAt ? new Date(sub.paidAt).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. NIGERIAN UNIVERSITIES DIRECTORY */}
          {activeTab === 'universities' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Nigerian University Directory</h2>
                  <p className="text-xs text-slate-400">Comprehensive directory covering Federal, State, and Private institutions.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: 'add_university' })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus size={14} />
                  <span>Add Institution</span>
                </button>
              </div>

              {/* University Search */}
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={universitySearch}
                  onChange={(e) => setUniversitySearch(e.target.value)}
                  placeholder="Search by university name, state, or abbreviation..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Institution Name</th>
                      <th className="py-3 px-4">Abbreviation</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {universities
                      .filter(u => {
                        const q = universitySearch.toLowerCase();
                        return !q || u.name.toLowerCase().includes(q) || u.state.toLowerCase().includes(q) || (u.abbreviation && u.abbreviation.toLowerCase().includes(q));
                      })
                      .map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{u.name}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">{u.abbreviation || '—'}</td>
                          <td className="py-3 px-4 text-slate-300">{u.state}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.type === 'Federal' 
                                ? 'bg-blue-500/20 text-blue-300'
                                : u.type === 'State'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}>
                              {u.type}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. AI USAGE MANAGEMENT TAB */}
          {activeTab === 'ai-usage' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">AI Usage & Cost Analytics</h2>
                <p className="text-xs text-slate-400">Monitoring Google Gemini API telemetry, token consumption, and cost estimates.</p>
              </div>

              {/* AI Key Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Total AI Generations</div>
                  <div className="text-2xl font-bold font-mono text-white">{aiAnalytics?.totalRequests ?? 0}</div>
                  <div className="text-[11px] text-slate-500">Live requests processed</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Estimated Tokens</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {(aiAnalytics?.estimatedTokens || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500">Blended input & output</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Estimated API Cost (USD)</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ${aiAnalytics?.estimatedCostUsd ?? '0.00'}
                  </div>
                  <div className="text-[11px] text-slate-500">Gemini 2.0 Flash standard rates</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="text-xs text-slate-400">Estimated API Cost (NGN)</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    ₦{(aiAnalytics?.estimatedCostNgn || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500">1,550 NGN/USD benchmark</div>
                </div>
              </div>

              {/* Feature Usage Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Feature Breakdown</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40">
                      <span className="text-slate-300">Summaries & Study Notes</span>
                      <span className="font-mono font-bold text-white">{aiAnalytics?.summariesGenerated ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40">
                      <span className="text-slate-300">Flashcard Sets</span>
                      <span className="font-mono font-bold text-white">{aiAnalytics?.flashcardsGenerated ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40">
                      <span className="text-slate-300">Practice Quizzes</span>
                      <span className="font-mono font-bold text-white">{aiAnalytics?.quizzesGenerated ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40">
                      <span className="text-slate-300">AI Audio Podcasts</span>
                      <span className="font-mono font-bold text-white">{aiAnalytics?.podcastsGenerated ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Top AI Consumers */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Highest AI Consumption Users</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
                    {(aiAnalytics?.topUsers || []).length === 0 ? (
                      <div className="text-slate-500 text-center py-4">No user AI generation telemetry recorded yet.</div>
                    ) : (
                      aiAnalytics.topUsers.map((u: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40">
                          <span className="font-mono text-slate-300 truncate max-w-[220px]">{u.userEmail}</span>
                          <span className="font-mono font-bold text-blue-400">{u.requestCount} requests</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. FILE & STORAGE MANAGEMENT TAB */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Files & Platform Storage</h2>
                  <p className="text-xs text-slate-400">Inspect uploaded academic documents, manage storage consumption, and remove problematic files.</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Filename</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Uploaded</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {files.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No uploaded documents in storage.
                        </td>
                      </tr>
                    ) : (
                      files.map((file) => (
                        <tr key={file.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white max-w-[240px] truncate">
                            {file.name}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{file.userEmail}</td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {new Date(file.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file.id, file.source)}
                              className="p-1 rounded text-rose-400 hover:bg-rose-600/20 transition-colors cursor-pointer"
                              title="Delete File"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. STUDY CIRCLES MANAGEMENT TAB */}
          {activeTab === 'circles' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Study Circles Management</h2>
                  <p className="text-xs text-slate-400">Monitor community study circles, investigate reported groups, and moderate content.</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Circle Name</th>
                      <th className="py-3 px-4">Creator</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Members</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {circles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No study circles created yet.
                        </td>
                      </tr>
                    ) : (
                      circles.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{c.name}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[250px]">{c.description || 'No description'}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{c.creatorEmail}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              c.isPrivate ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {c.isPrivate ? 'Private' : 'Public'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{c.memberCount}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteCircle(c.id)}
                              className="p-1 rounded text-rose-400 hover:bg-rose-600/20 transition-colors cursor-pointer"
                              title="Delete Study Circle"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. ANNOUNCEMENTS TAB */}
          {activeTab === 'announcements' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Platform Announcements</h2>
                  <p className="text-xs text-slate-400">Broadcast important updates to all users or target specific subscription tiers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: 'add_announcement' })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus size={14} />
                  <span>Create Announcement</span>
                </button>
              </div>

              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-slate-900/60 rounded-2xl border border-slate-800">
                    No active announcements published.
                  </div>
                ) : (
                  announcements.map((a) => (
                    <div key={a.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{a.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            a.priority === 'urgent' 
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {a.priority}
                          </span>
                          <span className="text-[11px] text-slate-500">Target: <strong>{a.target_group || 'all'}</strong></span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{a.message}</p>
                        <div className="text-[10px] text-slate-500 font-mono pt-1">
                          Posted by {a.created_by} • {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnouncement(a.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-600/20 cursor-pointer"
                        title="Delete Announcement"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 9. ADMINISTRATORS MANAGEMENT TAB (SUPER ADMIN) */}
          {activeTab === 'administrators' && isSuperAdmin && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Administrator Access Control</h2>
                  <p className="text-xs text-slate-400">Manage administrator accounts, assign specific roles, and revoke access.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: 'add_admin' })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus size={14} />
                  <span>Register Administrator</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Administrator</th>
                      <th className="py-3 px-4">Role Permission</th>
                      <th className="py-3 px-4">Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {administrators.map((admin) => (
                      <tr key={admin.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{admin.full_name || 'Admin'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{admin.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {admin.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                            <CheckCircle2 size={12} /> Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 10. SYSTEM LOGS & SECURITY TAB */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">System Security & Audit Trail</h2>
                <p className="text-xs text-slate-400">Complete audit log of admin authentication, OTP challenges, and system modifications.</p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Details</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-4 text-slate-400 shrink-0">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-200">
                          {log.event}
                        </td>
                        <td className="py-2.5 px-4 text-blue-400">
                          {log.actor || 'admin'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 font-sans text-xs max-w-sm truncate">
                          {log.details}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 11. PLATFORM SETTINGS TAB (SUPER ADMIN) */}
          {activeTab === 'settings' && isSuperAdmin && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Platform Settings</h2>
                <p className="text-xs text-slate-400">Configure global application availability, registration gates, and maintenance announcements.</p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-white">Maintenance Mode</div>
                    <div className="text-xs text-slate-400">Put KorsIQ in read-only maintenance mode.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={platformSettings.maintenanceMode}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, maintenanceMode: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-white">New User Registrations</div>
                    <div className="text-xs text-slate-400">Allow prospective students to create new accounts.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={platformSettings.registrationsEnabled}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, registrationsEnabled: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Global System Notice / Banner
                  </label>
                  <textarea
                    rows={3}
                    value={platformSettings.noticeMessage || ''}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, noticeMessage: e.target.value })}
                    placeholder="Enter an optional announcement notice displayed across student portals..."
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={modalActionLoading}
                  onClick={handleSaveSettings}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {modalActionLoading ? 'Saving...' : 'Save Platform Settings'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================================================== */}
      {/* ACTION MODALS */}
      {/* ==================================================== */}

      {/* Modal: Suspend User */}
      {activeModal?.type === 'suspend_user' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold">
              {activeModal.data.isSuspended ? 'Reactivate Account' : 'Suspend User Account'}
            </h3>
            <p className="text-xs text-slate-400">
              User: <strong className="text-white">{activeModal.data.email}</strong>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Reason for Action</label>
              <textarea
                rows={3}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Enter justification for administrative audit trail..."
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => { setActiveModal(null); setModalReason(''); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading}
                onClick={handleSuspendUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Processing...' : 'Confirm Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete User */}
      {activeModal?.type === 'delete_user' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold text-rose-400">Delete User Account</h3>
            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete user <strong className="text-white">{activeModal.data.email}</strong>?
              This will remove all associated courses, study hubs, and files. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading}
                onClick={handleDeleteUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Deleting...' : 'Permanently Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Change Subscription Tier */}
      {activeModal?.type === 'change_tier' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold">Adjust Subscription Tier</h3>
            <p className="text-xs text-slate-400">
              User: <strong className="text-white">{activeModal.data.email}</strong>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Select Plan Tier</label>
              <select
                value={modalTier}
                onChange={(e) => setModalTier(e.target.value)}
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="free">Free Plan (Default)</option>
                <option value="plus">KorsIQ Plus</option>
                <option value="studio">Academic Studio</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Administrative Reason</label>
              <input
                type="text"
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Reason for tier adjustment (e.g. manual payment verified)"
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => { setActiveModal(null); setModalReason(''); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading}
                onClick={handleChangeTier}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Updating...' : 'Save Plan Tier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add University */}
      {activeModal?.type === 'add_university' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold">Add Nigerian University</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Institution Name</label>
                <input
                  type="text"
                  required
                  value={modalUni.name}
                  onChange={(e) => setModalUni({ ...modalUni, name: e.target.value })}
                  placeholder="Official University Name"
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300">Abbreviation</label>
                  <input
                    type="text"
                    value={modalUni.abbreviation}
                    onChange={(e) => setModalUni({ ...modalUni, abbreviation: e.target.value })}
                    placeholder="e.g. UNILAG"
                    className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300">State / Territory</label>
                  <input
                    type="text"
                    value={modalUni.state}
                    onChange={(e) => setModalUni({ ...modalUni, state: e.target.value })}
                    placeholder="e.g. Lagos"
                    className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300">Institution Type</label>
                <select
                  value={modalUni.type}
                  onChange={(e) => setModalUni({ ...modalUni, type: e.target.value as any })}
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Federal">Federal University</option>
                  <option value="State">State University</option>
                  <option value="Private">Private University</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading || !modalUni.name.trim()}
                onClick={handleAddUniversity}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Saving...' : 'Add Institution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Announcement */}
      {activeModal?.type === 'add_announcement' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold">Publish Platform Announcement</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Announcement Title</label>
                <input
                  type="text"
                  required
                  value={modalAnnounce.title}
                  onChange={(e) => setModalAnnounce({ ...modalAnnounce, title: e.target.value })}
                  placeholder="e.g. Scheduled System Upgrade"
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300">Target Group</label>
                  <select
                    value={modalAnnounce.targetGroup}
                    onChange={(e) => setModalAnnounce({ ...modalAnnounce, targetGroup: e.target.value })}
                    className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="all">All Users</option>
                    <option value="free">Free Users</option>
                    <option value="plus">Plus Subscribers</option>
                    <option value="studio">Studio Subscribers</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300">Priority Level</label>
                  <select
                    value={modalAnnounce.priority}
                    onChange={(e) => setModalAnnounce({ ...modalAnnounce, priority: e.target.value })}
                    className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300">Announcement Message</label>
                <textarea
                  rows={4}
                  required
                  value={modalAnnounce.message}
                  onChange={(e) => setModalAnnounce({ ...modalAnnounce, message: e.target.value })}
                  placeholder="Details of the announcement..."
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading || !modalAnnounce.title.trim() || !modalAnnounce.message.trim()}
                onClick={handleCreateAnnouncement}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Dispatching...' : 'Dispatch Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Administrator */}
      {activeModal?.type === 'add_admin' && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-white">
            <h3 className="text-base font-bold">Register Administrator</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300">Administrator Email</label>
                <input
                  type="email"
                  required
                  value={modalAdmin.email}
                  onChange={(e) => setModalAdmin({ ...modalAdmin, email: e.target.value })}
                  placeholder="admin@korsiq.com"
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300">Full Name</label>
                <input
                  type="text"
                  value={modalAdmin.fullName}
                  onChange={(e) => setModalAdmin({ ...modalAdmin, fullName: e.target.value })}
                  placeholder="Officer Name"
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300">Assigned Role</label>
                <select
                  value={modalAdmin.role}
                  onChange={(e) => setModalAdmin({ ...modalAdmin, role: e.target.value })}
                  className="w-full p-2.5 mt-1 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                >
                  <option value="admin">Administrator (General)</option>
                  <option value="finance_admin">Finance Administrator</option>
                  <option value="support_admin">Support Administrator</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalActionLoading || !modalAdmin.email.trim()}
                onClick={handleAddAdmin}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {modalActionLoading ? 'Registering...' : 'Register Administrator'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;