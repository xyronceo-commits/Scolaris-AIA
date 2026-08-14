import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Course, UserProfile, StudySession, AppState, StudyHubData, StudyGroup, AppNotification } from './types';
import { ICONS } from './constants';
import { GraduationCap, Menu, X, ShieldAlert, Shield, Lock } from 'lucide-react';
import Onboarding from './components/Onboarding';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import CourseManager from './components/CourseManager';
import ScheduleView from './components/ScheduleView';
import StudyHub from './components/StudyHub';
import StudyGroups from './components/StudyGroups';
import CGPACalculator from './components/CGPACalculator';
import PomodoroTimer from './components/PomodoroTimer';
import TimetableView from './components/TimetableView';
import Profile from './components/Profile';
import { UserAvatar } from './components/UserAvatar';
import Tutorial from './components/Tutorial';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import { ScolarisChatWidget } from './components/ScolarisChatWidget';
import Auth from './components/Auth';
import { EmailVerification } from './components/EmailVerification';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { DBService } from './services/db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppState>('dashboard');
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedule, setSchedule] = useState<StudySession[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hubs, setHubs] = useState<Record<string, StudyHubData>>({});
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Auth State Management
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Admin System State
  const [adminToken, setAdminToken] = useState<string | null>(() => sessionStorage.getItem('scolaris_admin_token'));
  const [adminUser, setAdminUser] = useState<{ email: string; role: string } | null>(() => {
    try {
      const stored = sessionStorage.getItem('scolaris_admin_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isClaimAdmin, setIsClaimAdmin] = useState(false);
  const [showAdminLoginForm, setShowAdminLoginForm] = useState(false);

  // URL Path Listener for /admin
  useEffect(() => {
    const handleLocationChange = () => {
      if (window.location.pathname === '/admin') {
        setActiveTab('admin');
      }
    };
    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Load User Data & Profile from Firestore
  const loadUserData = async (user: User) => {
    try {
      const uid = user.uid;
      let dbProfile = await DBService.getProfile(uid);

      if (dbProfile) {
        setProfile(dbProfile);
      } else {
        // Create initial default profile in Firestore for new user
        const newProfile: UserProfile = {
          name: user.displayName || user.email?.split('@')[0] || 'Scholar',
          email: user.email || '',
          university: '',
          level: 'Undergraduate',
          age: 18,
          onboarded: false,
          tutorialSeen: false,
          tier: 'scholar',
          isPro: true,
          notifications: { messages: true, sessions: true, aiContent: true },
          semesterEnd: ''
        };
        await DBService.saveProfile(uid, newProfile);
        setProfile(newProfile);
      }

      const [dbCourses, dbSchedule, dbHubs, dbGroups] = await Promise.all([
        DBService.getCourses(uid),
        DBService.getSchedule(uid),
        DBService.getHubs(uid),
        DBService.getGroups(uid)
      ]);
      setCourses(dbCourses);
      setSchedule(dbSchedule);
      setHubs(dbHubs);
      setGroups(dbGroups);
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);

      if (user) {
        await user.reload().catch(() => {});
        const currentUser = auth.currentUser || user;
        setAuthUser(currentUser);
        setSessionExpiredMsg(null);

        // Check for admin custom claim
        try {
          const idTokenResult = await currentUser.getIdTokenResult(true);
          if (idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin') {
            setIsClaimAdmin(true);
          } else {
            setIsClaimAdmin(false);
          }
        } catch {
          setIsClaimAdmin(false);
        }

        if (currentUser.emailVerified) {
          await loadUserData(currentUser);
        }
      } else {
        setAuthUser(null);
        setProfile(null);
        setIsClaimAdmin(false);
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // DB Connection Health Checker
  useEffect(() => {
    const checkDb = async () => {
      const isConnected = await DBService.checkConnection();
      setDbConnected(isConnected);
    };
    checkDb();
    const interval = setInterval(checkDb, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync state changes to DB
  useEffect(() => {
    if (authUser?.uid && profile?.onboarded) {
      DBService.saveProfile(authUser.uid, profile);
    }
  }, [profile, authUser?.uid]);

  useEffect(() => {
    if (authUser?.uid && profile?.onboarded && courses.length > 0) {
      DBService.saveCourses(authUser.uid, courses);
    }
  }, [courses, profile?.onboarded, authUser?.uid]);

  useEffect(() => {
    if (authUser?.uid && profile?.onboarded && schedule.length > 0) {
      DBService.saveSchedule(authUser.uid, schedule);
    }
  }, [schedule, profile?.onboarded, authUser?.uid]);

  // Mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notifications for Upcoming Sessions
  useEffect(() => {
    if (!profile || !profile.onboarded || schedule.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      const todaySessions = schedule.filter(s => s.day === currentDay);
      
      todaySessions.forEach(session => {
        const lastNotifiedKey = `last_notified_session_${session.id}`;
        const lastNotified = localStorage.getItem(lastNotifiedKey);
        
        if (!lastNotified || (Date.now() - parseInt(lastNotified, 10)) > 86400000) {
          const course = courses.find(c => c.id === session.courseId);
          addNotification('session', 'Upcoming Study Session', `You have a ${session.mode} session for ${course?.code || 'your course'} today.`, 'schedule');
          localStorage.setItem(lastNotifiedKey, Date.now().toString());
        }
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [profile, schedule, courses]);

  const handleSaveProfile = async (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
    if (authUser) {
      await DBService.saveProfile(authUser.uid, updatedProfile);
    }
  };

  const handleOnboardingComplete = async (newProfile: UserProfile) => {
    if (authUser) {
      await DBService.saveProfile(authUser.uid, newProfile);
    }
    setProfile(newProfile);
    setActiveTab('dashboard');
  };

  const handleTutorialComplete = () => {
    if (profile) {
      setProfile({ ...profile, tutorialSeen: true });
    }
  };

  const handleSignOut = async () => {
    await firebaseSignOut(auth).catch(() => {});
    setAuthUser(null);
    setProfile(null);
    setCourses([]);
    setSchedule([]);
    setHubs({});
    setGroups([]);
    setActiveTab('dashboard');
    setShowAuth(true);
    setSessionExpiredMsg(null);
    handleAdminSignOut();
  };

  const handleAdminSignOut = () => {
    sessionStorage.removeItem('scolaris_admin_token');
    sessionStorage.removeItem('scolaris_admin_user');
    setAdminToken(null);
    setAdminUser(null);
    setShowAdminLoginForm(false);
    if (window.location.pathname === '/admin') {
      window.history.pushState({}, '', '/');
    }
    setActiveTab('dashboard');
  };

  const deleteAccount = () => {
    if (window.confirm("Are you absolutely sure you want to delete your account? This action is irreversible.")) {
      handleSignOut();
    }
  };

  const addNotification = (type: AppNotification['type'], title: string, message: string, link?: AppState) => {
    if (!profile) return;
    if (type === 'message' && !profile.notifications?.messages) return;
    if (type === 'session' && !profile.notifications?.sessions) return;
    if (type === 'content' && !profile.notifications?.aiContent) return;

    const newNotification: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      link
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // 1. Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl mb-4 animate-bounce">
          <div className="font-serif font-bold text-xl italic">S</div>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Resolving Academic Session...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated State
  if (!authUser) {
    if (showAuth) {
      return (
        <Auth 
          onAuthSuccess={() => setSessionExpiredMsg(null)} 
          initialMode={authMode} 
          sessionExpiredMsg={sessionExpiredMsg}
        />
      );
    }
    return (
      <LandingPage 
        onStart={() => {
          setAuthMode('signup');
          setShowAuth(true);
        }} 
        onSignIn={() => {
          setAuthMode('signin');
          setShowAuth(true);
        }} 
      />
    );
  }

  // 3. Email Unverified State (for Email/Password Accounts)
  if (authUser && !authUser.emailVerified) {
    return (
      <EmailVerification
        userEmail={authUser.email || ''}
        onVerified={async () => {
          await authUser.reload();
          if (auth.currentUser?.emailVerified) {
            setAuthUser(auth.currentUser);
            await loadUserData(auth.currentUser);
          }
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  // 4. Loading User Data / Profile State
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl mb-4 animate-spin">
          <GraduationCap size={24} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Loading Academic Records...
        </p>
      </div>
    );
  }

  // 5. Onboarding View
  if (profile && !profile.onboarded) {
    return <Onboarding userEmail={profile.email} onComplete={handleOnboardingComplete} />;
  }

  // 6. Main Protected Application View & Admin Router
  const renderContent = () => {
    // Admin Route Handler
    if (activeTab === 'admin' || window.location.pathname === '/admin') {
      if (adminToken || isClaimAdmin) {
        return (
          <AdminDashboard
            adminToken={adminToken || ''}
            adminEmail={adminUser?.email || authUser?.email || 'admin@scolaris.ai'}
            onSignOut={handleAdminSignOut}
            onBackToStudentWorkspace={() => {
              window.history.pushState({}, '', '/');
              setActiveTab('dashboard');
            }}
          />
        );
      }

      if (showAdminLoginForm || !authUser) {
        return (
          <AdminLogin
            onLoginSuccess={(token, user) => {
              setAdminToken(token);
              setAdminUser(user);
              setShowAdminLoginForm(false);
              setActiveTab('admin');
            }}
            onBackToStudentPortal={() => {
              window.history.pushState({}, '', '/');
              setActiveTab('dashboard');
            }}
          />
        );
      }

      return (
        <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-6">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center border border-rose-500/20 shadow-xl">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-serif font-bold text-slate-900">Access Denied</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              You do not have administrator privileges. Only authorized Scolaris AI administrative accounts can access this panel.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={() => {
                window.history.pushState({}, '', '/');
                setActiveTab('dashboard');
              }}
              className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:bg-slate-800 cursor-pointer"
            >
              Return to Student Portal
            </button>
            <button
              onClick={() => setShowAdminLoginForm(true)}
              className="flex-1 py-3 px-4 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold transition-all border border-blue-200 hover:bg-blue-100 cursor-pointer"
            >
              Admin Sign In
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard 
          profile={profile} 
          courses={courses} 
          schedule={schedule} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          onNavigate={(tab) => { setActiveTab(tab); }}
        />;
      case 'courses':
        return <CourseManager 
          courses={courses} 
          setCourses={setCourses} 
          onScheduleGenerated={(newSchedule) => { setSchedule(newSchedule); setActiveTab('schedule'); }} 
          profile={profile}
        />;
      case 'schedule':
        return <ScheduleView 
          schedule={schedule} 
          courses={courses} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
        />;
      case 'timetable':
        return <TimetableView schedule={schedule} courses={courses} />;
      case 'hub':
        return <StudyHub 
          courses={courses} 
          selectedCourseId={selectedCourseId} 
          hubs={hubs} 
          setHubs={setHubs}
          groups={groups}
          setGroups={setGroups}
          profile={profile}
          addNotification={addNotification}
          onCourseIdChange={setSelectedCourseId}
        />;
      case 'groups':
        return <StudyGroups 
          profile={profile} 
          groups={groups} 
          setGroups={setGroups} 
          hubs={hubs}
          addNotification={addNotification}
        />;
      case 'calculator':
        return <CGPACalculator profile={profile} onUpdateProfile={handleSaveProfile} />;
      case 'pomodoro':
      case 'library':
        return <PomodoroTimer />;
      case 'analytics':
        return <div className="text-center py-20 bg-white rounded-[3rem] border border-slate-100 shadow-sm animate-in fade-in">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
            {ICONS.Analytics}
          </div>
          <h2 className="text-3xl font-serif font-bold text-slate-900 mb-4">Deep Analytics</h2>
          <p className="text-slate-500 font-medium max-w-sm mx-auto leading-relaxed italic">
            Visualizing your academic journey. This feature is being tuned for peak precision.
          </p>
        </div>;
      case 'profile':
        return <Profile profile={profile} setProfile={handleSaveProfile} onSignOut={handleSignOut} onDelete={deleteAccount} />;
      default:
        return <Dashboard 
          profile={profile} 
          courses={courses} 
          schedule={schedule} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }} 
          onNavigate={(tab) => { setActiveTab(tab); }}
        />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: ICONS.Dashboard },
    { id: 'courses', label: 'Courses', icon: ICONS.Courses },
    { id: 'schedule', label: 'Schedule', icon: ICONS.Schedule },
    { id: 'hub', label: 'Study Hub', icon: ICONS.StudyHub },
    { id: 'groups', label: 'Circles', icon: ICONS.Groups },
    { id: 'calculator', label: 'GPA Calc', icon: ICONS.Calculator },
    { id: 'analytics', label: 'Analytics', icon: ICONS.Analytics },
    { id: 'pomodoro', label: 'Study Timer', icon: ICONS.Pomodoro },
  ];

  return (
    <div className="flex h-screen bg-slate-50/10 font-sans text-slate-900 overflow-hidden relative">
      {/* Mobile Top Header Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors active:scale-95"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center text-white shadow-md">
               <div className="font-serif font-bold text-xs">S</div>
            </div>
            <span className="font-serif font-bold text-base tracking-tight leading-none text-slate-900">Scolaris</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`p-2 rounded-lg transition-all duration-200 relative ${
              showNotifications ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ICONS.Bell}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            )}
          </button>
        </div>
      </header>

      {/* Sidebar Overlay for Mobile/Tablet */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 transition-opacity duration-300"
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 w-60 bg-white z-50 flex flex-col border-r border-slate-100 
        transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-50 lg:border-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-lg">
               <div className="font-serif font-bold text-base">S</div>
            </div>
            <div className="flex flex-col">
               <span className="font-serif font-bold text-lg tracking-tight leading-none">Scolaris</span>
               <span className="text-[9px] font-bold text-slate-400 tracking-[0.1em] mt-1 uppercase">FREE</span>
            </div>
          </div>
          
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto custom-scrollbar-mini">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
              showNotifications 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className={`transition-all duration-200 ${showNotifications ? 'scale-110 text-blue-600' : 'group-hover:scale-110'}`}>
              {ICONS.Bell}
              {unreadCount > 0 && (
                <span className="absolute top-2.5 left-6 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
              )}
            </div>
            <span className={`text-sm font-medium ${showNotifications ? 'font-bold' : ''}`}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
          </button>
          
          <div className="h-px bg-slate-50 my-2 mx-2" />

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as AppState);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                activeTab === item.id 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className={`transition-all duration-200 ${activeTab === item.id ? 'scale-110 text-blue-600' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className={`text-sm font-medium ${activeTab === item.id ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-4 space-y-4">
           <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
              <button 
                onClick={() => {
                  setActiveTab('profile');
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 ${
                  activeTab === 'profile' 
                    ? 'bg-blue-50 text-blue-600 font-bold border border-blue-100 shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <UserAvatar 
                  avatarIcon={profile?.avatarIcon || 'graduation-cap'} 
                  name={profile?.name || 'Profile'}
                  size="xs"
                  showStatus
                  isOnline={dbConnected ?? true}
                />
                <span className="text-xs font-bold truncate">
                  {profile?.name ? profile.name.split(' ')[0] : 'Profile'}
                </span>
              </button>

              {/* Discreet Admin Portal Entry Icon */}
              <button
                onClick={() => {
                  window.history.pushState({}, '', '/admin');
                  setActiveTab('admin');
                  setShowAdminLoginForm(true);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                title="Admin Portal"
                className="p-2.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100/80 rounded-xl transition-all cursor-pointer mr-1"
              >
                <Shield size={16} />
              </button>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white relative pt-16 lg:pt-0">
        {showNotifications && (
          <div className="absolute top-4 right-4 w-80 bg-white border border-slate-100 shadow-2xl rounded-3xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
               <h3 className="text-sm font-serif font-bold text-slate-900">Notifications</h3>
               <div className="flex gap-2">
                 <button onClick={markAllAsRead} className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:text-blue-700">Mark all Read</button>
                 <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
               </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
               {notifications.length === 0 ? (
                 <div className="p-10 text-center space-y-3">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mx-auto">
                     {ICONS.Bell}
                   </div>
                   <p className="text-slate-400 text-xs font-medium italic">No notifications yet.</p>
                 </div>
               ) : (
                 <div className="divide-y divide-slate-50">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          if (n.link) setActiveTab(n.link);
                          setShowNotifications(false);
                          setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
                        }}
                        className={`p-4 hover:bg-slate-50 transition-all cursor-pointer group relative ${!n.read ? 'bg-blue-50/30' : ''}`}
                      >
                         {!n.read && <div className="absolute top-5 left-2 w-1.5 h-1.5 bg-blue-600 rounded-full" />}
                         <div className="pl-3 space-y-1">
                            <div className="flex items-center justify-between">
                               <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                               <span className="text-[9px] text-slate-400 font-medium">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                         </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
            {notifications.length > 0 && (
              <button 
                onClick={clearNotifications}
                className="w-full p-3 text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-rose-50/30 hover:bg-rose-50 border-t border-rose-100 transition-all"
              >
                Clear All
              </button>
            )}
          </div>
        )}

        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 max-w-6xl">
           {renderContent()}
        </div>

        {profile && profile.onboarded && (
          <ScolarisChatWidget 
            courses={courses}
            activeCourseId={selectedCourseId}
            activeHub={hubs[selectedCourseId || (courses[0]?.id || '')] || null}
          />
        )}
      </main>

      {profile && profile.onboarded && !profile.tutorialSeen && (
         <Tutorial onComplete={handleTutorialComplete} />
      )}
    </div>
  );
};

export default App;
