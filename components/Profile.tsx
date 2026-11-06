import React from 'react';
import { UserProfile } from '../types';
import { ICONS } from '../constants';
import { UserAvatar, AVATAR_OPTIONS } from './UserAvatar';
import { ArrowRight, LogOut, Sparkles, X, Check, AlertCircle } from 'lucide-react';

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

  const handleSave = () => {
    setProfile(editedProfile);
    setIsEditing(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight leading-none">Profile & Account</h1>
          <p className="text-slate-500 font-normal text-xs mt-1">Manage your academic profile, preferences, and account credentials</p>
        </div>
        <button 
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
            isEditing 
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs' 
            : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-2xs'
          }`}
        >
          {isEditing ? 'Save Changes' : 'Edit Profile'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Account Card */}
        <section className="space-y-2">
           <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Academic Identity</h3>
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
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
                        className="w-full text-base font-serif font-bold text-slate-900 border-b border-blue-400 focus:outline-none bg-transparent pb-0.5"
                      />
                    ) : (
                      <h2 className="text-base font-serif font-bold text-slate-900">{profile.name}</h2>
                    )}
                    {isEditing ? (
                      <input 
                        type="text"
                        value={editedProfile.university}
                        onChange={e => setEditedProfile({...editedProfile, university: e.target.value})}
                        className="w-full text-xs text-slate-500 border-b border-blue-200 focus:outline-none bg-transparent mt-1 pb-0.5"
                        placeholder="Institution name"
                      />
                    ) : (
                      <p className="text-slate-500 font-medium text-xs">{profile.university}</p>
                    )}
                 </div>
              </div>

              {/* Avatar Icon Choice Selection Grid */}
              {isEditing && (
                <div className="pt-4 border-t border-slate-100 space-y-2.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Choose Profile Avatar Icon
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                    {AVATAR_OPTIONS.map((opt) => {
                      const isSelected = (editedProfile.avatarIcon || profile.avatarIcon || 'graduation-cap') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setEditedProfile({ ...editedProfile, avatarIcon: opt.id })}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 border-2 border-blue-600 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                          }`}
                          title={opt.name}
                        >
                          <UserAvatar avatarIcon={opt.id} size="sm" />
                          <span className="text-[9px] font-semibold text-slate-600 truncate w-full text-center mt-1">
                            {opt.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-1">
                 <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-150">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">User ID</p>
                    <p className="text-xs font-mono font-bold text-slate-800 truncate">SCL-882-991-X</p>
                 </div>
                 <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-150">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Email Address</p>
                    <p className="text-xs font-medium text-slate-800 truncate">{profile.email}</p>
                 </div>
                 <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-150">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Level of Study</p>
                    {isEditing ? (
                      <select 
                        value={editedProfile.level}
                        onChange={e => setEditedProfile({...editedProfile, level: e.target.value})}
                        className="text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded px-2 py-0.5 focus:outline-none cursor-pointer"
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
                      <p className="text-xs font-semibold text-slate-800">{profile.level}</p>
                    )}
                 </div>
                 <div className="space-y-1 p-3 bg-slate-50 rounded-lg border border-slate-150">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Targeted CGPA</p>
                    {isEditing ? (
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        max="5.00"
                        value={editedProfile.targetCGPA !== undefined ? editedProfile.targetCGPA : 0.00}
                        onChange={e => setEditedProfile({...editedProfile, targetCGPA: parseFloat(e.target.value) || 0})}
                        className="text-xs font-bold text-blue-600 bg-white border border-slate-200 rounded px-2 py-0.5 focus:outline-none w-20 font-mono"
                      />
                    ) : (
                      <p className="text-xs font-bold text-blue-600 font-mono">{(profile?.targetCGPA ?? 0.00).toFixed(2)}</p>
                    )}
                 </div>
              </div>
           </div>
        </section>

        {/* Preferences Section */}
        <section className="space-y-2">
           <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Preferences</h3>
              <button 
                onClick={() => setProfile({ ...profile, tutorialSeen: false })}
                className="group flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-all cursor-pointer text-xs"
              >
                <Sparkles size={11} className="text-blue-600" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Reset Tutorial</span>
              </button>
           </div>
           <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              {[
                { id: 'messages', label: 'Group Messages', desc: 'Alerts for new messages in study circles', icon: ICONS.Groups, value: profile.notifications?.messages ?? true },
                { id: 'sessions', label: 'Upcoming Sessions', desc: 'Reminders for your scheduled study times', icon: ICONS.Schedule, value: profile.notifications?.sessions ?? true },
                { id: 'aiContent', label: 'AI Content Readiness', desc: 'Alerts when your AI materials are processed', icon: ICONS.Sparkles, value: profile.notifications?.aiContent ?? true },
              ].map(notif => (
                <div key={notif.id} className="flex items-center justify-between py-1">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                         {notif.icon}
                      </div>
                      <div className="space-y-0.5">
                         <h4 className="text-xs font-semibold text-slate-900">{notif.label}</h4>
                         <p className="text-[11px] text-slate-500">{notif.desc}</p>
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
                     className={`w-10 h-5 rounded-full relative transition-all cursor-pointer ${notif.value ? 'bg-blue-600' : 'bg-slate-200'}`}
                   >
                     <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-xs ${notif.value ? 'left-5' : 'left-0.5'}`} />
                   </button>
                </div>
              ))}
           </div>
        </section>

        {/* System & Security Section */}
        <section className="space-y-2">
           <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Account Actions</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <button 
                onClick={onSignOut}
                className="w-full p-4 text-left bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all group flex items-center justify-between shadow-2xs cursor-pointer"
              >
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
                      <LogOut size={15} />
                   </div>
                   <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900">Sign Out</h4>
                      <p className="text-[10px] text-slate-500">End your current session</p>
                   </div>
                </div>
                <ArrowRight size={13} className="text-slate-300 group-hover:text-slate-800 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button 
                onClick={() => { if(confirm("Permanently delete academic records?")) onDelete(); }}
                className="w-full p-4 text-left bg-white border border-rose-200 rounded-xl hover:bg-rose-50/50 transition-all group flex items-center justify-between shadow-2xs cursor-pointer"
              >
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all">
                      <X size={15} />
                   </div>
                   <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-rose-900">Delete Account</h4>
                      <p className="text-[10px] text-rose-500">Permanently wipe all data</p>
                   </div>
                </div>
                <ArrowRight size={13} className="text-rose-300 group-hover:text-rose-700 group-hover:translate-x-0.5 transition-all" />
              </button>
           </div>
        </section>
      </div>
    </div>
  );
};

export default Profile;