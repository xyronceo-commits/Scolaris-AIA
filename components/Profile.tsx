import React from 'react';
import { UserProfile } from '../types';
import { ICONS } from '../constants';
import { UserAvatar, AVATAR_OPTIONS } from './UserAvatar';
import { ArrowRight, LogOut, Sparkles, X, Key, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

interface ProfileProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onSignOut: () => void;
  onDelete: () => void;
}

const Profile: React.FC<ProfileProps> = ({ profile, setProfile, onSignOut, onDelete }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedProfile, setEditedProfile] = React.useState(profile);

  React.useEffect(() => {
    setEditedProfile(profile);
  }, [profile]);
  
  const [apiKeyInput, setApiKeyInput] = React.useState(() => localStorage.getItem('scolaris_custom_groq_api_key') || localStorage.getItem('scolaris_custom_gemini_api_key') || '');
  const [showKey, setShowKey] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (trimmed) {
      localStorage.setItem('scolaris_custom_groq_api_key', trimmed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      handleClearKey();
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem('scolaris_custom_groq_api_key');
    localStorage.removeItem('scolaris_custom_gemini_api_key');
    setApiKeyInput('');
    setSaveSuccess(false);
  };

  const handleSave = () => {
    setProfile(editedProfile);
    setIsEditing(false);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight leading-none">Profile</h1>
          <p className="text-slate-500 font-medium text-sm italic mt-1">Manage your account and preferences</p>
        </div>
        <button 
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all ${
            isEditing 
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200' 
            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          {isEditing ? 'Save Changes' : 'Edit Profile'}
        </button>
      </div>

      <div className="space-y-10">
        {/* Account Card */}
        <section className="space-y-4">
           <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{profile.name.split(' ')[0]}'s Account</h3>
           <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                 <div className="shrink-0">
                   <UserAvatar 
                     avatarIcon={editedProfile.avatarIcon || profile.avatarIcon || 'graduation-cap'}
                     name={profile.name}
                     size="xl"
                     showStatus
                     isOnline
                   />
                 </div>
                 <div className="space-y-1 w-full max-w-xs">
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editedProfile.name}
                        onChange={e => setEditedProfile({...editedProfile, name: e.target.value})}
                        className="w-full text-lg font-serif font-bold text-slate-900 border-b border-blue-200 focus:outline-none focus:border-blue-500 bg-transparent"
                      />
                    ) : (
                      <h2 className="text-lg font-serif font-bold text-slate-900">{profile.name}</h2>
                    )}
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editedProfile.university}
                        onChange={e => setEditedProfile({...editedProfile, university: e.target.value})}
                        className="w-full text-xs text-slate-500 font-medium italic border-b border-blue-100 focus:outline-none focus:border-blue-400 bg-transparent mt-1"
                      />
                    ) : (
                      <p className="text-slate-500 font-medium text-xs italic">{profile.university}</p>
                    )}
                 </div>
              </div>

              {/* Avatar Icon Choice Selection Grid */}
              {isEditing && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    Choose Profile Avatar Icon
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                    {AVATAR_OPTIONS.map((opt) => {
                      const isSelected = (editedProfile.avatarIcon || profile.avatarIcon || 'graduation-cap') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setEditedProfile({ ...editedProfile, avatarIcon: opt.id })}
                          className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 border-2 border-blue-600 shadow-sm scale-105'
                              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                          }`}
                          title={opt.name}
                        >
                          <UserAvatar avatarIcon={opt.id} size="sm" />
                          <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center mt-1.5">
                            {opt.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 pt-2">
                 <div className="space-y-1 px-4 border-l-2 border-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">User ID</p>
                    <p className="text-sm font-bold text-slate-900 truncate">SCL-882-991-X</p>
                 </div>
                 <div className="space-y-1 px-4 border-l-2 border-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Email Address</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{profile.email}</p>
                 </div>
                 <div className="space-y-1 px-4 border-l-2 border-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Level of Study</p>
                    {isEditing ? (
                      <select 
                        value={editedProfile.level}
                        onChange={e => setEditedProfile({...editedProfile, level: e.target.value})}
                        className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                      >
                         <option>Freshman</option>
                         <option>Sophomore</option>
                         <option>Junior</option>
                         <option>Senior</option>
                         <option>Post-Grad</option>
                         <option>Undergraduate</option>
                         <option>Postgraduate</option>
                         <option>PhD / Research</option>
                      </select>
                    ) : (
                      <p className="text-sm font-bold text-slate-900">{profile.level}</p>
                    )}
                 </div>
                 <div className="space-y-1 px-4 border-l-2 border-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Age</p>
                    {isEditing ? (
                      <input 
                        type="number"
                        value={editedProfile.age || ''}
                        onChange={e => setEditedProfile({...editedProfile, age: e.target.value === '' ? '' as any : parseInt(e.target.value) || 0})}
                        className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none w-16"
                      />
                    ) : (
                      <p className="text-sm font-bold text-slate-900">{profile.age || 18}</p>
                    )}
                 </div>
                 <div className="space-y-1 px-4 border-l-2 border-slate-50">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-500">Targeted CGPA</p>
                    {isEditing ? (
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        max="5.00"
                        value={editedProfile.targetCGPA !== undefined ? editedProfile.targetCGPA : 4.50}
                        onChange={e => setEditedProfile({...editedProfile, targetCGPA: parseFloat(e.target.value) || 0})}
                        className="text-sm font-bold text-indigo-600 bg-transparent focus:outline-none w-20 border-b border-indigo-300"
                      />
                    ) : (
                      <p className="text-sm font-bold text-indigo-600">{(profile?.targetCGPA ?? 4.50).toFixed(2)}</p>
                    )}
                 </div>
              </div>
           </div>
         </section>

         {/* Preferences Section */}
        <section className="space-y-4">
           <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Preferences</h3>
              <button 
                onClick={() => setProfile({ ...profile, tutorialSeen: false })}
                className="group flex items-center gap-2.5 px-4 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-100 rounded-full transition-all duration-500"
              >
                <div className="w-5 h-5 bg-white text-blue-500 rounded-full flex items-center justify-center shadow-sm group-hover:rotate-12 transition-transform">
                  <Sparkles size={10} />
                </div>
                <span className="text-[9px] font-bold text-slate-500 group-hover:text-blue-700 uppercase tracking-widest">Re-show Tutorial</span>
              </button>
           </div>
           <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              {[
                { id: 'messages', label: 'Group Messages', desc: 'Alerts for new messages in study circles', icon: ICONS.Groups, value: profile.notifications?.messages ?? true },
                { id: 'sessions', label: 'Upcoming Sessions', desc: 'Reminders for your scheduled study times', icon: ICONS.Schedule, value: profile.notifications?.sessions ?? true },
                { id: 'aiContent', label: 'AI Content Readiness', desc: 'Alerts when your AI materials are processed', icon: ICONS.Sparkles, value: profile.notifications?.aiContent ?? true },
              ].map(notif => (
                <div key={notif.id} className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                         {notif.icon}
                      </div>
                      <div className="space-y-0.5">
                         <h4 className="text-sm font-bold text-slate-900">{notif.label}</h4>
                         <p className="text-[10px] text-slate-500 font-medium italic">{notif.desc}</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setProfile({
                       ...profile,
                       notifications: {
                         messages: profile.notifications?.messages ?? true,
                         sessions: profile.notifications?.sessions ?? true,
                         aiContent: profile.notifications?.aiContent ?? true,
                         [notif.id]: !notif.value
                       }
                     })}
                     className={`w-11 h-6 rounded-full relative transition-all duration-500 ease-out border-2 ${notif.value ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}
                   >
                     <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-500 shadow-lg ${notif.value ? 'left-6 blur-none scale-100' : 'left-0.5 blur-[1px] scale-90 opacity-80'}`} />
                     {notif.value && (
                       <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-1 bg-blue-400 rounded-full animate-pulse" />
                     )}
                   </button>
                </div>
              ))}
           </div>
        </section>

        {/* System & Security Section */}
        <section className="space-y-4">
           <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">System & Security</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={onSignOut}
                className="w-full p-6 text-left bg-white border border-slate-100 rounded-[1.5rem] hover:bg-slate-50 transition-all group flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
                      <LogOut size={18} />
                   </div>
                   <div className="space-y-0.5">
                      <h4 className="text-sm font-serif font-bold text-slate-900 italic tracking-tight">Sign Out</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">End Session</p>
                   </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
              </button>

              <button 
                onClick={() => { if(confirm("Permanently delete academic records?")) onDelete(); }}
                className="w-full p-6 text-left bg-rose-50/30 border border-rose-100 rounded-[1.5rem] hover:bg-rose-50 transition-all group flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all">
                      <X size={18} />
                   </div>
                   <div className="space-y-0.5">
                      <h4 className="text-sm font-serif font-bold text-rose-900 italic tracking-tight">Delete Account</h4>
                      <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Wipe Data</p>
                   </div>
                </div>
                <ArrowRight size={14} className="text-rose-300 group-hover:text-rose-900 group-hover:translate-x-1 transition-all" />
              </button>
           </div>
        </section>
      </div>
    </div>
  );
};

export default Profile;
