import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  Bot, 
  Activity, 
  LogOut, 
  RefreshCw, 
  BookOpen, 
  Layers, 
  MessageSquare, 
  FileText, 
  CheckCircle2, 
  Server, 
  Database, 
  Cpu, 
  Clock, 
  Search,
  Lock,
  AlertTriangle,
  Info
} from 'lucide-react';

interface AdminUser {
  uid: string;
  name: string;
  email: string;
  institution: string;
  level: string;
  tier: string;
  isPro: boolean;
  onboarded: boolean;
  updatedAt: string;
}

interface AdminStats {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  totalCourses: number;
  totalStudyHubs: number;
  totalStudyGroups: number;
  totalStudySessions: number;
  totalAIConversations: number;
  totalUploadedMaterials: number;
  updatedAt: string;
}

interface AIUsageStats {
  totalHubs: number;
  summariesGenerated: number;
  flashcardsGenerated: number;
  quizzesGenerated: number;
  podcastsGenerated: number;
  totalRequests: number;
}

interface SystemStatusData {
  server: string;
  uptimeSeconds: number;
  nodeVersion: string;
  memoryUsageMB: { rss: number; heapUsed: number; heapTotal: number };
  database: { status: string; projectId: string; firestoreDatabaseId: string };
  aiEngines: { groq: string; gemini: string };
  timestamp: string;
}

