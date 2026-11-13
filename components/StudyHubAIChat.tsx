import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  FileText,
  ChevronLeft,
  History
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Course, StudyHubData, UserProfile } from '../types';
import { GeminiService, getHeaders } from '../services/gemini';
import { supabase, getCurrentUserId } from '../lib/supabase';
import KorsIQLogo from './KorsIQLogo';

export interface AIConversation {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface StudyHubAIChatProps {
  profile: UserProfile;
  courses: Course[];
  activeCourse?: Course | null;
  activeHub?: StudyHubData | null;
  onBackToCourses?: () => void;
}

export const StudyHubAIChat: React.FC<StudyHubAIChatProps> = ({
  profile,
  courses,
  activeCourse = null,
  activeHub = null,
  onBackToCourses
}) => {
  const userId = getCurrentUserId() || (profile as any)?.id || '';
  const scopeCourseId = activeCourse?.id || null;

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mobile view toggle: 'chat' or 'list' (never side-by-side on mobile)
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'list'>('chat');

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fileContent = activeHub?.fileContent || '';
  const fileName = activeHub?.fileName || '';

  // Load conversations for the current scope (general vs course-specific)
  const loadConversations = async () => {
    if (!userId) return;
    setIsLoadingConversations(true);
    try {
      const headers = await getHeaders();
      const param = scopeCourseId ? encodeURIComponent(scopeCourseId) : 'general';
      const resp = await fetch(`/api/ai/conversations?courseId=${param}`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          setConversations(data.conversations);
          setIsLoadingConversations(false);
          return;
        }
      }

      // Direct Supabase RLS fallback
      let query = supabase
        .from('ai_conversations')
        .select('id, user_id, course_id, title, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (scopeCourseId) {
        query = query.eq('course_id', scopeCourseId);
      } else {
        query = query.is('course_id', null);
      }

      const { data: rows } = await query;
      setConversations((rows as AIConversation[]) || []);
    } catch (err) {
      console.warn('Failed to load AI conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Load messages for a selected conversation
  const loadMessages = async (convId: string) => {
    if (!userId || !convId) return;
    setIsLoadingMessages(true);
    setErrorMsg(null);
    try {
      const headers = await getHeaders();
      const resp = await fetch(`/api/ai/conversations/${encodeURIComponent(convId)}/messages`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
          setIsLoadingMessages(false);
          return;
        }
      }

      // Direct Supabase RLS fallback
      const { data: rows } = await supabase
        .from('ai_messages')
        .select('id, conversation_id, role, content, created_at')
        .eq('conversation_id', convId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(100);

      setMessages((rows as AIMessage[]) || []);
    } catch (err) {
      console.warn('Failed to load AI messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    setActiveConversationId(null);
    setMessages([]);
    loadConversations();
  }, [scopeCourseId, userId]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setErrorMsg(null);
    setMobilePanel('chat');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameConversation = async (convId: string) => {
    const trimmed = renameValue.trim().slice(0, 80);
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    setConversations(prev =>
      prev.map(c => (c.id === convId ? { ...c, title: trimmed } : c))
    );
    setRenamingId(null);

    try {
      const headers = await getHeaders();
      const resp = await fetch(`/api/ai/conversations/${encodeURIComponent(convId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: trimmed })
      });
      if (!resp.ok && userId) {
        await supabase
          .from('ai_conversations')
          .update({ title: trimmed, updated_at: new Date().toISOString() })
          .eq('id', convId)
          .eq('user_id', userId);
      }
    } catch {
      if (userId) {
        await supabase
          .from('ai_conversations')
          .update({ title: trimmed, updated_at: new Date().toISOString() })
          .eq('id', convId)
          .eq('user_id', userId);
      }
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) {
      setActiveConversationId(null);
      setMessages([]);
    }

    try {
      const headers = await getHeaders();
      const resp = await fetch(`/api/ai/conversations/${encodeURIComponent(convId)}`, {
        method: 'DELETE',
        headers
      });
      if (!resp.ok && userId) {
        await supabase.from('ai_messages').delete().eq('conversation_id', convId).eq('user_id', userId);
        await supabase.from('ai_conversations').delete().eq('id', convId).eq('user_id', userId);
      }
    } catch {
      if (userId) {
        await supabase.from('ai_messages').delete().eq('conversation_id', convId).eq('user_id', userId);
        await supabase.from('ai_conversations').delete().eq('id', convId).eq('user_id', userId);
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const promptText = inputVal.trim();
    if (!promptText || isSending) return;

    setInputVal('');
    setErrorMsg(null);
    setIsSending(true);

    const optimisticUserMsg: AIMessage = {
      id: `temp-user-${Date.now()}`,
      conversation_id: activeConversationId || 'pending',
      role: 'user',
      content: promptText,
      created_at: new Date().toISOString()
    };

    const nextHistory = [...messages, optimisticUserMsg];
    setMessages(nextHistory);

    try {
      const courseContext = activeCourse
        ? `[${activeCourse.code}] ${activeCourse.title}`
        : '';

      const reply = await GeminiService.scolarisChat(
        nextHistory.map(m => ({ role: m.role, content: m.content })),
        courseContext,
        fileContent,
        undefined,
        {
          conversationId: activeConversationId,
          courseId: scopeCourseId,
          message: promptText
        }
      );

      const aiText = reply?.text || 'I could not generate a response. Please try again.';
      let resolvedConv: AIConversation | null = reply?.conversation || null;
      let savedUser: AIMessage | null = reply?.userMessage || null;
      let savedAssistant: AIMessage | null = reply?.assistantMessage || null;

      // Client-side RLS persistence fallback if server did not write (e.g. local dev without service role key)
      if (!resolvedConv && userId) {
        const autoTitle = promptText.replace(/\s+/g, ' ').slice(0, 60) || 'New conversation';
        if (activeConversationId) {
          const { data: updated } = await supabase
            .from('ai_conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', activeConversationId)
            .eq('user_id', userId)
            .select('id, user_id, course_id, title, created_at, updated_at')
            .maybeSingle();
          resolvedConv = (updated as AIConversation) || null;
        } else {
          const { data: created } = await supabase
            .from('ai_conversations')
            .insert({
              user_id: userId,
              course_id: scopeCourseId,
              title: autoTitle
            })
            .select('id, user_id, course_id, title, created_at, updated_at')
            .maybeSingle();
          resolvedConv = (created as AIConversation) || null;
        }

        if (resolvedConv?.id) {
          const { data: inserted } = await supabase
            .from('ai_messages')
            .insert([
              { conversation_id: resolvedConv.id, user_id: userId, role: 'user', content: promptText },
              { conversation_id: resolvedConv.id, user_id: userId, role: 'assistant', content: aiText }
            ])
            .select('id, conversation_id, role, content, created_at');
          if (Array.isArray(inserted)) {
            savedUser = (inserted.find((m: any) => m.role === 'user') as AIMessage) || null;
            savedAssistant = (inserted.find((m: any) => m.role === 'assistant') as AIMessage) || null;
          }
        }
      }

      const finalConvId = resolvedConv?.id || activeConversationId || `local-${Date.now()}`;
      if (resolvedConv) {
        setActiveConversationId(resolvedConv.id);
        setConversations(prev => {
          const others = prev.filter(c => c.id !== resolvedConv!.id);
          return [resolvedConv!, ...others];
        });
      }

      const finalUserMsg: AIMessage = savedUser || {
        ...optimisticUserMsg,
        conversation_id: finalConvId
      };
      const finalAssistantMsg: AIMessage = savedAssistant || {
        id: `temp-ai-${Date.now()}`,
        conversation_id: finalConvId,
        role: 'assistant',
        content: aiText,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [
        ...prev.filter(m => m.id !== optimisticUserMsg.id),
        finalUserMsg,
        finalAssistantMsg
      ]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach KorsIQ AI right now.');
    } finally {
      setIsSending(false);
    }
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBackToCourses && (
            <button
              type="button"
              onClick={onBackToCourses}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#111827] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg hover:bg-slate-100 min-h-[44px] cursor-pointer shrink-0"
            >
              <ChevronLeft size={15} />
              <span>Courses</span>
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0">
            <KorsIQLogo variant="icon" size={18} onDark />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
              {activeCourse
                ? `${activeCourse.code} AI Companion`
                : 'KorsIQ Academic AI'}
            </h2>
            <p className="text-[11px] text-[#5B6472] dark:text-slate-400 truncate">
              {activeCourse
                ? `${activeCourse.title}${fileName ? ` · Grounded in ${fileName}` : ''}`
                : profile.department
                ? `Tailored to ${profile.department}`
                : 'General study conversations with saved history'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile toggle between Chat and History List */}
          <button
            type="button"
            onClick={() => setMobilePanel(mobilePanel === 'list' ? 'chat' : 'list')}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#111827] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg min-h-[44px] cursor-pointer"
          >
            <History size={15} />
            <span>{mobilePanel === 'list' ? 'Back to chat' : `History (${conversations.length})`}</span>
          </button>

          <button
            type="button"
            onClick={handleStartNewChat}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg min-h-[44px] transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>New chat</span>
          </button>
        </div>
      </div>

      {/* Main Split View on Desktop, Single View on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
        {/* Conversation History List (4 cols on desktop; full panel on mobile when toggled) */}
        <aside
          className={`lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#E5E7EB] dark:border-slate-800 flex flex-col bg-slate-50/40 dark:bg-slate-950/40 ${
            mobilePanel === 'list' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5B6472] dark:text-slate-400">
              Saved Conversations
            </span>
            <span className="text-xs text-[#5B6472] dark:text-slate-400">
              {conversations.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB] dark:divide-slate-800/70 max-h-[500px]">
            {isLoadingConversations ? (
              <div className="p-6 text-center text-xs text-[#5B6472] flex items-center justify-center gap-2">
                <Loader2 size={15} className="animate-spin text-[#2563EB]" />
                <span>Loading conversations...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-[#5B6472] dark:text-slate-400">
                  No conversations saved yet.
                </p>
                <button
                  type="button"
                  onClick={handleStartNewChat}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg min-h-[44px] cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Start a chat</span>
                </button>
              </div>
            ) : (
              conversations.map(conv => {
                const isSelected = conv.id === activeConversationId;
                const isRenaming = renamingId === conv.id;

                return (
                  <div
                    key={conv.id}
                    className={`p-3 transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40'
                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameConversation(conv.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-[#2563EB] rounded-md text-[#111827] dark:text-white outline-none min-h-[38px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameConversation(conv.id)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                          title="Save title"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="p-2 text-slate-400 hover:bg-slate-100 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                          title="Cancel"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveConversationId(conv.id);
                            setMobilePanel('chat');
                          }}
                          className="flex-1 min-w-0 text-left py-1 cursor-pointer min-h-[44px] flex flex-col justify-center"
                        >
                          <p
                            className={`text-xs font-semibold truncate ${
                              isSelected
                                ? 'text-[#2563EB] dark:text-blue-400'
                                : 'text-[#111827] dark:text-slate-200'
                            }`}
                          >
                            {conv.title}
                          </p>
                          <p className="text-[11px] text-[#5B6472] dark:text-slate-400 mt-0.5">
                            {new Date(conv.updated_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(conv.id);
                              setRenameValue(conv.title);
                            }}
                            className="p-2 text-[#5B6472] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                            title="Rename conversation"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConversation(conv.id)}
                            className="p-2 text-[#5B6472] hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                            title="Delete conversation"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Active Chat Panel (8 cols on desktop) */}
        <section
          className={`lg:col-span-8 flex flex-col justify-between min-h-[540px] ${
            mobilePanel === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Context Banner when a course file is active */}
          {fileName && (
            <div className="px-4 py-2 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/50 flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
              <FileText size={14} className="text-[#2563EB] shrink-0" />
              <span className="truncate">
                Active course material: <strong>{fileName}</strong>
              </span>
            </div>
          )}

          {/* Messages Stream or Empty State */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[440px]">
            {isLoadingMessages ? (
              <div className="h-64 flex items-center justify-center gap-2 text-xs text-[#5B6472]">
                <Loader2 size={16} className="animate-spin text-[#2563EB]" />
                <span>Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center">
                  <MessageSquare size={22} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                    {activeConversation
                      ? activeConversation.title
                      : activeCourse
                      ? `Ask about ${activeCourse.code}`
                      : 'Ask KorsIQ AI'}
                  </h3>
                  <p className="text-xs text-[#5B6472] dark:text-slate-400">
                    Ask a question about your coursework, concepts, or uploaded notes. Every conversation is saved to your history.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg min-h-[44px] transition-colors cursor-pointer"
                >
                  <span>Start a chat</span>
                </button>
              </div>
            ) : (
              messages.map(msg => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#2563EB] text-white'
                          : 'bg-slate-50 dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 text-[#111827] dark:text-slate-100'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-slate-50 dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-xl px-4 py-3 text-xs text-[#5B6472] dark:text-slate-300 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#2563EB]" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2" role="alert">
                {errorMsg}
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 sm:p-4 border-t border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                activeCourse
                  ? `Ask a question about ${activeCourse.code}...`
                  : 'Ask an academic question...'
              }
              className="flex-1 resize-none bg-slate-50 dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg px-3 py-2.5 text-xs sm:text-sm text-[#111827] dark:text-white placeholder-[#5B6472] focus:outline-none focus:border-[#2563EB] min-h-[44px]"
            />
            <button
              type="submit"
              disabled={isSending || !inputVal.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg min-h-[44px] transition-colors cursor-pointer shrink-0"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span>Send</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default StudyHubAIChat;
