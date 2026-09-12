import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, StudyGroup, StudyHubData, GroupMessage, AppNotification, AppState, GroupMaterial, GroupDiscussionPost, GroupActivity, GroupMember } from '../types';
import { 
  Globe, Lock, Link as LinkIcon, Check, Copy, Upload, Download, FileText, 
  LogOut, Share2, Search, Plus, X, ArrowRight, MessageSquare, Files, Bot, 
  Sparkles, Users, BookOpen, School, ShieldAlert, Award, Send, RefreshCw, 
  HelpCircle, Lightbulb, Trash2, UserX, Info, Activity, Layers, ChevronRight, Hash
} from 'lucide-react';
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

export const StudyGroups: React.FC<StudyGroupsProps> = ({ profile, groups, setGroups, hubs, addNotification }) => {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id || null);
  const [sidebarMode, setSidebarMode] = useState<'my' | 'explore'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // Create Group Form State
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCourse, setCreateCourse] = useState('');
  const [createType, setCreateType] = useState<'general' | 'private'>('general');
  const [createDept, setCreateDept] = useState('');
  const [createLevel, setCreateLevel] = useState('');
  const [createUni, setCreateUni] = useState('');
  const [createSession, setCreateSession] = useState('');
  const [createImage, setCreateImage] = useState('');

  // Join Group State
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  // Tabs inside Active Group
  const [activeTab, setActiveTab] = useState<'ai' | 'materials' | 'discussions' | 'overview'>('ai');

  // AI Assistant Chat State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ sender: string; text: string; timestamp: number }>>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiMode, setAiMode] = useState<'chat' | 'quiz' | 'summarize' | 'topics'>('chat');

  // Discussions State
  const [newDiscussionTitle, setNewDiscussionTitle] = useState('');
  const [newDiscussionContent, setNewDiscussionContent] = useState('');
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentUserId = auth.currentUser?.uid || profile.email || 'guest_user';
  const activeGroup = groups.find(g => g.id === activeGroupId);

  // Filtered Groups for My Circles vs Explore
  const myGroups = groups.filter(g => {
    const members = g.members || [];
    const isMem = members.some(m => {
      if (typeof m === 'string') {
        return m === currentUserId || m === profile.name;
      }
      return m.userId === currentUserId || m.name === profile.name;
    });
    const isOwner = g.ownerId === currentUserId;
    return isMem || isOwner;
  });

  const exploreGroups = groups.filter(g => {
    const isGeneral = g.type === 'general' || g.visibility === 'public';
    const isAlreadyMember = myGroups.some(mg => mg.id === g.id);
    return isGeneral && !isAlreadyMember;
  }).filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.course && g.course.toLowerCase().includes(q)) ||
      (g.description && g.description.toLowerCase().includes(q)) ||
      (g.department && g.department.toLowerCase().includes(q)) ||
      (g.university && g.university.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups]);

  useEffect(() => {
    if (activeGroup) {
      if (activeGroup.messages && activeGroup.messages.length > 0) {
        setAiMessages(activeGroup.messages.map(m => ({
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp
        })));
      } else {
        // Initialize default welcome AI chat message for active group
        setAiMessages([
          {
            sender: 'Scolaris AI',
            text: `Welcome to **${activeGroup.name}**! I am your group study companion. Upload course notes in the **Materials** tab, and I will analyze them to answer questions, generate quizzes, or summarize key topics for your study circle.`,
            timestamp: Date.now()
          }
        ]);
      }
    }
  }, [activeGroupId]);

  useEffect(() => {
    if (activeTab === 'ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, activeTab]);

  // Handle Group Creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createCourse.trim()) return;

    setIsAiThinking(true);
    try {
      const createdGroup = await DBService.createGroup(
        {
          name: createName.trim(),
          description: createDesc.trim(),
          course: createCourse.trim(),
          type: createType,
          department: createDept.trim(),
          level: createLevel.trim(),
          university: createUni.trim(),
          academicSession: createSession.trim(),
          groupImage: createImage.trim()
        },
        currentUserId,
        profile.name
      );

      setGroups(prev => [createdGroup, ...prev]);
      setActiveGroupId(createdGroup.id);
      setShowCreateModal(false);

      // Reset form
      setCreateName('');
      setCreateDesc('');
      setCreateCourse('');
      setCreateType('general');
      setCreateDept('');
      setCreateLevel('');
      setCreateUni('');
      setCreateSession('');
      setCreateImage('');

      addNotification('message', 'Group Formed', `Study group "${createdGroup.name}" is ready!`, 'groups');
    } catch (err) {
      console.error('Error creating group:', err);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Handle Join by Code or Direct
  const handleJoinByCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!joinCode.trim()) return;
    setJoinError('');
    setIsAiThinking(true);

    try {
      const code = joinCode.trim().toUpperCase();
      const groupFound = await DBService.findGroupByCode(code);

      if (!groupFound) {
        setJoinError('No active study group found matching this invite code.');
        setIsAiThinking(false);
        return;
      }

      const res = await DBService.joinGroup(groupFound.id, code, currentUserId, profile.name);
      if (res.success && res.group) {
        setGroups(prev => {
          const exists = prev.some(g => g.id === res.group!.id);
          if (exists) {
            return prev.map(g => g.id === res.group!.id ? res.group! : g);
          }
          return [res.group!, ...prev];
        });
        setActiveGroupId(res.group.id);
        setShowJoinModal(false);
        setJoinCode('');
        addNotification('message', 'Group Joined', `You joined "${res.group.name}"`, 'groups');
      } else {
        setJoinError(res.error || 'Failed to join group.');
      }
    } catch (err: any) {
      setJoinError('Error joining group. Please try again.');
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleJoinGeneralGroup = async (group: StudyGroup) => {
    setIsAiThinking(true);
    try {
      const res = await DBService.joinGroup(group.id, null, currentUserId, profile.name);
      if (res.success && res.group) {
        setGroups(prev => {
          const exists = prev.some(g => g.id === res.group!.id);
          if (exists) {
            return prev.map(g => g.id === res.group!.id ? res.group! : g);
          }
          return [res.group!, ...prev];
        });
        setActiveGroupId(res.group.id);
        setSidebarMode('my');
        addNotification('message', 'Circle Joined', `Joined "${group.name}"`, 'groups');
      }
    } catch (e) {
      console.error('Join group error:', e);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Upload Material to Group
  const handleMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeGroup) return;

    setIsUploading(true);
    addNotification('message', 'Uploading Material', `Processing "${file.name}" for group library...`, 'groups');

    try {
      const result = await DBService.uploadGroupMaterial(
        activeGroup.id,
        file,
        currentUserId,
        profile.name
      );

      if (result.success && result.material) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const updatedMaterials = [result.material, ...(g.sharedMaterials || [])];
            const updatedGroup = { ...g, sharedMaterials: updatedMaterials };
            DBService.saveGroup(updatedGroup, currentUserId);
            return updatedGroup;
          }
          return g;
        }));

        addNotification('message', 'Material Uploaded', `"${file.name}" is now available to all group members.`, 'groups');
      } else {
        addNotification('message', 'Upload Issue', result.error || 'Failed to upload document.', 'groups');
      }
    } catch (err: any) {
      console.error('Group upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // AI Study Assistant Query grounded in group materials
  const handleSendAiPrompt = async (e?: React.FormEvent, customPrompt?: string, modeOverride?: 'chat' | 'quiz' | 'summarize' | 'topics') => {
    e?.preventDefault();
    const promptToUse = customPrompt || aiPrompt;
    if (!promptToUse.trim() || !activeGroup || isAiThinking) return;

    const userMsgText = promptToUse;
    setAiPrompt('');
    
    const userMsgObj: GroupMessage = {
      id: `msg_${Date.now()}_u`,
      sender: profile.name,
      text: userMsgText,
      timestamp: Date.now()
    };

    // Add user prompt to chat
    setAiMessages(prev => [...prev, { sender: profile.name, text: userMsgText, timestamp: Date.now() }]);
    setIsAiThinking(true);

    // Save user message to group state and Firestore
    setGroups(prev => prev.map(g => {
      if (g.id === activeGroup.id) {
        const updatedMsgs = [...(g.messages || []), userMsgObj];
        const updatedGroup = { ...g, messages: updatedMsgs };
        DBService.saveGroup(updatedGroup, currentUserId);
        return updatedGroup;
      }
      return g;
    }));

    try {
      // Gather all text content from group materials
      const materials = activeGroup.sharedMaterials || [];
      const combinedMaterialsContent = materials
        .map(m => `--- DOCUMENT: ${m.fileName} ---\n${m.content || 'No text content available.'}`)
        .join('\n\n');

      const token = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/groups/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          groupId: activeGroup.id,
          groupName: activeGroup.name,
          groupCourse: activeGroup.course,
          materialsContent: combinedMaterialsContent,
          prompt: userMsgText,
          mode: modeOverride || aiMode
        })
      });

      let aiRespText = "I am ready to help! Ensure your group has uploaded course files under the Materials tab so I can ground my responses in your curriculum.";
      if (response.ok) {
        const data = await response.json();
        aiRespText = data.text || "I have analyzed your group materials.";
      }

      const aiMsgObj: GroupMessage = {
        id: `msg_${Date.now()}_ai`,
        sender: 'Scolaris AI',
        text: aiRespText,
        timestamp: Date.now()
      };

      setAiMessages(prev => [
        ...prev,
        {
          sender: 'Scolaris AI',
          text: aiRespText,
          timestamp: Date.now()
        }
      ]);

      // Save AI message to group state and Firestore
      setGroups(prev => prev.map(g => {
        if (g.id === activeGroup.id) {
          const updatedMsgs = [...(g.messages || []), aiMsgObj];
          const updatedGroup = { ...g, messages: updatedMsgs };
          DBService.saveGroup(updatedGroup, currentUserId);
          return updatedGroup;
        }
        return g;
      }));
    } catch (err) {
      console.error('Group AI query error:', err);
      const errMsg = "An internal exception occurred while parsing group files. Please try again.";
      setAiMessages(prev => [
        ...prev,
        {
          sender: 'Scolaris AI',
          text: errMsg,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Discussion forum operations
  const handleCreateDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiscussionContent.trim() || !activeGroup) return;

    try {
      const res = await DBService.createDiscussionPost(activeGroup.id, {
        title: newDiscussionTitle.trim(),
        content: newDiscussionContent.trim(),
        authorId: currentUserId,
        authorName: profile.name,
        authorAvatar: profile.avatarIcon
      });

      if (res.success && res.discussionPost) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const updated = [res.discussionPost, ...(g.discussions || [])];
            return { ...g, discussions: updated };
          }
          return g;
        }));

        setNewDiscussionTitle('');
        setNewDiscussionContent('');
        setShowNewDiscussion(false);
        addNotification('message', 'Discussion Started', 'New topic posted to group forum.', 'groups');
      }
    } catch (e) {
      console.error('Discussion creation error:', e);
    }
  };

  const handleAddReply = async (postId: string) => {
    if (!replyText.trim() || !activeGroup) return;

    try {
      const res = await DBService.addDiscussionReply(activeGroup.id, postId, {
        authorId: currentUserId,
        authorName: profile.name,
        authorAvatar: profile.avatarIcon,
        content: replyText.trim()
      });

      if (res.success) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const discussions = (g.discussions || []).map(p => {
              if (p.id === postId) {
                const newReply = {
                  id: `reply_${Date.now()}`,
                  postId,
                  authorId: currentUserId,
                  authorName: profile.name,
                  authorAvatar: profile.avatarIcon,
                  content: replyText.trim(),
                  timestamp: Date.now()
                };
                return { ...p, replies: [...(p.replies || []), newReply] };
              }
              return p;
            });
            return { ...g, discussions };
          }
          return g;
        }));

        setReplyText('');
        setActiveReplyPostId(null);
      }
    } catch (e) {
      console.error('Reply submission error:', e);
    }
  };

  // Member Management
  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeGroup) return;
    if (confirm("Are you sure you want to remove this student from the group?")) {
      const res = await DBService.removeGroupMember(activeGroup.id, targetUserId, currentUserId);
      if (res.success) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const updatedMembers = (g.members || []).filter(m => (typeof m === 'string' ? m : m.userId) !== targetUserId);
            return { ...g, members: updatedMembers, memberCount: updatedMembers.length };
          }
          return g;
        }));
        addNotification('message', 'Member Removed', 'User has been removed from the group.', 'groups');
      }
    }
  };

  const copyInvite = () => {
    if (!activeGroup) return;
    const inviteUrl = `${window.location.origin}?joinGroup=${activeGroup.inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateCode = async () => {
    if (!activeGroup) return;
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await DBService.updateGroupInviteCode(activeGroup.id, newCode, currentUserId);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, inviteCode: newCode } : g));
    addNotification('message', 'Invite Code Updated', `New invite code: ${newCode}`, 'groups');
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col xl:flex-row gap-6 animate-in fade-in duration-500">
      
      {/* SIDEBAR: Group Navigation & Discovery */}
      <div className="w-full xl:w-80 flex flex-col gap-4 shrink-0 h-auto xl:h-full">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <h1 className="text-lg font-serif font-bold text-slate-900 tracking-tight">Study Groups</h1>
            <p className="text-[11px] text-slate-500 font-medium">Collaborative Academic Circles</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJoinModal(true)}
              title="Join via Group Code"
              className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all cursor-pointer"
            >
              <LinkIcon size={16} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              title="Create New Group"
              className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-all shadow-xs cursor-pointer"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Directory Switcher Tabs */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs flex-1 flex flex-col overflow-hidden min-h-[280px] xl:min-h-0">
          <div className="p-1 border-b border-slate-100 bg-slate-50/50 flex">
            <button
              onClick={() => setSidebarMode('my')}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-1.5 ${
                sidebarMode === 'my' 
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/60' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users size={12} /> My Circles ({myGroups.length})
            </button>
            <button
              onClick={() => setSidebarMode('explore')}
              className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-1.5 ${
                sidebarMode === 'explore' 
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/60' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Globe size={12} /> Discover
            </button>
          </div>

          {sidebarMode === 'explore' && (
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter general groups..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {sidebarMode === 'my' ? (
              myGroups.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto">
                    <Users size={22} />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No Groups Joined Yet</p>
                  <p className="text-[11px] text-slate-500">Create a group for your course or enter an invite code to join a study circle.</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 underline cursor-pointer"
                  >
                    + Form a Study Circle
                  </button>
                </div>
              ) : (
                myGroups.map(g => {
                  const isActive = activeGroupId === g.id;
                  const isPrivate = g.type === 'private';
                  const memberCount = (g.members || []).length;

                  return (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroupId(g.id)}
                      className={`w-full p-3.5 rounded-2xl text-left transition-all duration-200 border cursor-pointer ${
                        isActive
                          ? 'bg-indigo-900 border-indigo-900 text-white shadow-md'
                          : 'bg-white hover:bg-slate-50 border-slate-200/70 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold uppercase tracking-tight truncate ${isActive ? 'text-white' : 'text-slate-900'}`}>
                          {g.name}
                        </span>
                        {isPrivate ? (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                            isActive ? 'bg-indigo-800 text-indigo-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Lock size={9} /> Private
                          </span>
                        ) : (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                            isActive ? 'bg-indigo-800 text-indigo-200' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            <Globe size={9} /> General
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`truncate ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                          {g.course || 'General Subject'}
                        </span>
                        <span className={`font-medium ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {memberCount} member{memberCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )
            ) : (
              exploreGroups.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  No public general study groups discovered matching your query.
                </div>
              ) : (
                exploreGroups.map(g => (
                  <div key={g.id} className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">{g.name}</span>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold">
                        General
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2">{g.description || `Group for ${g.course}`}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500 font-medium">{g.course}</span>
                      <button
                        onClick={() => handleJoinGeneralGroup(g)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Join Circle
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE: Active Group Workspace */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden">
        {!activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h2 className="text-xl font-serif font-bold text-slate-900 mb-2">Select a Study Group</h2>
            <p className="text-sm text-slate-500 max-w-md">Choose a circle from your directory on the left or enter an invite code to join a new group.</p>
            <button
              onClick={() => setShowJoinModal(true)}
              className="mt-6 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-xs transition-all cursor-pointer"
            >
              Enter Invite Code
            </button>
          </div>
        ) : (
          <>
            {/* Header Header */}
            <div className="p-5 border-b border-slate-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg md:text-xl font-serif font-bold text-slate-900 uppercase tracking-tight">
                    {activeGroup.name}
                  </h2>
                  {activeGroup.type === 'private' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                      <Lock size={10} /> Private Group
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                      <Globe size={10} /> General Group
                    </span>
                  )}
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                    {activeGroup.course}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                  <span>{activeGroup.description || 'Collaborative Academic Circle'}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                    Code: {activeGroup.inviteCode}
                  </span>
                  <button
                    onClick={copyInvite}
                    title="Copy Shareable Invite Link"
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copied ? 'Link Copied!' : 'Copy Link'}
                  </button>
                  {activeGroup.ownerId === currentUserId && (
                    <button
                      onClick={regenerateCode}
                      title="Generate new invite code"
                      className="text-[10px] text-slate-500 hover:text-slate-800 underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={10} /> Regen Code
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-100 p-1 rounded-2xl flex border border-slate-200/80">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'ai'
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Bot size={14} className="text-indigo-600" /> Scolaris AI
                  </button>
                  <button
                    onClick={() => setActiveTab('materials')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'materials'
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Files size={14} /> Materials ({(activeGroup.sharedMaterials || []).length})
                  </button>
                  <button
                    onClick={() => setActiveTab('discussions')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'discussions'
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare size={14} /> Forum
                  </button>
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'overview'
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users size={14} /> Info
                  </button>
                </div>
              </div>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/30">
              
              {/* 1. SCOLARIS AI TAB */}
              {activeTab === 'ai' && (
                <div className="max-w-4xl mx-auto space-y-6 flex flex-col h-full">
                  
                  {/* Preset AI Action Badges */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-indigo-600" />
                        <span className="text-xs font-bold text-slate-800">Group AI Study Assistant</span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                          Grounded in Group Materials
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {(activeGroup.sharedMaterials || []).length} Document(s) Indexed
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Generate a 5-question study quiz based on all uploaded group notes.", 'quiz')}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-100"
                      >
                        <HelpCircle size={13} /> Quiz Practice
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Synthesize and summarize all uploaded group study materials.", 'summarize')}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-100"
                      >
                        <FileText size={13} /> Group Summary
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Identify top 5 high-yield exam topics from our group materials.", 'topics')}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-amber-100"
                      >
                        <Lightbulb size={13} /> High-Yield Revision
                      </button>
                    </div>
                  </div>

                  {/* Chat Messages Log */}
                  <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                    {aiMessages.map((msg, idx) => {
                      const isAi = msg.sender === 'Scolaris AI';
                      return (
                        <div key={idx} className={`flex gap-3 ${isAi ? 'items-start' : 'items-end justify-end'}`}>
                          {isAi && (
                            <div className="w-8 h-8 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                              <Bot size={18} />
                            </div>
                          )}
                          <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-xs ${
                            isAi 
                              ? 'bg-white border border-slate-200/80 text-slate-800 font-normal' 
                              : 'bg-indigo-900 text-white font-medium'
                          }`}>
                            <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-100/50">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${isAi ? 'text-indigo-600' : 'text-indigo-200'}`}>
                                {msg.sender}
                              </span>
                              <span className="text-[9px] text-slate-400">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                          {!isAi && (
                            <UserAvatar avatarIcon={profile.avatarIcon || 'graduation-cap'} name={profile.name} size="sm" />
                          )}
                        </div>
                      );
                    })}

                    {isAiThinking && (
                      <div className="flex items-center gap-3 text-indigo-600 font-medium text-xs bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-100 animate-pulse">
                        <Sparkles size={16} className="animate-spin" />
                        Scolaris AI is analyzing group materials and generating response...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Prompt Input Field */}
                  <form onSubmit={e => handleSendAiPrompt(e)} className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Ask Scolaris AI about materials in "${activeGroup.name}"...`}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      disabled={isAiThinking}
                      className="flex-1 px-4 py-2.5 text-xs outline-none text-slate-800 placeholder:text-slate-400 bg-transparent"
                    />
                    <button
                      type="submit"
                      disabled={!aiPrompt.trim() || isAiThinking}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 transition-all cursor-pointer shrink-0"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              )}

              {/* 2. SHARED MATERIALS TAB */}
              {activeTab === 'materials' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-serif font-bold text-slate-900">Group Learning Repository</h3>
                      <p className="text-xs text-slate-500">Shared lecture slides, PDF notes, and course documents accessible to group members.</p>
                    </div>
                    <div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isUploading ? <Sparkles size={14} className="animate-spin" /> : <Upload size={14} />}
                        {isUploading ? 'Uploading & Indexing...' : 'Upload Study Material'}
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleMaterialUpload} className="hidden" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(activeGroup.sharedMaterials || []).length === 0 ? (
                      <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 p-8 space-y-3">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                          <Files size={24} />
                        </div>
                        <p className="text-xs font-bold text-slate-700">No Study Materials Uploaded</p>
                        <p className="text-xs text-slate-500">Upload your PDF course notes or slides so Scolaris AI can answer questions for your group!</p>
                      </div>
                    ) : (
                      (activeGroup.sharedMaterials || []).map((mat, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold text-xs">
                              PDF
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-slate-900 truncate" title={mat.fileName}>
                                {mat.fileName}
                              </h4>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Uploaded by {mat.sharedBy || mat.uploadedByName || 'Group Member'}
                              </p>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                            <span>{new Date(mat.timestamp || Date.now()).toLocaleDateString()}</span>
                            {mat.downloadUrl ? (
                              <a
                                href={mat.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1 transition-all"
                              >
                                <Download size={11} /> Download
                              </a>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-bold">Indexed for AI</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 3. DISCUSSIONS / FORUM TAB */}
              {activeTab === 'discussions' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-serif font-bold text-slate-900">Academic Forum</h3>
                      <p className="text-xs text-slate-500">Ask questions, share study tips, and collaborate on assignments.</p>
                    </div>
                    <button
                      onClick={() => setShowNewDiscussion(!showNewDiscussion)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus size={14} /> New Post
                    </button>
                  </div>

                  {/* Create Discussion Form */}
                  {showNewDiscussion && (
                    <form onSubmit={handleCreateDiscussion} className="bg-white p-5 rounded-3xl border border-indigo-100 shadow-xs space-y-3 animate-in slide-in-from-top-2">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Start Discussion Thread</h4>
                      <input
                        type="text"
                        placeholder="Thread Topic / Question Title"
                        value={newDiscussionTitle}
                        onChange={e => setNewDiscussionTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                      />
                      <textarea
                        rows={3}
                        placeholder="Detailed discussion prompt or question..."
                        value={newDiscussionContent}
                        onChange={e => setNewDiscussionContent(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewDiscussion(false)}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Post Discussion
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Discussions List */}
                  <div className="space-y-4">
                    {(activeGroup.discussions || []).length === 0 ? (
                      <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 p-8">
                        <MessageSquare size={24} className="text-slate-400 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700">No Discussions Started Yet</p>
                        <p className="text-xs text-slate-500">Be the first to post a study topic or ask a course question!</p>
                      </div>
                    ) : (
                      (activeGroup.discussions || []).map(post => (
                        <div key={post.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserAvatar avatarIcon={post.authorAvatar || 'graduation-cap'} name={post.authorName} size="xs" />
                              <span className="text-xs font-bold text-slate-900">{post.authorName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(post.timestamp).toLocaleDateString()}
                            </span>
                          </div>

                          {post.title && <h4 className="text-xs font-bold text-indigo-900">{post.title}</h4>}
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">{post.content}</p>

                          {/* Replies */}
                          {(post.replies || []).length > 0 && (
                            <div className="pl-4 border-l-2 border-indigo-100 space-y-2 pt-2">
                              {post.replies.map(reply => (
                                <div key={reply.id} className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800 text-[11px]">{reply.authorName}</span>
                                    <span className="text-[9px] text-slate-400">{new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="text-slate-600">{reply.content}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reply Trigger */}
                          {activeReplyPostId === post.id ? (
                            <div className="flex gap-2 pt-2">
                              <input
                                type="text"
                                placeholder="Write a reply..."
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                              />
                              <button
                                onClick={() => handleAddReply(post.id)}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                              >
                                Reply
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setActiveReplyPostId(post.id)}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 pt-1 cursor-pointer"
                            >
                              + Reply to thread
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. OVERVIEW / GROUP INFO TAB */}
              {activeTab === 'overview' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                    <h3 className="text-base font-serif font-bold text-slate-900">Group Metadata & Access</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Group Type</span>
                        <span className="font-bold text-slate-800 capitalize">{activeGroup.type} Circle</span>
                      </div>
                      <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Course / Subject</span>
                        <span className="font-bold text-slate-800">{activeGroup.course || 'General'}</span>
                      </div>
                      {activeGroup.department && (
                        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
                          <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Department</span>
                          <span className="font-bold text-slate-800">{activeGroup.department}</span>
                        </div>
                      )}
                      {activeGroup.level && (
                        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
                          <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Academic Level</span>
                          <span className="font-bold text-slate-800">{activeGroup.level}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-serif font-bold text-slate-900">Group Members ({(activeGroup.members || []).length})</h3>
                      {activeGroup.ownerId === currentUserId && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                          Owner Controls Active
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-slate-100">
                      {(activeGroup.members || []).map((mem: any, i) => {
                        const mName = typeof mem === 'string' ? mem : mem.name;
                        const mRole = typeof mem === 'string' ? (activeGroup.ownerId === currentUserId ? 'owner' : 'member') : (mem.role || 'member');
                        const mUid = typeof mem === 'string' ? mem : mem.userId;

                        return (
                          <div key={i} className="py-3 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar avatarIcon="graduation-cap" name={mName} size="xs" />
                              <div>
                                <span className="font-bold text-slate-900 block">{mName}</span>
                                <span className="text-[10px] text-slate-400 capitalize">{mRole}</span>
                              </div>
                            </div>

                            {activeGroup.ownerId === currentUserId && mUid !== currentUserId && (
                              <button
                                onClick={() => handleRemoveMember(mUid)}
                                className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>

      {/* CREATE GROUP MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg p-6 rounded-3xl shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-lg font-serif font-bold text-slate-900">Create New Study Group</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Organic Chemistry Study Circle"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Course / Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CHM 301"
                  value={createCourse}
                  onChange={e => setCreateCourse(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Group Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief overview of group goals..."
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Group Privacy / Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateType('general')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      createType === 'general'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Globe size={14} /> General Group
                    </div>
                    <p className="text-[10px] font-normal opacity-80">Discoverable by all students to join freely.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateType('private')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      createType === 'private'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lock size={14} /> Private Group
                    </div>
                    <p className="text-[10px] font-normal opacity-80">Restricted to members with invite code/link.</p>
                  </button>
                </div>
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Biochemistry"
                    value={createDept}
                    onChange={e => setCreateDept(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Level (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 300 Level"
                    value={createLevel}
                    onChange={e => setCreateLevel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!createName.trim() || !createCourse.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                >
                  Create Study Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOIN GROUP MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 rounded-3xl shadow-xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-lg font-serif font-bold text-slate-900">Join via Invite Code</h3>
              <button onClick={() => { setShowJoinModal(false); setJoinError(''); }} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleJoinByCode} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Group Code / Link Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. X7K29A"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-center text-sm font-mono font-bold tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/20 text-indigo-900 uppercase"
                />
                {joinError && <p className="text-[11px] text-rose-600 font-bold mt-1.5">{joinError}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                >
                  Join Circle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudyGroups;
