import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, StudyGroup, StudyHubData, GroupMessage, AppNotification, AppState, GroupMaterial, GroupDiscussionPost, GroupActivity, GroupMember } from '../types';
import { 
  Globe, Lock, Link as LinkIcon, Check, Copy, Upload, Download, FileText, 
  LogOut, Share2, Search, Plus, X, ArrowRight, MessageSquare, Files, Bot, 
  Sparkles, Users, BookOpen, School, ShieldAlert, Award, Send, RefreshCw, 
  HelpCircle, Lightbulb, Trash2, UserX, Info, Activity, Layers, ChevronRight, Hash
} from 'lucide-react';
import { DBService, generateCircleInviteCode } from '../services/db';
import { getHeaders } from '../services/gemini';
import { getCurrentUserId, getAccessToken } from '../lib/supabase';

import { isAiSender } from '../lib/brand';
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
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentUserId = getCurrentUserId() || profile.email || 'guest_user';
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
            sender: 'KorsIQ',
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
      const findRes = await DBService.findGroupByCode(code);

      if (!findRes || (!findRes.group && !findRes.error)) {
        setJoinError('Invalid invitation code. No active study circle found matching this code.');
        setIsAiThinking(false);
        return;
      }

      if (findRes.error) {
        setJoinError(findRes.error);
        setIsAiThinking(false);
        return;
      }

      const groupFound = findRes.group!;
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
        addNotification('message', 'Circle Joined', `You successfully joined "${res.group.name}"!`, 'groups');
      } else {
        setJoinError(res.error || 'Failed to join circle.');
      }
    } catch (err: any) {
      setJoinError('Error joining circle. Please try again.');
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

    // Save user message to group state and database
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

      const headers = await getHeaders();

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
        sender: 'KorsIQ',
        text: aiRespText,
        timestamp: Date.now()
      };

      setAiMessages(prev => [
        ...prev,
        {
          sender: 'KorsIQ',
          text: aiRespText,
          timestamp: Date.now()
        }
      ]);

      // Save AI message to group state and database
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
          sender: 'KorsIQ',
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

  const copyInviteCodeOnly = () => {
    if (!activeGroup) return;
    navigator.clipboard.writeText(activeGroup.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareInvite = async () => {
    if (!activeGroup) return;
    const inviteUrl = `${window.location.origin}?joinGroup=${activeGroup.inviteCode}`;
    const shareText = `Join our "${activeGroup.name}" study circle on KorsIQ using invite code: ${activeGroup.inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `KorsIQ Circle: ${activeGroup.name}`,
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        // user cancelled or share failed, fallback to copy
      }
    }
    navigator.clipboard.writeText(`${shareText}\n${inviteUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateCode = async () => {
    if (!activeGroup || activeGroup.ownerId !== currentUserId) return;
    const newCode = generateCircleInviteCode();
    const ok = await DBService.updateGroupInviteCode(activeGroup.id, newCode, currentUserId);
    if (ok) {
      setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, inviteCode: newCode, inviteCodeActive: true } : g));
      addNotification('message', 'Invite Code Regenerated', `New invite code: ${newCode}. Previous codes have been invalidated.`, 'groups');
    }
  };

  const revokeCodeToggle = async () => {
    if (!activeGroup || activeGroup.ownerId !== currentUserId) return;
    const isCurrentlyActive = activeGroup.inviteCodeActive !== false;
    if (isCurrentlyActive) {
      const ok = await DBService.revokeGroupInviteCode(activeGroup.id, currentUserId);
      if (ok) {
        setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, inviteCodeActive: false } : g));
        addNotification('message', 'Invite Code Revoked', `Invite code for "${activeGroup.name}" has been revoked and can no longer be used.`, 'groups');
      }
    } else {
      const newCode = generateCircleInviteCode();
      const ok = await DBService.updateGroupInviteCode(activeGroup.id, newCode, currentUserId);
      if (ok) {
        setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, inviteCode: newCode, inviteCodeActive: true } : g));
        addNotification('message', 'Invite Code Reactivated', `New active invite code generated: ${newCode}`, 'groups');
      }
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col xl:flex-row gap-5 animate-in fade-in duration-300">
      
      {/* SIDEBAR: Group Navigation & Discovery */}
      <div className="w-full xl:w-72 flex flex-col gap-3 shrink-0 h-auto xl:h-full">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Study Circles</h1>
            <p className="text-xs text-slate-500">Collaborative Academic Groups</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowJoinModal(true)}
              title="Join via Code"
              className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <LinkIcon size={14} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              title="Create New Circle"
              className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Directory Switcher Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex-1 flex flex-col overflow-hidden min-h-[260px] xl:min-h-0">
          <div className="p-1 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex">
            <button
              onClick={() => setSidebarMode('my')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarMode === 'my' 
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/60 dark:border-slate-700' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users size={13} /> My Circles ({myGroups.length})
            </button>
            <button
              onClick={() => setSidebarMode('explore')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarMode === 'explore' 
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/60 dark:border-slate-700' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Globe size={13} /> Discover
            </button>
          </div>

          {sidebarMode === 'explore' && (
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter circles..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2.5 py-1 text-xs outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {sidebarMode === 'my' ? (
              myGroups.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg flex items-center justify-center mx-auto">
                    <Users size={18} />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No circles joined yet</p>
                  <p className="text-[11px] text-slate-500">Create a circle for your course or enter an invite code.</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
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
                      className={`w-full p-3 rounded-lg text-left transition-colors border cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900 text-blue-950 dark:text-blue-100 shadow-xs'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200/70 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold truncate">
                          {g.name}
                        </span>
                        {isPrivate ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Lock size={9} /> Private
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 bg-emerald-50 text-emerald-700">
                            <Globe size={9} /> General
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">{g.course || 'General Subject'}</span>
                        <span className="shrink-0 font-medium">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
                      </div>
                    </button>
                  );
                })
              )
            ) : (
              exploreGroups.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No public general circles found.
                </div>
              ) : (
                exploreGroups.map(g => (
                  <div key={g.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">{g.name}</span>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                        General
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{g.description || `Group for ${g.course}`}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-medium">{g.course}</span>
                      <button
                        onClick={() => handleJoinGeneralGroup(g)}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                      >
                        Join
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
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col overflow-hidden">
        {!activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl flex items-center justify-center">
              <Users size={24} />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Select a Study Circle</h2>
            <p className="text-xs text-slate-500 max-w-sm">Choose a circle from your directory on the left or enter an invitation code to join a private group.</p>
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Enter Invite Code
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {activeGroup.name}
                  </h2>
                  {activeGroup.type === 'private' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded font-semibold">
                      <Lock size={10} /> Private Circle
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                      <Globe size={10} /> General Group
                    </span>
                  )}
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-medium">
                    {activeGroup.course}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                  <span>{activeGroup.description || 'Collaborative Academic Circle'}</span>
                  <span className="text-slate-300">•</span>
                  {/* Automatic Invite Code display */}
                  <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-xs inline-flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-sans font-medium uppercase">Invite:</span>
                    <span>{activeGroup.inviteCode}</span>
                    {activeGroup.inviteCodeActive === false ? (
                      <span className="text-[9px] bg-rose-100 text-rose-700 px-1 rounded font-sans font-semibold">Revoked</span>
                    ) : (
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-sans font-semibold">Active</span>
                    )}
                  </span>

                  <button
                    onClick={copyInviteCodeOnly}
                    title="Copy Invite Code"
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    {copiedCode ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={shareInvite}
                    title="Share Circle Invitation"
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    <Share2 size={12} />
                    <span>Share</span>
                  </button>

                  {activeGroup.ownerId === currentUserId && (
                    <>
                      <button
                        onClick={regenerateCode}
                        title="Generate a new invite code"
                        className="text-[11px] text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={11} /> Regen
                      </button>
                      <button
                        onClick={revokeCodeToggle}
                        title={activeGroup.inviteCodeActive === false ? 'Reactivate invite code' : 'Revoke invite code'}
                        className={`text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                          activeGroup.inviteCodeActive === false ? 'text-emerald-600 hover:text-emerald-700' : 'text-rose-600 hover:text-rose-700'
                        }`}
                      >
                        {activeGroup.inviteCodeActive === false ? 'Reactivate' : 'Revoke'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex border border-slate-200/80 dark:border-slate-700 text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'ai'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Bot size={13} /> KorsIQ AI
                  </button>
                  <button
                    onClick={() => setActiveTab('materials')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'materials'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Files size={13} /> Materials ({(activeGroup.sharedMaterials || []).length})
                  </button>
                  <button
                    onClick={() => setActiveTab('discussions')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'discussions'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare size={13} /> Forum
                  </button>
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'overview'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users size={13} /> Members
                  </button>
                </div>
              </div>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40 dark:bg-slate-950/40">
              
              {/* 1. KORSIQ TAB */}
              {activeTab === 'ai' && (
                <div className="max-w-4xl mx-auto space-y-4 flex flex-col h-full">
                  
                  {/* Preset AI Action Badges */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-600" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Group AI Study Assistant</span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-medium">
                          Grounded in Uploaded Files
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {(activeGroup.sharedMaterials || []).length} Document(s) Indexed
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Generate a 5-question study quiz based on all uploaded group notes.", 'quiz')}
                        className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                      >
                        <HelpCircle size={12} /> Quiz Practice
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Synthesize and summarize all uploaded group study materials.", 'summarize')}
                        className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                      >
                        <FileText size={12} /> Group Summary
                      </button>
                      <button
                        onClick={() => handleSendAiPrompt(undefined, "Identify top 5 high-yield exam topics from our group materials.", 'topics')}
                        className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                      >
                        <Lightbulb size={12} /> High-Yield Revision
                      </button>
                    </div>
                  </div>

                  {/* Chat Messages Log */}
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {aiMessages.map((msg, idx) => {
                      const isAi = isAiSender(msg.sender);
                      return (
                        <div key={idx} className={`flex gap-2.5 ${isAi ? 'items-start' : 'items-end justify-end'}`}>
                          {isAi && (
                            <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Bot size={15} />
                            </div>
                          )}
                          <div className={`p-3.5 rounded-lg max-w-[85%] text-xs leading-relaxed ${
                            isAi 
                              ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 shadow-xs' 
                              : 'bg-blue-600 text-white font-medium'
                          }`}>
                            <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-100 dark:border-slate-800">
                              <span className={`text-[10px] font-semibold uppercase tracking-wider ${isAi ? 'text-blue-600 dark:text-blue-400' : 'text-blue-100'}`}>
                                {msg.sender}
                              </span>
                              <span className={`text-[9px] ${isAi ? 'text-slate-400' : 'text-blue-200'}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                          </div>
                          {!isAi && (
                            <UserAvatar avatarIcon={profile.avatarIcon || 'graduation-cap'} name={profile.name} size="xs" />
                          )}
                        </div>
                      );
                    })}

                    {isAiThinking && (
                      <div className="flex items-center gap-2 text-blue-600 font-medium text-xs bg-blue-50 dark:bg-blue-950/60 p-3 rounded-lg border border-blue-200 dark:border-blue-900">
                        <Sparkles size={14} className="animate-spin" />
                        <span>KorsIQ is analyzing group materials and generating response...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Prompt Input Field */}
                  <form onSubmit={e => handleSendAiPrompt(e)} className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Ask KorsIQ about materials in "${activeGroup.name}"...`}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      disabled={isAiThinking}
                      className="flex-1 px-3 py-2 text-xs outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400 bg-transparent"
                    />
                    <button
                      type="submit"
                      disabled={!aiPrompt.trim() || isAiThinking}
                      className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}

              {/* 2. SHARED MATERIALS TAB */}
              {activeTab === 'materials' && (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Group Learning Repository</h3>
                      <p className="text-xs text-slate-500">Shared lecture slides, PDF notes, and course documents accessible to circle members.</p>
                    </div>
                    <div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isUploading ? <Sparkles size={13} className="animate-spin" /> : <Upload size={13} />}
                        <span>{isUploading ? 'Uploading...' : 'Upload Material'}</span>
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleMaterialUpload} className="hidden" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(activeGroup.sharedMaterials || []).length === 0 ? (
                      <div className="col-span-full py-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 space-y-2">
                        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg flex items-center justify-center mx-auto">
                          <Files size={20} />
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Materials Uploaded</p>
                        <p className="text-xs text-slate-500">Upload PDF notes or slides to empower KorsIQ AI for all members.</p>
                      </div>
                    ) : (
                      (activeGroup.sharedMaterials || []).map((mat, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center shrink-0 font-semibold text-xs">
                              PDF
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={mat.fileName}>
                                {mat.fileName}
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                By {mat.sharedBy || mat.uploadedByName || 'Member'}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                            <span>{new Date(mat.timestamp || Date.now()).toLocaleDateString()}</span>
                            {mat.downloadUrl ? (
                              <a
                                href={mat.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium rounded flex items-center gap-1 transition-colors"
                              >
                                <Download size={11} /> Download
                              </a>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-medium">Indexed for AI</span>
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
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Academic Forum</h3>
                      <p className="text-xs text-slate-500">Ask questions, share study tips, and collaborate on assignments.</p>
                    </div>
                    <button
                      onClick={() => setShowNewDiscussion(!showNewDiscussion)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus size={13} /> New Post
                    </button>
                  </div>

                  {/* Create Discussion Form */}
                  {showNewDiscussion && (
                    <form onSubmit={handleCreateDiscussion} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-blue-200 dark:border-blue-900 shadow-xs space-y-2.5">
                      <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Start Discussion Thread</h4>
                      <input
                        type="text"
                        placeholder="Thread Topic / Question Title"
                        value={newDiscussionTitle}
                        onChange={e => setNewDiscussionTitle(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200"
                      />
                      <textarea
                        rows={3}
                        placeholder="Detailed discussion prompt or question..."
                        value={newDiscussionContent}
                        onChange={e => setNewDiscussionContent(e.target.value)}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200 resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewDiscussion(false)}
                          className="px-3 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Post Thread
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Discussions List */}
                  <div className="space-y-3">
                    {(activeGroup.discussions || []).length === 0 ? (
                      <div className="py-10 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                        <MessageSquare size={20} className="text-slate-400 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Discussions Started Yet</p>
                        <p className="text-xs text-slate-500">Be the first to post a study topic or ask a question!</p>
                      </div>
                    ) : (
                      (activeGroup.discussions || []).map(post => (
                        <div key={post.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <UserAvatar avatarIcon={post.authorAvatar || 'graduation-cap'} name={post.authorName} size="xs" />
                              <span className="text-xs font-semibold text-slate-900 dark:text-white">{post.authorName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(post.timestamp).toLocaleDateString()}
                            </span>
                          </div>

                          {post.title && <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{post.title}</h4>}
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{post.content}</p>

                          {/* Replies */}
                          {(post.replies || []).length > 0 && (
                            <div className="pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-1.5 pt-1">
                              {post.replies.map(reply => (
                                <div key={reply.id} className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-xs space-y-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{reply.authorName}</span>
                                    <span className="text-[9px] text-slate-400">{new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="text-slate-600 dark:text-slate-300">{reply.content}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reply Trigger */}
                          {activeReplyPostId === post.id ? (
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                placeholder="Write a reply..."
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200"
                              />
                              <button
                                onClick={() => handleAddReply(post.id)}
                                className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                              >
                                Reply
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setActiveReplyPostId(post.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 pt-0.5 cursor-pointer"
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
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Private Circle Invitation & Access Management Card */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-blue-600 dark:text-blue-400 tracking-wider block mb-0.5">
                          Circle Invitation
                        </span>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeGroup.name}</h3>
                        <p className="text-xs text-slate-500">{activeGroup.description || 'Collaborative Academic Study Circle'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeGroup.inviteCodeActive === false ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Code Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Active Invitation Code
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Invitation Code</span>
                          <span className="text-xl font-mono font-bold text-slate-900 dark:text-white tracking-widest bg-white dark:bg-slate-900 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs inline-block">
                            {activeGroup.inviteCode}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={copyInviteCodeOnly}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
                          </button>
                          <button
                            onClick={shareInvite}
                            className="px-3.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Share2 size={13} />
                            <span>Share</span>
                          </button>
                        </div>
                      </div>

                      {activeGroup.ownerId === currentUserId && (
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={regenerateCode}
                              className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw size={11} />
                              <span>Regenerate Code</span>
                            </button>
                            <button
                              onClick={revokeCodeToggle}
                              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer ${
                                activeGroup.inviteCodeActive === false
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                            >
                              <span>{activeGroup.inviteCodeActive === false ? 'Reactivate Code' : 'Revoke Code'}</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {activeGroup.inviteCodeActive === false
                              ? 'This code is inactive. Students cannot join until reactivated.'
                              : 'Regenerating will invalidate previous codes.'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Members</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block">{(activeGroup.members || []).length} Students</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Admin</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                          {activeGroup.ownerId === currentUserId ? 'You (Admin)' : 'Circle Admin'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Visibility</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 block capitalize">{activeGroup.type} Circle</span>
                      </div>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Circle Members ({(activeGroup.members || []).length})</h3>
                      {activeGroup.ownerId === currentUserId && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-semibold">
                          Admin Controls
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(activeGroup.members || []).map((mem: any, i) => {
                        const mName = typeof mem === 'string' ? mem : mem.name;
                        const mRole = typeof mem === 'string' ? (activeGroup.ownerId === currentUserId ? 'owner' : 'member') : (mem.role || 'member');
                        const mUid = typeof mem === 'string' ? mem : mem.userId;

                        return (
                          <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar avatarIcon="graduation-cap" name={mName} size="xs" />
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-white block">{mName}</span>
                                <span className="text-[10px] text-slate-400 capitalize">{mRole}</span>
                              </div>
                            </div>

                            {activeGroup.ownerId === currentUserId && mUid !== currentUserId && (
                              <button
                                onClick={() => handleRemoveMember(mUid)}
                                className="text-rose-600 hover:text-rose-700 text-xs font-semibold cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Create Study Circle</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Circle Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Organic Chemistry Study Circle"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Course Code / Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CHM 301"
                  value={createCourse}
                  onChange={e => setCreateCourse(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Circle Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief overview of group focus..."
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Privacy Type *</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCreateType('general')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                      createType === 'general'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe size={13} /> General
                    </div>
                    <p className="text-[10px] font-normal opacity-80">Discoverable by all students.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateType('private')}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                      createType === 'private'
                        ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Lock size={13} /> Private Circle
                    </div>
                    <p className="text-[10px] font-normal opacity-80">Requires auto-generated invite code.</p>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!createName.trim() || !createCourse.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                >
                  Create Circle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOIN GROUP MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Join via Invite Code</h3>
              <button onClick={() => { setShowJoinModal(false); setJoinError(''); }} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleJoinByCode} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Circle Invite Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KOR-7X9P2Q"
                  value={joinCode}
                  onChange={e => {
                    let val = e.target.value;
                    if (val.includes('joinGroup=')) {
                      val = val.split('joinGroup=')[1]?.split('&')[0] || val;
                    }
                    setJoinCode(val.trim());
                    setJoinError('');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-center text-sm font-mono font-bold tracking-widest outline-none focus:border-blue-600 text-slate-900 dark:text-white uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1 text-center">
                  Enter the unique code shared by your circle creator.
                </p>
                {joinError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium mt-2">
                    {joinError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
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
