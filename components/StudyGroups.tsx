import React, { useState, useEffect, useRef } from 'react';
import { 
  UserProfile, 
  StudyGroup, 
  StudyHubData, 
  AppNotification, 
  AppState, 
  GroupDiscussionPost, 
  GroupDiscussionReply,
  GroupMember
} from '../types';
import { 
  Globe, 
  Lock, 
  Link as LinkIcon, 
  Check, 
  Copy, 
  Download, 
  FileText, 
  Share2, 
  Search, 
  Plus, 
  X, 
  MessageSquare, 
  Users, 
  Trash2, 
  Pin, 
  Bookmark, 
  BookmarkCheck, 
  Send, 
  CornerDownRight, 
  Loader2, 
  Clock, 
  AlertCircle, 
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { DBService, generateCircleInviteCode } from '../services/db';
import { getCurrentUserId, supabase } from '../lib/supabase';
import { UserAvatar } from './UserAvatar';

interface StudyGroupsProps {
  profile: UserProfile;
  userId?: string;
  groups: StudyGroup[];
  setGroups: React.Dispatch<React.SetStateAction<StudyGroup[]>>;
  hubs: Record<string, StudyHubData>;
  addNotification: (type: AppNotification['type'], title: string, message: string, link?: AppState) => void;
}

export const StudyGroups: React.FC<StudyGroupsProps> = ({ 
  profile, 
  userId, 
  groups, 
  setGroups, 
  addNotification 
}) => {
  const currentUserId = userId || getCurrentUserId() || (profile as any)?.id || profile.email || 'guest_user';
  
  // Selection
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.id || null);
  const activeGroup = groups.find(g => g.id === activeGroupId) || null;
  const isOwner = Boolean(activeGroup && activeGroup.ownerId === currentUserId);

  // Reddit Community Feed State
  const [posts, setPosts] = useState<GroupDiscussionPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<'new' | 'top' | 'saved'>('new');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active thread reply expansion
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const [replyInputByPost, setReplyInputByPost] = useState<Record<string, string>>({});
  const [submittingReplyFor, setSubmittingReplyFor] = useState<string | null>(null);
  const [quoteReplyTarget, setQuoteReplyTarget] = useState<{ postId: string; replyId: string; authorName: string; text: string } | null>(null);

  // New Post Modal State (Owner Only)
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postType, setPostType] = useState<'thread' | 'material'>('thread');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Create & Join Circle Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createCourse, setCreateCourse] = useState('');
  const [createType, setCreateType] = useState<'general' | 'private'>('private');
  const [isCreatingCircle, setIsCreatingCircle] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  // Copy feedback
  const [copiedInvite, setCopiedInvite] = useState(false);

  // 1. Fetch Posts and Saved Status for Active Circle
  const loadCirclePosts = async (circleId: string) => {
    setIsLoadingPosts(true);
    try {
      const [fetchedPosts, savedIds] = await Promise.all([
        DBService.getCircleDiscussions(circleId),
        DBService.getSavedPostIds(currentUserId)
      ]);
      setPosts(fetchedPosts);
      setSavedPostIds(new Set(savedIds));
    } catch (err) {
      console.warn('Failed to load circle posts:', err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (activeGroupId) {
      loadCirclePosts(activeGroupId);
    }
  }, [activeGroupId, currentUserId]);

  // 2. Realtime Live Subscription for Posts & Replies
  useEffect(() => {
    if (!activeGroupId) return;

    const channel = supabase
      .channel(`circle-community-${activeGroupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'circle_discussions', filter: `circle_id=eq.${activeGroupId}` },
        () => {
          loadCirclePosts(activeGroupId);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'circle_discussion_replies', filter: `circle_id=eq.${activeGroupId}` },
        () => {
          loadCirclePosts(activeGroupId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeGroupId]);

  // Tier Limits Check
  const userTier = (profile.tier || 'free').toLowerCase();
  const createdCirclesCount = groups.filter(g => g.ownerId === currentUserId).length;
  const canCreateCircle = userTier === 'studio' || userTier === 'sage' 
    ? true 
    : userTier === 'plus' || userTier === 'scholar' 
    ? createdCirclesCount < 3 
    : createdCirclesCount < 1;

  const canJoinMoreCircles = userTier === 'studio' || userTier === 'sage' 
    ? true 
    : userTier === 'plus' || userTier === 'scholar' 
    ? groups.length < 10 
    : groups.length < 2;

  // Handle Post Creation (Owner Only)
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId || !isOwner) return;
    if (!postTitle.trim()) {
      setPostError('Please provide a title for this post.');
      return;
    }

    setIsSubmittingPost(true);
    setPostError(null);

    try {
      let fileUrl = '';
      let fileName = '';
      let fileSize = 0;
      let fileType = '';

      if (postType === 'material' && materialFile) {
        const uploadRes = await DBService.uploadGroupMaterial(
          activeGroupId,
          materialFile,
          currentUserId,
          profile.name
        );
        if (uploadRes.success && uploadRes.material) {
          fileUrl = uploadRes.material.downloadUrl || '';
          fileName = materialFile.name;
          fileSize = materialFile.size;
          fileType = materialFile.type;
        } else {
          throw new Error(uploadRes.error || 'Failed to upload material file.');
        }
      }

      const res = await DBService.createCircleDiscussion(activeGroupId, {
        title: postTitle.trim(),
        content: postContent.trim(),
        authorId: currentUserId,
        authorName: profile.name || 'Circle Owner',
        authorAvatar: profile.avatarIcon || 'user',
        postType,
        isPinned: false,
        fileUrl: fileUrl || undefined,
        fileName: fileName || undefined,
        fileSize: fileSize || undefined,
        fileType: fileType || undefined
      });

      if (res.success && res.post) {
        setPosts(prev => [res.post!, ...prev]);
        setIsPostModalOpen(false);
        setPostTitle('');
        setPostContent('');
        setMaterialFile(null);
        addNotification('message', 'Post Published', `"${res.post.title}" is now live in the circle.`);
      } else {
        throw new Error(res.error || 'Failed to publish post.');
      }
    } catch (err: any) {
      setPostError(err?.message || 'Error publishing post. Please try again.');
    } finally {
      setIsSubmittingPost(false);
    }
  };

  // Handle Post Deletion (Author or Circle Owner)
  const handleDeletePost = async (postId: string) => {
    const ok = window.confirm('Are you sure you want to delete this post?');
    if (!ok) return;

    setPosts(prev => prev.filter(p => p.id !== postId));
    await DBService.deleteCircleDiscussion(postId);
    addNotification('message', 'Post Removed', 'The post was removed from the circle.');
  };

  // Handle Pin Toggle (Owner Only)
  const handleTogglePin = async (postId: string, currentPinStatus: boolean) => {
    if (!isOwner) return;
    const nextStatus = !currentPinStatus;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isPinned: nextStatus } : p));
    await DBService.togglePinPost(postId, nextStatus);
    addNotification('message', nextStatus ? 'Post Pinned' : 'Post Unpinned', 'Updated pinned status for the circle.');
  };

  // Handle Save / Bookmark Post
  const handleToggleSave = async (postId: string) => {
    if (!activeGroupId) return;
    const isSaved = savedPostIds.has(postId);
    const nextSaved = new Set(savedPostIds);

    if (isSaved) {
      nextSaved.delete(postId);
      setSavedPostIds(nextSaved);
      await DBService.unsavePost(postId, currentUserId);
      addNotification('message', 'Removed from Saved', 'Post removed from your saved list.');
    } else {
      nextSaved.add(postId);
      setSavedPostIds(nextSaved);
      await DBService.savePost(activeGroupId, postId, currentUserId);
      addNotification('message', 'Post Saved', 'Saved to your personal circle bookmarks.');
    }
  };

  // Handle Reply Submission (Any Member)
  const handleSubmitReply = async (postId: string) => {
    if (!activeGroupId) return;
    const text = (replyInputByPost[postId] || '').trim();
    if (!text) return;

    setSubmittingReplyFor(postId);
    try {
      const res = await DBService.addCircleReply(activeGroupId, postId, {
        authorId: currentUserId,
        authorName: profile.name || 'Member',
        authorAvatar: profile.avatarIcon || 'user',
        content: text,
        quoteReplyId: quoteReplyTarget?.postId === postId ? quoteReplyTarget.replyId : undefined,
        quoteReplyText: quoteReplyTarget?.postId === postId ? quoteReplyTarget.text : undefined,
        quoteReplyAuthor: quoteReplyTarget?.postId === postId ? quoteReplyTarget.authorName : undefined,
      });

      if (res.success && res.reply) {
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              repliesCount: (p.repliesCount || 0) + 1,
              replies: [...(p.replies || []), res.reply!]
            };
          }
          return p;
        }));

        setReplyInputByPost(prev => ({ ...prev, [postId]: '' }));
        setQuoteReplyTarget(null);
        // Ensure reply thread is visible
        setExpandedPostIds(prev => new Set(prev).add(postId));
      } else {
        alert(res.error || 'Failed to submit reply.');
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmittingReplyFor(null);
    }
  };

  // Handle Reply Deletion (Author or Circle Owner)
  const handleDeleteReply = async (postId: string, replyId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          repliesCount: Math.max(0, (p.repliesCount || 1) - 1),
          replies: (p.replies || []).filter(r => r.id !== replyId)
        };
      }
      return p;
    }));
    await DBService.deleteCircleReply(replyId);
  };

  // Copy Invite Code
  const handleCopyInvite = () => {
    if (!activeGroup?.inviteCode) return;
    navigator.clipboard.writeText(activeGroup.inviteCode);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
    addNotification('message', 'Invite Code Copied', `Circle code ${activeGroup.inviteCode} copied.`);
  };

  // Filter & Sort Posts
  const filteredPosts = posts.filter(post => {
    if (feedFilter === 'saved' && !savedPostIds.has(post.id)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (post.title || '').toLowerCase().includes(q);
      const matchContent = (post.content || '').toLowerCase().includes(q);
      const matchFile = (post.fileName || '').toLowerCase().includes(q);
      return matchTitle || matchContent || matchFile;
    }
    return true;
  }).sort((a, b) => {
    // Pinned always on top
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (feedFilter === 'top') {
      return (b.repliesCount || 0) - (a.repliesCount || 0);
    }
    // New (default)
    return b.timestamp - a.timestamp;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Circle Header & Active Circle Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[10px] font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900">
              Community Circle
            </span>
            {activeGroup?.course && (
              <span className="text-xs font-mono text-slate-500 font-semibold">
                {activeGroup.course}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {activeGroup?.name || 'Study Circles'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeGroup?.description || 'Private academic discussion communities and shared course materials.'}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeGroup && (
            <button
              onClick={handleCopyInvite}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg min-h-[44px] transition-colors cursor-pointer"
              title="Copy Circle Invite Code"
            >
              {copiedInvite ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copiedInvite ? 'Copied' : `Code: ${activeGroup.inviteCode || 'Invite'}`}</span>
            </button>
          )}

          {/* ONE Primary Action: + New Post if Owner */}
          {isOwner ? (
            <button
              onClick={() => {
                setPostError(null);
                setIsPostModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs min-h-[44px] transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>+ New Post</span>
            </button>
          ) : (
            <button
              onClick={() => setShowJoinModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs min-h-[44px] transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>Join Circle</span>
            </button>
          )}
        </div>
      </div>

      {/* Circle Switcher Pills & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        {/* Circle selector pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {groups.map(group => {
            const isSelected = group.id === activeGroupId;
            return (
              <button
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <span>{group.name}</span>
                {group.ownerId === currentUserId && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Owner
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={!canCreateCircle}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 dark:border-slate-700 min-h-[44px] flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
            title={canCreateCircle ? 'Create new circle' : 'Circle creation limit reached for your plan'}
          >
            <Plus size={14} />
            <span>New Circle</span>
          </button>
        </div>

        {/* Reddit-style Sort & Saved Tabs */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setFeedFilter('new')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer ${
              feedFilter === 'new'
                ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            New
          </button>
          <button
            onClick={() => setFeedFilter('top')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] cursor-pointer ${
              feedFilter === 'top'
                ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Top-replied
          </button>
          <button
            onClick={() => setFeedFilter('saved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] flex items-center gap-1 cursor-pointer ${
              feedFilter === 'saved'
                ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Bookmark size={13} />
            <span>Saved ({savedPostIds.size})</span>
          </button>
        </div>
      </div>

      {/* Search Input within Circle */}
      {posts.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search discussions or materials in this circle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 min-h-[44px]"
          />
        </div>
      )}

      {/* Notice for non-owners */}
      {!isOwner && activeGroup && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Posting is managed by the circle owner. Members can participate in all discussion threads below.</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Member Mode</span>
        </div>
      )}

      {/* Community Feed */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 sm:p-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {feedFilter === 'saved'
                  ? 'No saved posts'
                  : searchQuery.trim()
                  ? 'No matching posts'
                  : 'No posts in this circle yet'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {feedFilter === 'saved'
                  ? 'Tap the bookmark icon on any post to save it for quick reference.'
                  : searchQuery.trim()
                  ? 'Try searching with different keywords.'
                  : isOwner
                  ? 'Start the discussion by creating a question thread or sharing lecture materials.'
                  : 'The circle owner has not posted any threads yet. Check back soon!'}
              </p>
            </div>
            {isOwner && !searchQuery.trim() && feedFilter !== 'saved' && (
              <button
                onClick={() => setIsPostModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer shadow-xs"
              >
                <Plus size={16} />
                <span>+ Create First Post</span>
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map(post => {
            const isSaved = savedPostIds.has(post.id);
            const isPostAuthor = post.authorId === currentUserId;
            const canDelete = isPostAuthor || isOwner;
            const isExpanded = expandedPostIds.has(post.id);
            const replies = post.replies || [];

            return (
              <div 
                key={post.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-5 transition-colors space-y-4 ${
                  post.isPinned 
                    ? 'border-blue-300 dark:border-blue-800 shadow-2xs' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Post Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar name={post.authorName} size="xs" useInitials />
                    <div className="min-w-0 flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {post.authorName}
                      </span>
                      {activeGroup?.ownerId === post.authorId && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold uppercase border border-blue-100 dark:border-blue-900">
                          Owner
                        </span>
                      )}
                      <span className="text-slate-400 text-[11px]">
                        {new Date(post.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      {post.isPinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                          <Pin size={11} className="rotate-45" />
                          Pinned
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions: Pin (owner), Save (all), Delete (author/owner) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isOwner && (
                      <button
                        onClick={() => handleTogglePin(post.id, Boolean(post.isPinned))}
                        className={`p-2 rounded-lg text-slate-400 hover:text-blue-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
                          post.isPinned ? 'text-blue-600' : ''
                        }`}
                        title={post.isPinned ? 'Unpin post' : 'Pin to top of circle'}
                      >
                        <Pin size={16} className={post.isPinned ? 'fill-blue-600 rotate-45' : ''} />
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleSave(post.id)}
                      className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
                        isSaved ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title={isSaved ? 'Remove from saved' : 'Save post'}
                    >
                      {isSaved ? <BookmarkCheck size={16} className="fill-blue-600" /> : <Bookmark size={16} />}
                    </button>

                    {canDelete && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        title="Delete post"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Post Title & Content */}
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {post.title}
                  </h3>
                  {post.content && (
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">
                      {post.content}
                    </p>
                  )}
                </div>

                {/* Attachment if Material */}
                {post.postType === 'material' && (post.fileUrl || post.fileName) && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {post.fileName || 'Shared Document'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {post.fileSize ? `${Math.round(post.fileSize / 1024)} KB` : 'Academic Material'}
                        </p>
                      </div>
                    </div>

                    {post.fileUrl && (
                      <a
                        href={post.fileUrl}
                        download={post.fileName || 'document'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors shrink-0"
                      >
                        <Download size={14} />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Post Footer: Reply counter trigger */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <button
                    onClick={() => {
                      const next = new Set(expandedPostIds);
                      if (next.has(post.id)) next.delete(post.id);
                      else next.add(post.id);
                      setExpandedPostIds(next);
                    }}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors min-h-[44px] cursor-pointer"
                  >
                    <MessageSquare size={15} />
                    <span>{replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}</span>
                  </button>

                  <span className="text-[11px] text-slate-400">
                    {post.postType === 'material' ? 'Material Post' : 'Discussion Thread'}
                  </span>
                </div>

                {/* Expanded Thread Replies */}
                {isExpanded && (
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {/* Replies List */}
                    {replies.length > 0 && (
                      <div className="space-y-2.5 pl-3 border-l-2 border-slate-200 dark:border-slate-800">
                        {replies.map(reply => {
                          const canDeleteReply = reply.authorId === currentUserId || isOwner;

                          return (
                            <div key={reply.id} className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {reply.authorName}
                                  </span>
                                  {activeGroup?.ownerId === reply.authorId && (
                                    <span className="text-[9px] font-bold text-blue-600 uppercase">
                                      Owner
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    {new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setQuoteReplyTarget({ postId: post.id, replyId: reply.id, authorName: reply.authorName, text: reply.content })}
                                    className="text-[11px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                                  >
                                    Reply
                                  </button>
                                  {canDeleteReply && (
                                    <button
                                      onClick={() => handleDeleteReply(post.id, reply.id)}
                                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {reply.quoteReplyText && (
                                <div className="border-l-2 border-blue-500 pl-2 text-[11px] text-slate-500 italic">
                                  @{reply.quoteReplyAuthor}: {reply.quoteReplyText.slice(0, 80)}...
                                </div>
                              )}

                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                {reply.content}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Quoted reply banner if active */}
                    {quoteReplyTarget?.postId === post.id && (
                      <div className="flex items-center justify-between text-[11px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900">
                        <span>Replying to <strong>@{quoteReplyTarget.authorName}</strong></span>
                        <button onClick={() => setQuoteReplyTarget(null)} className="p-0.5 hover:text-red-500">
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    {/* Reply Input Form (Open to all circle members!) */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Write a reply..."
                        value={replyInputByPost[post.id] || ''}
                        onChange={(e) => setReplyInputByPost(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitReply(post.id);
                        }}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 min-h-[44px]"
                      />
                      <button
                        onClick={() => handleSubmitReply(post.id)}
                        disabled={submittingReplyFor === post.id || !(replyInputByPost[post.id] || '').trim()}
                        className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {submittingReplyFor === post.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>Reply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: Create Post Modal (Owner Only) */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create Circle Post
              </h3>
              <button onClick={() => setIsPostModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {postError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {postError}
              </div>
            )}

            {/* Type selector */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setPostType('thread')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md min-h-[44px] transition-colors cursor-pointer ${
                  postType === 'thread'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Question / Thread
              </button>
              <button
                type="button"
                onClick={() => setPostType('material')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md min-h-[44px] transition-colors cursor-pointer ${
                  postType === 'material'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Course Material
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder={postType === 'material' ? 'e.g., Week 4 Lecture Slides - Mechanics' : 'e.g., Problem 3 on Assignment 2 clarification'}
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Body
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide context, question details, or material instructions..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              {postType === 'material' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Upload File (PDF, Slides, Notes)
                  </label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setMaterialFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 min-h-[44px]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 min-h-[44px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPost}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingPost ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Publish Post</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Circle Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Create New Circle</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {createError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsCreatingCircle(true);
                setCreateError(null);
                try {
                  const newCode = generateCircleInviteCode();
                  const created = await DBService.createGroup(
                    {
                      name: createName.trim(),
                      description: createDesc.trim(),
                      course: createCourse.trim(),
                      type: createType,
                      department: profile.department,
                      level: profile.level,
                      university: profile.university,
                      inviteCode: newCode
                    },
                    currentUserId,
                    profile.name || 'Student'
                  );
                  setGroups(prev => [created, ...prev]);
                  setActiveGroupId(created.id);
                  setShowCreateModal(false);
                  addNotification('message', 'Circle Created', `"${created.name}" is now ready.`);
                } catch (err: any) {
                  setCreateError(err?.message || 'Failed to create study circle.');
                } finally {
                  setIsCreatingCircle(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Circle Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., CSC 301 Study Group"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., CSC301"
                  value={createCourse}
                  onChange={(e) => setCreateCourse(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Circle purpose and focus topics..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 min-h-[44px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCircle}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingCircle ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Create Circle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Join Circle Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Join Circle via Code</h3>
              <button onClick={() => setShowJoinModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {joinError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {joinError}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!joinCode.trim()) return;
                setIsJoining(true);
                setJoinError(null);
                try {
                  const findRes = await DBService.findGroupByCode(joinCode.trim().toUpperCase());
                  if (!findRes?.group) {
                    throw new Error(findRes?.error || "That code doesn't match any study circle.");
                  }
                  const groupFound = findRes.group;
                  const joinRes = await DBService.joinGroup(groupFound.id, joinCode.trim().toUpperCase(), currentUserId, profile.name);
                  if (joinRes.success) {
                    setGroups(prev => [groupFound, ...prev]);
                    setActiveGroupId(groupFound.id);
                    setShowJoinModal(false);
                    setJoinCode('');
                    addNotification('message', 'Joined Circle', `You are now a member of ${groupFound.name}.`);
                  } else {
                    throw new Error(joinRes.error || 'Failed to join circle.');
                  }
                } catch (err: any) {
                  setJoinError(err?.message || 'Error joining circle.');
                } finally {
                  setIsJoining(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Invite Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., KORS-7X29"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-white outline-none focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 min-h-[44px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining || !joinCode.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isJoining ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Join</span>
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
