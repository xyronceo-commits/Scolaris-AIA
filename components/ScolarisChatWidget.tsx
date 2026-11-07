import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, GraduationCap, FileText, Trash2, Loader2 } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { Course, StudyHubData, UserProfile } from '../types';
import ReactMarkdown from 'react-markdown';
import KorsIQLogo from './KorsIQLogo';

interface ScolarisChatWidgetProps {
  courses: Course[];
  activeCourseId: string | null;
  activeHub: StudyHubData | null;
  profile?: UserProfile | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'KorsIQ';
  text: string;
  timestamp: number;
}

export const ScolarisChatWidget: React.FC<ScolarisChatWidgetProps> = ({
  courses,
  activeCourseId,
  activeHub,
  profile
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentCourse = courses.find(c => c.id === activeCourseId);
  const fileContent = activeHub?.fileContent || '';
  const fileName = activeHub?.fileName || '';

  // Scroll to bottom when messages list updates or when panel is opened
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Add default introductory greeting on first load
  const hasGreetingRef = useRef(false);
  useEffect(() => {
    if (!hasGreetingRef.current && messages.length === 0) {
      hasGreetingRef.current = true;
      const deptNotice = profile?.department ? ` (specializing in ${profile.department})` : '';
      setMessages([
        {
          id: 'welcome',
          sender: 'KorsIQ',
          text: `Welcome to KorsIQ. I am your academic study assistant${deptNotice}. 

${fileName ? `I have loaded and analyzed your course document: **"${fileName}"**.` : ''} 
How can I assist you with your studies or coursework today?`,
          timestamp: Date.now()
        }
      ]);
    }
  }, [fileName, profile]);

  // Highlight button if a file gets uploaded but chat is closed to alert user they can use it
  useEffect(() => {
    if (fileName && !isOpen) {
      setHasNewMessage(true);
    }
  }, [fileName]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || inputVal;
    if (!textToSend.trim() || loading) return;

    if (!customText) {
      setInputVal('');
    }

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: 'user',
      text: textToSend,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build context description
      const courseContext = currentCourse ? `[${currentCourse.code}] ${currentCourse.title}` : '';
      
      const academicProfile = profile ? {
        department: profile.department || '',
        university: profile.university || '',
        level: profile.level || '',
        registeredCourses: courses.map(c => `${c.code}: ${c.title}`),
        activeCourse: currentCourse ? `${currentCourse.code}: ${currentCourse.title}` : undefined
      } : undefined;

      // Request AI reply from server with department-specific context
      const reply = await GeminiService.scolarisChat(
        [...messages, userMsg],
        courseContext,
        fileContent,
        academicProfile
      );

      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          sender: 'KorsIQ',
          text: reply.text || 'I encountered an error processing that question.',
          timestamp: Date.now()
        }
      ]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          sender: 'KorsIQ',
          text: "We're having trouble connecting to our AI service. Please try again shortly.",
          timestamp: Date.now()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm("Clear chat history?")) {
      setMessages([]);
    }
  };

  const presetSuggestions = [
    ...(fileName ? [{ label: "Summarize this document", prompt: `Provide a structured academic summary of the loaded material "${fileName}" highlighting key themes, formulas, and definitions.` }] : []),
    ...(currentCourse ? [{ label: `Quiz me on ${currentCourse.code}`, prompt: `Generate 3 diagnostic practice questions for ${currentCourse.code} (${currentCourse.title}) with detailed academic explanations.` }] : []),
    { label: "Explain key concept", prompt: "Explain the most critical core concept in this subject step-by-step with practical examples." },
    { label: "Exam revision tips", prompt: "What are high-yield study and memory techniques for revising this academic material effectively?" }
  ];

  return (
    <>
      {/* Floating Button - Repositioned to bottom-20 on mobile to completely clear the bottom navigation bar */}
      <button
        id="scolaris-summon-widget"
        onClick={() => {
          setIsOpen(!isOpen);
          setHasNewMessage(false);
        }}
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 p-3.5 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center cursor-pointer border ring-2 ring-white/50 dark:ring-slate-800 active:scale-95 min-h-[44px] min-w-[44px] ${
          isOpen
            ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-800'
            : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white border-blue-500 hover:shadow-xl'
        }`}
        aria-label="Toggle study chat"
        title="Ask KorsIQ Assistant"
      >
        <div className="relative flex items-center justify-center">
          {isOpen ? (
            <X size={20} />
          ) : (
            <>
              <MessageSquare size={20} className="text-white" />
              {hasNewMessage && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 border border-white"></span>
                </span>
              )}
            </>
          )}
        </div>
      </button>

      {/* Slide / Scale Floating AI Assistant Overlay Panel */}
      {isOpen && (
        <div 
          id="scolaris-floating-chatbot"
          className="fixed bottom-20 right-3 sm:right-6 z-40 w-[calc(100vw-24px)] sm:w-[380px] max-w-[400px] h-[65vh] max-h-[580px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-white p-1">
                <KorsIQLogo variant="icon" size={20} onDark />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">
                  KorsIQ Assistant
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[9px] text-slate-300 font-medium">
                    {profile?.department ? `${profile.department} Mentor` : 'Academic Study Assistant'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={handleClearHistory}
                title="Clear conversation history"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <Trash2 size={14} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                aria-label="Close assistant"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Dynamic Loaded Context Bar */}
          {(currentCourse || fileName) && (
            <div className="bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/60 px-4 py-1.5 flex flex-wrap gap-2 items-center justify-between text-[10px] text-slate-600 dark:text-slate-300 font-medium shrink-0">
              <div className="flex items-center gap-1.5 truncate">
                {currentCourse && (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded font-semibold uppercase shrink-0">
                    {currentCourse.code}
                  </span>
                )}
                {fileName ? (
                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1 truncate max-w-[150px]">
                    <FileText size={11} className="inline text-[#2563EB] shrink-0" />
                    <span className="truncate">{fileName}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 select-none">No document context</span>
                )}
              </div>
              {fileName && (
                <span className="text-[8px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded">
                  Grounded
                </span>
              )}
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0 bg-slate-50 dark:bg-slate-950 select-text">
            {messages.map((msg) => {
              const isAi = msg.sender === 'KorsIQ';
              return (
                <div 
                  key={msg.id} 
                  className={`flex leading-relaxed max-w-[88%] ${isAi ? 'mr-auto items-start gap-2' : 'ml-auto justify-end'}`}
                >
                  {isAi && (
                    <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-800 border border-slate-800 flex items-center justify-center shrink-0 text-white mt-0.5">
                      <GraduationCap size={12} />
                    </div>
                  )}
                  <div 
                    className={`rounded-xl px-3.5 py-2 text-xs font-normal shadow-xs border ${
                      isAi 
                        ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-800' 
                        : 'bg-[#2563EB] text-white border-blue-600'
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    <span className={`block text-[8px] mt-1 text-right ${isAi ? 'text-slate-400 dark:text-slate-500' : 'text-blue-100'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {loading && (
              <div className="flex items-start gap-2 mr-auto max-w-[88%]">
                <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-800 border border-slate-800 flex items-center justify-center shrink-0 text-white">
                  <GraduationCap size={12} />
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs flex items-center gap-2">
                  <Loader2 size={13} className="text-[#2563EB] animate-spin" />
                  <span className="text-xs text-slate-400 font-semibold">Consulting academic models...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggesters */}
          {presetSuggestions.length > 0 && (
            <div className="px-3 py-1.5 overflow-x-auto bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-1.5 no-scrollbar shrink-0">
              {presetSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sug.prompt)}
                  disabled={loading}
                  className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-[#2563EB] dark:hover:text-blue-300 text-slate-700 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {sug.label}
                </button>
              ))}
            </div>
          )}

          {/* Form Action */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              disabled={loading}
              placeholder={fileName ? "Ask about this document..." : profile?.department ? `Ask ${profile.department} assistant...` : "Ask your Academic Assistant..."}
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white placeholder-slate-400 px-3 py-2 rounded-lg text-xs focus:outline-none focus:border-[#2563EB] transition-all min-h-[40px]"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || loading}
              className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer min-h-[40px] min-w-[40px] ${
                inputVal.trim() && !loading
                  ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default ScolarisChatWidget;
