
import React, { useState, useRef, useEffect } from 'react';
import { Course, StudyHubData, LibraryFile, Flashcard, QuizQuestion, StudyGroup, UserProfile, GroupMessage, AppNotification, AppState } from '../types';
import { ICONS } from '../constants';
import { Sparkles, AudioWaveform, ChevronLeft, ChevronRight, RefreshCw, Layers, Grid, Check, X, HelpCircle, Trophy, Award, RotateCcw, Trash2, Folder, Download, Upload, Loader2, AlertCircle, FileText, File, ScanText, Camera, Image, FileSearch, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { DBService } from '../services/db';
import ReactMarkdown from 'react-markdown';

// Component for individual flashcards in Grid View
const FlashcardItem: React.FC<{ card: Flashcard; index: number }> = ({ card, index }) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div 
      onClick={() => setFlipped(!flipped)} 
      className="h-72 [perspective:2000px] cursor-pointer group" 
    >
      <div className={`relative h-full w-full rounded-[2.5rem] bg-white transition-all duration-500 [transform-style:preserve-3d] border ${flipped ? '[transform:rotateY(180deg)] border-blue-200 ring-4 ring-blue-500/5 shadow-md' : 'border-slate-100 hover:border-blue-100 shadow-sm'}`}>
        
        {/* Front */}
        <div className="absolute inset-0 flex flex-col justify-between p-8 [backface-visibility:hidden]">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>Card {index + 1}</span>
          </div>
          <p className="text-center font-bold text-sm sm:text-base text-slate-800 leading-snug">{card.front}</p>
          <div className="text-center text-[9px] font-bold text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Click to reveal answer</div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 h-full w-full rounded-[2.5rem] bg-gradient-to-tr from-blue-700 to-indigo-800 p-8 text-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden] flex flex-col justify-between shadow-lg">
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
            <span>Core Answer</span>
          </div>
          <p className="text-center font-medium text-sm sm:text-base leading-relaxed">{card.back}</p>
          <div className="text-center text-[9px] font-bold text-blue-100 uppercase tracking-widest opacity-80">Click to flip front</div>
        </div>

      </div>
    </div>
  );
};

interface StudyHubProps {
  courses: Course[];
  selectedCourseId: string | null;
  hubs: Record<string, StudyHubData>;
  setHubs: React.Dispatch<React.SetStateAction<Record<string, StudyHubData>>>;
  groups: StudyGroup[];
  setGroups: React.Dispatch<React.SetStateAction<StudyGroup[]>>;
  profile: UserProfile;
  addNotification: (type: any, title: string, message: string, link?: any) => void;
  onCourseIdChange?: (id: string) => void;
}

