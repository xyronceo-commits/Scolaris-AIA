import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, MessageSquare, X, Send, GraduationCap, Bot, FileText, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { Course, StudyHubData } from '../types';
import ReactMarkdown from 'react-markdown';

interface ScolarisChatWidgetProps {
  courses: Course[];
  activeCourseId: string | null;
  activeHub: StudyHubData | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'Scolaris';
  text: string;
  timestamp: number;
}

export const ScolarisChatWidget: React.FC<ScolarisChatWidgetProps> = ({
  courses,
  activeCourseId,
  activeHub
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
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'Scolaris',
          text: `Welcome to Scolaris AI! 🎓 I am your personal academic study companion. 

${fileName ? `I have automatically loaded and analyzed your uploaded file: **"${fileName}"**.` : ''} 
How can I assist you with your studies or coursework today?`,
          timestamp: Date.now()
        }
      ]);
    }
  }, [messages, fileName]);

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
      
      // Request AI reply from server
      const reply = await GeminiService.scolarisChat(
        [...messages, userMsg],
        courseContext,
        fileContent
      );

      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          sender: 'Scolaris',
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
          sender: 'Scolaris',
          text: `⚠️ **Connection Error**: ${error?.message || 'I am on offline duty. Please check your Groq secret key.'}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Do you want to clear your conversation history?")) {
      setMessages([
        {
          id: 'welcome-reset',
          sender: 'Scolaris',
          text: `Hi again! I am ready to start fresh. ${fileName ? `I still have your document **"${fileName}"** loaded in memory.` : ''} What should we analyze?`,
          timestamp: Date.now()
        }
      ]);
    }
  };

  const presetSuggestions = [
    ...(fileName ? [{ label: '📄 File Summary', prompt: 'Please summarize the key takeaways of the uploaded file.' }] : []),
    ...(fileName ? [{ label: '❓ Quiz Me', prompt: 'Generate 3 quick multiple-choice questions from this uploaded document to test my active recall!' }] : []),
    { label: '📝 Build Tasklist', prompt: `Construct a highly-efficient step-by-step study schedule for my course: ${currentCourse?.code || 'my semester classes'}.` },
    { label: '💡 Explaining Tips', prompt: 'What are the best methods to memorize dense academic information?' }
  ];

  return (
    <>
      {/* Dynamic Floating Button */}
      <button
        id="scolaris-summon-widget"
        onClick={() => {
          setIsOpen(!isOpen);
          setHasNewMessage(false);
        }}
        className={`fixed bottom-6 right-6 z-50 p-4 md:p-4.5 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center cursor-pointer border ${
          isOpen
            ? 'bg-slate-950 text-white border-slate-800 scale-95 hover:scale-100'
            : 'bg-gradient-to-tr from-blue-700 to-indigo-800 text-white border-blue-600 hover:shadow-[0_10px_30px_rgba(59,130,246,0.3)] hover:-translate-y-1 scale-100'
        }`}
      >
        <div className="relative">
          {isOpen ? (
            <X size={24} className="animate-in spin-in duration-300" />
          ) : (
            <>
              <Bot size={24} className="animate-pulse" />
              {hasNewMessage && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-white"></span>
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
          className="fixed bottom-24 right-4 md:right-6 z-50 w-[92vw] max-w-[420px] h-[75vh] max-h-[640px] bg-slate-50 rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 px-6 py-5 flex items-center justify-between border-b border-indigo-950/20 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white border border-blue-400 shadow-inner">
                <GraduationCap size={20} className="text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  Scolaris Academic Assistant
                  <Sparkles size={12} className="text-yellow-400 fill-yellow-400 animate-pulse" />
                </h4>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] text-indigo-200 font-bold uppercase tracking-wider">Tutor Agent Online</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearHistory}
                title="Clear conversation history"
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Dynamic Loaded Context Bar */}
          {(currentCourse || fileName) && (
            <div className="bg-blue-50/70 border-b border-blue-100/50 px-6 py-2 flex flex-wrap gap-2 items-center justify-between text-[10px] text-slate-600 font-medium">
              <div className="flex items-center gap-1.5 truncate">
                {currentCourse && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold uppercase shrink-0">
                    {currentCourse.code}
                  </span>
                )}
                {fileName ? (
                  <span className="text-slate-500 flex items-center gap-1 truncate max-w-[150px]">
                    <FileText size={12} className="inline text-blue-500 shrink-0" />
                    <span className="truncate">{fileName}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 select-none">No uploaded document context available</span>
                )}
              </div>
              {fileName && (
                <span className="text-[8px] font-bold text-emerald-600 uppercase bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
                  Active Recall Grounded
                </span>
              )}
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 min-h-0 bg-slate-50 select-text scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {messages.map((msg) => {
              const isAi = msg.sender === 'Scolaris';
              return (
                <div 
                  key={msg.id} 
                  className={`flex leading-relaxed max-w-[85%] ${isAi ? 'mr-auto items-start gap-2.5' : 'ml-auto justify-end'}`}
                >
                  {isAi && (
                    <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow shrink-0 text-white">
                      <GraduationCap size={14} />
                    </div>
                  )}
                  <div 
                    className={`rounded-[1.5rem] px-5 py-3.5 text-xs sm:text-sm font-medium shadow-sm border ${
                      isAi 
                        ? 'bg-white text-slate-800 border-slate-100/60 rounded-tl-sm' 
                        : 'bg-indigo-900 text-white border-indigo-950 rounded-tr-sm'
                    }`}
                  >
                    <div className="prose prose-sm prose-slate max-w-none text-xs sm:text-sm">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    <span className={`block text-[8px] mt-1 text-right  ${isAi ? 'text-slate-400' : 'text-indigo-300'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {loading && (
              <div className="flex items-start gap-2.5 mr-auto max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow shrink-0 text-white">
                  <GraduationCap size={14} />
                </div>
                <div className="bg-white border border-slate-100/60 rounded-[1.5rem] rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-2">
                  <Loader2 size={16} className="text-blue-600 animate-spin" />
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">Scolaris is thinking...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggesters */}
          {presetSuggestions.length > 0 && (
            <div className="px-5 py-2 overflow-x-auto bg-slate-100/50 border-t border-slate-200/50 flex gap-2 scrollbar-none scroll-smooth">
              {presetSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sug.prompt)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-indigo-900 text-[10px] font-bold border border-slate-200/60 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
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
            className="p-4 bg-white border-t border-slate-100 flex items-center gap-2 relative z-10"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              disabled={loading}
              placeholder={fileName ? "Ask anything about this document..." : "Ask your Academic Study Assistant..."}
              className="flex-1 bg-slate-50 border border-slate-200/60 text-slate-800 placeholder-slate-400 px-5 py-3.5 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || loading}
              className={`p-3.5 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                inputVal.trim() && !loading
                  ? 'bg-blue-700 text-white hover:bg-blue-800 hover:-translate-y-0.5'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