interface AdminAuditLog {
  id?: string;
  event: string;
  status: string;
  timestamp: string;
  details: string;
  ip: string;
  userAgent: string;
}

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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'ai-usage' | 'status' | 'audit-logs'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [aiUsage, setAiUsage] = useState<AIUsageStats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  const [userSearch, setUserSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; actionText: string; onConfirm: () => void } | null>(null);

  const fetchDashboardData = async () => {
    setError(null);
    setRefreshing(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };

      const [statsRes, usersRes, aiRes, statusRes, logsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/ai-usage', { headers }),
        fetch('/api/admin/status', { headers }),
        fetch('/api/admin/logs', { headers }),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        onSignOut();
        return;
      }

      const [statsData, usersData, aiData, statusData, logsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        aiRes.json(),
        statusRes.json(),
        logsRes.json(),
      ]);

      if (statsData.success) setStats(statsData.stats);
      if (usersData.success) setUsers(usersData.users);
      if (aiData.success) setAiUsage(aiData.aiUsage);
      if (statusData.success) setSystemStatus(statusData.status);
      if (logsData.success) setAuditLogs(logsData.logs || []);
    } catch (err: any) {
      console.error('Failed to fetch admin data:', err);
      setError('Error communicating with backend admin server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [adminToken]);

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.institution.toLowerCase().includes(q) ||
      u.tier.toLowerCase().includes(q)
    );
  });

  const filteredLogs = auditLogs.filter((l) => {
    const q = logSearch.toLowerCase();
    return (
      (l.event || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q) ||
      (l.ip || '').toLowerCase().includes(q) ||
      (l.status || '').toLowerCase().includes(q)
    );
  });

  const handleActionClick = (title: string, actionText: string) => {
    setConfirmModal({
      open: true,
      title,
      actionText,
      onConfirm: () => {
        setConfirmModal(null);
        alert(`Action completed under administrative protocol.`);
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 rounded-3xl p-4 sm:p-8 space-y-8 my-2 border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Admin Top Navigation & Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-800/80 border border-slate-700/80 rounded-2xl shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight">
                Scolaris AI Administration
              </h1>
              <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Read-Only
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-1.5">
              <span>Authenticated Admin:</span>
              <span className="text-slate-200 font-bold">{adminEmail}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="p-2.5 bg-slate-700/80 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-600 transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold"
            title="Refresh Dashboard Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={onBackToStudentWorkspace}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
          >
            Student Workspace
          </button>

          <button
            onClick={onSignOut}
            className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-800 space-x-2 sm:space-x-4 overflow-x-auto custom-scrollbar pb-1">
        {[
          { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
          { id: 'users', label: 'Users Directory', icon: <Users className="w-4 h-4" /> },
          { id: 'ai-usage', label: 'AI Analytics', icon: <Bot className="w-4 h-4" /> },
          { id: 'status', label: 'System Status', icon: <Server className="w-4 h-4" /> },
          { id: 'audit-logs', label: 'Audit Logs', icon: <FileText className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 rounded-t-xl font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-slate-800/90 text-blue-400 border-blue-500 shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="p-16 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-400">Loading Scolaris Backend Telemetry...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-sm font-medium flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Users</span>
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-3xl font-serif font-bold text-white">
                    {stats?.totalUsers ?? 0}
                  </div>
                  <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>+{stats?.newUsers ?? 0} new (7 days)</span>
                  </p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Active Users</span>
                    <Activity className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-3xl font-serif font-bold text-white">
                    {stats?.activeUsers ?? 1}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Verified active sessions</p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">AI Conversations</span>
                    <Bot className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="text-3xl font-serif font-bold text-white">
                    {stats?.totalAIConversations ?? 0}
                  </div>
                  <p className="text-[11px] text-indigo-300 font-medium">Interactions & Queries</p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-bold uppercase tracking-wider">Uploaded Materials</span>
                    <FileText className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="text-3xl font-serif font-bold text-white">
                    {stats?.totalUploadedMaterials ?? 0}
                  </div>
                  <p className="text-[11px] text-amber-300 font-medium">Documents & Transcripts</p>
                </div>
              </div>

              {/* Extended Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-blue-400" />
                      <span>Academic Courses</span>
                    </h3>
                    <span className="text-lg font-bold text-white">{stats?.totalCourses ?? 0}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Total course modules registered by scholars across all university levels.
                  </p>
                </div>

                <div className="p-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>Study Hubs</span>
                    </h3>
                    <span className="text-lg font-bold text-white">{stats?.totalStudyHubs ?? 0}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Active AI content hubs containing generated flashcards, quizzes, and podcasts.
                  </p>
                </div>

                <div className="p-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <span>Study Groups</span>
                    </h3>
                    <span className="text-lg font-bold text-white">{stats?.totalStudyGroups ?? 0}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Collaborative peer learning circles and private discussion groups.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users by name, email, or institution..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-xs font-semibold text-slate-400">
                  Showing <span className="text-white font-bold">{filteredUsers.length}</span> registered users
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800/90 border-b border-slate-700 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Name</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Institution</th>
                        <th className="p-4">Level</th>
                        <th className="p-4">Tier</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50 font-medium">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                            No users matched your query.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.uid} className="hover:bg-slate-800/80 transition-colors">
                            <td className="p-4 font-bold text-white">{u.name}</td>
                            <td className="p-4 text-slate-300">{u.email}</td>
                            <td className="p-4 text-slate-400">{u.institution || 'Standard Scholar'}</td>
                            <td className="p-4 text-slate-400">{u.level}</td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                {u.tier}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                Active
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleActionClick(`Inspect User ${u.name}`, 'Verify User Audit Trail')}
                                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                              >
                                View Log
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* AI USAGE TAB */}
          {activeTab === 'ai-usage' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-2">
                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Summaries Generated</span>
                  <div className="text-2xl font-serif font-bold text-white">{aiUsage?.summariesGenerated ?? 0}</div>
                  <p className="text-[10px] text-blue-400 font-medium">Core AI Concept Extractions</p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-2">
                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Flashcard Cards</span>
                  <div className="text-2xl font-serif font-bold text-white">{aiUsage?.flashcardsGenerated ?? 0}</div>
                  <p className="text-[10px] text-purple-400 font-medium">Spaced Repetition Decks</p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-2">
                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Quiz Items</span>
                  <div className="text-2xl font-serif font-bold text-white">{aiUsage?.quizzesGenerated ?? 0}</div>
                  <p className="text-[10px] text-emerald-400 font-medium">AI Formative Assessments</p>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-2">
                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Podcasts/Audio</span>
                  <div className="text-2xl font-serif font-bold text-white">{aiUsage?.podcastsGenerated ?? 0}</div>
                  <p className="text-[10px] text-amber-400 font-medium">Academic Seminar Dialogues</p>
                </div>
              </div>

              <div className="p-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-400" />
                    <span>AI Model Pipeline Health</span>
                  </h3>
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded-full border border-emerald-500/30">
                    Optimal
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-bold text-slate-300">Groq LLM Engine (Llama 3.3 70B)</span>
                    <p className="text-[11px] text-slate-400">Primary instant text generation and quiz synthesizer</p>
                  </div>
                  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-bold text-slate-300">Google Gemini Engine (Flash 2.5)</span>
                    <p className="text-[11px] text-slate-400">Multimodal document parsing & OCR synthesis</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SYSTEM STATUS TAB */}
          {activeTab === 'status' && systemStatus && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                      <Server className="w-4 h-4 text-blue-400" />
                      <span>Node Express Backend</span>
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
                      {systemStatus.server}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Uptime:</span>
                      <span className="font-mono text-white font-bold">{systemStatus.uptimeSeconds} seconds</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Node Version:</span>
                      <span className="font-mono text-white font-bold">{systemStatus.nodeVersion}</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span>Firestore Database</span>
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
                      {systemStatus.database.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Project ID:</span>
                      <span className="font-mono text-white font-bold truncate max-w-[150px]">{systemStatus.database.projectId}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Database ID:</span>
                      <span className="font-mono text-white font-bold truncate max-w-[150px]">{systemStatus.database.firestoreDatabaseId}</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      <span>Server Memory RSS</span>
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {systemStatus.memoryUsageMB.rss} MB
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Heap Used:</span>
                      <span className="font-mono text-white font-bold">{systemStatus.memoryUsageMB.heapUsed} MB</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Heap Total:</span>
                      <span className="font-mono text-white font-bold">{systemStatus.memoryUsageMB.heapTotal} MB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AUDIT LOGS TAB */}
          {activeTab === 'audit-logs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs by event, status, details, or IP..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-xs font-semibold text-slate-400">
                  Total <span className="text-white font-bold">{filteredLogs.length}</span> recorded audit events
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800/90 border-b border-slate-700 text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Event</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">Details</th>
                        <th className="p-4">Client IP</th>
                        <th className="p-4">User Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50 font-medium font-mono text-[11px]">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 italic font-sans">
                            No administrative audit log events recorded yet.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log, idx) => {
                          const isSuccess = log.status?.toUpperCase() === 'SUCCESS';
                          return (
                            <tr key={log.id || idx} className="hover:bg-slate-800/80 transition-colors">
                              <td className="p-4 font-bold text-white font-sans">
                                <span className="px-2.5 py-1 bg-slate-700/80 rounded-md border border-slate-600 text-[10px] text-blue-300 font-mono">
                                  {log.event}
                                </span>
                              </td>
                              <td className="p-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  isSuccess 
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="p-4 text-slate-300 whitespace-nowrap font-sans">
                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                              </td>
                              <td className="p-4 text-slate-200 font-sans max-w-xs truncate" title={log.details}>
                                {log.details}
                              </td>
                              <td className="p-4 text-slate-400 whitespace-nowrap">
                                {log.ip || '127.0.0.1'}
                              </td>
                              <td className="p-4 text-slate-500 max-w-xs truncate" title={log.userAgent}>
                                {log.userAgent || 'Unknown'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Admin Actions */}
      {confirmModal && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-serif font-bold text-white">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are performing an administrative action ({confirmModal.actionText}). Please confirm your intent.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
