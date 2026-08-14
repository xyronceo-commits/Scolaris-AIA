import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, StudyGroup, StudyHubData, GroupMessage, SharedMaterial, AppNotification, AppState } from '../types';
import { ICONS } from '../constants';
import { Globe, Lock, Link as LinkIcon, Check, Copy, Upload, Download, FileText, LogOut, Share2, Search, Plus, X, ArrowRight, MessageSquare, Files, Bot, Sparkles } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { DBService } from '../services/db';
import { auth } from '../lib/firebase';
import { UserAvatar } from './UserAvatar';

interface StudyGroupsProps {
  profile: UserProfile;
  groups: StudyGroup[];
  setGroups: React.Dispatch<React.SetStateAction<StudyGroup[]>>;
  hubs: Record<string, StudyHubData>;
  addNotification: (type: AppNotification['type'], title: string, message: string, link?: AppState) => void;
}

const StudyGroups: React.FC<StudyGroupsProps> = ({ profile, groups, setGroups, hubs, addNotification }) => {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id || null);
  const [sidebarMode, setSidebarMode] = useState<'my' | 'explore'>('my');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupVisibility, setNewGroupVisibility] = useState<'public' | 'private'>('private');
  const [messageText, setMessageText] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'materials'>('chat');
  const [copied, setCopied] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId);

  const mockPublicGroups: StudyGroup[] = [
    {
      id: 'pub-1',
      name: 'QUANTUM ETHICS',
      description: 'Discussing the philosophical implications of observer effects.',
      visibility: 'public',
      inviteCode: 'ETHX-001',
      members: ['Alice', 'Bob'],
      messages: [],
      sharedMaterials: []
    },
    {
      id: 'pub-2',
      name: 'NEURO-DYNAMICS',
      description: 'Deep dive into computational neuroscience models.',
      visibility: 'public',
      inviteCode: 'BRAIN-99',
      members: ['Charlie', 'Dana'],
      messages: [],
      sharedMaterials: []
    }
  ];

  const exploreGroups = mockPublicGroups.filter(pg => !groups.find(g => g.id === pg.id || g.name === pg.name));

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeGroup?.messages, activeTab]);

  const generateInviteCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setIsAiThinking(true);
    try {
      const userId = auth.currentUser?.uid || 'anonymous';

      const newGroup: StudyGroup = {
        id: 'group-' + Math.random().toString(36).substring(2, 11),
        name: newGroupName.toUpperCase(),
        description: newGroupDesc,
        visibility: newGroupVisibility,
        inviteCode: generateInviteCode(),
        members: [profile.name],
        messages: [{
          id: 'welcome',
          sender: 'Scolaris AI',
          text: `Study group established: ${newGroupName.toUpperCase()}. I am your academic assistant. Share materials or ask me anything to support your learning.`,
          timestamp: Date.now()
        }],
        sharedMaterials: []
      };

      await DBService.saveGroup(newGroup, userId);
      setGroups(prev => [...prev, newGroup]);
      setActiveGroupId(newGroup.id);
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      addNotification('message', 'Group Formed', `Study group ${newGroup.name} has been established.`, 'groups');
    } catch (err) {
      console.error('Error creating study group:', err);
    } finally {
      setIsAiThinking(false);
    }
  };

  const joinByCode = async () => {
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinError('');
    setIsAiThinking(true);

    try {
      const existing = groups.find(g => g.inviteCode === code);
      if (existing) {
        setActiveGroupId(existing.id);
        setShowJoinModal(false);
        setInviteCodeInput('');
        return;
      }

      // Try searching for the group in Firestore / DB
      const groupFromDb = await DBService.findGroupByCode(code);
      if (groupFromDb) {
        const userId = auth.currentUser?.uid || 'anonymous';

        const joinedGroup: StudyGroup = {
          ...groupFromDb,
          members: [profile.name]
        };

        await DBService.saveGroup(joinedGroup, userId);
        setGroups(prev => [...prev, joinedGroup]);
        setActiveGroupId(joinedGroup.id);
        setShowJoinModal(false);
        setInviteCodeInput('');
        addNotification('message', 'Circle Joined', `Connected to the private circle: ${joinedGroup.name}`, 'groups');
      } else {
        // Fallback for simulation & mockup checks
        if (code === 'ETHX-001' || code === 'BRAIN-99') {
          const mockG = mockPublicGroups.find(m => m.inviteCode === code);
          if (mockG) {
            joinGroup(mockG);
            setShowJoinModal(false);
            setInviteCodeInput('');
            return;
          }
        }
        setJoinError('Invalid or expired access code. Please verify and try again.');
      }
    } catch (err) {
      console.error('Error joining group by code:', err);
      setJoinError('Failed to establish connection. Table or service schema exception.');
    } finally {
      setIsAiThinking(false);
    }
  };

  const regenerateCode = async () => {
    if (!activeGroupId || !activeGroup) return;
    const newCode = generateInviteCode();
    
    try {
      const userId = auth.currentUser?.uid || 'anonymous';

      // 1. Update in local State
      const updatedGroups = groups.map(g => g.id === activeGroupId ? { ...g, inviteCode: newCode } : g);
      setGroups(updatedGroups);

      // 2. Update in DB and Local Caching
      await DBService.updateGroupInviteCode(activeGroupId, newCode, userId);

      addNotification('message', 'Invite Code Regoverned', `Regenerated invite code for ${activeGroup.name}: ${newCode}`, 'groups');
    } catch (err) {
      console.error('Failed to regenerate code:', err);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!messageText.trim() || !activeGroupId || !activeGroup || isValidating) return;

    setIsValidating(true);
    const currentText = messageText;
    setMessageText('');

    try {
      // Step 1: Validate relevance
      const validation = await GeminiService.validateGroupMessage(currentText, activeGroup.name, activeGroup.description);
      
      const userMsg: GroupMessage = {
        id: Math.random().toString(36).substr(2, 9),
        sender: profile.name,
        text: currentText,
        timestamp: Date.now(),
        isIrrelevant: !validation.isRelevant
      };

      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, messages: [...g.messages, userMsg] } : g));

      if (!validation.isRelevant) {
        addNotification('message', 'Irrelevant Content', 'Your message was flagged as unrelated to the group purpose and has been obscured.', 'groups');
      }

      // Step 2: AI Bot Response (only if relevant)
      if (validation.isRelevant) {
        setIsAiThinking(true);
        const response = await GeminiService.groupChat(
          [...activeGroup.messages, userMsg].slice(-10), 
          activeGroup.name,
          activeGroup.description
        );
        
        const botMsg: GroupMessage = {
          id: Math.random().toString(36).substr(2, 9),
          sender: 'Scolaris AI',
          text: response || "I'm having trouble connecting to the knowledge base. Please try again.",
          timestamp: Date.now()
        };

        setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, messages: [...g.messages, botMsg] } : g));
        addNotification('message', 'New Message', `Scolaris AI: ${botMsg.text.substring(0, 50)}...`, 'groups');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsValidating(false);
      setIsAiThinking(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeGroupId) return;

    setIsUploading(true);
    addNotification('message', 'S3 Uploading', `Initiating cloud transfer for ${file.name}...`, 'groups');

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch('/api/s3/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          contentBase64: base64
        })
      });

      if (!response.ok) {
        throw new Error('S3 Proxy endpoint returned status ' + response.status);
      }

      const uploadResult = await response.json();

      if (uploadResult.success) {
        const newMaterial: SharedMaterial = {
          courseId: 'shared',
          courseCode: 'SYNC',
          sharedBy: profile.name,
          timestamp: Date.now(),
          fileName: file.name,
          s3Key: uploadResult.key,
          s3Url: uploadResult.publicUrl,
          content: `Files hosted under S3 key: ${uploadResult.key}`
        };

        setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, sharedMaterials: [newMaterial, ...g.sharedMaterials] } : g));
        addNotification('message', 'S3 Upload Complete', `${file.name} successfully committed to cloud storage!`, 'groups');

        const msg: GroupMessage = {
          id: Math.random().toString(36).substr(2, 9),
          sender: 'Scolaris AI',
          text: `${profile.name} uploaded a resource to Cloud Storage: ${file.name} (Key: ${uploadResult.key})`,
          timestamp: Date.now()
        };
        setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, messages: [...g.messages, msg] } : g));
      } else {
        throw new Error(uploadResult.error || 'Unknown upload error');
      }

    } catch (err: any) {
      console.warn('S3 Storage upload failed, falling back to local simulation. Error:', err?.message);
      
      const newMaterial: SharedMaterial = {
        courseId: 'shared',
        courseCode: 'SYNC',
        sharedBy: profile.name,
        timestamp: Date.now(),
        fileName: file.name,
        content: `Simulated content for ${file.name}`
      };
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, sharedMaterials: [newMaterial, ...g.sharedMaterials] } : g));
      addNotification('message', 'Local Upload (Simulation)', `${file.name} added (S3 credentials not active in environment)`, 'groups');

      const msg: GroupMessage = {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'Scolaris AI',
        text: `${profile.name} shared a simulated resource: ${file.name}`,
        timestamp: Date.now()
      };
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, messages: [...g.messages, msg] } : g));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAccessFile = async (file: SharedMaterial) => {
    if (file.s3Key) {
      try {
        addNotification('message', 'S3 Accessing', `Generating S3 dynamic authorization for ${file.fileName}...`, 'groups');
        const response = await fetch('/api/s3/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: file.s3Key })
        });
        const data = await response.json();
        if (data.presignedUrl) {
          const a = document.createElement('a');
          a.href = data.presignedUrl;
          a.download = file.fileName || 'download';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          addNotification('message', 'S3 File Downloaded', `${file.fileName} accessed from Supabase S3 bucket!`, 'groups');
        } else {
          throw new Error("Presigned URL missing");
        }
      } catch (e: any) {
        console.error(e);
        addNotification('message', 'S3 Downloader Error', 'Could not retrieve safe S3 access token.', 'groups');
      }
    } else {
      const blob = new Blob([file.content || ''], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName || 'material.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const copyInvite = () => {
    if (!activeGroup) return;
    navigator.clipboard.writeText(`https://scolaris.ai/join/${activeGroup.inviteCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveGroup = () => {
    if (!activeGroupId || !activeGroup) return;
    if (confirm(`Leave ${activeGroup.name}?`)) {
      setGroups(prev => prev.filter(g => g.id !== activeGroupId));
      setActiveGroupId(null);
    }
  };

  const joinGroup = (group: StudyGroup) => {
    if (groups.find(g => g.id === group.id)) return;
    const joinedGroup = {
      ...group,
      members: [...group.members, profile.name],
      messages: [...group.messages, {
        id: 'join-msg-' + Date.now(),
        sender: 'Scolaris AI',
        text: `${profile.name} has entered the circle. Welcome.`,
        timestamp: Date.now()
      }]
    };
    setGroups(prev => [...prev, joinedGroup]);
    setActiveGroupId(group.id);
    setSidebarMode('my');
  };

  return (
    <div className="h-[calc(100vh-160px)] xl:h-[calc(100vh-140px)] flex flex-col xl:flex-row gap-8 animate-in fade-in duration-700">
        {/* Sidebar - Group Directory */}
      <div className="w-full xl:w-80 flex flex-col gap-4 shrink-0 h-auto xl:h-full">
        <div className="glass-card p-6 rounded-[2rem] relative overflow-hidden bg-white border border-slate-100 shadow-sm">
           <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 blur-[60px] rounded-full pointer-events-none" />
           <div className="flex items-center justify-between relative z-10">
              <div>
                <h1 className="text-xl font-serif font-bold text-slate-900 tracking-tight">Study Circles</h1>
                <p className="text-[10px] text-slate-400 font-medium italic">Collaborative Research</p>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={() => setShowJoinModal(true)} 
                  title="Join Group"
                  className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 flex items-center justify-center hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm group"
                 >
                   <LinkIcon size={16} className="group-hover:rotate-12 transition-transform" />
                 </button>
                 <button 
                  onClick={() => setShowCreateModal(true)} 
                  title="Create Group"
                  className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-md group"
                 >
                   <Plus size={18} className="group-hover:rotate-90 transition-transform" />
                 </button>
              </div>
           </div>
        </div>

        <div className="flex-1 bg-white rounded-[2rem] overflow-hidden flex flex-col border border-slate-100 shadow-sm min-h-[250px] xl:min-h-0">
           <div className="p-1 border-b border-slate-50 bg-slate-50/30 flex">
              <button 
                onClick={() => setSidebarMode('my')}
                className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${sidebarMode === 'my' ? 'bg-white text-slate-900 shadow-[2px_0_10px_rgba(0,0,0,0.02)]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                My Circles
              </button>
              <button 
                onClick={() => setSidebarMode('explore')}
                className={`flex-1 py-3 text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${sidebarMode === 'explore' ? 'bg-white text-slate-900 shadow-[-2px_0_10px_rgba(0,0,0,0.02)]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Globe size={11} /> Explore
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
             {sidebarMode === 'my' ? (
                groups.length === 0 ? (
                  <div className="p-8 text-center space-y-4">
                     <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mx-auto border border-slate-100/50">
                       <Search size={24} />
                     </div>
                     <div className="space-y-1">
                       <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-tight">Registry Empty</p>
                       <p className="text-[9px] text-slate-400 font-medium italic">Form a circle or enter an access code to begin.</p>
                     </div>
                  </div>
                ) : (
                   groups.map(g => (
                     <button 
                       key={g.id} 
                       onClick={() => setActiveGroupId(g.id)} 
                       className={`w-full p-4 rounded-[1.5rem] text-left transition-all duration-300 relative overflow-hidden group border ${
                         activeGroupId === g.id 
                           ? 'bg-slate-900 border-slate-900 text-white shadow-xl translate-x-1' 
                           : 'hover:bg-slate-50 text-slate-600 border-transparent hover:border-slate-100'
                       }`}
                     >
                       <div className="flex items-center justify-between mb-1 relative z-10">
                         <span className="font-bold text-sm tracking-tight truncate max-w-[140px] uppercase font-serif italic">{g.name}</span>
                         {g.visibility === 'private' && <Lock size={10} className={activeGroupId === g.id ? 'text-blue-300' : 'text-slate-300'} />}
                       </div>
                       <div className="flex items-center gap-2 relative z-10">
                         <div className={`w-1.5 h-1.5 rounded-full ${activeGroupId === g.id ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
                         <div className={`text-[9px] font-bold tracking-widest uppercase ${activeGroupId === g.id ? 'text-slate-400' : 'text-slate-400'}`}>{g.members.length} Researching</div>
                       </div>
                       {activeGroupId === g.id && (
                         <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 blur-xl rounded-full" />
                       )}
                     </button>
                   ))
                )
             ) : (
                exploreGroups.length === 0 ? (
                  <div className="p-8 text-center text-[10px] text-slate-400 font-medium italic">
                    No new public circles discovered yet.
                  </div>
                ) : (
                  exploreGroups.map(g => (
                    <div 
                      key={g.id} 
                      className="w-full p-4 rounded-[1.5rem] text-left border border-slate-100/50 bg-slate-50/30 group hover:border-blue-200 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs tracking-tight truncate uppercase font-serif italic">{g.name}</span>
                        <Globe size={11} className="text-slate-300" />
                      </div>
                      <p className="text-[9px] text-slate-500 mb-3 line-clamp-2 italic">{g.description}</p>
                      <button 
                        onClick={() => joinGroup(g)}
                        className="w-full py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all"
                      >
                        Join Collective
                      </button>
                    </div>
                  ))
                )
             )}
           </div>
        </div>
      </div>

      {/* Main Channel Workspace */}
      <div className="flex-1 bg-white rounded-[2.5rem] flex flex-col border border-black/5 shadow-sm overflow-hidden relative">
         {!activeGroup ? (
           <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-300 mb-6 border border-slate-100">
                <Globe size={32} />
              </div>
              <h2 className="text-2xl font-serif font-bold text-slate-900 tracking-tight mb-3">Select a Study Group</h2>
              <p className="text-slate-500 max-w-sm font-medium text-sm">Choose a group from the sidebar or enter an access code to begin collaborating.</p>
              <button 
                onClick={() => setShowJoinModal(true)}
                className="mt-6 px-6 py-3 bg-blue-700 text-white rounded-xl font-bold text-xs tracking-wide hover:scale-105 active:scale-95 transition-all shadow-md"
              >
                Join with Access Code
              </button>
           </div>
         ) : (
           <>
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 shadow-sm">
                 <div className="space-y-0.5">
                    <div className="flex items-center gap-3">
                       <h2 className="text-xl md:text-2xl font-serif font-bold text-slate-900 tracking-tight uppercase italic">{activeGroup.name}</h2>
                       <div className="flex gap-2">
                          <button 
                            onClick={copyInvite} 
                            title="Copy Invite URL"
                            className={`p-2 rounded-xl transition-all shadow-sm border ${copied ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100'}`}
                          >
                            {copied ? <Check size={14} /> : <Share2 size={14} />}
                          </button>
                       </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-slate-500">
                      <p className="text-[10px] text-slate-400 font-medium italic">{activeGroup.description}</p>
                      <div className="w-1 h-1 bg-slate-200 rounded-full" />
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Access Link Code:</span>
                      <span className="text-[10px] text-indigo-600 font-mono font-bold uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg shadow-xs">
                        {activeGroup.inviteCode}
                      </span>
                      {activeGroup.visibility === 'private' && (
                        <button 
                          onClick={regenerateCode}
                          title="Regenerate unique invite code for this private circle"
                          className="text-[9px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-700 transition-colors flex items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2 py-1 ml-1 cursor-pointer"
                        >
                          <Sparkles size={10} />
                          Regen Code
                        </button>
                      )}
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex flex-1 md:flex-none bg-slate-50 p-1 rounded-2xl border border-slate-100">
                       <button 
                         onClick={() => setActiveTab('chat')}
                         className={`flex-1 md:flex-none px-5 py-2.5 rounded-[1rem] text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                       >
                         <MessageSquare size={12} /> Discussion
                       </button>
                       <button 
                         onClick={() => setActiveTab('materials')}
                         className={`flex-1 md:flex-none px-5 py-2.5 rounded-[1rem] text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'materials' ? 'bg-white text-slate-900 shadow-md border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                       >
                         <Files size={12} /> Library
                       </button>
                    </div>
                    <button 
                      onClick={leaveGroup} 
                      className="hidden md:flex p-3 text-slate-400 hover:text-rose-500 transition-colors"
                      title="Abandon Circle"
                    >
                      <LogOut size={18} />
                    </button>
                 </div>
              </div>

              {/* Feed Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 bg-white">
                 {activeTab === 'chat' ? (
                   <div className="space-y-8 max-w-4xl mx-auto">
                      {activeGroup.messages.map(msg => {
                        const isMe = msg.sender === profile.name;
                        const isSystem = msg.sender === 'Scolaris AI';
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1.5 animate-in slide-in-from-bottom-2 duration-400`}>
                             <div className={`flex items-center gap-2 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                {isMe ? (
                                  <UserAvatar avatarIcon={profile.avatarIcon || 'graduation-cap'} name={profile.name} size="xs" />
                                ) : isSystem ? (
                                  <UserAvatar avatarIcon="brain" name="Scolaris AI" size="xs" />
                                ) : (
                                  <UserAvatar avatarIcon="user-circle" name={msg.sender} size="xs" />
                                )}
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${isMe ? 'text-blue-600' : isSystem ? 'text-indigo-600' : 'text-slate-500'}`}>
                                  {isSystem ? 'Scolaris Analysis' : msg.sender}
                                </span>
                                {isSystem && <Sparkles size={10} className="text-indigo-500" />}
                             </div>
                              <div className={`p-4 md:p-6 rounded-[1.8rem] max-w-[85%] md:max-w-xl text-[14px] leading-relaxed shadow-sm border relative overflow-hidden ${
                               isMe 
                                 ? 'bg-slate-900 text-white border-slate-900 rounded-tr-none' 
                                 : isSystem 
                                   ? 'bg-indigo-50/30 border-indigo-100 text-slate-800 rounded-tl-none font-medium' 
                                   : 'bg-slate-50 border-slate-100 text-slate-700 rounded-tl-none'
                              } ${msg.isIrrelevant ? 'opacity-90' : ''}`}>
                                {msg.isIrrelevant ? (
                                  <div className="relative group/irrelevant">
                                    <div className="blur-sm select-none grayscale contrast-125">
                                      {msg.text.split('').map(() => 'X').join('')}
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                       <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-rose-100 shadow-sm flex items-center gap-2">
                                          <Bot size={12} className="text-rose-500" />
                                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Irrelevant Content Flagged</span>
                                       </div>
                                    </div>
                                    <div className="mt-4 p-3 bg-rose-50 rounded-xl border border-rose-100 text-[11px] text-rose-700 italic">
                                       "This node emitted data unrelated to our collective objective. Transmission obscured."
                                    </div>
                                  </div>
                                ) : (
                                  msg.text
                                )}
                                <div className={`text-[8px] mt-3 font-bold uppercase tracking-[0.1em] flex items-center gap-2 ${isMe ? 'text-slate-400' : 'text-slate-400'}`}>
                                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  <div className="w-1 h-1 bg-current opacity-30 rounded-full" />
                                  <span>{msg.isIrrelevant ? 'ANOMALY DETECTED' : 'VERIFIED NODE'}</span>
                                </div>
                             </div>
                          </div>
                        );
                      })}
                      {isAiThinking && (
                        <div className="flex flex-col items-start gap-1.5 animate-pulse">
                           <div className="flex items-center gap-2 px-1">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 leading-none">Neural Processing</span>
                              <div className="flex gap-0.5">
                                <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                           </div>
                           <div className="p-5 bg-indigo-50/50 border border-indigo-100 text-indigo-700/60 rounded-[1.8rem] rounded-tl-none font-serif italic text-xs shadow-sm">
                             Scolaris is synthesizing collective intelligence...
                           </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                   </div>
                 ) : (
                    <div className="space-y-8 max-w-5xl mx-auto">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 mb-8 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="space-y-1 relative z-10">
                             <div className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full text-[8px] font-black uppercase tracking-widest inline-block mb-1">Knowledge Repository</div>
                             <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-250 text-indigo-700 text-[8px] font-bold tracking-wider font-mono rounded-full leading-none inline-block ml-2 mb-1">● Supabase S1 S3 Protocol Active</span>
                             <h3 className="text-2xl font-serif font-bold text-slate-900 tracking-tight italic">Group Library</h3>
                             <p className="text-xs text-slate-500 font-medium">Shared study materials and collective research briefings.</p>
                             <div className="text-[9px] text-slate-400 font-mono italic mt-1 leading-relaxed">
                               S3 Endpoint: <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded leading-none select-all font-semibold">https://ijvttbxphdntffmdggvv.storage.supabase.co/storage/v1/s3</span> (Region: eu-north-1)
                             </div>
                          </div>
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="w-full md:w-auto mt-6 md:mt-0 px-8 py-4 bg-slate-900 text-white rounded-[1.2rem] font-bold text-xs tracking-widest uppercase hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                             {isUploading ? (
                               <>
                                 <Sparkles size={18} className="animate-spin text-indigo-400" /> S3 Transmitting...
                               </>
                             ) : (
                               <>
                                 <Upload size={18} className="group-hover:-translate-y-1 transition-transform" /> Contribute Material
                               </>
                             )}
                          </button>
                          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {activeGroup.sharedMaterials.length === 0 ? (
                            <div className="col-span-full py-24 text-center bg-slate-50/50 rounded-[3rem] border border-dashed border-slate-200 group hover:bg-slate-50 transition-colors">
                               <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-200 mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform">
                                 <FileText size={32} />
                               </div>
                               <div className="space-y-1">
                                 <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Library Empty</p>
                                 <p className="text-slate-400 text-[11px] font-medium italic">Upload scholarly resources to build your collective knowledge.</p>
                               </div>
                            </div>
                          ) : (
                            activeGroup.sharedMaterials.map((file, idx) => (
                              <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col justify-between group hover:border-blue-400/30 hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                                 <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                       <FileText size={20} />
                                    </div>
                                    <div className="space-y-0.5 flex-1 min-w-0">
                                       <div className="text-sm font-bold text-slate-900 tracking-tight truncate uppercase font-serif italic" title={file.fileName}>{file.fileName}</div>
                                       <div className="flex items-center gap-1.5 flex-wrap">
                                          <div className={`w-1 h-1 rounded-full ${file.s3Key ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">By {file.sharedBy}</div>
                                          {file.s3Key && (
                                            <span className="text-[7px] bg-indigo-50 text-indigo-700 font-mono px-1 py-0.5 rounded border border-indigo-100 font-extrabold leading-none">
                                              S3
                                            </span>
                                          )}
                                       </div>
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                    <span className="text-[8px] font-medium text-slate-300 uppercase tracking-widest">{new Date(file.timestamp).toLocaleDateString()}</span>
                                    <button 
                                      onClick={() => handleAccessFile(file)}
                                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-600 hover:bg-slate-950 hover:text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer"
                                    >
                                       <Download size={12} /> Access
                                    </button>
                                 </div>
                              </div>
                            ))
                          )}
                       </div>
                    </div>
                 )}
              </div>

               {/* Input Rail */}
              {activeTab === 'chat' && (
                <div className="p-6 md:p-8 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                   <form onSubmit={sendMessage} className="flex gap-4 max-w-5xl mx-auto items-center">
                      <div className="flex-1 relative group">
                        <input 
                          disabled={isValidating}
                          className={`w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-8 py-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white text-slate-700 placeholder:text-slate-400 transition-all pr-16 ${isValidating ? 'bg-indigo-50/30' : ''}`} 
                          placeholder={isValidating ? "AI is validating transmission..." : "Contribute to educational discussion..."} 
                          value={messageText} 
                          onChange={e => setMessageText(e.target.value)} 
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                           {isValidating ? (
                              <div className="flex gap-1">
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" />
                              </div>
                           ) : (
                             <>
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                               <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest hidden sm:inline">Active Hive</span>
                             </>
                           )}
                        </div>
                      </div>
                      <button 
                        type="submit" 
                        disabled={!messageText.trim() || isAiThinking || isValidating} 
                        className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shrink-0 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
                      >
                         <ArrowRight size={20} />
                      </button>
                   </form>
                </div>
              )}
           </>
         )}
      </div>

      {/* Modals */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in duration-500">
           <div className="bg-white w-full max-w-md p-10 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8 animate-in zoom-in duration-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
              <div className="flex justify-between items-center">
                 <div>
                   <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight italic leading-none">Join Circle</h1>
                   <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-widest">Collective Access Request</p>
                 </div>
                 <button onClick={() => { setShowJoinModal(false); setJoinError(''); }} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"><X size={20} /></button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Registry Access Code</label>
                    <div className="relative">
                      <input 
                        required 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-5 text-2xl font-bold tracking-[0.3em] outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white uppercase text-center placeholder:text-slate-200" 
                        placeholder="XXXX-XXXX" 
                        value={inviteCodeInput} 
                        onChange={e => { setInviteCodeInput(e.target.value); setJoinError(''); }} 
                      />
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200">
                         <Lock size={18} />
                      </div>
                    </div>
                    {joinError && (
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider ml-4 mt-2 leading-normal">
                        {joinError}
                      </p>
                    )}
                 </div>
                 <button 
                  onClick={joinByCode} 
                  disabled={!inviteCodeInput.trim() || isAiThinking} 
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-sm tracking-[0.2em] uppercase hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/10 disabled:opacity-50"
                 >
                    {isAiThinking && <Sparkles size={14} className="animate-spin" />} Establish Connection
                 </button>
              </div>
           </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in duration-500">
           <div className="bg-white w-full max-w-xl p-10 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8 animate-in zoom-in duration-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-600" />
              <div className="flex justify-between items-center">
                 <div>
                   <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight italic leading-none">Form Study Circle</h1>
                   <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-widest">Collective Initiation</p>
                 </div>
                 <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"><X size={20} /></button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Collective Identifier</label>
                    <input required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold font-serif italic outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white text-slate-700 placeholder:text-slate-300" placeholder="e.g. Advanced Quantum Mechanics 402" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Research Scope</label>
                    <textarea className="w-full h-32 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-medium outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white text-slate-700 resize-none placeholder:text-slate-300" placeholder="Define the primary learning objectives and collaborative focus..." value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} />
                 </div>
                 <div className="flex items-center gap-4 px-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <button type="button" onClick={() => setNewGroupVisibility(v => v === 'public' ? 'private' : 'public')} className="flex items-center gap-4 group w-full">
                       <div className={`w-12 h-6 rounded-full relative transition-all duration-500 ${newGroupVisibility === 'private' ? 'bg-slate-900' : 'bg-slate-200'}`}>
                          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-500 shadow-sm ${newGroupVisibility === 'private' ? 'left-6.5' : 'left-0.5'}`} />
                       </div>
                       <div className="flex flex-col items-start">
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Restricted Access Circle</span>
                          <span className="text-[9px] text-slate-400 font-medium italic">Requires invite code for entry</span>
                       </div>
                    </button>
                 </div>
                 <button 
                  onClick={createGroup} 
                  disabled={!newGroupName.trim()} 
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-sm tracking-[0.2em] uppercase hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-900/10 disabled:opacity-50"
                 >
                    Deploy New Collaborative Node
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StudyGroups;