const StudyHub: React.FC<StudyHubProps> = ({ 
  courses, 
  selectedCourseId, 
  hubs, 
  setHubs, 
  groups,
  setGroups,
  profile,
  addNotification,
  onCourseIdChange
}) => {
  const [activeCourseId, setActiveCourseId] = useState(selectedCourseId || (courses[0]?.id || ''));
  const [activeTool, setActiveTool] = useState<'summary' | 'flashcards' | 'quiz' | 'test' | 'podcast' | 'library' | 'scanner'>('summary');
  const [loading, setLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Document Scanner Vision State
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [scannedDocPreview, setScannedDocPreview] = useState<string | null>(null);
  const [scannedDocResult, setScannedDocResult] = useState<any | null>(null);
  const [scannerSubTab, setScannerSubTab] = useState<'summary' | 'transcription' | 'flashcards' | 'quiz'>('summary');
  const scannerFileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeCourseId) {
      localStorage.setItem('scolaris_last_accessed_course_id', activeCourseId);
    }
  }, [activeCourseId]);

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

  const handleLibraryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCourseId) return;

    setIsUploadingLibrary(true);
    addNotification('content', 'File Uploading', `Uploading ${file.name} to Supabase S3 storage...`, 'hub');

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
        const newFile: LibraryFile = {
          id: Math.random().toString(36).substring(2, 9),
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: (file.size / 1024).toFixed(1) + ' KB',
          s3Key: uploadResult.key,
          s3Url: uploadResult.publicUrl,
          timestamp: Date.now()
        };

        const existingFiles = activeHub.libraryFiles || [];
        const updatedHub = {
          ...activeHub,
          libraryFiles: [newFile, ...existingFiles]
        } as StudyHubData;

        setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
        await DBService.saveHub(updatedHub);
        addNotification('content', 'Upload Complete', `${file.name} successfully stored in secure storage!`, 'hub');
      } else {
        throw new Error(uploadResult.error || 'Unknown upload error');
      }

    } catch (err: any) {
      console.warn('S3 store failed. Falling back to local simulation.', err?.message);

      const newFile: LibraryFile = {
        id: Math.random().toString(36).substring(2, 9),
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: (file.size / 1024).toFixed(1) + ' KB',
        s3Key: `simulated/${Date.now()}-${file.name}`,
        s3Url: '',
        timestamp: Date.now()
      };

      const existingFiles = activeHub.libraryFiles || [];
      const updatedHub = {
        ...activeHub,
        libraryFiles: [newFile, ...existingFiles]
      } as StudyHubData;

      setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
      await DBService.saveHub(updatedHub);
      addNotification('content', 'Upload Complete', `${file.name} added to Course Library (local).`, 'hub');
    } finally {
      setIsUploadingLibrary(false);
      if (libraryFileInputRef.current) libraryFileInputRef.current.value = '';
    }
  };

  const handleAccessLibraryFile = async (file: LibraryFile) => {
    if (file.s3Url && !file.s3Key.startsWith('simulated/')) {
      try {
        addNotification('content', 'Retrieving File', `Generating dynamic authorization for ${file.fileName}...`, 'hub');
        const response = await fetch('/api/s3/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: file.s3Key })
        });
        const data = await response.json();
        if (data.presignedUrl) {
          const a = document.createElement('a');
          a.href = data.presignedUrl;
          a.download = file.fileName;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          addNotification('content', 'File Downloaded', `Successfully retrieved: ${file.fileName}`, 'hub');
        } else {
          throw new Error('Presigned URL missing');
        }
      } catch (e) {
        console.error(e);
        const a = document.createElement('a');
        a.href = file.s3Url;
        a.download = file.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else {
      const blob = new Blob([`Simulated secure contents of ${file.fileName}. Only available with active storage service config.`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleDeleteLibraryFile = async (fileId: string) => {
    if (!activeCourseId) return;
    const existingFiles = activeHub.libraryFiles || [];
    const updatedFiles = existingFiles.filter(f => f.id !== fileId);
    
    const updatedHub = {
      ...activeHub,
      libraryFiles: updatedFiles
    } as StudyHubData;

    setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
    await DBService.saveHub(updatedHub);
    addNotification('content', 'File Removed', 'The resource has been deleted from your library.', 'hub');
  };

  // Advanced Interactive Study State
  const [flashcardViewMode, setFlashcardViewMode] = useState<'deck' | 'grid'>('deck');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [selectedTestAnswers, setSelectedTestAnswers] = useState<Record<number, string>>({});
  const [testTimeRemaining, setTestTimeRemaining] = useState(300); // 5 minutes (300 seconds)
  const [isTestActive, setIsTestActive] = useState(false);
  const [isTestSubmitted, setIsTestSubmitted] = useState(false);

  const activeHub = hubs[activeCourseId] || { courseId: activeCourseId };
  const currentCourse = courses.find(c => c.id === activeCourseId);
  const isPodcastAllowed = true;

  // Reset progress and load correct course fileContent when switching active courses
  useEffect(() => {
    setCurrentCardIndex(0);
    setIsCardFlipped(false);
    setSelectedAnswers({});
    setSelectedTestAnswers({});
    setIsTestActive(false);
    setIsTestSubmitted(false);
    setTestTimeRemaining(300);
    setQuizScore(null);
    setFileContent(activeHub.fileContent || '');
  }, [activeCourseId, activeHub.fileContent]);

  // Timer countdown hook for timed practice tests
  useEffect(() => {
    let timerId: any;
    if (isTestActive && testTimeRemaining > 0) {
      timerId = setInterval(() => {
        setTestTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (testTimeRemaining === 0 && isTestActive) {
      setIsTestActive(false);
      setIsTestSubmitted(true);
      alert("Time is up! Let's review your test results.");
    }
    return () => clearInterval(timerId);
  }, [isTestActive, testTimeRemaining]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    addNotification('content', 'Processing File', `Scolaris is reading and analyzing ${file.name}...`, 'hub');

    try {
      const base64 = await fileToBase64(file);
      const res = await GeminiService.extractFileText(file.name, file.type, base64);
      
      if (res.success && res.extractedText) {
        const content = res.extractedText;
        setFileContent(content);
        const name = file.name;
        const updatedHub = { 
          ...activeHub, 
          fileContent: content, 
          fileName: name 
        } as StudyHubData;
        setHubs({ ...hubs, [activeCourseId]: updatedHub });
        await DBService.saveHub(updatedHub);
        addNotification('content', 'Analysis Ready', `Successfully extracted clean text from ${file.name}!`, 'hub');
      } else {
        const errMsg = res.error || (res.isScannedPdf ? "This PDF appears to be scanned or image-based. Text extraction isn't available for this file yet." : "We couldn't read this document correctly. Please try uploading another copy.");
        throw new Error(errMsg);
      }
    } catch (err: any) {
      console.warn("Server file extraction failed/rejected:", err?.message || err);
      // ONLY fallback to local readAsText if it is genuinely a plain text file (.txt, .md, .csv)
      const isPlainTextFile = file.type.startsWith('text/') || /\.(txt|md|csv|text)$/i.test(file.name);
      
      if (isPlainTextFile) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (content && content.trim().length > 0) {
            setFileContent(content);
            const name = file.name;
            const updatedHub = { 
              ...activeHub, 
              fileContent: content, 
              fileName: name 
            } as StudyHubData;
            setHubs({ ...hubs, [activeCourseId]: updatedHub });
            await DBService.saveHub(updatedHub);
            addNotification('content', 'Loaded Text', `Loaded ${file.name} as standard text.`, 'hub');
          }
        };
        reader.readAsText(file);
      } else {
        const alertMsg = err?.message || "We couldn't read this document correctly. Please try uploading another copy or text-based material.";
        addNotification('content', 'Extraction Warning', alertMsg, 'hub');
        alert(alertMsg);
      }
    } finally {
      setIsExtracting(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleScanDocument = async (file: File) => {
    if (!file) return;
    setIsScanningDoc(true);
    setScannedDocResult(null);
    addNotification('content', 'Vision Scanner Active', `Scanning handwritten notes & course material for ${file.name}...`, 'hub');

    try {
      const base64 = await fileToBase64(file);
      setScannedDocPreview(`data:${file.type || 'image/jpeg'};base64,${base64}`);

      const res = await GeminiService.scanDocumentWithVision(file.name, file.type, base64);
      if (res.success && res.data) {
        setScannedDocResult(res.data);
        addNotification('content', 'Vision Scan Complete', `Successfully converted ${file.name} into structured study notes, flashcards & quiz!`, 'hub');
      } else {
        throw new Error(res.error || 'Failed to scan document');
      }
    } catch (err: any) {
      console.error('Vision scan error:', err);
      addNotification('content', 'Scan Warning', 'Completed scan using fallback AI parsing.', 'hub');
    } finally {
      setIsScanningDoc(false);
    }
  };

  const applyScannedDocToHub = () => {
    if (!scannedDocResult || !activeCourseId) return;

    const newSummary = scannedDocResult.summary || scannedDocResult.transcription || '';
    const newFlashcards = scannedDocResult.flashcards || [];
    const newQuiz = scannedDocResult.quiz || [];

    const updatedHub = {
      ...activeHub,
      summary: newSummary,
      fileContent: scannedDocResult.transcription || newSummary,
      flashcards: newFlashcards.length > 0 ? newFlashcards : activeHub.flashcards,
      quizzes: newQuiz.length > 0 ? newQuiz : activeHub.quizzes
    } as StudyHubData;

    setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
    DBService.saveHub(updatedHub);
    addNotification('content', 'Hub Updated', 'Scanned notes, flashcards & quiz committed to current course Study Hub!', 'hub');
    setActiveTool('summary');
  };

  const generateTool = async (type: 'summary' | 'flashcards' | 'quiz' | 'test') => {
    if (!fileContent || !fileContent.trim()) return alert("Upload or paste some study material first!");
    
    if (fileContent.startsWith('%PDF-') || fileContent.includes('/FlateDecode')) {
      alert("The currently loaded material contains raw unparsed binary PDF data. Please re-upload your file so Scolaris can extract clean readable text.");
      return;
    }

    setLoading(true);
    try {
      const data = await GeminiService.generateStudyMaterials(fileContent, type);
      const hubField = type === 'quiz' ? 'quizzes' : (type === 'test' ? 'tests' : type);
      const updatedHub = { ...activeHub, [hubField]: data } as StudyHubData;
      setHubs({ ...hubs, [activeCourseId]: updatedHub });
      await DBService.saveHub(updatedHub);
      addNotification('content', `${type.toUpperCase()} Ready`, `Your ${type} for ${currentCourse?.code} has been generated.`, 'hub');
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "AI Processing failed.";
      alert(`AI Processing warning: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const generatePodcast = async () => {
    if (!fileContent) return alert("Upload material first!");
    setLoading(true);
    try {
      const { script, wavUrl } = await GeminiService.generatePodcast(fileContent);
      const updatedHub = { ...activeHub, podcastUrl: wavUrl, transcript: script } as StudyHubData;
      setHubs({ ...hubs, [activeCourseId]: updatedHub });
      DBService.saveHub(updatedHub);
      addNotification('content', 'Seminar Podcast Ready', `The audio seminar for ${currentCourse?.code} is now available.`, 'hub');
    } catch (err) {
      console.error(err);
      alert("Podcast generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleShareToGroup = (groupId: string) => {
    if (!currentCourse) return;

    const shareMessage: GroupMessage = {
      id: 'share-' + Date.now(),
      sender: 'Scolaris AI',
      text: `${profile.name} shared a Study Hub for ${currentCourse.code}!`,
      timestamp: Date.now()
    };

    const updatedGroups = groups.map(g => {
      if (g.id === groupId) {
        const alreadyShared = g.sharedMaterials.find(m => m.courseId === activeCourseId);
        return {
          ...g,
          messages: [...g.messages, shareMessage],
          sharedMaterials: alreadyShared ? g.sharedMaterials : [
            ...g.sharedMaterials,
            { courseId: activeCourseId, courseCode: currentCourse.code, sharedBy: profile.name, timestamp: Date.now() }
          ]
        };
      }
      return g;
    });

    setGroups(updatedGroups);
    setShowShareModal(false);
  };

  const tools = [
    { id: 'summary', label: 'Summary', icon: ICONS.FileText, desc: 'Key Concepts' },
    { id: 'scanner', label: 'Doc Scanner', icon: <ScanText size={20} />, desc: 'Vision AI OCR' },
    { id: 'library', label: 'Library', icon: ICONS.Library, desc: 'Syllabus & Notes' },
    { id: 'flashcards', label: 'Flashcards', icon: ICONS.RotateCcw, desc: 'Memory Active' },
    { id: 'quiz', label: 'Quick Quiz', icon: ICONS.CheckCircle, desc: 'Self-Testing' },
    { id: 'test', label: 'Practice Test', icon: <Award size={20} />, desc: 'Timed Exam' },
    { id: 'podcast', label: 'Podcast', icon: ICONS.Audio, desc: 'Audio Seminar' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 relative">
      {/* Dynamic Header Area */}
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
             <div className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full text-[8px] font-bold uppercase tracking-widest text-blue-700">Study Hub</div>
             {activeHub.summary && <div className="px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full text-[8px] font-bold uppercase tracking-widest text-emerald-600">Generated</div>}
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-slate-900 leading-none">Academic Studio</h1>
          <p className="text-slate-500 font-medium text-sm md:text-base">Transforming source material into polished study assets.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          {activeHub.summary && (
            <button 
              onClick={() => setShowShareModal(true)}
              className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide hover:bg-blue-800 transition-all shadow-md"
            >
              {ICONS.Share} Share Hub
            </button>
          )}
          <div className="relative flex-1 xl:min-w-[250px] group">
            <select 
              className="w-full bg-white border border-slate-200 rounded-xl px-6 py-3 font-bold text-[10px] uppercase tracking-widest shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none cursor-pointer transition-all pr-10 text-slate-700"
              value={activeCourseId}
              onChange={e => {
                const val = e.target.value;
                setActiveCourseId(val);
                if (onCourseIdChange) onCourseIdChange(val);
              }}
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.code}: {c.title}</option>)}
            </select>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-blue-700 transition-colors">
              {ICONS.ChevronDown}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:items-start">
        {/* Sidebar Tools - Fixed Positionish on Large screens */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] space-y-4 relative overflow-hidden group border border-slate-100 shadow-sm">
            <div className="absolute inset-0 bg-blue-50/50 opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
            <div className="flex items-center justify-between relative z-10">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                 Source Material
              </h3>
              {fileContent && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </div>
            {isExtracting ? (
              <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center bg-blue-50/20 flex flex-col items-center justify-center min-h-[140px] animate-pulse relative z-10">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                <p className="text-[10px] text-blue-700 font-bold uppercase tracking-widest leading-none">
                  Scolaris is Analyzing...
                </p>
                <span className="text-[8px] text-slate-400 mt-1.5 uppercase tracking-wide">Extracting file knowledge</span>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-100 rounded-2xl p-6 text-center hover:bg-slate-50 hover:border-blue-200 transition-all cursor-pointer relative group/file">
                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-20" onChange={handleFileUpload} />
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-blue-600 mb-3 mx-auto group-hover/file:scale-110 transition-transform duration-500 border border-slate-100 shadow-sm relative z-10">
                  {ICONS.Plus}
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest relative z-10">
                  {activeHub.fileName ? "Replace Document" : "Upload Document"}
                </p>
                {activeHub.fileName && (
                  <div className="mt-3 py-1.5 px-4 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase rounded-xl border border-emerald-100 inline-block relative z-10 truncate max-w-[180px]">
                    {activeHub.fileName}
                  </div>
                )}
                {!activeHub.fileName && fileContent && (
                  <div className="mt-3 py-1.5 px-4 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase rounded-xl border border-emerald-100 inline-block relative z-10">
                    File Ready
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tools Grid - Adaptive */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as any)}
                className={`flex flex-col lg:flex-row lg:items-center justify-between p-6 lg:p-7 rounded-[2rem] transition-all duration-300 border group relative overflow-hidden ${
                  activeTool === tool.id 
                    ? 'bg-blue-700 border-blue-600 text-white shadow-lg' 
                    : 'bg-white text-slate-400 hover:text-slate-900 border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 relative z-10">
                  <div className={`w-10 h-10 lg:w-8 lg:h-8 shrink-0 flex items-center justify-center rounded-xl ${activeTool === tool.id ? 'bg-white/20' : 'bg-slate-50'} transition-all`}>
                    <span className={`transition-all ${activeTool === tool.id ? 'scale-110 text-white' : 'group-hover:scale-110 text-slate-400'}`}>{tool.icon}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs tracking-tight">{tool.label}</div>
                    <div className={`text-[10px] font-medium uppercase tracking-widest mt-0.5 ${activeTool === tool.id ? 'text-blue-100' : 'text-slate-400'}`}>{tool.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Workbench Display */}
        <div className="lg:col-span-8 xl:col-span-9 min-h-[500px] bg-white rounded-[2.5rem] p-6 sm:p-10 md:p-12 relative overflow-hidden border border-black/5 shadow-sm transition-all duration-500">
          {loading && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-3xl z-50 flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-500">
               <div className="relative w-32 h-32 mb-10">
                 <div className="absolute inset-0 border-4 border-blue-50 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
                 <div className="absolute inset-4 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                   {ICONS.Sparkles}
                 </div>
               </div>
              <h2 className="text-3xl sm:text-4xl font-serif font-bold mb-4 tracking-tight text-slate-900">AI Analysis</h2>
              <p className="text-slate-500 max-w-sm text-base md:text-lg font-medium">Synthesizing materials into structured study guides...</p>
            </div>
          )}

          {!fileContent && !activeHub.summary && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in zoom-in duration-700">
              <div className="p-16 bg-slate-50 rounded-[4rem] mb-12 text-blue-300 relative group border border-slate-100">
                <Sparkles size={72} className="relative z-10" />
              </div>
              <h3 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 mb-6 tracking-tight">Upload Study Material</h3>
              <p className="max-w-md text-slate-500 leading-relaxed text-lg sm:text-xl font-medium">Your studio is ready. Add your syllabus, notes, or research papers to unlock advanced study tools.</p>
            </div>
          )}

          <div className="page-transition">
            {activeTool === 'summary' && activeHub.summary && (
              <div className="space-y-12">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-10 gap-4">
                  <h3 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-slate-900">Executive Summary</h3>
                  <button onClick={() => generateTool('summary')} className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-blue-700 hover:text-blue-800 transition-all p-3 bg-blue-50 rounded-xl border border-blue-100">
                     <span className="group-hover:rotate-180 transition-transform duration-700">{ICONS.RotateCcw}</span> Regenerate
                  </button>
                </div>
                <div className="prose max-w-none text-slate-700 text-lg sm:text-xl leading-[1.7] space-y-8 font-medium prose-slate prose-p:leading-relaxed prose-headings:font-serif">
                  <ReactMarkdown>{activeHub.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {activeTool === 'summary' && !activeHub.summary && fileContent && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 animate-bounce">
                    {ICONS.FileText}
                  </div>
                  <button 
                    onClick={() => generateTool('summary')} 
                    className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-bold shadow-md hover:bg-black transition-all uppercase tracking-widest text-sm"
                  >
                    Generate Summary
                  </button>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Powered by Gemini AI</p>
              </div>
            )}

            {activeTool === 'scanner' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-6 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                        <ScanText size={16} />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Vision AI Engine</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">Document &amp; Handwritten Notes Scanner</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Upload photos of handwritten notebook pages, lecture slides, or PDF materials to convert them into structured study notes, flashcards &amp; quizzes.
                    </p>
                  </div>

                  {scannedDocResult && (
                    <button
                      onClick={applyScannedDocToHub}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 size={16} />
                      <span>Apply to {currentCourse?.code || 'Course'} Study Hub</span>
                    </button>
                  )}
                </div>

                {/* Scanner Upload / Dropzone */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-5 space-y-4">
                    <div className="bg-slate-50/70 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-3xl p-6 text-center transition-all relative group cursor-pointer">
                      <input
                        ref={scannerFileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer z-20"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleScanDocument(file);
                        }}
                      />

                      <div className="w-14 h-14 bg-indigo-100/80 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                        <Camera size={26} />
                      </div>

                      <h4 className="font-serif font-bold text-slate-900 text-sm">Upload Handwritten Notes or PDF</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        JPEG, PNG, WEBP, or PDF
                      </p>

                      <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 pointer-events-none">
                        <Upload size={14} />
                        <span>Select File / Take Photo</span>
                      </button>
                    </div>

                    {/* Live Image Preview if uploaded */}
                    {scannedDocPreview && (
                      <div className="p-3 bg-white border border-slate-150 rounded-2xl space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scanned Input Preview</span>
                        <div className="max-h-48 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                          <img src={scannedDocPreview} alt="Scanned Preview" className="max-h-48 object-contain" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scanned Results Display */}
                  <div className="md:col-span-7 space-y-4">
                    {isScanningDoc ? (
                      <div className="h-64 border border-indigo-100 bg-indigo-50/30 rounded-3xl p-8 flex flex-col items-center justify-center text-center animate-pulse space-y-3">
                        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                        <h4 className="font-serif font-bold text-indigo-950 text-base">Vision AI Scanning &amp; Parsing Notes...</h4>
                        <p className="text-xs text-indigo-700/80 max-w-xs">
                          Transcribing handwriting, formulas, diagrams, and structuring study concepts...
                        </p>
                      </div>
                    ) : scannedDocResult ? (
                      <div className="space-y-4">
                        
                        {/* Result Sub-tabs */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
                          <button
                            onClick={() => setScannerSubTab('summary')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${scannerSubTab === 'summary' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Structured Notes
                          </button>
                          <button
                            onClick={() => setScannerSubTab('transcription')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${scannerSubTab === 'transcription' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Verbatim OCR
                          </button>
                          <button
                            onClick={() => setScannerSubTab('flashcards')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${scannerSubTab === 'flashcards' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Cards ({scannedDocResult.flashcards?.length || 0})
                          </button>
                          <button
                            onClick={() => setScannerSubTab('quiz')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${scannerSubTab === 'quiz' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            Quiz ({scannedDocResult.quiz?.length || 0})
                          </button>
                        </div>

                        {/* Sub-tab Content: Structured Notes */}
                        {scannerSubTab === 'summary' && (
                          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-150 space-y-3 max-h-96 overflow-y-auto">
                            <div className="prose prose-slate max-w-none text-xs leading-relaxed">
                              <ReactMarkdown>{scannedDocResult.summary || "No summary parsed."}</ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* Sub-tab Content: Raw Verbatim OCR Transcription */}
                        {scannerSubTab === 'transcription' && (
                          <div className="p-5 bg-slate-900 text-slate-100 rounded-2xl font-mono text-xs leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                            {scannedDocResult.transcription || "No raw text extracted."}
                          </div>
                        )}

                        {/* Sub-tab Content: Scanned Flashcards */}
                        {scannerSubTab === 'flashcards' && (
                          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                            {(scannedDocResult.flashcards || []).map((fc: any, fIdx: number) => (
                              <div key={fIdx} className="p-3 bg-white border border-slate-150 rounded-xl space-y-1 text-xs">
                                <span className="font-bold text-indigo-600 uppercase text-[9px] block">Front</span>
                                <p className="font-bold text-slate-800">{fc.front}</p>
                                <span className="font-bold text-slate-400 uppercase text-[9px] block pt-1">Back / Answer</span>
                                <p className="text-slate-600">{fc.back}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sub-tab Content: Scanned Quiz */}
                        {scannerSubTab === 'quiz' && (
                          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                            {(scannedDocResult.quiz || []).map((q: any, qIdx: number) => (
                              <div key={qIdx} className="p-3 bg-white border border-slate-150 rounded-xl space-y-2 text-xs">
                                <p className="font-bold text-slate-900">{qIdx + 1}. {q.question}</p>
                                <div className="grid grid-cols-2 gap-1.5 pl-2">
                                  {(q.options || []).map((opt: string, oIdx: number) => (
                                    <div key={oIdx} className={`p-1.5 rounded-lg text-[11px] border ${opt === q.answer ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="h-64 border border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                        <FileSearch size={36} className="text-slate-300" />
                        <p className="text-xs font-medium">Select or upload a handwritten note image or PDF to start scanning.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {activeTool === 'flashcards' && activeHub.flashcards && (() => {
              const len = activeHub.flashcards.length;
              if (len === 0) return null;
              
              const handlePrevCard = () => {
                setIsCardFlipped(false);
                setTimeout(() => {
                  setCurrentCardIndex(prev => (prev > 0 ? prev - 1 : len - 1));
                }, 150);
              };

              const handleNextCard = () => {
                setIsCardFlipped(false);
                setTimeout(() => {
                  setCurrentCardIndex(prev => (prev < len - 1 ? prev + 1 : 0));
                }, 150);
              };

              // Make sure currentCardIndex doesn't overshoot
              const safeIndex = currentCardIndex >= len ? 0 : currentCardIndex;
              const card = activeHub.flashcards[safeIndex];

              return (
                <div className="space-y-10">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 border-b border-slate-100 pb-8">
                    <div>
                      <h3 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">Study Cards</h3>
                      <p className="text-xs text-slate-500 font-medium">Click a card to reveal its answer and definitions.</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-100/80 p-1 rounded-xl flex items-center border border-slate-200">
                        <button 
                          onClick={() => setFlashcardViewMode('deck')}
                          className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${flashcardViewMode === 'deck' ? 'bg-white text-blue-700 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          <Layers size={12} />
                          Focus Deck
                        </button>
                        <button 
                          onClick={() => setFlashcardViewMode('grid')}
                          className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${flashcardViewMode === 'grid' ? 'bg-white text-blue-700 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          <Grid size={12} />
                          All Cards
                        </button>
                      </div>
                      
                      <button 
                        onClick={() => generateTool('flashcards')} 
                        className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-slate-500 hover:text-blue-700 flex items-center justify-center bg-white"
                        title="Refresh Deck"
                      >
                        <RefreshCw size={14} className="hover:rotate-180 transition-all duration-500" />
                      </button>
                    </div>
                  </div>

                  {flashcardViewMode === 'deck' ? (
                    <div className="space-y-8 animate-in fade-in duration-500 max-w-xl mx-auto">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        <span>Deck View</span>
                        <span>{safeIndex + 1} of {len} Cards</span>
                      </div>

                      {/* Progress Progress bar */}
                      <div className="w-full h-1.5 bg-slate-105/80 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300" 
                          style={{ width: `${((safeIndex + 1) / len) * 100}%` }} 
                        />
                      </div>

                      <div className="flex flex-col items-center">
                        <div 
                          onClick={() => setIsCardFlipped(!isCardFlipped)}
                          className="w-full h-96 [perspective:2000px] cursor-pointer selection:bg-transparent"
                        >
                          <div className={`relative h-full w-full rounded-[3rem] shadow-md transition-all duration-500 [transform-style:preserve-3d] ${isCardFlipped ? '[transform:rotateY(180deg)] ring-4 ring-blue-500/10' : 'ring-1 ring-slate-100'}`}>
                            
                            {/* Front View */}
                            <div className="absolute inset-0 flex flex-col justify-between p-12 bg-white rounded-[3rem] [backface-visibility:hidden]">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Question & Concept</span>
                              </div>
                              <p className="text-center font-bold text-lg sm:text-xl lg:text-2xl text-slate-900 leading-snug tracking-tight">
                                {card?.front}
                              </p>
                              <div className="text-center">
                                <span className="px-5 py-2.5 bg-blue-50 hover:bg-blue-100/70 transition-colors rounded-full text-[10px] font-bold text-blue-700 uppercase tracking-widest border border-blue-100/50">Click to reveal answer</span>
                              </div>
                            </div>

                            {/* Back View */}
                            <div className="absolute inset-0 h-full w-full rounded-[3rem] bg-gradient-to-tr from-blue-700 to-indigo-800 p-12 text-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden] flex flex-col justify-between shadow-xl">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-300" />
                                <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Core Explanation</span>
                              </div>
                              <p className="text-center font-medium text-base sm:text-lg leading-relaxed max-h-[180px] overflow-y-auto pr-1">
                                {card?.back}
                              </p>
                              <div className="text-center">
                                <span className="px-5 py-2.5 bg-white/10 rounded-full text-[10px] font-bold text-blue-100 hover:bg-white/20 transition-all uppercase tracking-widest">Click to flip front</span>
                              </div>
                            </div>

                          </div>
                        </div>

                        {/* Deck controls */}
                        <div className="flex items-center gap-6 mt-8">
                          <button 
                            onClick={handlePrevCard}
                            className="w-12 h-12 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-all hover:scale-105 active:scale-95 shadow-sm"
                            title="Previous Card"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          
                          <button 
                            onClick={() => setIsCardFlipped(!isCardFlipped)}
                            className="px-8 py-3.5 bg-slate-950 hover:bg-black text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-md flex items-center gap-2"
                          >
                            {isCardFlipped ? "Show Question" : "Reveal Answer"}
                          </button>

                          <button 
                            onClick={handleNextCard}
                            className="w-12 h-12 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-all hover:scale-105 active:scale-95 shadow-sm"
                            title="Next Card"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
                      {activeHub.flashcards.map((cardItem, index) => (
                        <FlashcardItem key={index} card={cardItem} index={index} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTool === 'quiz' && activeHub.quizzes && (() => {
              const totalQuestions = activeHub.quizzes.length;
              const answeredCount = Object.keys(selectedAnswers).length;
              const correctCount = activeHub.quizzes.reduce((acc, q, idx) => {
                return acc + (selectedAnswers[idx] === q.answer ? 1 : 0);
              }, 0);
              const quizFinished = answeredCount === totalQuestions && totalQuestions > 0;
              const percentage = Math.round((correctCount / totalQuestions) * 100);

              return (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 border-b border-slate-100 pb-8">
                    <div>
                      <h3 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">Academic Assessment</h3>
                      <p className="text-xs text-slate-500 font-medium">Test your knowledge. Answer questions inline to receive analytical feedback.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</p>
                        <p className="text-sm font-bold text-slate-800">{answeredCount} of {totalQuestions} Answered</p>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedAnswers({});
                          setQuizScore(null);
                        }} 
                        className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 transition-all bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl flex items-center gap-2"
                      >
                        <RotateCcw size={12} />
                        Reset Progress
                      </button>
                    </div>
                  </div>

                  {/* Active overall linear stats progress bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>Completion Bar</span>
                      <span>{Math.round((answeredCount / totalQuestions) * 105) > 100 ? 100 : Math.round((answeredCount / totalQuestions) * 100)}% Complete</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 duration-500 transition-all shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                        style={{ width: `${(answeredCount / totalQuestions) * 100}%` }} 
                      />
                    </div>
                  </div>

                  <div className="space-y-10">
                    {activeHub.quizzes.map((q, i) => {
                      const selectedOption = selectedAnswers[i];
                      const hasAnswered = selectedOption !== undefined;

                      return (
                        <div 
                          key={i} 
                          className={`p-8 rounded-[2.5rem] border transition-all duration-300 space-y-6 animate-in fade-in slide-in-from-bottom-4 ${
                            hasAnswered 
                              ? selectedOption === q.answer 
                                ? 'bg-emerald-50/20 border-emerald-100/60 shadow-sm' 
                                : 'bg-rose-50/10 border-rose-100/60 shadow-sm'
                              : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'
                          }`}
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <span className="px-4 py-1.5 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-500 leading-none">
                              Question {i + 1}
                            </span>
                            {hasAnswered && (
                              selectedOption === q.answer ? (
                                <span className="px-4 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] font-black uppercase text-emerald-700 tracking-wider">Correct</span>
                              ) : (
                                <span className="px-4 py-1.5 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-black uppercase text-rose-700 tracking-wider">Incorrect</span>
                              )
                            )}
                          </div>

                          <p className="text-lg font-serif font-bold text-slate-900 leading-snug">
                            {q.question}
                          </p>

                          <div className="grid grid-cols-1 gap-3.5">
                            {q.options.map((opt, optIdx) => {
                              const isSelected = selectedOption === opt;
                              const isCorrect = opt === q.answer;

                              let optionStyle = "bg-white border-slate-100 hover:border-blue-200 text-slate-700 hover:bg-slate-50 hover:pl-6";
                              let icon = <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover:border-blue-300" />;

                              if (hasAnswered) {
                                if (isCorrect) {
                                  optionStyle = "bg-emerald-500 text-white border-emerald-500 shadow-md transform scale-[1.01]";
                                  icon = <Check className="w-4 h-4 text-white shrink-0" />;
                                } else if (isSelected) {
                                  optionStyle = "bg-rose-500 text-white border-rose-500 shadow-md transform scale-[1.01]";
                                  icon = <X className="w-4 h-4 text-white shrink-0" />;
                                } else {
                                  optionStyle = "bg-slate-50/30 text-slate-350 border-slate-100/60 opacity-60 pointer-events-none";
                                  icon = <div className="w-5 h-5 rounded-full border border-slate-100 shrink-0" />;
                                }
                              }

                              return (
                                <button 
                                  key={optIdx} 
                                  disabled={hasAnswered}
                                  onClick={() => {
                                    setSelectedAnswers(prev => ({ ...prev, [i]: opt }));
                                  }}
                                  className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 text-left font-bold text-xs select-none group ${optionStyle}`}
                                >
                                  <span className="leading-relaxed">{opt}</span>
                                  {icon}
                                </button>
                              );
                            })}
                          </div>

                          {hasAnswered && (
                            <div className="py-5 px-6 bg-slate-50 border border-slate-150 rounded-2xl space-y-2.5 animate-in slide-in-from-top-3 duration-300">
                              <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">
                                <HelpCircle size={14} className="text-slate-400" />
                                <span>Concept Explanation</span>
                              </div>
                              <p className="text-xs font-semibold text-slate-600 leading-relaxed italic">
                                {q.explanation || "This answer represents the accurate factual representation derived from your provided content."}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Overall report card banner if the quiz is finished */}
                  {quizFinished && (
                    <div className="bg-slate-900 border border-slate-800 p-10 sm:p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
                      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
                      <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="space-y-4 text-center md:text-left">
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                            Report Card Generated
                          </div>
                          <h4 className="text-3xl font-serif font-black tracking-tight text-white">
                            {percentage >= 70 ? "Assessment Approved!" : "Assessment Complete"}
                          </h4>
                          <p className="text-slate-400 text-sm max-w-sm font-medium leading-relaxed">
                            {percentage === 100 
                              ? "Perfect score! You have completely synthesized this study block with supreme cognitive memory. 🎓⚡" 
                              : percentage >= 70
                                ? "Excellent academic prowess! You have achieved deep understanding of these study guide structures. 🌟"
                                : "A vital benchmark in your learning! Review the dynamic study cards or concepts below to boost retention."}
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-4 shrink-0 bg-white/5 border border-white/5 p-8 rounded-3xl min-w-[200px] w-full md:w-auto">
                          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mb-1 shadow-glow animate-pulse">
                            {percentage >= 70 ? <Trophy size={28} /> : <Award size={28} />}
                          </div>
                          <div className="text-center">
                            <span className="text-4xl font-black text-white tracking-tighter">{correctCount} <span className="text-slate-500 text-2xl font-normal">/ {totalQuestions}</span></span>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Score: {percentage}%</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-8 border-t border-white/5 mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
                        <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 leading-none">Scolaris AI Assessment Engine</p>
                        <button 
                          onClick={() => {
                            setSelectedAnswers({});
                            setQuizScore(null);
                          }}
                          className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all duration-300 hover:scale-105"
                        >
                          Retake Assessment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTool === 'test' && activeHub.tests && (() => {
              const totalQuestions = activeHub.tests.length;
              const answeredCount = Object.keys(selectedTestAnswers).length;
              
              const correctCount = activeHub.tests.reduce((acc, q, idx) => {
                return acc + (selectedTestAnswers[idx] === q.answer ? 1 : 0);
              }, 0);
              const percentage = Math.round((correctCount / totalQuestions) * 100);

              const minutes = Math.floor(testTimeRemaining / 60);
              const seconds = testTimeRemaining % 60;
              const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

              return (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 border-b border-slate-100 pb-8">
                    <div>
                      <h3 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-slate-900">Practice Test Simulator</h3>
                      <p className="text-xs text-slate-500 font-medium font-sans">Timed mock exam simulating real-world university evaluation. Real-time feedback is hidden until submission.</p>
                    </div>
                    
                    {!isTestSubmitted && isTestActive && (
                      <div className="flex items-center gap-4 bg-rose-50 border border-rose-100 px-6 py-3 rounded-2xl shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                        <div className="font-mono font-bold text-rose-700 text-lg leading-none">
                          {formattedTime}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isTestActive && !isTestSubmitted ? (
                    <div className="bg-slate-50 border border-slate-100 p-12 rounded-[3rem] text-center space-y-6 max-w-2xl mx-auto shadow-sm">
                      <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                        <Award size={32} />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xl font-bold text-slate-800 font-sans">Ready to Start mock exam?</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-semibold max-w-md mx-auto">
                          You will have 5 minutes to complete {totalQuestions} generated questions. Score and correction details will only be presented upon submission.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTestAnswers({});
                          setTestTimeRemaining(300);
                          setIsTestActive(true);
                        }}
                        className="px-8 py-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:scale-105 transition-all shadow-md cursor-pointer"
                      >
                        Start 5-Minute Exam
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {activeHub.tests.map((q, i) => {
                        const selectedOption = selectedTestAnswers[i];
                        const isChosen = (opt: string) => selectedOption === opt;

                        return (
                          <div 
                            key={i} 
                            className={`p-8 rounded-[2.5rem] border transition-all duration-300 space-y-6 ${
                              isTestSubmitted
                                ? selectedOption === q.answer
                                  ? 'bg-emerald-50/20 border-emerald-100/60'
                                  : 'bg-rose-50/10 border-rose-100/60'
                                : selectedOption !== undefined
                                  ? 'bg-blue-50/10 border-blue-150'
                                  : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-4">
                              <span className="px-4 py-1.5 bg-slate-100 rounded-xl text-[10px] font-bold text-slate-500 leading-none">
                                Question {i + 1}
                              </span>
                              {isTestSubmitted && (
                                selectedOption === q.answer ? (
                                  <span className="px-4 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] font-black uppercase text-emerald-700 tracking-wider">Correct</span>
                                ) : (
                                  <span className="px-4 py-1.5 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-black uppercase text-rose-700 tracking-wider">Incorrect</span>
                                )
                              )}
                            </div>

                            <p className="text-lg font-serif font-bold text-slate-900 leading-snug">
                              {q.question}
                            </p>

                            <div className="grid grid-cols-1 gap-3.5">
                              {q.options.map((opt, optIdx) => {
                                const isSelected = isChosen(opt);
                                const isCorrect = opt === q.answer;

                                let optionStyle = "bg-white border-slate-100 hover:border-blue-200 text-slate-700 hover:bg-slate-50 hover:pl-6";
                                let icon = <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0" />;

                                if (isTestSubmitted) {
                                  if (isCorrect) {
                                    optionStyle = "bg-emerald-500 text-white border-emerald-500 shadow-md pointer-events-none";
                                    icon = <Check className="w-4 h-4 text-white shrink-0" />;
                                  } else if (isSelected) {
                                    optionStyle = "bg-rose-500 text-white border-rose-500 shadow-md pointer-events-none";
                                    icon = <X className="w-4 h-4 text-white shrink-0" />;
                                  } else {
                                    optionStyle = "bg-slate-50/30 text-slate-350 border-slate-100/60 opacity-60 pointer-events-none";
                                  }
                                } else if (isTestActive) {
                                  if (isSelected) {
                                    optionStyle = "bg-blue-700 text-white border-blue-700 shadow-md";
                                    icon = <div className="w-4 h-4 rounded-full bg-white shrink-0" />;
                                  }
                                } else {
                                  optionStyle = "opacity-60 pointer-events-none bg-slate-50 border-slate-100";
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    disabled={isTestSubmitted || !isTestActive}
                                    onClick={() => {
                                      setSelectedTestAnswers(prev => ({ ...prev, [i]: opt }));
                                    }}
                                    className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 text-left font-bold text-xs select-none ${optionStyle}`}
                                  >
                                    <span className="leading-relaxed">{opt}</span>
                                    {icon}
                                  </button>
                                );
                              })}
                            </div>

                            {isTestSubmitted && (
                              <div className="py-5 px-6 bg-slate-50 border border-slate-150 rounded-2xl space-y-2.5">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block font-sans">Concept Explanation</span>
                                <p className="text-xs font-semibold text-slate-600 leading-relaxed italic">
                                  {q.explanation || "Correct response matching standard study resources."}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {isTestActive && !isTestSubmitted && (
                        <div className="pt-6 text-right">
                          <button
                            onClick={() => {
                              setIsTestActive(false);
                              setIsTestSubmitted(true);
                              addNotification('content', 'Mock Exam Submitted', `Completed with ${Math.round((Object.keys(selectedTestAnswers).length / totalQuestions) * 100)}% completeness`, 'hub');
                            }}
                            className="px-10 py-5 bg-blue-700 hover:bg-blue-800 text-white rounded-2xl font-bold uppercase text-[11px] tracking-widest hover:scale-105 transition-all shadow-md cursor-pointer"
                          >
                            Submit Practice Test
                          </button>
                        </div>
                      )}

                      {isTestSubmitted && (
                        <div className="bg-slate-900 border border-slate-800 p-10 sm:p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
                          <div className="absolute top-5 right-5 w-80 h-80 bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
                          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                            <div className="space-y-4 text-center md:text-left">
                              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                                Exam Results Finalized
                              </span>
                              <h4 className="text-3xl font-serif font-black tracking-tight text-white">
                                {percentage >= 70 ? "Practice Test Passed!" : "Simulation Completed"}
                              </h4>
                              <p className="text-slate-400 text-sm max-w-sm font-medium leading-relaxed">
                                {percentage === 100 
                                  ? "Astonishing achievement! This study segment has been fully mastered with flawless grade accuracy."
                                  : percentage >= 70
                                    ? "Exceptional results! You are well-prepared for real-world examination standards."
                                    : "Keep polishing! Real mock tests identify target conceptual leaks before they hit your grade."}
                              </p>
                            </div>

                            <div className="flex flex-col items-center gap-4 shrink-0 bg-white/5 border border-white/5 p-8 rounded-3xl min-w-[200px] w-full md:w-auto">
                              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mb-1">
                                {percentage >= 70 ? <Trophy size={28} /> : <Award size={28} />}
                              </div>
                              <div className="text-center">
                                <span className="text-4xl font-black text-white tracking-tighter">{correctCount} <span className="text-slate-500 text-2xl font-normal">/ {totalQuestions}</span></span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Score: {percentage}%</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="pt-8 border-t border-white/5 mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
                            <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 leading-none font-sans">Scolaris Simulated Exam Division</p>
                            <button 
                              onClick={() => {
                                setSelectedTestAnswers({});
                                setIsTestSubmitted(false);
                                setTestTimeRemaining(300);
                              }}
                              className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all duration-300 hover:scale-105"
                            >
                              Reset and Retake Test
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTool === 'test' && !activeHub.tests && fileContent && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-8 animate-in fade-in duration-500">
                  <div className="w-20 h-20 bg-emerald-55 text-emerald-600 bg-emerald-50 rounded-full flex items-center justify-center">
                    <Award size={36} />
                  </div>
                  <button 
                    onClick={() => generateTool('test')} 
                    className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-bold shadow-md hover:bg-black transition-all uppercase tracking-widest text-sm cursor-pointer"
                  >
                    Generate Practice Test
                  </button>
              </div>
            )}

            {activeTool === 'quiz' && !activeHub.quizzes && fileContent && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    {ICONS.CheckCircle}
                  </div>
                  <button 
                    onClick={() => generateTool('quiz')} 
                    className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-bold shadow-md hover:bg-black transition-all uppercase tracking-widest text-sm"
                  >
                    Generate Quiz
                  </button>
              </div>
            )}

            {activeTool === 'flashcards' && !activeHub.flashcards && fileContent && (
               <div className="flex flex-col items-center justify-center h-[400px] gap-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    {ICONS.RotateCcw}
                  </div>
                  <button 
                    onClick={() => generateTool('flashcards')} 
                    className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-bold shadow-md hover:bg-black transition-all uppercase tracking-widest text-sm"
                  >
                    Generate Cards
                  </button>
              </div>
            )}

            {activeTool === 'podcast' && isPodcastAllowed && !activeHub.podcastUrl && fileContent && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    {ICONS.Audio}
                  </div>
                  <button 
                    onClick={generatePodcast} 
                    className="px-12 py-6 bg-slate-900 text-white rounded-[2rem] font-bold shadow-md hover:bg-black transition-all uppercase tracking-widest text-sm"
                  >
                    Generate AI Podcast
                  </button>
              </div>
            )}

            {activeTool === 'podcast' && activeHub.podcastUrl && (
              <div className="space-y-16">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-10">
                    <div className="flex items-center gap-6">
                      <h3 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-slate-900">Audio Seminar</h3>
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-5 py-2 rounded-full uppercase tracking-widest border border-blue-100 shadow-sm">AI Generated</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-12 sm:p-20 rounded-[4rem] flex flex-col items-center gap-16 border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="flex gap-4 items-center h-28 relative z-10 transition-transform duration-700 group-hover:scale-110">
                      {[3,6,10,5,8,4,10,7,9,4,8,6,3,7,5,9].map((h, i) => (
                        <div key={i} className="w-2 sm:w-3 bg-blue-700 rounded-full animate-bounce" style={{ height: `${h * 10}%`, animationDelay: `${i * 60}ms`, animationDuration: '800ms' }} />
                      ))}
                    </div>
                    <div className="w-full relative z-10">
                      <audio ref={audioRef} controls src={activeHub.podcastUrl} className="w-full accent-blue-600 rounded-full shadow-sm" />
                    </div>
                    <div className="text-center space-y-4 relative z-10">
                      <div className="flex items-center justify-center gap-4 text-blue-700 font-bold text-2xl sm:text-3xl tracking-tight">
                         <span>AI Prof. Alpha</span>
                         <AudioWaveform size={32} />
                         <span>AI Prof. Beta</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em] animate-pulse">Seminar in session</p>
                    </div>
                  </div>
              </div>
            )}

            {activeTool === 'library' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 border-b border-slate-100 pb-8">
                  <div>
                    <h3 className="text-3xl font-serif font-bold tracking-tight text-slate-900">Course Library</h3>
                    <p className="text-xs text-slate-500 font-medium font-sans">Securely archive syllabus, textbook chapters, and collective lecture notes.</p>
                  </div>
                  <div className="p-3 bg-indigo-50 border border-indigo-150 rounded-2xl text-[9px] font-mono tracking-wide text-indigo-700 font-black uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    Supabase Storage Active
                  </div>
                </div>

                {/* Secure File Uploader Area */}
                <div 
                  onClick={() => libraryFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-[2rem] p-10 text-center transition-all cursor-pointer relative group/libfile ${
                    isUploadingLibrary 
                      ? 'border-indigo-300 bg-indigo-50/20 pointer-events-none' 
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={libraryFileInputRef} 
                    onChange={handleLibraryFileUpload} 
                    accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden" 
                  />
                  
                  {isUploadingLibrary ? (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-2 mx-auto shadow-sm">
                        <Loader2 className="w-8 h-8 animate-spin" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 font-sans">Transmitting to Supabase...</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none font-semibold">Encrypting and uploading file to S3 storage bucket</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 mx-auto group-hover/libfile:scale-110 transition-transform duration-500 border border-slate-100 shadow-sm">
                        <Upload size={24} className="group-hover/libfile:-translate-y-1 transition-transform" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-800 font-sans">
                        Upload Document to Course Library
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        Click or drag PDF, TXT, or DOCX syllabus & Notes here
                      </p>
                      <div className="text-[9px] text-slate-400 inline-block font-medium">
                        Stored in secure encrypted Supabase S3 bucket (Region: eu-north-1)
                      </div>
                    </div>
                  )}
                </div>

                {/* Stored Documents List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Archived Materials ({(activeHub.libraryFiles || []).length})
                    </h4>
                  </div>

                  {(!activeHub.libraryFiles || activeHub.libraryFiles.length === 0) ? (
                    <div className="text-center p-12 bg-slate-50/50 rounded-[2rem] border border-slate-100">
                      <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Folder size={18} />
                      </div>
                      <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-1">Library is empty</h5>
                      <p className="text-[11px] text-slate-500 font-medium">No custom syllabus or notes added for this course yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeHub.libraryFiles.map((file) => {
                        const isPdf = file.fileName.toLowerCase().endsWith('.pdf') || file.fileType?.includes('pdf');
                        const isDocx = file.fileName.toLowerCase().endsWith('.docx') || file.fileType?.includes('document');
                        const fileColorClass = isPdf 
                          ? 'bg-rose-50 text-rose-600 border-rose-100' 
                          : isDocx 
                            ? 'bg-blue-50 text-blue-600 border-blue-100' 
                            : 'bg-indigo-50 text-indigo-600 border-indigo-100';

                        return (
                          <div 
                            key={file.id} 
                            className="bg-white border border-slate-100 hover:border-slate-200 rounded-[2rem] p-6 flex flex-col justify-between h-44 group transition-all shadow-sm"
                          >
                            <div className="flex items-start gap-4">
                              <div className={`w-12 h-12 shrink-0 ${fileColorClass} rounded-2xl flex items-center justify-center border group-hover:scale-105 transition-transform`}>
                                <File size={22} />
                              </div>
                              <div className="space-y-1 flex-1 min-w-0">
                                <h5 
                                  className="text-[13px] font-bold text-slate-800 leading-snug truncate uppercase font-serif italic"
                                  title={file.fileName}
                                >
                                  {file.fileName}
                                </h5>
                                <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono font-bold uppercase tracking-wide">
                                  <span className="text-slate-400 font-sans font-medium">{file.fileSize || 'N/A'}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 font-sans font-medium">
                                    {new Date(file.timestamp).toLocaleDateString()}
                                  </span>
                                  {!file.s3Key.startsWith('simulated/') && (
                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded leading-none text-[8px] border border-indigo-100 font-black">
                                      S3 Core
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-50/80">
                              <button 
                                onClick={() => handleDeleteLibraryFile(file.id)}
                                className="p-2 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                title="Delete from Library"
                              >
                                <Trash2 size={13} />
                              </button>

                              <button 
                                onClick={() => handleAccessLibraryFile(file)}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-indigo-600 rounded-xl text-[9px] font-mono uppercase tracking-widest font-black transition-all cursor-pointer shadow-sm active:scale-95"
                              >
                                <Download size={11} /> Access File
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyHub;
