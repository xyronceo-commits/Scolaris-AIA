
import React, { useState, useEffect } from 'react';
import { Course, UserProfile, StudySession, AppState, StudyHubData, StudyGroup, AppNotification } from './types';
import { ICONS } from './constants';
import { GraduationCap, Menu, X, ChevronLeft, ChevronRight, Crown } from 'lucide-react';
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
import ProGate from './components/ProGate';
import Profile from './components/Profile';
import Tutorial from './components/Tutorial';
import Auth from './components/Auth';
import { supabase } from '@/lib/supabase';
import { DBService } from './services/db';
import { SubscriptionTier } from './types';

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
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(true);

  // Supabase Auth and Data Fetching
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleAuthSuccess(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        handleAuthSuccess(session.user);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = async (user: any) => {
    setLoading(true);
    try {
      let dbProfile = await DBService.getProfile(user.id);
      const isSignupFlow = localStorage.getItem('scolaris_is_signup') === 'true';
      
      if (dbProfile) {
        // If they had a profile but onboarded is false, and it is not a signup flow, bypass onboarding
        if (!dbProfile.onboarded && !isSignupFlow) {
          dbProfile.onboarded = true;
          dbProfile.tutorialSeen = true;
          await DBService.saveProfile(user.id, dbProfile);
        }
        
        setProfile(dbProfile);
        const [dbCourses, dbSchedule, dbHubs, dbGroups] = await Promise.all([
          DBService.getCourses(user.id),
          DBService.getSchedule(user.id),
          DBService.getHubs(user.id),
          DBService.getGroups(user.id)
        ]);
        setCourses(dbCourses);
        setSchedule(dbSchedule);
        setHubs(dbHubs);
        setGroups(dbGroups);
      } else {
        // New user - profile created in Auth.tsx or initialized here
        const defaultProfile = {
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Scholar',
          email: user.email || '',
          university: user.user_metadata?.university || '',
          level: user.user_metadata?.level || 'Undergraduate',
          age: user.user_metadata?.age || 18,
          onboarded: isSignupFlow ? false : true,
          tutorialSeen: isSignupFlow ? false : true,
          tier: 'free' as SubscriptionTier,
          isPro: false,
          notifications: { messages: true, sessions: true, aiContent: true },
          semesterEnd: ''
        };
        await DBService.saveProfile(user.id, defaultProfile);
        setProfile(defaultProfile);
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = async (newProfile: UserProfile) => {
    localStorage.removeItem('scolaris_is_signup');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await DBService.saveProfile(user.id, newProfile);
    }
    setProfile(newProfile);
    setActiveTab('dashboard');
  };

  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkDb = async () => {
      const isConnected = await DBService.checkConnection();
      setDbConnected(isConnected);
    };
    checkDb();
    const interval = setInterval(checkDb, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Sync state changes to DB
  useEffect(() => {
    const syncProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profile?.onboarded) return;
      DBService.saveProfile(user.id, profile);
    };
    if (profile?.onboarded) syncProfile();
  }, [profile]);

  useEffect(() => {
    const syncCourses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || courses.length === 0) return;
      DBService.saveCourses(user.id, courses);
    };
    if (profile?.onboarded) syncCourses();
  }, [courses, profile?.onboarded]);

  useEffect(() => {
    const syncSchedule = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || schedule.length === 0) return;
      DBService.saveSchedule(user.id, schedule);
    };
    if (profile?.onboarded) syncSchedule();
  }, [schedule, profile?.onboarded]);


  useEffect(() => {
    // Handle mobile responsiveness for sidebar
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notification for Upcoming Sessions
  useEffect(() => {
    if (!profile || !profile.onboarded || schedule.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      
      const todaySessions = schedule.filter(s => s.day === currentDay);
      
      todaySessions.forEach(session => {
        const lastNotifiedKey = `last_notified_session_${session.id}`;
        const lastNotified = localStorage.getItem(lastNotifiedKey);
        
        // Notify once per day if it's the right day
        if (!lastNotified || (Date.now() - parseInt(lastNotified)) > 86400000) {
           const course = courses.find(c => c.id === session.courseId);
           addNotification('session', 'Upcoming Study Session', `You have a ${session.mode} session for ${course?.code || 'your course'} today.`, 'schedule');
           localStorage.setItem(lastNotifiedKey, Date.now().toString());
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [profile, schedule, courses]);

  const handleTutorialComplete = () => {
    if (profile) {
      setProfile({ ...profile, tutorialSeen: true });
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    setProfile(null);
    setCourses([]);
    setSchedule([]);
    setHubs({});
    setGroups([]);
    setActiveTab('dashboard');
    setShowAuth(false);
  };


  const deleteAccount = () => {
    if (window.confirm("Are you absolutely sure you want to delete your account? This action is irreversible.")) {
      logout();
    }
  };

  const addNotification = (type: AppNotification['type'], title: string, message: string, link?: AppState) => {
    if (!profile) return;
    
    // Respect user preferences
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

  if (!profile) {
    if (showAuth) {
      return <Auth onAuth={(p) => setProfile(p)} initialMode={authMode} />;
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

  if (profile && !profile.onboarded) {
    return <Onboarding userEmail={profile.email} onComplete={handleOnboardingComplete} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard 
          profile={profile} 
          courses={courses} 
          schedule={schedule} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }}
          onUpgrade={() => setActiveTab('pro')}
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
          onUpgrade={() => setActiveTab('pro')}
          addNotification={addNotification}
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
        return <CGPACalculator />;
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
        return <Profile profile={profile} setProfile={setProfile} onSignOut={logout} onDelete={deleteAccount} />;
      case 'pro':
        return <ProGate profile={profile} setProfile={setProfile} onBack={() => setActiveTab('dashboard')} />;
      default:
        return <Dashboard 
          profile={profile} 
          courses={courses} 
          schedule={schedule} 
          onOpenHub={(id) => { setSelectedCourseId(id); setActiveTab('hub'); }} 
          onUpgrade={() => setActiveTab('pro')}
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

      {/* Sidebar - sliding drawer for mobile/tablet, persistent for desktop */}
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
           {profile.tier === 'free' && (
             <button 
               onClick={() => {
                 setActiveTab('pro');
                 if (window.innerWidth < 1024) setIsSidebarOpen(false);
               }}
               className="w-full h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl group border-t border-white/5 overflow-hidden relative"
             >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Crown size={16} className="text-amber-400" />
                <span className="font-bold text-xs uppercase tracking-widest">Go Pro</span>
             </button>
           )}

           <div className="pt-2 border-t border-slate-50">
              <button 
                onClick={() => {
                  setActiveTab('profile');
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  activeTab === 'profile' 
                    ? 'text-blue-600' 
                    : 'text-slate-400 hover:text-slate-900'
                }`}
              >
                {ICONS.User}
                <span className="text-sm font-bold uppercase tracking-widest mt-0.5 flex items-center gap-2">
                  Profile
                  <div className={`w-1 h-1 rounded-full ${dbConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                </span>
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
      </main>

      {profile && profile.onboarded && !profile.tutorialSeen && (
         <Tutorial onComplete={handleTutorialComplete} />
      )}
    </div>
  );
};

export default App;
