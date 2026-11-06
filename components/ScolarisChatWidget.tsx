import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, MessageSquare, X, Send, GraduationCap, Bot, FileText, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { Course, StudyHubData } from '../types';
import ReactMarkdown from 'react-markdown';
import KorsIQLogo from './KorsIQLogo';

interface ScolarisChatWidgetProps {
  courses: Course[];
  activeCourseId: string | null;
  activeHub: StudyHubData | null;
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
  const hasGreetingRef = useRef(false);
  useEffect(() => {
    if (!hasGreetingRef.current && messages.length === 0) {
      hasGreetingRef.current = true;
      setMessages([
        {
          id: 'welcome',
          sender: 'KorsIQ',
          text: `Welcome to KorsIQ! 🎓 I am your personal academic study companion. 

${fileName ? `I have automatically loaded and analyzed your uploaded file: **"${fileName}"**.` : ''} 
How can I assist you with your studies or coursework today?`,
          timestamp: Date.now()
        }
      ]);
    }
  }, [fileName]);

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
    if (window.confirm("Do you want to clear your conversation history?")) {
      setMessages([
        {
          id: 'welcome-reset',
          sender: 'KorsIQ',
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
        className={`fixed bottom-6 right-6 z-50 p-3.5 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center cursor-pointer border ring-2 ring-white/50 active:scale-95 ${
          isOpen
            ? 'bg-slate-950 text-white border-slate-800'
            : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 hover:shadow-xl'
        }`}
      >
        <div className="relative flex items-center justify-center">
          {isOpen ? (
            <X size={20} className="animate-in spin-in duration-200" />
          ) : (
            <>
              <Bot size={22} className="text-white" />
              {hasNewMessage && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-white"></span>
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
          className="fixed bottom-20 right-4 md:right-6 z-50 w-[92vw] max-w-[400px] h-[72vh] max-h-[600px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="bg-slate-900 px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-white p-1">
                <KorsIQLogo variant="icon" size={20} onDark />
              </div>
              <div>
                <h4 className="text-xs font-serif font-bold text-white tracking-wide flex items-center gap-1.5">
                  KorsIQ Assistant
                  <Sparkles size={11} className="text-blue-400" />
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-slate-300 font-medium">
                    Live Academic Agent
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={handleClearHistory}
                title="Clear conversation history"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Dynamic Loaded Context Bar */}
          {(currentCourse || fileName) && (
            <div className="bg-blue-50/70 border-b border-blue-100 px-5 py-2 flex flex-wrap gap-2 items-center justify-between text-[10px] text-slate-600 font-medium">
              <div className="flex items-center gap-1.5 truncate">
                {currentCourse && (
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold uppercase shrink-0">
                    {currentCourse.code}
                  </span>
                )}
                {fileName ? (
                  <span className="text-slate-500 flex items-center gap-1 truncate max-w-[150px]">
                    <FileText size={11} className="inline text-blue-600 shrink-0" />
                    <span className="truncate">{fileName}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 select-none">No document context</span>
                )}
              </div>
              {fileName && (
                <span className="text-[8px] font-semibold text-emerald-700 uppercase bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  Grounded
                </span>
              )}
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0 bg-slate-50 select-text">
            {messages.map((msg) => {
              const isAi = msg.sender === 'KorsIQ';
              return (
                <div 
                  key={msg.id} 
                  className={`flex leading-relaxed max-w-[85%] ${isAi ? 'mr-auto items-start gap-2' : 'ml-auto justify-end'}`}
                >
                  {isAi && (
                    <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-white mt-0.5">
                      <GraduationCap size={13} />
                    </div>
                  )}
                  <div 
                    className={`rounded-xl px-4 py-2.5 text-xs font-normal shadow-2xs border ${
                      isAi 
                        ? 'bg-white text-slate-800 border-slate-200' 
                        : 'bg-blue-600 text-white border-blue-600'
                    }`}
                  >
                    <div className="prose prose-sm max-w-none text-xs">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    <span className={`block text-[8px] mt-1 text-right ${isAi ? 'text-slate-400' : 'text-blue-100'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {loading && (
              <div className="flex items-start gap-2 mr-auto max-w-[85%]">
                <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-white">
                  <GraduationCap size={13} />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-2xs flex items-center gap-2">
                  <Loader2 size={14} className="text-blue-600 animate-spin" />
                  <span className="text-xs text-slate-400 font-semibold">Thinking...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggesters */}
          {presetSuggestions.length > 0 && (
            <div className="px-4 py-1.5 overflow-x-auto bg-white border-t border-slate-100 flex gap-1.5 scrollbar-none">
              {presetSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sug.prompt)}
                  disabled={loading}
                  className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[10px] font-medium border border-slate-200 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0"
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
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 relative z-10"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              disabled={loading}
              placeholder={fileName ? "Ask about this document..." : "Ask your Academic Assistant..."}
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 px-3.5 py-2 rounded-lg text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || loading}
              className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                inputVal.trim() && !loading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
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
