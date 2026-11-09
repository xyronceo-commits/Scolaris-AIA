import React, { useState, useEffect, useRef } from 'react';
import { 
  UserProfile, 
  StudyGroup, 
  StudyHubData, 
  GroupMessage, 
  AppNotification, 
  AppState, 
  GroupMaterial, 
  GroupDiscussionPost, 
  GroupDiscussionReply,
  GroupActivity, 
  GroupMember,
  SharedMaterial
} from '../types';
import { 
  Globe, Lock, Link as LinkIcon, Check, Copy, Upload, Download, FileText, 
  LogOut, Share2, Search, Plus, X, ArrowRight, MessageSquare, Files, Bot, 
  Sparkles, Users, BookOpen, School, ShieldAlert, Award, Send, RefreshCw, 
  HelpCircle, Lightbulb, Trash2, UserX, Info, Activity, Layers, ChevronRight, Hash,
  KeyRound, AlertCircle, CheckCircle2, Loader2, CornerDownLeft, ChevronDown, CheckCheck, Clock, RotateCcw
} from 'lucide-react';
import { DBService, generateCircleInviteCode } from '../services/db';
import { getHeaders } from '../services/gemini';
import { getCurrentUserId, getAccessToken, supabase } from '../lib/supabase';

import { isAiSender } from '../lib/brand';
import { UserAvatar } from './UserAvatar';

