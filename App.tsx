import React, { useState, useEffect, useRef } from 'react';
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
import AcademicStudio from './components/AcademicStudio';
import PomodoroTimer from './components/PomodoroTimer';
import TimetableView from './components/TimetableView';
import Profile from './components/Profile';
import AnalyticsView from './components/AnalyticsView';
import { UserAvatar } from './components/UserAvatar';
import Tutorial from './components/Tutorial';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import { ScolarisChatWidget } from './components/ScolarisChatWidget';
import Auth, { type AuthMode } from './components/Auth';
import type { Session } from '@supabase/supabase-js';
import { supabase, toAuthUser, setCurrentUserId, type AuthUser } from './lib/supabase';
import { DBService } from './services/db';
import { cleanupLegacyApiKeyStorage } from './services/gemini';
import KorsIQLogo from './components/KorsIQLogo';
import StudyPlannerView from './components/StudyPlannerView';
import ResourcesView from './components/ResourcesView';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppState>('dashboard');
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedule, setSchedule] = useState<StudySession[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hubs, setHubs] = useState<Record<string, StudyHubData>>({});
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotifPermissionBanner, setShowNotifPermissionBanner] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      if (Notification.permission !== 'default') return false;
      return !localStorage.getItem('korsiq_notif_prompt_dismissed');
    } catch {
      return false;
    }
  });
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

  // Safe one-time legacy API key cleanup from browser storage
  useEffect(() => {
    cleanupLegacyApiKeyStorage();
  }, []);
  
  // Auth State Management
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');
  });
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Admin System State with 12-Hour Session Persistence
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('korsiq_admin_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.expiresAt && Date.now() < parsed.expiresAt) {
          return parsed.token;
        }
      }
    } catch {}
    return sessionStorage.getItem('scolaris_admin_token');
  });
  const [adminUser, setAdminUser] = useState<{ email: string; role: string; fullName?: string } | null>(() => {
    try {
      const stored = localStorage.getItem('korsiq_admin_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.expiresAt && Date.now() < parsed.expiresAt) {
          return parsed.user;
        }
      }
      const sessionStored = sessionStorage.getItem('scolaris_admin_user');
      return sessionStored ? JSON.parse(sessionStored) : null;
    } catch {
      return null;
    }
  });
  const [isClaimAdmin, setIsClaimAdmin] = useState(false);
  const [showAdminLoginForm, setShowAdminLoginForm] = useState(false);

  // Verify Admin Session validity against server
  useEffect(() => {
    if (!adminToken) return;
    fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          handleAdminSignOut();
        }
      })
      .catch(() => {});
  }, [adminToken]);

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

  // Update Page Title and Robots Metadata based on Active State
  useEffect(() => {
    let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      document.head.appendChild(robotsMeta);
    }

    if (showAdminLoginForm) {
      document.title = 'Admin | KorsIQ';
      robotsMeta.content = 'noindex, nofollow';
      return;
    }
    if (!authUser && showAuth) {
      document.title = authMode === 'signup' ? 'Create Account | KorsIQ' : 'Sign In | KorsIQ';
      robotsMeta.content = 'noindex, nofollow';
      return;
    }
    if (!authUser) {
      document.title = 'KorsIQ — AI-Powered Study & Academic Workspace';
      robotsMeta.content = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
      return;
    }

    // Authenticated private workspace views are strictly marked noindex
    robotsMeta.content = 'noindex, nofollow';

    const tabTitles: Record<string, string> = {
      dashboard: 'Dashboard | KorsIQ',
      courses: 'My Courses | KorsIQ',
      hub: 'Study | KorsIQ',
      tools: 'AI Study Tools | KorsIQ',
      podcast: 'AI Podcast | KorsIQ',
      profile: 'Profile | KorsIQ',
      schedule: 'Schedule | KorsIQ',
      groups: 'Study Circles | KorsIQ',
      analytics: 'Analytics | KorsIQ',
      paid: 'Pro Access | KorsIQ',
      admin: 'Admin | KorsIQ'
    };
    if (tabTitles[activeTab]) {
      document.title = tabTitles[activeTab];
    } else {
      const formatted = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
      document.title = `${formatted} | KorsIQ`;
    }
  }, [activeTab, authUser, showAuth, authMode, showAdminLoginForm]);

  // Load User Data & Profile from Supabase
  const isInitialDataLoadedRef = useRef(false);
  const loadUserData = async (user: AuthUser) => {
    isInitialDataLoadedRef.current = false;
    try {
      const uid = user.uid;
      let dbProfile = await DBService.getProfile(uid);

      if (dbProfile) {
        if ((!dbProfile.name || dbProfile.name === 'Scholar') && user.displayName) {
          dbProfile.name = user.displayName;
        }
        setProfile(dbProfile);
      } else {
        // Create initial default profile in Supabase for new user
        const newProfile: UserProfile = {
          name: user.displayName || user.email?.split('@')[0] || 'Scholar',
          email: user.email || '',
          university: '',
          level: 'Undergraduate',
          age: 20,
          onboarded: false,
          tutorialSeen: false,
          tier: 'free',
          isPro: false,
          subscriptionTier: 'free',
          subscriptionStatus: 'inactive',
          paymentStatus: 'none',
          targetCGPA: 0.00,
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
      isInitialDataLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  // Supabase Auth Observer
  const loadedUidRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      const user = session?.user ? toAuthUser(session.user) : null;

      if (!user || !user.emailVerified) {
        loadedUidRef.current = null;
        setCurrentUserId(undefined);
        setAuthUser(null);
        setProfile(null);
        setIsClaimAdmin(false);
        setAuthLoading(false);
        return;
      }

      setCurrentUserId(user.uid);
      setAuthUser(user);
      setSessionExpiredMsg(null);

      // Token refreshes re-fire this handler: only load data once per signed-in user
      if (loadedUidRef.current === user.uid) {
        setAuthLoading(false);
        return;
      }
      loadedUidRef.current = user.uid;
      setAuthLoading(true);

      // Admin status comes from the admins table (readable by the user for their own row)
      try {
        const { data } = await supabase.from('admins').select('user_id').eq('user_id', user.uid).maybeSingle();
        if (!cancelled) setIsClaimAdmin(!!data);
      } catch {
        if (!cancelled) setIsClaimAdmin(false);
      }

      await loadUserData(user);
      if (!cancelled) setAuthLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setShowAuth(true);
      }
      // Defer: calling Supabase APIs synchronously inside this callback can deadlock the client
      setTimeout(() => { if (!cancelled) applySession(session); }, 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
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
    if (authUser?.uid && profile?.onboarded && (isInitialDataLoadedRef.current || courses.length > 0)) {
      DBService.saveCourses(authUser.uid, courses);
    }
  }, [courses, profile?.onboarded, authUser?.uid]);

  useEffect(() => {
    if (authUser?.uid && profile?.onboarded && (isInitialDataLoadedRef.current || schedule.length > 0)) {
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
          const topicInfo = session.topic ? ` Today's focus: ${session.topic}.` : '';
          const techniqueInfo = session.technique ? ` Recommended technique: ${session.technique}.` : '';
          addNotification('session', 'Upcoming Study Session', `Your ${session.mode} session for ${course?.code || 'your course'} is scheduled today.${topicInfo}${techniqueInfo}`, 'schedule');
          localStorage.setItem(lastNotifiedKey, Date.now().toString());

          // Trigger native browser notification if permitted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && profile.notifications?.browserPush !== false) {
            try {
              new Notification(`KorsIQ Reminder: ${course?.code || 'Study Session'}`, {
                body: `Your ${session.mode} session is scheduled today.${topicInfo}`,
                icon: '/korsiq-logo-192.png'
              });
            } catch (err) {
              console.warn('Native notification dispatch error:', err);
            }
          }
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
    await supabase.auth.signOut().catch(() => {});
    loadedUidRef.current = null;
    setCurrentUserId(undefined);
    setAuthUser(null);
    setProfile(null);
    setCourses([]);
    setSchedule([]);
    setHubs({});
    setGroups([]);
    setActiveTab('dashboard');
    setShowAuth(true);
    setAuthMode('signin');
    setSessionExpiredMsg(null);
    handleAdminSignOut();
  };

  const handleAdminSignOut = () => {
    try {
      localStorage.removeItem('korsiq_admin_session');
    } catch {}
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

  const addNotification = async (type: AppNotification['type'], title: string, message: string, link?: AppState) => {
    if (!profile) return;
    if (type === 'message' && !profile.notifications?.messages) return;
    if (type === 'session' && !profile.notifications?.sessions) return;
    if (type === 'content' && !profile.notifications?.aiContent) return;

    if (authUser) {
      const persisted = await DBService.createNotification(authUser.uid, {
        type,
        title,
        message,
        read: false,
        link
      });
      setNotifications(prev => [persisted, ...prev.filter(p => p.id !== persisted.id)]);
    } else {
      const fallbackNotif: AppNotification = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false,
        link
      };
      setNotifications(prev => [fallbackNotif, ...prev]);
    }
  };

  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  const notificationScrollRef = useRef<HTMLDivElement>(null);

  // Load real persistent notifications from database
  useEffect(() => {
    if (!authUser) return;
    const loadDbNotifications = async () => {
      try {
        const dbNotifs = await DBService.getNotifications(authUser.uid);
        if (dbNotifs && dbNotifs.length > 0) {
          setNotifications(dbNotifs);
        } else {
          // If brand new user with no notifications in DB, create initial welcome notif
          const welcome = await DBService.createNotification(authUser.uid, {
            type: 'content',
            title: 'Welcome to KorsIQ',
            message: 'Your AI Academic Studio is active. Explore your dashboard and generate study plans!',
            read: false,
            link: 'dashboard'
          });
          setNotifications([welcome]);
        }
      } catch (err) {
        console.warn('Failed to load database notifications:', err);
      }
    };
    loadDbNotifications();
  }, [authUser]);

  // Mark single notification as read in DB and state
  const handleMarkNotificationRead = async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    if (authUser) {
      await DBService.markNotificationAsRead(authUser.uid, notifId);
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (authUser) {
      await DBService.markAllNotificationsAsRead(authUser.uid);
    }
  };

  const handleMarkAllAsReadAnimated = () => {
    if (isMarkingAllRead) return;
    setIsMarkingAllRead(true);
    markAllAsRead();
    setTimeout(() => {
      setIsMarkingAllRead(false);
    }, 400);
  };

  const clearNotifications = async () => {
    setNotifications([]);
    if (authUser) {
      await DBService.clearAllNotifications(authUser.uid);
    }
  };

  const handleClearAllAnimated = () => {
    if (isClearingNotifications) return;
    setIsClearingNotifications(true);
    clearNotifications();
    setTimeout(() => {
      setIsClearingNotifications(false);
    }, 300);
  };

  const handleEnableBrowserNotifs = async () => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && profile && authUser) {
          const updated: UserProfile = {
            ...profile,
            notifications: { ...profile.notifications, browserPush: true }
          };
          setProfile(updated);
          await DBService.saveProfile(authUser.uid, updated);
          addNotification('content', 'Browser Notifications Enabled', 'You will now receive timely reminders for deadlines and study sessions.');
        }
      }
    } catch (err) {
      console.warn('Notification permission error:', err);
    } finally {
      setShowNotifPermissionBanner(false);
      localStorage.setItem('korsiq_notif_prompt_dismissed', 'true');
    }
  };

  const handleDismissNotifBanner = () => {
    setShowNotifPermissionBanner(false);
    localStorage.setItem('korsiq_notif_prompt_dismissed', 'true');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // 1. Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-3 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl shadow-xl mb-4 animate-bounce">
          <KorsIQLogo variant="icon" size={32} onDark />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Resolving Academic Session...
        </p>
      </div>
    );
  }

  // 1.5 Password Recovery Flow
  if (isPasswordRecovery) {
    return (
      <Auth 
        onAuthSuccess={() => {
          setIsPasswordRecovery(false);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          setSessionExpiredMsg(null);
        }} 
        initialMode="reset_password"
        isDirectRecovery={true}
        onRecoveryComplete={() => {
          setIsPasswordRecovery(false);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
      />
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
    return <Onboarding userEmail={profile.email} initialProfile={profile} onComplete={handleOnboardingComplete} />;
  }

  // 6. Main Protected Application View & Admin Router
  const renderContent = () => {
    // Admin Route Handler
    if (activeTab === 'admin' || window.location.pathname === '/admin') {
      if (adminToken || isClaimAdmin) {
        return (
          <AdminDashboard
            adminToken={adminToken || ''}
            adminEmail={adminUser?.email || authUser?.email || 'buildsafe247@gmail.com'}
            onSignOut={handleAdminSignOut}
            onBackToStudentWorkspace={() => {
              window.history.pushState({}, '', '/');
              setActiveTab('dashboard');
            }}
          />
        );
      }

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

    switch (activeTab) {
      case 'overview':
      case 'dashboard':
        return <Dashboard 
          profile={profile} 
          courses={courses} 
          schedule={schedule} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          onNavigate={(tab) => { setActiveTab(tab); }}
        />;
      case 'planner':
        return <StudyPlannerView 
          initialTab="courses"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'courses':
        return <StudyPlannerView 
          initialTab="courses"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'calculator':
        return <StudyPlannerView 
          initialTab="cgpa"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'timetable':
        return <StudyPlannerView 
          initialTab="timetable"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'schedule':
        return <StudyPlannerView 
          initialTab="revision"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'analytics':
        return <StudyPlannerView 
          initialTab="analytics"
          courses={courses}
          setCourses={setCourses}
          schedule={schedule}
          setSchedule={setSchedule}
          profile={profile}
          onUpdateProfile={handleSaveProfile}
          addNotification={addNotification}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          hubs={hubs}
        />;
      case 'resources':
      case 'library':
        return <ResourcesView 
          courses={courses}
          groups={groups}
          profile={profile}
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
        />;
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
      case 'circles':
      case 'groups':
        return <StudyGroups 
          profile={profile} 
          userId={authUser?.uid}
          groups={groups} 
          setGroups={setGroups} 
          hubs={hubs}
          addNotification={addNotification}
        />;
      case 'studio':
        return <AcademicStudio 
          userId={authUser.uid} 
          profile={profile} 
          setProfile={handleSaveProfile} 
          onNavigateTab={(tab) => setActiveTab(tab as AppState)} 
        />;
      case 'pomodoro':
        return <PomodoroTimer />;
      case 'settings':
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

  // Spec Desktop Sidebar (Exactly 6 destinations)
  const desktopNavItems = [
    { id: 'overview', label: 'Overview', icon: ICONS.Dashboard },
    { id: 'planner', label: 'Study Planner', icon: ICONS.Courses },
    { id: 'studio', label: 'Academic Studio', icon: ICONS.Studio },
    { id: 'circles', label: 'Private Circles', icon: ICONS.Groups },
    { id: 'resources', label: 'Resources', icon: ICONS.Library },
    { id: 'settings', label: 'Settings', icon: ICONS.Settings },
  ];

  // Spec Mobile Bottom Bar (Exactly 5 destinations)
  const mobileNavItems = [
    { id: 'overview', label: 'Home', icon: ICONS.Dashboard },
    { id: 'planner', label: 'Planner', icon: ICONS.Courses },
    { id: 'studio', label: 'Studio', icon: ICONS.Studio },
    { id: 'circles', label: 'Circles', icon: ICONS.Groups },
    { id: 'resources', label: 'Library', icon: ICONS.Library },
  ];

  const isNavActive = (id: string) => {
    if (id === 'overview') return activeTab === 'overview' || activeTab === 'dashboard';
    if (id === 'planner') return ['planner', 'courses', 'schedule', 'timetable', 'calculator', 'analytics'].includes(activeTab);
    if (id === 'studio') return activeTab === 'studio';
    if (id === 'circles') return activeTab === 'circles' || activeTab === 'groups';
    if (id === 'resources') return activeTab === 'resources' || activeTab === 'library' || activeTab === 'hub';
    if (id === 'settings') return activeTab === 'settings' || activeTab === 'profile';
    return activeTab === id;
  };

  const currentNavTitle = desktopNavItems.find(item => isNavActive(item.id))?.label || 'Overview';

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-slate-950 font-sans text-[#111827] dark:text-slate-100 overflow-hidden relative">
      {/* Mobile Top Header Bar per Spec (Logo, Bell, Theme, Initials Avatar) */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-b border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <KorsIQLogo variant="full" size={28} />
        </div>

        <div className="flex items-center gap-1">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="p-2 text-[#5B6472] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer transition-colors"
          >
            {isDarkMode ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} className="text-[#5B6472]" />}
          </button>

          {/* Notifications Trigger */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            className={`p-2 rounded-lg transition-colors relative min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
              showNotifications 
                ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950 dark:text-blue-400' 
                : 'text-[#5B6472] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {ICONS.Bell}
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#2563EB] rounded-full" />
            )}
          </button>

          {/* Avatar Profile Trigger */}
          <button
            onClick={() => setActiveTab('settings')}
            aria-label="Account Settings"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <UserAvatar 
              name={profile?.name || 'User'}
              size="xs"
              useInitials
            />
          </button>
        </div>
      </header>

      {/* Desktop and Tablet Fixed Sidebar (Permanently displayed on md and above) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-[#E5E7EB] dark:border-slate-800 shrink-0 z-30">
        <div className="h-16 flex items-center justify-between px-5 border-b border-[#E5E7EB] dark:border-slate-800">
          <KorsIQLogo variant="full" size={32} showSubtitle />
        </div>
        
        {/* Navigation Items: Light blue bg with Primary blue text/icon when active */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {desktopNavItems.map((item) => {
            const isActive = isNavActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as AppState);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] cursor-pointer ${
                  isActive 
                    ? 'bg-[#EFF6FF] text-[#2563EB] font-semibold dark:bg-blue-950/60 dark:text-blue-400' 
                    : 'text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className={isActive ? 'text-[#2563EB] dark:text-blue-400' : 'text-[#5B6472] dark:text-slate-400'}>
                  {item.icon}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#E5E7EB] dark:border-slate-800 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-[#5B6472] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
          >
            <span className="flex items-center gap-2">
              {isDarkMode ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} className="text-[#5B6472]" />}
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </span>
            <span className="text-[10px] font-mono uppercase text-slate-400">
              {isDarkMode ? 'DARK' : 'LIGHT'}
            </span>
          </button>

          <div className="flex items-center justify-between pt-1">
            <button 
              onClick={() => {
                setActiveTab('settings');
              }}
              className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors min-h-[44px] cursor-pointer ${
                isNavActive('settings') 
                  ? 'bg-[#EFF6FF] text-[#2563EB] font-semibold dark:bg-blue-950/60 dark:text-blue-400' 
                  : 'text-[#111827] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <UserAvatar 
                name={profile?.name || 'Profile'}
                size="xs"
                useInitials
                showStatus
                isOnline={dbConnected ?? true}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#111827] dark:text-white truncate">
                  {profile?.name || 'Profile'}
                </p>
                <p className="text-[10px] text-[#5B6472] truncate">
                  {profile?.university || 'Student'}
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                window.history.pushState({}, '', '/admin');
                setActiveTab('admin');
                setShowAdminLoginForm(true);
              }}
              title="Admin Portal"
              aria-label="Admin Portal"
              className="p-2.5 text-[#5B6472] hover:text-[#111827] dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Shield size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop & Tablet Top Header Bar */}
        <header className="hidden md:flex h-16 bg-white dark:bg-slate-900 border-b border-[#E5E7EB] dark:border-slate-800 items-center justify-between px-8 z-20 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#5B6472] font-medium">KorsIQ</span>
            <span className="text-[#E5E7EB] dark:text-slate-700">/</span>
            <span className="text-[#111827] dark:text-slate-100 font-semibold">{currentNavTitle}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications Trigger */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`p-2.5 rounded-lg transition-colors relative min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
                showNotifications 
                  ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950 dark:text-blue-400' 
                  : 'text-[#5B6472] hover:text-[#111827] dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Notifications"
              aria-label="Notifications"
            >
              {ICONS.Bell}
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#2563EB] rounded-full" />
              )}
            </button>

            {/* Profile Avatar Pill */}
            <button
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer min-h-[44px]"
              aria-label="Open Settings"
            >
              <UserAvatar 
                name={profile?.name || 'Profile'}
                size="xs"
                useInitials
              />
              <span className="text-xs font-medium text-[#111827] dark:text-slate-200">
                {profile?.name ? profile.name.split(' ')[0] : 'Settings'}
              </span>
            </button>
          </div>
        </header>

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950 text-[#111827] dark:text-slate-100 relative pt-14 md:pt-0 pb-24 md:pb-8">
          {showNotifications && (
            <div className="absolute top-4 right-4 sm:right-8 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 shadow-xl rounded-lg z-50 overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#111827] dark:text-slate-100">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] text-[10px] font-bold rounded-full border border-blue-200">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllAsReadAnimated}
                      disabled={isMarkingAllRead}
                      className="text-[11px] font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 min-h-[44px] px-2"
                      title="Mark all notifications as read"
                    >
                      <CheckCheck size={13} />
                      <span>{isMarkingAllRead ? 'Marking...' : 'Mark all read'}</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setShowNotifications(false)} 
                    className="text-[#5B6472] hover:text-[#111827] transition-colors p-2 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label="Close notifications"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div 
                ref={notificationScrollRef}
                className="max-h-[380px] overflow-y-auto divide-y divide-[#E5E7EB] dark:divide-slate-800"
              >
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#5B6472] font-medium">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map(n => {
                    const isUnread = !n.read;
                    return (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          if (n.link) setActiveTab(n.link);
                          setShowNotifications(false);
                          handleMarkNotificationRead(n.id);
                        }}
                        className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex items-start gap-3 ${
                          isUnread ? 'bg-[#EFF6FF]/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isUnread ? 'bg-[#2563EB]' : 'bg-transparent'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className={`text-xs ${isUnread ? 'font-semibold text-[#111827] dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300'} truncate`}>
                              {n.title}
                            </h4>
                            <span className="text-[10px] text-[#5B6472] shrink-0">
                              {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-[#5B6472] dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {notifications.length > 0 && (
                <button 
                  onClick={handleClearAllAnimated}
                  disabled={isClearingNotifications}
                  className="w-full p-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 border-t border-[#E5E7EB] dark:border-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  <Trash2 size={12} />
                  <span>{isClearingNotifications ? 'Clearing...' : 'Clear all'}</span>
                </button>
              )}
            </div>
          )}

          <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 max-w-6xl">
            {/* Notification Permission Pre-Prompt Banner */}
            {showNotifPermissionBanner && (
              <div className="mb-6 p-4 bg-[#EFF6FF] dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 bg-[#2563EB] text-white rounded-lg shrink-0 mt-0.5">
                    {ICONS.Bell}
                  </div>
                  <div>
                    <p className="font-semibold text-[#111827] dark:text-white">Enable study &amp; deadline reminders</p>
                    <p className="text-[#5B6472] dark:text-slate-300 mt-0.5 leading-relaxed">
                      KorsIQ can send browser reminders before assignments are due, when revisions start, and when exam dates approach.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    onClick={handleDismissNotifBanner}
                    className="px-3 py-1.5 text-[#5B6472] dark:text-slate-400 hover:text-[#111827] dark:hover:text-white font-medium min-h-[44px] cursor-pointer"
                  >
                    Not now
                  </button>
                  <button
                    onClick={handleEnableBrowserNotifs}
                    className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg shadow-sm min-h-[44px] cursor-pointer"
                  >
                    Enable alerts
                  </button>
                </div>
              </div>
            )}

            {renderContent()}
          </div>

          {profile && profile.onboarded && (
            <ScolarisChatWidget 
              profile={profile}
              courses={courses}
              activeCourseId={selectedCourseId}
              activeHub={hubs[selectedCourseId || (courses[0]?.id || '')] || null}
            />
          )}
        </main>

        {/* Mobile Pinned Bottom Navigation Bar (Visible ONLY on mobile devices) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-[#E5E7EB] dark:border-slate-800 grid grid-cols-5 z-40 px-1">
          {mobileNavItems.map((item) => {
            const isActive = isNavActive(item.id);
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as AppState)}
                className={`flex flex-col items-center justify-center py-1 transition-colors min-h-[44px] cursor-pointer ${
                  isActive ? 'text-[#2563EB] dark:text-blue-400 font-semibold' : 'text-[#5B6472] dark:text-slate-400'
                }`}
              >
                <div className="scale-90">{item.icon}</div>
                <span className="text-[10px] mt-0.5">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {profile && profile.onboarded && !profile.tutorialSeen && (
         <Tutorial onComplete={handleTutorialComplete} />
      )}
    </div>
  );
};

export default App;
