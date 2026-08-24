import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Course, UserProfile, StudySession, AppState, StudyHubData, StudyGroup, AppNotification } from './types';
import { ICONS } from './constants';
import { GraduationCap, Menu, X, ShieldAlert, Shield, Lock, Sun, Moon, CheckCheck, Trash2 } from 'lucide-react';
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
import AnalyticsView from './components/AnalyticsView';
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
import ScolarisLogo from './components/ScolarisLogo';

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
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('scolaris_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('scolaris_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('scolaris_theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);
  
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

  // Update Page Title Metadata based on Active State
  useEffect(() => {
    if (showAdminLoginForm) {
      document.title = 'Admin | Scolaris AI';
      return;
    }
    if (!authUser && showAuth) {
      document.title = authMode === 'signup' ? 'Create Account | Scolaris AI' : 'Sign In | Scolaris AI';
      return;
    }
    if (!authUser) {
      document.title = 'Scolaris AI — AI-Powered Study Platform';
      return;
    }
    const tabTitles: Record<string, string> = {
      dashboard: 'Dashboard | Scolaris AI',
      courses: 'My Courses | Scolaris AI',
      hub: 'Study | Scolaris AI',
      tools: 'AI Study Tools | Scolaris AI',
      podcast: 'AI Podcast | Scolaris AI',
      profile: 'Profile | Scolaris AI',
      schedule: 'Schedule | Scolaris AI',
      groups: 'Study Circles | Scolaris AI',
      analytics: 'Analytics | Scolaris AI',
      paid: 'Pro Access | Scolaris AI',
      admin: 'Admin | Scolaris AI'
    };
    if (tabTitles[activeTab]) {
      document.title = tabTitles[activeTab];
    } else {
      const formatted = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
      document.title = `${formatted} | Scolaris AI`;
    }
  }, [activeTab, authUser, showAuth, authMode, showAdminLoginForm]);

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

  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  const notificationScrollRef = useRef<HTMLDivElement>(null);

  // Default initial notifications if empty
  useEffect(() => {
    if (notifications.length === 0 && authUser) {
      setNotifications([
        {
          id: 'notif-1',
          type: 'content',
          title: 'Welcome to Scolaris AI',
          message: 'Your AI Academic Studio is active. Explore your dashboard and generate study plans!',
          timestamp: Date.now() - 1000 * 60 * 5,
          read: false,
          link: 'dashboard'
        },
        {
          id: 'notif-2',
          type: 'session',
          title: 'Upcoming Study Session',
          message: 'Revision session scheduled. Review flashcards & study notes for your courses.',
          timestamp: Date.now() - 1000 * 60 * 25,
          read: false,
          link: 'schedule'
        },
        {
          id: 'notif-3',
          type: 'message',
          title: 'AI Study Assistant Ready',
          message: 'Ask Scolaris AI anything about your course materials or generate an AI podcast.',
          timestamp: Date.now() - 1000 * 60 * 90,
          read: false,
          link: 'hub'
        },
        {
          id: 'notif-4',
          type: 'content',
          title: 'Study Circle Collaboration',
          message: 'Connect with classmates in Study Circles to share notes and solve questions together.',
          timestamp: Date.now() - 1000 * 60 * 240,
          read: false,
          link: 'groups'
        }
      ]);
    }
  }, [authUser]);

  // Scroll-past auto-mark-as-read via IntersectionObserver
  useEffect(() => {
    if (!showNotifications || !notificationScrollRef.current) return;

    const scrollContainer = notificationScrollRef.current;
    const timers: Record<string, NodeJS.Timeout> = {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-notification-id');
          if (!id) return;

          if (entry.isIntersecting) {
            if (!timers[id]) {
              timers[id] = setTimeout(() => {
                setNotifications((prev) =>
                  prev.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))
                );
              }, 350);
            }
          } else {
            if (timers[id]) {
              clearTimeout(timers[id]);
              delete timers[id];
            }
          }
        });
      },
      {
        root: scrollContainer,
        threshold: 0.6,
      }
    );

    const items = scrollContainer.querySelectorAll('.notification-item');
    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [showNotifications, notifications]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMarkAllAsReadAnimated = () => {
    if (isMarkingAllRead) return;
    setIsMarkingAllRead(true);
    setTimeout(() => {
      markAllAsRead();
      setIsMarkingAllRead(false);
    }, 500);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const handleClearAllAnimated = () => {
    if (isClearingNotifications) return;
    setIsClearingNotifications(true);
    setTimeout(() => {
      clearNotifications();
      setIsClearingNotifications(false);
    }, 300);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // 1. Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-3 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl shadow-xl mb-4 animate-bounce">
          <ScolarisLogo variant="icon" size={32} colorClass="text-white" />
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
        return <AnalyticsView 
          courses={courses} 
          schedule={schedule} 
          profile={profile} 
          hubs={hubs}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          setCourses={setCourses}
        />;
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
    <div className="flex h-screen bg-slate-50/10 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden relative transition-colors duration-300">
      {/* Mobile Top Header Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-4 z-40 shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors active:scale-95"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-2">
            <ScolarisLogo variant="full" size={26} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title="Toggle Theme Mode"
          >
            {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}
          </button>

          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`p-2 rounded-lg transition-all duration-200 relative ${
              showNotifications 
                ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {ICONS.Bell}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900" />
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
        fixed inset-y-0 left-0 w-60 bg-white dark:bg-slate-900 z-50 flex flex-col border-r border-slate-100 dark:border-slate-800/80
        transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-50 dark:border-slate-800 lg:border-none">
          <div className="flex items-center gap-3">
            <ScolarisLogo variant="full" size={32} showSubtitle />
          </div>
          
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
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
                ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <div className={`transition-all duration-200 ${showNotifications ? 'scale-110 text-blue-600 dark:text-blue-400' : 'group-hover:scale-110'}`}>
              {ICONS.Bell}
              {unreadCount > 0 && (
                <span className="absolute top-2.5 left-6 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900" />
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
          
          <div className="h-px bg-slate-50 dark:bg-slate-800/60 my-2 mx-2" />

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as AppState);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                activeTab === item.id 
                  ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className={`transition-all duration-200 ${activeTab === item.id ? 'scale-110 text-blue-600 dark:text-blue-400' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <span className={`text-sm font-medium ${activeTab === item.id ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-4 space-y-2">
           {/* Global Theme Mode Button in Sidebar */}
           <button
             onClick={toggleTheme}
             className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
           >
             <span className="flex items-center gap-2">
               {isDarkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-600" />}
               <span>{isDarkMode ? 'Light Mode' : 'Study Dark Mode'}</span>
             </span>
             <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
               {isDarkMode ? 'DARK' : 'LIGHT'}
             </span>
           </button>

           <div className="pt-2 border-t border-slate-50 dark:border-slate-800/60 flex items-center justify-between">
              <button 
                onClick={() => {
                  setActiveTab('profile');
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 ${
                  activeTab === 'profile' 
                    ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-900/60 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
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
                className="p-2.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer mr-1"
              >
                <Shield size={16} />
              </button>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative pt-16 lg:pt-0 transition-colors duration-300">
        {showNotifications && (
          <div className="absolute top-4 right-4 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-2xl rounded-3xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
               <div className="flex items-center gap-2">
                 <h3 className="text-sm font-serif font-bold text-slate-900 dark:text-slate-100">Notifications</h3>
                 {unreadCount > 0 && (
                   <span className={`px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded-full border border-blue-500/20 transition-all duration-500 ${isMarkingAllRead ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
                     {unreadCount} new
                   </span>
                 )}
               </div>
               <div className="flex items-center gap-2">
                 {unreadCount > 0 && (
                   <button 
                     onClick={handleMarkAllAsReadAnimated}
                     disabled={isMarkingAllRead}
                     className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:text-blue-700 dark:hover:text-blue-300 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                     title="Mark all notifications as read"
                   >
                     <CheckCheck size={13} className={`transition-transform duration-300 ${isMarkingAllRead ? 'scale-125 text-emerald-500' : ''}`} />
                     <span>{isMarkingAllRead ? 'Reading...' : 'Read All'}</span>
                   </button>
                 )}
                 <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg">
                   <X size={14} />
                 </button>
               </div>
            </div>

            <div 
              ref={notificationScrollRef}
              className="max-h-[400px] overflow-y-auto custom-scrollbar transition-all duration-300"
            >
               {notifications.length === 0 ? (
                 <div className="p-10 text-center space-y-3">
                   <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800/60 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-600 mx-auto">
                     {ICONS.Bell}
                   </div>
                   <p className="text-slate-400 text-xs font-medium italic">No notifications yet.</p>
                 </div>
               ) : (
                 <div className={`divide-y divide-slate-100 dark:divide-slate-800 transition-all duration-300 ${isClearingNotifications ? 'opacity-0 scale-95 -translate-y-2' : 'opacity-100 scale-100'}`}>
                    {notifications.map(n => {
                      const isUnread = !n.read;
                      return (
                        <div 
                          key={n.id} 
                          data-notification-id={n.id}
                          onClick={() => {
                            if (n.link) setActiveTab(n.link);
                            setShowNotifications(false);
                            setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif));
                          }}
                          className={`notification-item p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-500 cursor-pointer group relative ${
                            isUnread && !isMarkingAllRead 
                              ? 'bg-blue-50/40 dark:bg-blue-950/30' 
                              : isUnread && isMarkingAllRead
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-500/30'
                              : ''
                          }`}
                        >
                           {/* Unread indicator dot with smooth scale animation */}
                           <div 
                             className={`absolute top-5 left-3 w-2 h-2 rounded-full transition-all duration-500 ease-out ${
                               isUnread && !isMarkingAllRead 
                                 ? 'bg-blue-600 dark:bg-blue-400 scale-100 opacity-100' 
                                 : isUnread && isMarkingAllRead
                                 ? 'bg-emerald-500 scale-125 opacity-100 animate-ping'
                                 : 'scale-0 opacity-0'
                             }`} 
                           />

                           <div className="pl-4 space-y-1">
                              <div className="flex items-center justify-between">
                                 <h4 className={`text-xs font-bold transition-colors duration-300 ${isUnread ? 'text-slate-900 dark:text-slate-100 font-extrabold' : 'text-slate-700 dark:text-slate-300'}`}>
                                   {n.title}
                                 </h4>
                                 <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{n.message}</p>
                           </div>
                        </div>
                      );
                    })}
                 </div>
               )}
            </div>

            {notifications.length > 0 && (
              <button 
                onClick={handleClearAllAnimated}
                disabled={isClearingNotifications}
                className="w-full p-3 text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-widest bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-t border-rose-100 dark:border-rose-900/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={12} />
                <span>{isClearingNotifications ? 'Clearing...' : 'Clear All'}</span>
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