function formatMessageDateHeader(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (msgDay === today) return 'Today';
  if (msgDay === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

interface MessageDayGroup {
  dateLabel: string;
  messages: GroupMessage[];
}

function groupMessagesByDay(messages: GroupMessage[]): MessageDayGroup[] {
  const dayGroups: MessageDayGroup[] = [];
  let currentDay: MessageDayGroup | null = null;

  messages.forEach(msg => {
    const label = formatMessageDateHeader(msg.timestamp);
    if (!currentDay || currentDay.dateLabel !== label) {
      currentDay = { dateLabel: label, messages: [msg] };
      dayGroups.push(currentDay);
    } else {
      currentDay.messages.push(msg);
    }
  });

  return dayGroups;
}

interface StudyGroupsProps {
  profile: UserProfile;
  userId?: string;
  groups: StudyGroup[];
  setGroups: React.Dispatch<React.SetStateAction<StudyGroup[]>>;
  hubs: Record<string, StudyHubData>;
  addNotification: (type: AppNotification['type'], title: string, message: string, link?: AppState) => void;
}

export const StudyGroups: React.FC<StudyGroupsProps> = ({ profile, userId, groups, setGroups, hubs, addNotification }) => {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id || null);
  const [sidebarMode, setSidebarMode] = useState<'my' | 'explore'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // Create Group Form State & Invite Code Generation
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCourse, setCreateCourse] = useState('');
  const [createType, setCreateType] = useState<'general' | 'private'>('private');
  const [createDept, setCreateDept] = useState('');
  const [createLevel, setCreateLevel] = useState('');
  const [createUni, setCreateUni] = useState('');
  const [createSession, setCreateSession] = useState('');
  const [createImage, setCreateImage] = useState('');
  const [createInviteCode, setCreateInviteCode] = useState(() => generateCircleInviteCode());
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingCircle, setIsCreatingCircle] = useState(false);
  const [createdCircleSuccess, setCreatedCircleSuccess] = useState<StudyGroup | null>(null);

  // Join Group State
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinAttempts, setJoinAttempts] = useState<{ count: number; firstAttemptTime: number }>({ count: 0, firstAttemptTime: 0 });

  // Gating & Removal Modals
  const [showCircleUpgradePrompt, setShowCircleUpgradePrompt] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  // Tabs inside Active Group
  const [activeTab, setActiveTab] = useState<'chat' | 'discussions' | 'materials' | 'ai' | 'overview'>('chat');

  // Real-time WhatsApp-style Chat State
  const [circleMessages, setCircleMessages] = useState<GroupMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [newMessagesCount, setNewMessagesCount] = useState<number>(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // AI Assistant Chat State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ sender: string; text: string; timestamp: number }>>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiMode, setAiMode] = useState<'chat' | 'quiz' | 'summarize' | 'topics'>('chat');

  // Discussions Forum State
  const [newDiscussionTitle, setNewDiscussionTitle] = useState('');
  const [newDiscussionContent, setNewDiscussionContent] = useState('');
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyingToReply, setReplyingToReply] = useState<GroupDiscussionReply | null>(null);

  // File Upload State & Material Processing Retry
  const [isUploading, setIsUploading] = useState(false);
  const [retryingMaterialId, setRetryingMaterialId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const channelRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  const currentUserId = userId || getCurrentUserId() || (profile as any)?.id || profile.email || 'guest_user';
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

  // Real-time Supabase subscription on active circle
  useEffect(() => {
    if (!activeGroupId) return;

    setUnreadCounts(prev => ({ ...prev, [activeGroupId]: 0 }));
    setNewMessagesCount(0);

    let isCancelled = false;

    // Load initial messages, discussions, materials
    const loadCircleData = async () => {
      try {
        const [msgs, discs, mats] = await Promise.all([
          DBService.getCircleMessages(activeGroupId),
          DBService.getCircleDiscussions(activeGroupId),
          DBService.getCircleMaterials(activeGroupId),
        ]);
        if (!isCancelled) {
          setCircleMessages(msgs);
          setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, discussions: discs, sharedMaterials: mats } : g));
          setTimeout(() => {
            if (chatScrollRef.current) {
              chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
          }, 80);
        }
      } catch (e) {
        console.warn('Initial circle data load notice:', e);
      }
    };
    loadCircleData();

    // Supabase Realtime Channel
    const channel = supabase.channel(`circle-room:${activeGroupId}`, {
      config: { broadcast: { self: false } }
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${activeGroupId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          const newRow = payload.new as any;
          const newMsg: GroupMessage = {
            id: newRow.id,
            sender: newRow.sender_name,
            senderId: newRow.sender_id,
            senderAvatar: newRow.sender_avatar,
            text: newRow.text,
            timestamp: new Date(newRow.created_at).getTime(),
            replyToId: newRow.reply_to_id,
            replyToText: newRow.reply_to_text,
            replyToSender: newRow.reply_to_sender,
            clientTempId: newRow.client_temp_id,
            status: 'sent'
          };

          setCircleMessages(prev => {
            if (newMsg.clientTempId && prev.some(m => m.clientTempId === newMsg.clientTempId)) {
              return prev.map(m => m.clientTempId === newMsg.clientTempId ? newMsg : m);
            }
            if (prev.some(m => m.id === newMsg.id)) {
              return prev;
            }
            return [...prev, newMsg];
          });

          if (isNearBottomRef.current) {
            setTimeout(() => {
              if (chatScrollRef.current) {
                chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
              }
            }, 40);
          } else {
            setNewMessagesCount(c => c + 1);
          }
        } else if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as any;
          setCircleMessages(prev => prev.filter(m => m.id !== oldRow.id));
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as any;
          setCircleMessages(prev => prev.map(m => m.id === updated.id ? { ...m, text: updated.text } : m));
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circle_discussions', filter: `circle_id=eq.${activeGroupId}` },
      async () => {
        const discs = await DBService.getCircleDiscussions(activeGroupId);
        if (!isCancelled) {
          setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, discussions: discs } : g));
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'circle_discussion_replies', filter: `circle_id=eq.${activeGroupId}` },
      async () => {
        const discs = await DBService.getCircleDiscussions(activeGroupId);
        if (!isCancelled) {
          setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, discussions: discs } : g));
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_materials', filter: `group_id=eq.${activeGroupId}` },
      async () => {
        const mats = await DBService.getCircleMaterials(activeGroupId);
        if (!isCancelled) {
          setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, sharedMaterials: mats } : g));
        }
      }
    )
    .on('broadcast', { event: 'typing' }, (payload) => {
      const typingUser = payload.payload?.name;
      if (typingUser && typingUser !== profile.name) {
        setTypingUsers(prev => Array.from(new Set([...prev, typingUser])));
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== typingUser));
        }, 3000);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        DBService.getCircleMessages(activeGroupId).then(msgs => {
          if (!isCancelled && msgs.length > 0) {
            setCircleMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const missing = msgs.filter(m => !existingIds.has(m.id));
              return missing.length > 0 ? [...prev, ...missing].sort((a, b) => a.timestamp - b.timestamp) : prev;
            });
          }
        });
      }
    });

    channelRef.current = channel;

    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeGroupId]);

  useEffect(() => {
    if (activeTab === 'ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, activeTab]);

  // Handle Group Creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const cleanName = createName.trim();
    const cleanCourse = createCourse.trim();

    if (!cleanName || !cleanCourse) {
      setCreateError('Circle name and course code are required.');
      return;
    }

    setIsCreatingCircle(true);
    setIsAiThinking(true);

    try {
      const codeToAssign = createInviteCode || generateCircleInviteCode();
      const createdGroup = await DBService.createGroup(
        {
          name: cleanName,
          description: createDesc.trim(),
          course: cleanCourse,
          type: createType,
          inviteCode: codeToAssign,
          department: createDept.trim(),
          level: createLevel.trim(),
          university: createUni.trim(),
          academicSession: createSession.trim(),
          groupImage: createImage.trim()
        },
        currentUserId,
        profile.name
      );

      setGroups(prev => [createdGroup, ...prev.filter(g => g.id !== createdGroup.id)]);
      setActiveGroupId(createdGroup.id);
      setShowCreateModal(false);
      setCreatedCircleSuccess(createdGroup);

      // Reset form & generate fresh code for next time
      setCreateName('');
      setCreateDesc('');
      setCreateCourse('');
      setCreateType('private');
      setCreateDept('');
      setCreateLevel('');
      setCreateUni('');
      setCreateSession('');
      setCreateImage('');
      setCreateInviteCode(generateCircleInviteCode());

      addNotification('message', 'Circle Formed', `Study circle "${createdGroup.name}" is ready with invite code ${createdGroup.inviteCode}!`, 'groups');
    } catch (err: any) {
      console.error('Error creating circle:', err);
      setCreateError(err?.message || 'Failed to create study circle. Please try again.');
    } finally {
      setIsCreatingCircle(false);
      setIsAiThinking(false);
    }
  };

  // Handle Join by Code with Rate Limiting & Distinct Errors
  const handleJoinByCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!joinCode.trim()) return;

    const now = Date.now();
    if (joinAttempts.count >= 5 && now - joinAttempts.firstAttemptTime < 60000) {
      setJoinError('Too many attempts. Please wait a moment before trying another code.');
      return;
    }

    setJoinError('');
    setIsAiThinking(true);

    try {
      const code = joinCode.trim().toUpperCase();
      const findRes = await DBService.findGroupByCode(code);

      if (!findRes || (!findRes.group && !findRes.error)) {
        setJoinAttempts(prev => ({
          count: prev.count + 1,
          firstAttemptTime: prev.count === 0 ? now : prev.firstAttemptTime
        }));
        setJoinError("That code doesn't match any circle. Check the code and try again.");
        setIsAiThinking(false);
        return;
      }

      if (findRes.error) {
        setJoinAttempts(prev => ({
          count: prev.count + 1,
          firstAttemptTime: prev.count === 0 ? now : prev.firstAttemptTime
        }));
        if (findRes.error.toLowerCase().includes('revoked') || findRes.error.toLowerCase().includes('inactive')) {
          setJoinError('This invite code has expired or has been replaced by the circle owner.');
        } else {
          setJoinError(findRes.error);
        }
        setIsAiThinking(false);
        return;
      }

      const groupFound = findRes.group!;
      const res = await DBService.joinGroup(groupFound.id, code, currentUserId, profile.name);
      if (res.success && res.group) {
        setJoinAttempts({ count: 0, firstAttemptTime: 0 });
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
        setJoinAttempts(prev => ({
          count: prev.count + 1,
          firstAttemptTime: prev.count === 0 ? now : prev.firstAttemptTime
        }));
        if (res.isAlreadyMember) {
          setJoinError('You are already a member of this circle.');
        } else if (res.error?.toLowerCase().includes('revoked')) {
          setJoinError('This invite code has expired or has been replaced by the circle owner.');
        } else if (res.error?.toLowerCase().includes('invalid')) {
          setJoinError("That code doesn't match any circle. Check the code and try again.");
        } else {
          setJoinError(res.error || 'Failed to join circle.');
        }
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

  // Chat Scroll & Near-Bottom Tracking
  const handleChatScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    const near = distanceToBottom < 80;
    isNearBottomRef.current = near;
    if (near && newMessagesCount > 0) {
      setNewMessagesCount(0);
    }
  };

  // Real-time WhatsApp-style Send Message Handler
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim() || !activeGroup) return;

    const text = inputMessage.trim();
    setInputMessage('');
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const quoted = replyingTo;
    setReplyingTo(null);

    const optimisticMsg: GroupMessage = {
      id: tempId,
      sender: profile.name,
      senderId: currentUserId,
      senderAvatar: profile.avatarIcon,
      text,
      timestamp: Date.now(),
      replyToId: quoted?.id,
      replyToText: quoted?.text,
      replyToSender: quoted?.sender,
      clientTempId: tempId,
      status: 'sending'
    };

    setCircleMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 40);

    try {
      const res = await DBService.sendCircleMessage(activeGroup.id, currentUserId, profile.name, text, {
        replyToId: quoted?.id,
        replyToText: quoted?.text,
        replyToSender: quoted?.sender,
        clientTempId: tempId,
        senderAvatar: profile.avatarIcon
      });

      if (!res.success || !res.message) {
        setCircleMessages(prev => prev.map(m => m.clientTempId === tempId ? { ...m, status: 'failed' } : m));
      } else {
        const confirmed = res.message;
        setCircleMessages(prev => prev.map(m => m.clientTempId === tempId ? { ...confirmed, status: 'sent' } : m));
      }
    } catch {
      setCircleMessages(prev => prev.map(m => m.clientTempId === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const handleRetrySend = async (msg: GroupMessage) => {
    if (!activeGroup) return;
    setCircleMessages(prev => prev.map(m => m.clientTempId === msg.clientTempId ? { ...m, status: 'sending' } : m));
    try {
      const res = await DBService.sendCircleMessage(activeGroup.id, currentUserId, profile.name, msg.text, {
        replyToId: msg.replyToId,
        replyToText: msg.replyToText,
        replyToSender: msg.replyToSender,
        clientTempId: msg.clientTempId,
        senderAvatar: profile.avatarIcon
      });
      if (res.success && res.message) {
        setCircleMessages(prev => prev.map(m => m.clientTempId === msg.clientTempId ? { ...res.message!, status: 'sent' } : m));
      } else {
        setCircleMessages(prev => prev.map(m => m.clientTempId === msg.clientTempId ? { ...m, status: 'failed' } : m));
      }
    } catch {
      setCircleMessages(prev => prev.map(m => m.clientTempId === msg.clientTempId ? { ...m, status: 'failed' } : m));
    }
  };

  const handleDeleteChatMessage = async (msgId: string) => {
    if (!activeGroup) return;
    setCircleMessages(prev => prev.filter(m => m.id !== msgId && m.clientTempId !== msgId));
    await DBService.deleteCircleMessage(msgId, activeGroup.id);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2500 && channelRef.current) {
      lastTypingSentRef.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { name: profile.name }
      }).catch(() => {});
    }
  };

  const handleRetryExtraction = async (mat: SharedMaterial) => {
    if (!mat.id || !mat.storagePath) return;
    setRetryingMaterialId(mat.id);
    addNotification('message', 'Retrying Extraction', `Processing "${mat.fileName}" for AI study assistance...`, 'groups');

    try {
      const res = await DBService.retryMaterialExtraction(
        mat.id,
        mat.storagePath,
        mat.fileName || 'file',
        mat.fileType || 'application/pdf'
      );

      if (res.success) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
            const updated = (g.sharedMaterials || []).map(m => m.id === mat.id ? { ...m, status: 'ready' as const, content: res.extractedText, errorMessage: undefined } : m);
            return { ...g, sharedMaterials: updated };
          }
          return g;
        }));
        addNotification('message', 'Extraction Complete', `"${mat.fileName}" is ready for Circle AI queries.`, 'groups');
      } else {
        addNotification('message', 'Extraction Notice', res.error || 'Text extraction unsuccessful.', 'groups');
      }
    } catch (e: any) {
      addNotification('message', 'Retry Failed', e?.message || 'Error executing retry.', 'groups');
    } finally {
      setRetryingMaterialId(null);
    }
  };

  // AI Study Assistant Query grounded in group materials
  const handleSendAiPrompt = async (e?: React.FormEvent, customPrompt?: string, modeOverride?: 'chat' | 'quiz' | 'summarize' | 'topics') => {
    e?.preventDefault();
    const promptToUse = customPrompt || aiPrompt;
    if (!promptToUse.trim() || !activeGroup || isAiThinking) return;

    const userMsgText = promptToUse;
    setAiPrompt('');
    
    // Add user prompt to AI view
    setAiMessages(prev => [...prev, { sender: profile.name, text: userMsgText, timestamp: Date.now() }]);
    setIsAiThinking(true);

    try {
      const headers = await getHeaders();
      const response = await fetch('/api/groups/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          groupId: activeGroup.id,
          groupName: activeGroup.name,
          groupCourse: activeGroup.course,
          prompt: userMsgText,
          mode: modeOverride || aiMode
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      const aiRespText = data.text || "I have analyzed your group materials.";

      setAiMessages(prev => [
        ...prev,
        {
          sender: 'KorsIQ',
          text: aiRespText,
          timestamp: Date.now()
        }
      ]);
    } catch (err: any) {
      console.error('Group AI query error:', err);
      const errMsg = `[KorsIQ Assistant] ${err?.message || 'Failed to analyze materials. Please ensure resources are uploaded in the Resources tab.'}`;
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
      const res = await DBService.createCircleDiscussion(activeGroup.id, {
        title: newDiscussionTitle.trim(),
        content: newDiscussionContent.trim(),
        authorId: currentUserId,
        authorName: profile.name,
        authorAvatar: profile.avatarIcon
      });

      if (res.success && res.post) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const updated = [res.post!, ...(g.discussions || [])];
            return { ...g, discussions: updated };
          }
          return g;
        }));

        setNewDiscussionTitle('');
        setNewDiscussionContent('');
        setShowNewDiscussion(false);
        addNotification('message', 'Discussion Started', 'New topic posted to circle forum.', 'groups');
      }
    } catch (e) {
      console.error('Discussion creation error:', e);
    }
  };

  const handleAddDiscussionReply = async (postId: string, quote?: GroupDiscussionReply) => {
    if (!replyText.trim() || !activeGroup) return;

    try {
      const quoteToUse = quote || replyingToReply || undefined;
      const res = await DBService.addCircleReply(activeGroup.id, postId, {
        authorId: currentUserId,
        authorName: profile.name,
        authorAvatar: profile.avatarIcon,
        content: replyText.trim(),
        quoteReplyId: quoteToUse?.id,
        quoteReplyText: quoteToUse?.content,
        quoteReplyAuthor: quoteToUse?.authorName
      });

      if (res.success && res.reply) {
        setGroups(prev => prev.map(g => {
          if (g.id === activeGroup.id) {
            const discussions = (g.discussions || []).map(p => {
              if (p.id === postId) {
                return { ...p, replies: [...(p.replies || []), res.reply!] };
              }
              return p;
            });
            return { ...g, discussions };
          }
          return g;
        }));

        setReplyText('');
        setActiveReplyPostId(null);
        setReplyingToReply(null);
      }
    } catch (e) {
      console.error('Reply submission error:', e);
    }
  };

  // Member Management (Spec: Asks for confirmation and states shared-file access ends)
  const handleRemoveMember = (targetUserId: string, targetUserName: string) => {
    setMemberToRemove({ id: targetUserId, name: targetUserName });
  };

  const confirmRemoveMember = async () => {
    if (!activeGroup || !memberToRemove) return;
    const targetUserId = memberToRemove.id;
    setMemberToRemove(null);

    const res = await DBService.removeGroupMember(activeGroup.id, targetUserId, currentUserId);
    if (res.success) {
      setGroups(prev => prev.map(g => {
        if (g.id === activeGroup.id) {
          const updatedMembers = (g.members || []).filter(m => (typeof m === 'string' ? m : m.userId) !== targetUserId);
          return { ...g, members: updatedMembers, memberCount: updatedMembers.length };
        }
        return g;
      }));
      addNotification('message', 'Member Removed', 'User has been removed from the circle.', 'groups');
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

  const isFreePlan = !profile.isPro && profile.tier !== 'scholar' && profile.tier !== 'sage';
  const isOwner = activeGroup?.ownerId === currentUserId;
  const currentMemberObj = (activeGroup?.members || []).find((m: any) =>
    typeof m === 'object' && (m.userId === currentUserId || m.name === profile.name)
  );
  const currentUserRole = isOwner ? 'owner' : (typeof currentMemberObj === 'object' && currentMemberObj ? currentMemberObj.role : 'member');
  const isOwnerOrMod = isOwner || currentUserRole === 'admin' || currentUserRole === 'moderator';

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Title & Top Bar per Spec */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E7EB] dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-[#111827] dark:text-white">Private Circles</h1>
          <p className="text-xs text-[#5B6472]">Study groups, members and shared files</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            if (!createInviteCode) setCreateInviteCode(generateCircleInviteCode());
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer shadow-sm"
        >
          <Plus size={16} />
          <span>Create circle</span>
        </button>
      </div>

      <div className="h-[calc(100vh-210px)] flex flex-col lg:flex-row gap-5">
        {/* LEFT CARD: My circles (Spec: Name and role, Join with code button) */}
        <div className="w-full lg:w-80 shrink-0 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-3.5 space-y-3 flex flex-col h-auto lg:h-full shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] dark:border-slate-800">
            <h2 className="text-sm font-bold text-[#111827] dark:text-white">My circles ({myGroups.length})</h2>
            <button
              type="button"
              onClick={() => {
                setJoinCode('');
                setJoinError('');
                setShowJoinModal(true);
              }}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer min-h-[44px] px-2 flex items-center"
            >
              Join with code
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[280px] lg:max-h-none">
            {myGroups.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs font-semibold text-[#111827] dark:text-slate-200">No circles yet</p>
                <p className="text-[11px] text-[#5B6472]">Enter an invite code to join a study circle.</p>
                <button
                  type="button"
                  onClick={() => setShowJoinModal(true)}
                  className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Join with code
                </button>
              </div>
            ) : (
              myGroups.map(g => {
                const isCircleOwner = g.ownerId === currentUserId;
                const mObj = (g.members || []).find((m: any) => typeof m === 'object' && (m.userId === currentUserId || m.name === profile.name));
                const mRole = typeof mObj === 'object' && mObj ? mObj.role : 'member';
                const roleLabel = isCircleOwner ? 'Owner' : (mRole === 'moderator' || mRole === 'admin') ? 'Moderator' : 'Member';
                const isActive = activeGroupId === g.id;

                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setActiveGroupId(g.id);
                      setUnreadCounts(prev => ({ ...prev, [g.id]: 0 }));
                    }}
                    className={`w-full text-left p-3 rounded-lg border min-h-[44px] flex items-center justify-between transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#EFF6FF] border-[#2563EB] text-[#111827]'
                        : 'border-[#E5E7EB] hover:bg-slate-50 text-[#111827]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-semibold text-xs truncate text-[#111827] dark:text-white">{g.name}</p>
                      <p className="text-[11px] text-[#5B6472]">{g.course}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(unreadCounts[g.id] || 0) > 0 && (
                        <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-xs">
                          {unreadCounts[g.id] > 99 ? '99+' : unreadCounts[g.id]}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                        roleLabel === 'Owner'
                          ? 'bg-[#EFF6FF] text-[#2563EB]'
                          : 'bg-slate-100 text-[#5B6472]'
                      }`}>
                        {roleLabel}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Selected circle (Spec: Invite code box for owners/mods, tabs: Chat, Discussions, Resources, AI Assistant, Members) */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xs">
          {!activeGroup ? (
            <div className="m-auto text-center p-8 space-y-2">
              <p className="text-xs font-semibold text-[#111827] dark:text-slate-300">No circle selected</p>
              <p className="text-[11px] text-[#5B6472]">Select a study circle from the left or join a new one.</p>
            </div>
          ) : (
            <>
              {/* Circle Header */}
              <div className="p-4 border-b border-[#E5E7EB] dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-[#111827] dark:text-white">{activeGroup.name}</h2>
                    <p className="text-xs text-[#5B6472]">{activeGroup.course} · {activeGroup.description || 'Collaborative study circle'}</p>
                  </div>
                  {/* Tabs: Chat, Discussions, Resources, AI Assistant, Members */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab('chat')}
                      className={`px-3 py-1.5 rounded-md min-h-[36px] transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'chat'
                          ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                          : 'text-[#5B6472] hover:text-[#111827]'
                      }`}
                    >
                      <MessageSquare size={13} />
                      <span>Chat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('discussions')}
                      className={`px-3 py-1.5 rounded-md min-h-[36px] transition-colors cursor-pointer ${
                        activeTab === 'discussions'
                          ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                          : 'text-[#5B6472] hover:text-[#111827]'
                      }`}
                    >
                      Discussions
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('materials')}
                      className={`px-3 py-1.5 rounded-md min-h-[36px] transition-colors cursor-pointer ${
                        activeTab === 'materials'
                          ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                          : 'text-[#5B6472] hover:text-[#111827]'
                      }`}
                    >
                      Resources
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ai')}
                      className={`px-2.5 py-1.5 rounded-md min-h-[36px] transition-colors cursor-pointer flex items-center gap-1 ${
                        activeTab === 'ai'
                          ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                          : 'text-[#5B6472] hover:text-[#111827]'
                      }`}
                    >
                      <Sparkles size={12} className="text-blue-500" />
                      <span>AI Assistant</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('overview')}
                      className={`px-3 py-1.5 rounded-md min-h-[36px] transition-colors cursor-pointer ${
                        activeTab === 'overview'
                          ? 'bg-white dark:bg-slate-900 text-[#2563EB] shadow-xs'
                          : 'text-[#5B6472] hover:text-[#111827]'
                      }`}
                    >
                      Members ({(activeGroup.members || []).length})
                    </button>
                  </div>
                </div>

                {/* Invite Code Box: Shown only to Owners and Moderators per Spec */}
                {isOwnerOrMod && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-[#E5E7EB] dark:border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#5B6472] uppercase tracking-wider">Invite code:</span>
                        <span className="font-mono font-bold text-sm text-[#111827] dark:text-white px-2.5 py-1 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-700 rounded-md tracking-wider">
                          {activeGroup.inviteCode || 'KQ-XXXX-XX'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={copyInviteCodeOnly}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-[#E5E7EB] hover:bg-slate-50 text-xs font-semibold text-[#111827] dark:text-white rounded-lg flex items-center gap-1 cursor-pointer min-h-[44px]"
                        >
                          {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={regenerateCode}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-[#E5E7EB] hover:bg-slate-50 text-xs font-semibold text-[#111827] dark:text-white rounded-lg flex items-center gap-1 cursor-pointer min-h-[44px]"
                        >
                          <RefreshCw size={13} />
                          <span>Regenerate</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#5B6472]">
                      Regenerating replaces the old code. Current members keep access.
                    </p>
                  </div>
                )}
              </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/40 dark:bg-slate-950/40 flex flex-col">
              
              {/* 1. WHATSAPP-STYLE REALTIME CHAT TAB */}
              {activeTab === 'chat' && (
                <div className="max-w-4xl w-full mx-auto flex flex-col flex-1 h-full min-h-[420px]">
                  {/* Messages Log Container */}
                  <div 
                    ref={chatScrollRef}
                    onScroll={handleChatScroll}
                    className="flex-1 overflow-y-auto space-y-4 pr-1 relative"
                  >
                    {circleMessages.length === 0 ? (
                      <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-6 text-center space-y-2">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/60 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                          <MessageSquare size={24} />
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          No messages in {activeGroup.name} yet
                        </h4>
                        <p className="text-[11px] text-[#5B6472] max-w-xs">
                          Be the first to say hello, ask a course question, or share study ideas with your peers!
                        </p>
                      </div>
                    ) : (
                      groupMessagesByDay(circleMessages).map((dayGroup, dIdx) => (
                        <div key={dIdx} className="space-y-3">
                          {/* Day Separator Pill */}
                          <div className="flex items-center justify-center my-3">
                            <span className="bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-2xs">
                              {dayGroup.dateLabel}
                            </span>
                          </div>

                          {/* Messages for this Day */}
                          {dayGroup.messages.map(msg => {
                            const isMe = msg.senderId === currentUserId || msg.sender === profile.name;
                            const isSending = msg.status === 'sending';
                            const isFailed = msg.status === 'failed';
                            const canDelete = isMe || isOwnerOrMod;

                            return (
                              <div
                                key={msg.id}
                                className={`flex gap-2.5 items-end group ${isMe ? 'justify-end' : 'justify-start'}`}
                              >
                                {!isMe && (
                                  <UserAvatar 
                                    avatarIcon={msg.senderAvatar || 'graduation-cap'} 
                                    name={msg.sender} 
                                    size="xs" 
                                  />
                                )}

                                <div className={`relative max-w-[82%] sm:max-w-[70%] p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                                  isMe
                                    ? 'bg-blue-600 text-white rounded-br-xs'
                                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-bl-xs'
                                }`}>
                                  {/* Sender Name (Only on incoming messages) */}
                                  {!isMe && (
                                    <span className="font-semibold text-[11px] text-blue-600 dark:text-blue-400 block mb-1">
                                      {msg.sender}
                                    </span>
                                  )}

                                  {/* Quoted Message Preview */}
                                  {msg.replyToText && (
                                    <div className={`p-2 rounded-lg mb-2 text-[11px] border-l-3 ${
                                      isMe
                                        ? 'bg-blue-700/60 border-white text-blue-100'
                                        : 'bg-slate-100 dark:bg-slate-800/80 border-blue-600 text-slate-700 dark:text-slate-300'
                                    }`}>
                                      <span className="font-bold block text-[10px] opacity-90">
                                        {msg.replyToSender || 'Replying to message'}
                                      </span>
                                      <p className="truncate line-clamp-2 italic opacity-95">
                                        "{msg.replyToText}"
                                      </p>
                                    </div>
                                  )}

                                  {/* Message Text */}
                                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                                  {/* Footer: Timestamp, Delivery Status, Actions */}
                                  <div className={`flex items-center justify-end gap-1.5 mt-1 pt-0.5 text-[9px] ${
                                    isMe ? 'text-blue-200' : 'text-slate-400'
                                  }`}>
                                    <span>
                                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>

                                    {isMe && (
                                      <span>
                                        {isSending && <Loader2 size={10} className="animate-spin inline" />}
                                        {isFailed && (
                                          <button
                                            type="button"
                                            onClick={() => handleRetrySend(msg)}
                                            className="text-rose-200 font-bold underline cursor-pointer"
                                            title="Failed to send. Tap to retry."
                                          >
                                            Failed (tap retry)
                                          </button>
                                        )}
                                        {!isSending && !isFailed && <CheckCheck size={12} className="inline" />}
                                      </span>
                                    )}

                                    {/* Action Triggers (Quote Reply, Delete) */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setReplyingTo(msg)}
                                        className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer`}
                                        title="Reply to this message"
                                      >
                                        <CornerDownLeft size={11} />
                                      </button>
                                      {canDelete && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteChatMessage(msg.id)}
                                          className={`p-0.5 rounded hover:bg-rose-500/20 text-rose-300 hover:text-rose-100 cursor-pointer`}
                                          title="Delete message"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Floating "New messages" pill when scrolled up */}
                  {newMessagesCount > 0 && (
                    <div className="sticky bottom-14 flex justify-center z-20 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => {
                          if (chatScrollRef.current) {
                            chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
                          }
                          setNewMessagesCount(0);
                        }}
                        className="pointer-events-auto px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 transition-all transform hover:scale-105 cursor-pointer animate-bounce"
                      >
                        <span>{newMessagesCount} new message{newMessagesCount > 1 ? 's' : ''}</span>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}

                  {/* Typing Indicator */}
                  {typingUsers.length > 0 && (
                    <div className="px-3 py-1 text-[11px] text-slate-500 italic flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                      <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
                    </div>
                  )}

                  {/* Quoted Message Preview Bar */}
                  {replyingTo && (
                    <div className="px-3.5 py-2 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-t-lg flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <CornerDownLeft size={13} className="text-blue-600 shrink-0" />
                        <span className="text-[#5B6472]">
                          Replying to <strong className="text-slate-900 dark:text-white">{replyingTo.sender}</strong>:
                        </span>
                        <span className="truncate italic text-slate-600 dark:text-slate-400">
                          "{replyingTo.text.slice(0, 50)}"
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded text-slate-500 cursor-pointer"
                        title="Cancel reply quote"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {/* Realtime Chat Input Form */}
                  <form 
                    onSubmit={handleSendChatMessage} 
                    className={`bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2 ${
                      replyingTo ? 'rounded-b-lg border-t-0' : 'rounded-lg'
                    }`}
                  >
                    <input
                      type="text"
                      placeholder={`Message ${activeGroup.name}...`}
                      value={inputMessage}
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 text-xs outline-none text-slate-900 dark:text-white placeholder:text-slate-400 bg-transparent"
                    />
                    <button
                      type="submit"
                      disabled={!inputMessage.trim()}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <Send size={13} />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                </div>
              )}

              {/* 2. SHARED RESOURCES TAB (With Extraction Status & Retry) */}
              {activeTab === 'materials' && (
                <div className="max-w-4xl mx-auto space-y-4 w-full">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Circle Study Resources</h3>
                      <p className="text-xs text-slate-500">Shared lecture slides, PDF notes, and documents accessible to all circle members and KorsIQ AI.</p>
                    </div>
                    <div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 min-h-[40px]"
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
                      (activeGroup.sharedMaterials || []).map((mat, idx) => {
                        const isReady = mat.status === 'ready' || (!mat.status && mat.content);
                        const isProcessing = mat.status === 'processing';
                        const isFailed = mat.status === 'failed';
                        const isRetrying = retryingMaterialId === mat.id;

                        return (
                          <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
                            <div className="flex items-start gap-2.5">
                              <div className="w-9 h-9 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center shrink-0 font-semibold text-xs uppercase">
                                {(mat.fileName || 'PDF').split('.').pop()?.slice(0, 4) || 'FILE'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={mat.fileName}>
                                  {mat.fileName}
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Uploaded by {mat.sharedBy || mat.uploadedByName || 'Member'} · {mat.fileSize || ''}
                                </p>
                              </div>
                            </div>

                            {/* Processing Status Badge per Task 3 */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                              <div>
                                {isReady && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                    <Check size={11} /> Ready for AI
                                  </span>
                                )}
                                {isProcessing && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                                    <Loader2 size={11} className="animate-spin" /> Processing...
                                  </span>
                                )}
                                {isFailed && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryExtraction(mat)}
                                    disabled={isRetrying}
                                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 flex items-center gap-1 cursor-pointer transition-colors"
                                    title={mat.errorMessage || 'Text extraction unsuccessful. Click to retry.'}
                                  >
                                    {isRetrying ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                    <span>Failed - Tap to retry</span>
                                  </button>
                                )}
                              </div>

                              {mat.downloadUrl ? (
                                <a
                                  href={mat.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium rounded flex items-center gap-1 transition-colors text-xs"
                                >
                                  <Download size={11} /> Download
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  {new Date(mat.timestamp || Date.now()).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3. DISCUSSIONS / FORUM TAB (Live Updating with Quote Replies) */}
              {activeTab === 'discussions' && (
                <div className="max-w-4xl mx-auto space-y-4 w-full">
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Academic Forum & Questions</h3>
                      <p className="text-xs text-slate-500">Ask questions, start threads, and reply to your study peers live.</p>
                    </div>
                    <button
                      onClick={() => setShowNewDiscussion(!showNewDiscussion)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
                    >
                      <Plus size={13} /> New Topic
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

                          {/* Nested Replies with Quote Support */}
                          {(post.replies || []).length > 0 && (
                            <div className="pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 pt-1">
                              {post.replies.map((reply: any) => (
                                <div key={reply.id} className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{reply.authorName}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] text-slate-400">{new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveReplyPostId(post.id);
                                          setReplyingToReply(reply);
                                        }}
                                        className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                      >
                                        Quote
                                      </button>
                                    </div>
                                  </div>

                                  {reply.quoteReplyText && (
                                    <div className="p-1.5 bg-white dark:bg-slate-900 rounded border-l-2 border-blue-500 text-[10px] italic text-slate-500">
                                      <strong>{reply.quoteReplyAuthor || 'Reply'}:</strong> "{reply.quoteReplyText.slice(0, 50)}"
                                    </div>
                                  )}

                                  <p className="text-slate-700 dark:text-slate-300">{reply.content}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reply Trigger & Form */}
                          {activeReplyPostId === post.id ? (
                            <div className="space-y-1.5 pt-2">
                              {replyingToReply && (
                                <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded flex items-center justify-between text-[11px]">
                                  <span className="truncate text-slate-600 dark:text-slate-300">
                                    Quoting <strong>{replyingToReply.authorName}</strong>: "{replyingToReply.content.slice(0, 40)}"
                                  </span>
                                  <button onClick={() => setReplyingToReply(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder={replyingToReply ? `Reply to ${replyingToReply.authorName}...` : "Write a reply to this thread..."}
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-blue-600 text-slate-800 dark:text-slate-200"
                                />
                                <button
                                  onClick={() => handleAddDiscussionReply(post.id)}
                                  className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                                >
                                  Reply
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveReplyPostId(null);
                                    setReplyingToReply(null);
                                  }}
                                  className="px-2 py-1 text-slate-500 text-xs rounded-lg hover:bg-slate-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveReplyPostId(post.id);
                                setReplyingToReply(null);
                              }}
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

              {/* 4. GROUNDED CIRCLE AI ASSISTANT TAB */}
              {activeTab === 'ai' && (
                <div className="max-w-4xl mx-auto space-y-4 flex flex-col h-full w-full">
                  {/* Preset AI Action Badges */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-600" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Circle AI Study Assistant</span>
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
                    {aiMessages.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <Bot size={28} className="text-blue-500 mx-auto" />
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Circle AI Study Assistant Ready
                        </h4>
                        <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                          Ask questions, generate practice quizzes, or synthesize notes from the files uploaded to this circle.
                        </p>
                      </div>
                    ) : (
                      aiMessages.map((msg, idx) => {
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
                      })
                    )}

                    {isAiThinking && (
                      <div className="flex items-center gap-2 text-blue-600 font-medium text-xs bg-blue-50 dark:bg-blue-950/60 p-3 rounded-lg border border-blue-200 dark:border-blue-900">
                        <Sparkles size={14} className="animate-spin" />
                        <span>KorsIQ is analyzing circle materials and citing resources...</span>
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

              {/* 5. OVERVIEW / MEMBERS TAB */}
              {activeTab === 'overview' && (
                <div className="max-w-3xl mx-auto space-y-4 w-full">
                  {/* Members List */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] dark:border-slate-800">
                      <div>
                        <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                          Members ({(activeGroup.members || []).length})
                        </h3>
                        <p className="text-xs text-[#5B6472]">Students and moderators in this study circle</p>
                      </div>
                      {isOwnerOrMod && (
                        <span className="text-[10px] bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                          Moderator Access
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                      {(activeGroup.members || []).map((mem: any, i) => {
                        const mName = typeof mem === 'string' ? mem : mem.name;
                        const mUid = typeof mem === 'string' ? mem : mem.userId;
                        const isCircleOwner = activeGroup.ownerId === mUid;
                        const mRole = isCircleOwner ? 'Owner' : (typeof mem === 'object' && mem.role === 'moderator' ? 'Moderator' : 'Member');

                        return (
                          <div key={i} className="py-3 flex items-center justify-between text-xs min-h-[44px]">
                            <div className="flex items-center gap-3">
                              <UserAvatar avatarIcon="graduation-cap" name={mName} size="xs" />
                              <div>
                                <span className="font-semibold text-[#111827] dark:text-white block">{mName}</span>
                                <span className="text-[10px] text-[#5B6472]">{mRole}</span>
                              </div>
                            </div>

                            {isOwnerOrMod && mUid !== currentUserId && !isCircleOwner && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(mUid, mName)}
                                className="text-rose-600 hover:text-rose-700 text-xs font-semibold cursor-pointer min-h-[44px] px-2 flex items-center"
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

              {/* Auto-Generated Invite Code Display */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound size={13} /> Circle Invite Code
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreateInviteCode(generateCircleInviteCode())}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} /> Generate New
                  </button>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-900/60">
                  <span className="font-mono font-bold text-sm tracking-widest text-slate-900 dark:text-white">
                    {createInviteCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createInviteCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Students will use this code to join your circle.
                </p>
              </div>

              {createError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

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
                  disabled={isCreatingCircle || !createName.trim() || !createCourse.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg disabled:opacity-50 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  {isCreatingCircle ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Creating Circle...</span>
                    </>
                  ) : (
                    <span>Create Circle</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CIRCLE CREATED SUCCESS MODAL */}
      {createdCircleSuccess && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Study Circle Created!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                "{createdCircleSuccess.name}" ({createdCircleSuccess.course}) is ready.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Invite Code</span>
              <div className="font-mono font-bold text-xl tracking-widest text-blue-600 dark:text-blue-400">
                {createdCircleSuccess.inviteCode}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Share this invite code with other students so they can join your circle.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`Join my KorsIQ study circle "${createdCircleSuccess.name}"! Use invite code: ${createdCircleSuccess.inviteCode}`);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedCode ? 'Copied' : 'Copy Invite Info'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCircleSuccess(null)}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
              >
                Enter Circle
              </button>
            </div>
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
                  placeholder="e.g. KQ-7F3A-92"
                  value={joinCode}
                  onChange={e => {
                    let val = e.target.value;
                    if (val.includes('joinGroup=')) {
                      val = val.split('joinGroup=')[1]?.split('&')[0] || val;
                    }
                    setJoinCode(val.trim());
                    setJoinError('');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg px-4 py-2.5 text-center text-sm font-mono font-bold tracking-widest outline-none focus:border-[#2563EB] text-[#111827] dark:text-white uppercase"
                />
                <p className="text-[11px] text-[#5B6472] mt-1 text-center">
                  Enter the unique code shared by your circle owner or moderator.
                </p>
                {joinError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium mt-2">
                    {joinError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-3 py-2 text-[#5B6472] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium rounded-lg cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs rounded-lg disabled:opacity-50 transition-colors cursor-pointer shadow-xs min-h-[44px]"
                >
                  Join Circle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MEMBER REMOVAL MODAL (SPEC: asks for confirmation and states shared-file access ends) */}
      {memberToRemove && (
        <div className="fixed inset-0 bg-[#111827]/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-sm w-full p-6 space-y-4 shadow-xl text-left">
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-[#111827] dark:text-white">
                Remove member
              </h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed">
                Removing <strong className="text-[#111827] dark:text-white">{memberToRemove.name}</strong> will immediately revoke their access to shared circle files and discussions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                className="px-3 py-2 text-xs font-semibold text-[#5B6472] hover:text-[#111827] rounded-lg min-h-[44px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer"
              >
                Remove member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLUS UPGRADE PROMPT MODAL (SPEC: Free plan can join; Create circle shows short Plus prompt) */}
      {showCircleUpgradePrompt && (
        <div className="fixed inset-0 bg-[#111827]/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-sm w-full p-6 space-y-4 shadow-xl text-left">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-[#2563EB] uppercase tracking-wider">
                Plus Feature
              </span>
              <h3 className="font-bold text-base text-[#111827] dark:text-white">
                Create Private Circles
              </h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed">
                Creating private study circles is included in the Plus and Academic Studio plans. Free plans can join circles with an invite code.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCircleUpgradePrompt(false)}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm min-h-[44px]"
              >
                See plans
              </button>
              <button
                type="button"
                onClick={() => setShowCircleUpgradePrompt(false)}
                className="w-full py-2 text-[#5B6472] hover:text-[#111827] text-xs font-medium cursor-pointer min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StudyGroups;
