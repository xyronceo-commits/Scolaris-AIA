import React from 'react';
import { UserProfile } from '../types';
import { ICONS } from '../constants';
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
  
  const [apiKeyInput, setApiKeyInput] = React.useState(() => localStorage.getItem('scolaris_custom_gemini_api_key') || '');
  const [showKey, setShowKey] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (trimmed) {
      localStorage.setItem('scolaris_custom_gemini_api_key', trimmed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      handleClearKey();
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem('scolaris_custom_gemini_api_key');
    setApiKeyInput('');
    setSaveSuccess(false);
    // Trigger window storage/state event if needed, but standard reload or local variable state is perfect
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
              <div className="flex items-center gap-6">
                 <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-2xl font-serif font-bold italic shadow-xl relative">
                    {profile.name.charAt(0)}
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center">
                       <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    </div>
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
              </div>
           </div>
        </section>

        {/* Scolaris AI Companion Control Panel */}
         <section className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scolaris AI Companion</h3>
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-[1.25rem] flex items-center justify-center shadow-inner">
                        <Key size={20} />
                     </div>
                     <div className="space-y-0.5">
                        <h4 className="text-sm font-bold text-slate-900">Custom Gemini API Key</h4>
                        <p className="text-[10px] text-slate-500 font-medium italic">Override system default model keys with your preferred credential</p>
                     </div>
                  </div>
                  <div>
                     {localStorage.getItem('scolaris_custom_gemini_api_key') ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           Companion Override Active
                        </span>
                     ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-100">
                           <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                           Using Default System Key
                        </span>
                     )}
                  </div>
               </div>

               <div className="space-y-3 pt-2">
                  <div className="relative">
                     <input 
                       type={showKey ? "text" : "password"}
                       value={apiKeyInput}
                       onChange={e => setApiKeyInput(e.target.value)}
                       placeholder="Enter your Gemini API Key (starts with AIzaSy...)"
                       className="w-full pl-4 pr-12 py-3 bg-slate-50/50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl text-sm font-mono focus:outline-none transition-all placeholder:text-slate-300 placeholder:font-sans"
                     />
                     <button 
                       type="button"
                       onClick={() => setShowKey(!showKey)}
                       className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                     >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                     </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                     <p className="text-[10px] text-zinc-400 font-medium max-w-prose">
                        Your credential is saved securely in your browser (<b>localStorage</b>) and only utilized programmatically for secure full-stack proxy routing.
                     </p>
                     <div className="flex items-center gap-2">
                        {localStorage.getItem('scolaris_custom_gemini_api_key') && (
                           <button 
                             onClick={handleClearKey}
                             className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] uppercase font-bold tracking-wider border border-slate-200 transition-all"
                           >
                              Clear
                           </button>
                        )}
                        <button 
                          onClick={handleSaveKey}
                          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-[10px] uppercase font-bold tracking-widest transition-all ${
                             saveSuccess 
                             ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                             : 'bg-slate-900 hover:bg-zinc-800 text-white shadow-md shadow-slate-200'
                          }`}
                        >
                           {saveSuccess ? (
                              <>
                                 <Check size={12} />
                                 Key Saved
                              </>
                           ) : (
                              'Save AI Key'
                           )}
                        </button>
                     </div>
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
