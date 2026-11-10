
import React, { useState, useRef, useEffect } from 'react';
import { Course, StudyHubData, LibraryFile, Flashcard, QuizQuestion, StudyGroup, UserProfile, GroupMessage, AppNotification, AppState, UserFile } from '../types';
import { ICONS } from '../constants';
import { Sparkles, AudioWaveform, ChevronLeft, ChevronRight, RefreshCw, Layers, Grid, Check, X, HelpCircle, Trophy, Award, RotateCcw, Trash2, Folder, Download, Upload, Loader2, AlertCircle, FileText, File, ScanText, Camera, Image, FileSearch, CheckCircle2, ArrowUpRight, BookOpen, Plus, MessageSquare, Link as LinkIcon } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { DBService } from '../services/db';
import { getCurrentUserId, getAccessToken } from '../lib/supabase';
import ReactMarkdown from 'react-markdown';
import { RecentFiles } from './RecentFiles';
import { StudyHubAIChat } from './StudyHubAIChat';

// Component for individual flashcards in Grid View
const FlashcardItem: React.FC<{ card: Flashcard; index: number }> = ({ card, index }) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div 
      onClick={() => setFlipped(!flipped)} 
      className="h-64 [perspective:1500px] cursor-pointer group" 
    >
      <div className={`relative h-full w-full rounded-xl bg-white transition-all duration-300 [transform-style:preserve-3d] border ${flipped ? '[transform:rotateY(180deg)] border-blue-300 ring-2 ring-blue-500/10 shadow-xs' : 'border-slate-200 hover:border-slate-300 shadow-2xs'}`}>
        
        {/* Front */}
        <div className="absolute inset-0 flex flex-col justify-between p-6 [backface-visibility:hidden]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>Card {index + 1}</span>
          </div>
          <p className="text-center font-medium text-sm text-slate-900 leading-snug">{card.front}</p>
          <div className="text-center text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Click to reveal answer</div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 h-full w-full rounded-xl bg-slate-900 p-6 text-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden] flex flex-col justify-between shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>Explanation</span>
          </div>
          <p className="text-center font-normal text-xs sm:text-sm text-slate-200 leading-relaxed overflow-y-auto">{card.back}</p>
          <div className="text-center text-[11px] font-medium text-slate-400">Click to flip front</div>
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
  onNavigate?: (tab: string) => void;
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
  onCourseIdChange,
  onNavigate
}) => {
  // Remember last opened course; if none remembered or selected, show course list
  const [activeCourseId, setActiveCourseId] = useState<string>(() => {
    if (selectedCourseId && courses.some(c => c.id === selectedCourseId)) {
      return selectedCourseId;
    }
    try {
      const saved = localStorage.getItem('korsiq_last_hub_course_id') || localStorage.getItem('scolaris_last_accessed_course_id');
      if (saved && courses.some(c => c.id === saved)) {
        return saved;
      }
    } catch {}
    // If only 1 course exists, open it directly; otherwise start at course list
    if (courses.length === 1) return courses[0].id;
    return '';
  });

  // Deep links sync: if selectedCourseId changes from an outside screen, switch to it immediately
  useEffect(() => {
    if (selectedCourseId && courses.some(c => c.id === selectedCourseId)) {
      setActiveCourseId(selectedCourseId);
      try {
        localStorage.setItem('korsiq_last_hub_course_id', selectedCourseId);
        localStorage.setItem('scolaris_last_accessed_course_id', selectedCourseId);
      } catch {}
    }
  }, [selectedCourseId, courses]);
  const [activeTool, setActiveTool] = useState<'summary' | 'flashcards' | 'quiz' | 'test' | 'podcast' | 'library' | 'scanner' | 'ai'>('summary');
  const [landingView, setLandingView] = useState<'courses' | 'ai'>('courses');
  const [loading, setLoading] = useState(false);
  const [insufficientCreditsNotice, setInsufficientCreditsNotice] = useState<{
    required: number;
    balance: number;
    resetDate?: string;
  } | null>(null);
  const [failedExtractionFile, setFailedExtractionFile] = useState<{
    file: UserFile;
    error: string;
  } | null>(null);
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
  const [refreshFilesTrigger, setRefreshFilesTrigger] = useState(0);
  const [isSessionFileActive, setIsSessionFileActive] = useState(false);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);
  
  const [libraryFilter, setLibraryFilter] = useState<'recent' | 'all'>('recent');
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);

  // 3-Source Upload Sheet State (From device, From my Library, From a link)
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploadSheetTab, setUploadSheetTab] = useState<'options' | 'library' | 'link'>('options');
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkErrorMsg, setLinkErrorMsg] = useState<string | null>(null);
  const deviceFileInputRef = useRef<HTMLInputElement>(null);

  const openUploadSheet = () => {
    setUploadSheetTab('options');
    setLinkUrlInput('');
    setLinkErrorMsg(null);
    setShowUploadSheet(true);
  };

  const handleAttachFromLibrary = async (file: UserFile) => {
    setShowUploadSheet(false);
    if (!activeCourseId) return;

    // Attach reference to this course's libraryFiles without duplicating stored cloud file
    const existingFiles = activeHub.libraryFiles || [];
    const alreadyAttached = existingFiles.some(f => f.id === file.id || f.s3Key === file.storagePath);
    if (!alreadyAttached) {
      const refFile: LibraryFile = {
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType || 'application/octet-stream',
        fileSize: file.fileSize,
        s3Key: file.storagePath,
        s3Url: file.downloadUrl || '',
        timestamp: file.timestamp || Date.now()
      };
      const updatedHub = {
        ...activeHub,
        libraryFiles: [refFile, ...existingFiles]
      } as StudyHubData;
      setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
      await DBService.saveHub(updatedHub);
    }

    await handleSelectRecentFile({ ...file, courseId: activeCourseId });
  };

  const handleExtractFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = linkUrlInput.trim();
    if (!trimmedUrl || !activeCourseId) return;

    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setLinkErrorMsg('Please enter a valid http:// or https:// URL.');
      return;
    }

    setLinkErrorMsg(null);
    setShowUploadSheet(false);
    setIsExtracting(true);
    setIsSessionFileActive(true);
    addNotification('content', 'Fetching Link', `Reading study material from ${trimmedUrl}...`, 'hub');

    try {
      const res = await GeminiService.extractUrlText(trimmedUrl);
      if (!res.success || !res.extractedText) {
        setIsExtracting(false);
        setUploadSheetTab('link');
        setLinkErrorMsg(res.error || "We couldn't read that link. Check that the page or document is publicly accessible.");
        setShowUploadSheet(true);
        return;
      }

      const content = res.extractedText;
      const derivedTitle = res.fileName || new URL(trimmedUrl).hostname;
      setFileContent(content);

      let summaryText = '';
      try {
        const sumRes = await GeminiService.generateStudyMaterials(content, 'summary');
        if (sumRes) {
          summaryText = typeof sumRes === 'string' ? sumRes : (sumRes.text || JSON.stringify(sumRes));
        }
      } catch (sumErr) {
        console.warn('URL summary generation warning:', sumErr);
      }

      const updatedHub = {
        ...activeHub,
        fileContent: content,
        fileName: derivedTitle,
        summary: summaryText || activeHub.summary
      } as StudyHubData;

      setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
      await DBService.saveHub(updatedHub);
      addNotification('content', 'Link Imported', `Extracted and summarized ${derivedTitle}.`, 'hub');
      setActiveTool('summary');
    } catch (err: any) {
      setUploadSheetTab('link');
      setLinkErrorMsg(err?.message || "We couldn't read that link. Please try another URL.");
      setShowUploadSheet(true);
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    const fetchUserFiles = async () => {
      const userId = getCurrentUserId();
      if (userId) {
        try {
          const files = await DBService.getUserFiles(userId);
          setUserFiles(files);
        } catch (err) {
          console.error('Failed to fetch user files:', err);
        }
      }
    };
    fetchUserFiles();
  }, [getCurrentUserId(), refreshFilesTrigger]);

  const handleSelectRecentFile = async (file: UserFile) => {
    const targetCourseId = file.courseId || activeCourseId;
    if (targetCourseId) {
      setActiveCourseId(targetCourseId);
    }
    setIsSessionFileActive(true);
    setFailedExtractionFile(null);
    addNotification('content', 'Loading File', `Loading ${file.fileName} into Study Hub workbench...`, 'hub');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setIsExtracting(true);
    try {
      // Extract directly from Supabase Storage path on the server first (bypasses Vercel 4.5MB limit)
      let res = file.storagePath
        ? await GeminiService.extractFileText(file.fileName, file.fileType, undefined, {
            storagePath: file.storagePath,
            fileId: file.id,
          })
        : { success: false, error: 'Missing storage path' };

      if ((!res.success || !res.extractedText) && file.downloadUrl) {
        const resp = await fetch(file.downloadUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const base64 = await fileToBase64(blob);
          res = await GeminiService.extractFileText(file.fileName, file.fileType, base64, { fileId: file.id });
        }
      }

      if (res.success && res.extractedText) {
        setFileContent(res.extractedText);
        if (targetCourseId) {
          const currentH = hubs[targetCourseId] || { courseId: targetCourseId };
          const updatedH = { ...currentH, fileContent: res.extractedText, fileName: file.fileName } as StudyHubData;
          setHubs(prev => ({ ...prev, [targetCourseId]: updatedH }));
          await DBService.saveHub(updatedH);
        }
        setRefreshFilesTrigger(prev => prev + 1);
        addNotification('content', 'File Ready', `${file.fileName} loaded and ready in Study Hub workbench!`, 'hub');
      } else {
        setFailedExtractionFile({
          file,
          error: res.error || 'Uploaded, could not read text from this document.'
        });
      }
    } catch (loadErr: any) {
      console.warn('Auto-extract for selected recent file warning:', loadErr);
      setFailedExtractionFile({
        file,
        error: loadErr?.message || 'Uploaded, could not read text from this document.'
      });
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    if (activeCourseId) {
      try {
        localStorage.setItem('scolaris_last_accessed_course_id', activeCourseId);
        localStorage.setItem('korsiq_last_hub_course_id', activeCourseId);
      } catch {}
    }
  }, [activeCourseId]);

  const fileToBase64 = (file: Blob): Promise<string> => {
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
    addNotification('content', 'File Uploading', `Uploading ${file.name} to isolated user storage...`, 'hub');

    try {
      const activeCourse = courses.find(c => c.id === activeCourseId);
      const userId = getCurrentUserId() || 'user_anonymous';

      const userFile = await DBService.uploadFileToStorage(
        userId,
        activeCourseId,
        file,
        activeCourse?.code,
        activeCourse?.title
      );

      const newFile: LibraryFile = {
        id: userFile.id,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: userFile.fileSize,
        s3Key: userFile.storagePath,
        s3Url: userFile.downloadUrl || '',
        timestamp: userFile.timestamp
      };

      const existingFiles = activeHub.libraryFiles || [];
      const updatedHub = {
        ...activeHub,
        libraryFiles: [newFile, ...existingFiles]
      } as StudyHubData;

      setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
      await DBService.saveHub(updatedHub);
      setRefreshFilesTrigger(prev => prev + 1);
      addNotification('content', 'Upload Complete', `${file.name} successfully saved to your isolated storage!`, 'hub');

    } catch (err: any) {
      console.warn('Isolated storage upload failed:', err?.message || err);
      addNotification('content', 'Upload Warning', `Could not save ${file.name} to storage.`, 'hub');
    } finally {
      setIsUploadingLibrary(false);
      if (libraryFileInputRef.current) libraryFileInputRef.current.value = '';
    }
  };

  const handleAccessLibraryFile = async (file: LibraryFile) => {
    if (file.s3Url && !file.s3Key.startsWith('simulated/')) {
      try {
        addNotification('content', 'Retrieving File', `Generating dynamic authorization for ${file.fileName}...`, 'hub');
        const token = await getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch('/api/s3/presign', {
          method: 'POST',
          headers,
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
    setIsSessionFileActive(true);
    setFailedExtractionFile(null);
    addNotification('content', 'Uploading File', `Uploading ${file.name} to cloud storage and extracting text...`, 'hub');

    const userId = getCurrentUserId();
    const activeCourse = courses.find(c => c.id === activeCourseId);
    let uploadedFile: UserFile | null = null;

    try {
      // Step 1: Upload to Supabase Storage FIRST so the file is always saved in user_files
      // and large files bypass Vercel's 4.5MB serverless request body limit.
      if (userId && activeCourseId) {
        try {
          uploadedFile = await DBService.uploadFileToStorage(
            userId,
            activeCourseId,
            file,
            activeCourse?.code,
            activeCourse?.title,
            'processing'
          );
          setRefreshFilesTrigger(prev => prev + 1);
        } catch (stErr: any) {
          console.warn('Direct storage upload warning:', stErr);
        }
      }

      // Step 2: Extract text using storagePath on the server (or plain text / base64 fallback for small files)
      const isPlainTextFile = file.type.startsWith('text/') || /\.(txt|md|csv|text)$/i.test(file.name);
      let content = '';

      if (isPlainTextFile) {
        content = await file.text();
        if (uploadedFile && userId) {
          await DBService.updateUserFileStatus(uploadedFile.id, userId, 'ready');
        }
      } else {
        const canSendBase64Fallback = !uploadedFile?.storagePath && file.size <= 3 * 1024 * 1024;
        const base64Fallback = canSendBase64Fallback ? await fileToBase64(file) : undefined;
        const res = await GeminiService.extractFileText(file.name, file.type, base64Fallback, {
          storagePath: uploadedFile?.storagePath,
          fileId: uploadedFile?.id,
        });

        if (res.success && res.extractedText) {
          content = res.extractedText;
        } else {
          if (uploadedFile && userId) {
            await DBService.updateUserFileStatus(uploadedFile.id, userId, 'failed');
            setRefreshFilesTrigger(prev => prev + 1);
          }
          const errReason = res.error || "Uploaded, could not read text from this document.";
          if (uploadedFile) {
            setFailedExtractionFile({ file: { ...uploadedFile, status: 'failed' }, error: errReason });
          }
          throw new Error(errReason);
        }
      }

      if (content && content.trim().length > 0) {
        setFileContent(content);
        const name = file.name;

        const updatedHub = { 
          ...activeHub, 
          fileContent: content, 
          fileName: name,
        } as StudyHubData;

        setHubs(prev => ({ ...prev, [activeCourseId]: updatedHub }));
        await DBService.saveHub(updatedHub);
        setRefreshFilesTrigger(prev => prev + 1);
        addNotification('content', 'Material Ready', `${name} uploaded and ready in Study Hub.`, 'hub');
        setActiveTool('summary');
      } else {
        if (uploadedFile && userId) {
          await DBService.updateUserFileStatus(uploadedFile.id, userId, 'failed');
          setFailedExtractionFile({
            file: { ...uploadedFile, status: 'failed' },
            error: 'Uploaded, could not read text from this document.'
          });
        }
        throw new Error('Uploaded, could not read text from this document.');
      }
    } catch (err: any) {
      console.warn("File extraction warning:", err?.message || err);
      addNotification('content', 'Extraction Notice', err?.message || 'Uploaded, could not read text.', 'hub');
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
      const userId = getCurrentUserId();
      const activeCourse = courses.find(c => c.id === activeCourseId);
      let uploadedScanFile: UserFile | null = null;

      if (userId && activeCourseId) {
        try {
          uploadedScanFile = await DBService.uploadFileToStorage(
            userId,
            activeCourseId,
            file,
            activeCourse?.code,
            activeCourse?.title,
            'processing'
          );
          setRefreshFilesTrigger(prev => prev + 1);
        } catch {}
      }

      if (file.type.startsWith('image/') && file.size <= 4 * 1024 * 1024) {
        const previewB64 = await fileToBase64(file);
        setScannedDocPreview(`data:${file.type || 'image/jpeg'};base64,${previewB64}`);
      }

      const base64Fallback = !uploadedScanFile?.storagePath && file.size <= 3 * 1024 * 1024
        ? await fileToBase64(file)
        : undefined;

      const res = await GeminiService.scanDocumentWithVision(file.name, file.type, base64Fallback, {
        storagePath: uploadedScanFile?.storagePath,
      });
      if (res.success && res.data) {
        if (uploadedScanFile && userId) {
          await DBService.updateUserFileStatus(uploadedScanFile.id, userId, 'ready');
          setRefreshFilesTrigger(prev => prev + 1);
        }
        setScannedDocResult(res.data);
        addNotification('content', 'Vision Scan Complete', `Successfully converted ${file.name} into structured study notes, flashcards & quiz!`, 'hub');
      } else {
        if (uploadedScanFile && userId) {
          await DBService.updateUserFileStatus(uploadedScanFile.id, userId, 'failed');
          setRefreshFilesTrigger(prev => prev + 1);
          setFailedExtractionFile({
            file: { ...uploadedScanFile, status: 'failed' },
            error: res.error || 'Uploaded, could not read text during OCR scan.'
          });
        }
        throw new Error(res.error || 'Uploaded, could not read text during OCR scan.');
      }
    } catch (err: any) {
      console.error('Vision scan error:', err);
      addNotification('content', 'Scan Error', err?.message || 'Uploaded, could not read text during OCR scan.', 'hub');
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
      alert("The currently loaded material contains raw unparsed binary PDF data. Please re-upload your file so KorsIQ can extract clean readable text.");
      return;
    }

    setInsufficientCreditsNotice(null);
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
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientCreditsNotice({
          required: err.required ?? (type === 'summary' ? 1 : 2),
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      const msg = err?.message || "AI Processing failed.";
      alert(`AI Processing warning: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const generatePodcastTool = async () => {
    const source = (fileContent && fileContent.trim()) || activeHub.summary || `${currentCourse?.code}: ${currentCourse?.title}`;
    if (!source || !source.trim()) return alert("Upload or select study material first!");

    setInsufficientCreditsNotice(null);
    setLoading(true);
    try {
      const res = await GeminiService.generatePodcast(source);
      const updatedHub = {
        ...activeHub,
        podcastUrl: res.wavUrl || undefined,
        transcript: res.script
      } as StudyHubData;
      setHubs({ ...hubs, [activeCourseId]: updatedHub });
      await DBService.saveHub(updatedHub);
      addNotification('content', 'AI Podcast Ready', `Your audio overview for ${currentCourse?.code} has been generated.`, 'hub');
    } catch (err: any) {
      console.error(err);
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientCreditsNotice({
          required: err.required ?? 6,
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      alert(err?.message || "We couldn't generate your podcast right now.");
    } finally {
      setLoading(false);
    }
  };

  const handleShareToGroup = (groupId: string) => {
    if (!currentCourse) return;

    const shareMessage: GroupMessage = {
      id: 'share-' + Date.now(),
      sender: 'KorsIQ',
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
    { id: 'summary', label: 'Summary', icon: ICONS.FileText, desc: '1 credit' },
    { id: 'ai', label: 'AI', icon: <MessageSquare size={18} />, desc: 'Chat & History (Free)' },
    { id: 'library', label: 'Library', icon: ICONS.Library, desc: 'Syllabus & Notes' },
    { id: 'flashcards', label: 'Flashcards', icon: ICONS.RotateCcw, desc: '2 credits' },
    { id: 'quiz', label: 'Practice Quiz', icon: ICONS.CheckCircle, desc: '2 credits' },
    { id: 'test', label: 'Practice Test', icon: <Award size={20} />, desc: '2 credits' },
    { id: 'podcast', label: 'AI Podcast', icon: <AudioWaveform size={18} />, desc: '6 credits' },
  ];

  if (!activeCourseId || !currentCourse) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-16">
        {/* Header with Ask KorsIQ AI entry */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[10px] font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900">
                Study Hub
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {landingView === 'ai' ? 'Ask KorsIQ AI' : 'Course Workbenches'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              {landingView === 'ai'
                ? 'General academic discussions with saved conversation history.'
                : 'Select a course to open its study workbench, or start a conversation with KorsIQ AI.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setLandingView(landingView === 'ai' ? 'courses' : 'ai')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs sm:text-sm font-semibold min-h-[44px] transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <MessageSquare size={16} />
            <span>{landingView === 'ai' ? 'View courses' : 'Ask KorsIQ AI'}</span>
          </button>
        </div>

        {landingView === 'ai' ? (
          <StudyHubAIChat
            profile={profile}
            courses={courses}
            activeCourse={null}
            activeHub={null}
            onBackToCourses={() => setLandingView('courses')}
          />
        ) : (
          <>
            {/* Prominent Ask KorsIQ AI Entry Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Ask KorsIQ AI
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Chat with your discipline-tailored academic tutor and revisit your saved conversation history anytime.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLandingView('ai')}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer shrink-0"
              >
                <MessageSquare size={15} />
                <span>Open AI Chat</span>
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 sm:p-12 text-center max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    No courses enrolled yet
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Add your courses to start generating tailored summaries, active recall flashcards, and quizzes.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate?.('planner')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer shadow-xs"
                >
                  <Plus size={16} />
                  <span>Add your first course</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map(course => {
                  const hubData = hubs[course.id];
                  const hasMaterials = Boolean(hubData?.summary || hubData?.flashcards?.length || hubData?.quizzes?.length || hubData?.libraryFiles?.length);

                  return (
                    <button
                      key={course.id}
                      onClick={() => {
                        setActiveCourseId(course.id);
                        onCourseIdChange?.(course.id);
                      }}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-5 text-left transition-all hover:shadow-sm min-h-[120px] flex flex-col justify-between group cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-bold font-mono px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded border border-blue-100 dark:border-blue-900">
                            {course.code}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">
                            {course.units} Units
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {course.title}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                        <span className="text-[11px] text-slate-400">
                          {hasMaterials ? 'Materials active' : 'Ready to start'}
                        </span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Open Hub &rarr;
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 relative">
      {/* Dynamic Header Area */}
      <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
             <div className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-full text-[8px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300">Study Hub</div>
             {activeHub.summary && <div className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 rounded-full text-[8px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Generated</div>}
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            {currentCourse.code}: {currentCourse.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Course workbench: summaries, flashcards, active recall quizzes, and course materials.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5 w-full xl:w-auto items-center">
          <button
            onClick={() => {
              setActiveCourseId('');
              try {
                localStorage.removeItem('korsiq_last_hub_course_id');
              } catch {}
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold min-h-[44px] transition-colors cursor-pointer"
            title="Switch Course"
          >
            <ChevronLeft size={16} />
            <span>Switch course</span>
          </button>

          {activeHub.summary && (
            <button 
              onClick={() => setShowShareModal(true)}
              className="flex-1 xl:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wide transition-all shadow-xs min-h-[44px]"
            >
              {ICONS.Share} Share Hub
            </button>
          )}
          <div className="relative flex-1 xl:min-w-[240px] group">
            <select 
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 font-bold text-[10px] uppercase tracking-widest shadow-2xs focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none cursor-pointer transition-all pr-10 text-slate-700 dark:text-slate-200 min-h-[44px]"
              value={activeCourseId}
              onChange={e => {
                const val = e.target.value;
                setActiveCourseId(val);
                if (onCourseIdChange) onCourseIdChange(val);
              }}
            >
              {courses.map(c => <option key={c.id} value={c.id}>{c.code}: {c.title}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-blue-700 transition-colors">
              {ICONS.ChevronDown}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:items-start">
        {/* Sidebar Tools - Fixed Positionish on Large screens */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-white p-5 rounded-xl space-y-4 relative overflow-hidden group border border-slate-200 shadow-2xs">
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
                  KorsIQ is Analyzing...
                </p>
                <span className="text-[8px] text-slate-400 mt-1.5 uppercase tracking-wide">Extracting file knowledge</span>
              </div>
            ) : (
              <>
                <input
                  ref={deviceFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={openUploadSheet}
                  className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:bg-slate-50 hover:border-blue-300 transition-all cursor-pointer relative group/file min-h-[120px]"
                >
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-blue-600 mb-3 mx-auto group-hover/file:scale-105 transition-transform duration-300 border border-slate-100 shadow-sm relative z-10">
                    {ICONS.Plus}
                  </div>
                  <p className="text-xs text-slate-700 font-semibold relative z-10">
                    Upload Material
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 relative z-10">
                    From device, Library, or link
                  </p>
                </button>
              </>
            )}
          </div>

          {/* Recently Uploaded Quick List */}
          {(() => {
            const courseRecentFiles = userFiles.filter(f => 
              (!activeCourseId || f.courseId === activeCourseId)
            ).slice(0, 3);

            if (courseRecentFiles.length === 0) return null;

            return (
              <div className="bg-white p-4 rounded-xl space-y-3 border border-slate-200 shadow-2xs animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} className="text-blue-600" />
                    Recently Uploaded
                  </span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium border border-blue-100">
                    Quick Load
                  </span>
                </div>
                <div className="space-y-1.5">
                  {courseRecentFiles.map(file => (
                    <button
                      key={file.id}
                      onClick={() => handleSelectRecentFile(file)}
                      className="w-full text-left p-2.5 bg-slate-50 hover:bg-blue-50/50 rounded-lg border border-slate-200 hover:border-blue-300 transition-all text-xs font-medium text-slate-700 flex items-center justify-between gap-2 group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className="text-blue-600 shrink-0" />
                        <span className="truncate text-xs font-semibold text-slate-800">{file.fileName}</span>
                      </div>
                      <ArrowUpRight size={13} className="text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const el = document.getElementById('recent-files-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-1 text-center text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Full Document Library Below</span>
                  <span>↓</span>
                </button>
              </div>
            );
          })()}

          {/* Tools Grid - Adaptive */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as any)}
                className={`flex flex-col lg:flex-row lg:items-center justify-between p-3.5 lg:p-4 rounded-xl transition-all border group relative overflow-hidden ${
                  activeTool === tool.id 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                    : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 relative z-10">
                  <div className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg ${activeTool === tool.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'} transition-all`}>
                    <span className="transition-all">{tool.icon}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-xs">{tool.label}</div>
                    <div className={`text-[11px] font-normal mt-0.5 ${activeTool === tool.id ? 'text-blue-100' : 'text-slate-400'}`}>{tool.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Workbench Display */}
        <div className="lg:col-span-8 xl:col-span-9 min-h-[500px] bg-white rounded-xl p-6 sm:p-8 relative border border-slate-200 shadow-2xs transition-all duration-300">
          {insufficientCreditsNotice && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-bold">
                    Not enough credits ({insufficientCreditsNotice.balance} remaining, {insufficientCreditsNotice.required} required)
                  </p>
                  <p className="text-amber-800">
                    {insufficientCreditsNotice.resetDate
                      ? `Your monthly credits reset on ${new Date(insufficientCreditsNotice.resetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. `
                      : ''}
                    Upgrade your plan in Settings for up to 200 monthly AI credits.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('profile')}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[40px] cursor-pointer"
                  >
                    Upgrade
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInsufficientCreditsNotice(null)}
                  className="p-2 text-amber-700 hover:text-amber-900 rounded-lg cursor-pointer"
                  aria-label="Dismiss credit alert"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {failedExtractionFile && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-bold">
                    Uploaded, could not read text ({failedExtractionFile.file.fileName})
                  </p>
                  <p className="text-rose-800">
                    {failedExtractionFile.error} Your file is saved in your Library — click Retry to try extracting text again.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectRecentFile(failedExtractionFile.file)}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[40px] cursor-pointer"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setFailedExtractionFile(null)}
                  className="p-2 text-rose-700 hover:text-rose-900 rounded-lg cursor-pointer"
                  aria-label="Dismiss extraction alert"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-200 rounded-xl">
               <div className="relative w-16 h-16 mb-6">
                 <div className="absolute inset-0 border-2 border-slate-100 rounded-full"></div>
                 <div className="absolute inset-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                 <div className="absolute inset-2 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                   {ICONS.Sparkles}
                 </div>
               </div>
              <h2 className="text-base font-semibold mb-1 text-slate-900">Synthesizing Course Materials</h2>
              <p className="text-slate-500 max-w-sm text-xs">Transforming your syllabus into structured summaries, cards, and quizzes...</p>
            </div>
          )}

          {activeTool === 'ai' ? (
            <StudyHubAIChat
              profile={profile}
              courses={courses}
              activeCourse={currentCourse}
              activeHub={activeHub}
            />
          ) : !isSessionFileActive && activeTool !== 'library' ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-300 min-h-[380px]">
              <div className="p-4 bg-blue-50 rounded-xl mb-4 text-blue-600 border border-blue-100 shadow-2xs">
                <Sparkles size={28} />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">
                Upload or Select Study Material
              </h3>
              <p className="max-w-md text-slate-500 leading-relaxed text-xs mb-4">
                Upload a document from your device, pick an existing file from your Library, or paste a public link to generate summaries, flashcards, and quizzes.
              </p>
              <button
                type="button"
                onClick={openUploadSheet}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[44px] transition-colors cursor-pointer"
              >
                <Upload size={15} />
                <span>Upload material</span>
              </button>
            </div>
          ) : (
            <div className="page-transition">
            {activeTool === 'summary' && activeHub.summary && (
              <div className="space-y-12">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-10 gap-4">
                  <h3 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-slate-900">Executive Summary</h3>
                  <button onClick={() => generateTool('summary')} className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-blue-700 hover:text-blue-800 transition-all p-3 bg-blue-50 rounded-xl border border-blue-100 cursor-pointer">
                     <span className="group-hover:rotate-180 transition-transform duration-700">{ICONS.RotateCcw}</span> Regenerate — 1 credit
                  </button>
                </div>
                <div className="prose max-w-none text-slate-700 text-lg sm:text-xl leading-[1.7] space-y-8 font-medium prose-slate prose-p:leading-relaxed prose-headings:font-serif">
                  <ReactMarkdown>{activeHub.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {activeTool === 'summary' && !activeHub.summary && fileContent && (
              <div className="flex flex-col items-center justify-center h-[400px] gap-8">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    {ICONS.FileText}
                  </div>
                  <button 
                    onClick={() => generateTool('summary')} 
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors text-xs cursor-pointer min-h-[44px]"
                  >
                    Generate Summary — 1 credit
                  </button>
              </div>
            )}

            {activeTool === 'scanner' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-5 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="p-1 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                        <ScanText size={14} />
                      </span>
                      <span className="text-xs font-semibold text-blue-700">Vision OCR Engine</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Notes &amp; Document Scanner</h3>
                    <p className="text-xs text-slate-500 font-normal">
                      Scan handwritten lecture notes, slides, or diagrams to generate study guides, flashcards &amp; quizzes.
                    </p>
                  </div>

                  {scannedDocResult && (
                    <button
                      onClick={applyScannedDocToHub}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Apply to {currentCourse?.code || 'Course'} Study Hub</span>
                    </button>
                  )}
                </div>

                {/* Scanner Upload / Dropzone */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  <div className="md:col-span-5 space-y-3">
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-5 text-center transition-colors relative group cursor-pointer">
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

                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mx-auto mb-2 border border-blue-100">
                        <Camera size={20} />
                      </div>

                      <h4 className="font-semibold text-slate-900 text-xs">Upload Notes or PDF</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        JPEG, PNG, WEBP, or PDF
                      </p>

                      <button className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium shadow-2xs inline-flex items-center gap-1.5 pointer-events-none">
                        <Upload size={13} />
                        <span>Select File / Capture</span>
                      </button>
                    </div>

                    {/* Live Image Preview if uploaded */}
                    {scannedDocPreview ? (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5">
                        <span className="text-xs font-semibold text-slate-500">Document Preview</span>
                        <div className="max-h-40 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                          <img src={scannedDocPreview} alt="Scanned Preview" className="max-h-40 object-contain" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Scanned Results Display */}
                  <div className="md:col-span-7 space-y-3">
                    {isScanningDoc ? (
                      <div className="h-56 border border-slate-200 bg-slate-50 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <h4 className="font-semibold text-slate-900 text-sm">Vision AI Scanning Notes...</h4>
                        <p className="text-xs text-slate-500 max-w-xs">
                          Transcribing handwriting, formulas, diagrams, and structuring key concepts...
                        </p>
                      </div>
                    ) : scannedDocResult ? (
                      <div className="space-y-3">
                        
                        {/* Result Sub-tabs */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                          <button
                            onClick={() => setScannerSubTab('summary')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${scannerSubTab === 'summary' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Structured Notes
                          </button>
                          <button
                            onClick={() => setScannerSubTab('transcription')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${scannerSubTab === 'transcription' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Verbatim OCR
                          </button>
                          <button
                            onClick={() => setScannerSubTab('flashcards')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${scannerSubTab === 'flashcards' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Cards ({scannedDocResult.flashcards?.length || 0})
                          </button>
                          <button
                            onClick={() => setScannerSubTab('quiz')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${scannerSubTab === 'quiz' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
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
                                <span className="font-semibold text-blue-600 text-[10px] block">Front</span>
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
                          className="w-full h-80 [perspective:1500px] cursor-pointer selection:bg-transparent"
                        >
                          <div className={`relative h-full w-full rounded-xl shadow-xs transition-all duration-300 [transform-style:preserve-3d] ${isCardFlipped ? '[transform:rotateY(180deg)] ring-2 ring-blue-500/20' : 'border border-slate-200'}`}>
                            
                            {/* Front View */}
                            <div className="absolute inset-0 flex flex-col justify-between p-8 bg-white rounded-xl [backface-visibility:hidden]">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-600" />
                                <span className="text-xs font-semibold text-slate-400">Concept Prompt</span>
                              </div>
                              <p className="text-center font-semibold text-base sm:text-lg text-slate-900 leading-snug">
                                {card?.front}
                              </p>
                              <div className="text-center">
                                <span className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg text-xs font-medium text-blue-700 border border-blue-100">Click to reveal answer</span>
                              </div>
                            </div>

                            {/* Back View */}
                            <div className="absolute inset-0 h-full w-full rounded-xl bg-slate-900 p-8 text-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden] flex flex-col justify-between shadow-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-400" />
                                <span className="text-xs font-semibold text-blue-300">Explanation & Insights</span>
                              </div>
                              <p className="text-center font-normal text-sm leading-relaxed max-h-[160px] overflow-y-auto pr-1 text-slate-200">
                                {card?.back}
                              </p>
                              <div className="text-center">
                                <span className="px-3 py-1 bg-white/10 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/20 transition-all">Click to flip front</span>
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
                          className={`p-6 rounded-xl border transition-all duration-200 space-y-4 animate-in fade-in ${
                            hasAnswered 
                              ? selectedOption === q.answer 
                                ? 'bg-emerald-50/30 border-emerald-200 shadow-2xs' 
                                : 'bg-rose-50/20 border-rose-200 shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-600">
                              Question {i + 1}
                            </span>
                            {hasAnswered && (
                              selectedOption === q.answer ? (
                                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-semibold text-emerald-700">Correct</span>
                              ) : (
                                <span className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700">Incorrect</span>
                              )
                            )}
                          </div>

                          <p className="text-sm font-semibold text-slate-900 leading-snug">
                            {q.question}
                          </p>

                          <div className="grid grid-cols-1 gap-2">
                            {q.options.map((opt, optIdx) => {
                              const isSelected = selectedOption === opt;
                              const isCorrect = opt === q.answer;

                              let optionStyle = "bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50";
                              let icon = <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0 flex items-center justify-center text-[10px] text-slate-400" />;

                              if (hasAnswered) {
                                if (isCorrect) {
                                  optionStyle = "bg-emerald-600 text-white border-emerald-600 shadow-2xs";
                                  icon = <Check className="w-4 h-4 text-white shrink-0" />;
                                } else if (isSelected) {
                                  optionStyle = "bg-rose-600 text-white border-rose-600 shadow-2xs";
                                  icon = <X className="w-4 h-4 text-white shrink-0" />;
                                } else {
                                  optionStyle = "bg-slate-50 text-slate-400 border-slate-100 opacity-60 pointer-events-none";
                                  icon = <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" />;
                                }
                              }

                              return (
                                <button 
                                  key={optIdx} 
                                  disabled={hasAnswered}
                                  onClick={() => {
                                    setSelectedAnswers(prev => ({ ...prev, [i]: opt }));
                                  }}
                                  className={`w-full flex items-center justify-between p-3.5 rounded-lg border transition-colors text-left text-xs font-medium select-none ${optionStyle}`}
                                >
                                  <span className="leading-relaxed">{opt}</span>
                                  {icon}
                                </button>
                              );
                            })}
                          </div>

                          {hasAnswered && (
                            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 animate-in slide-in-from-top-2">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                                <HelpCircle size={14} className="text-slate-400" />
                                <span>Explanation</span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                {q.explanation || "This answer is derived directly from your course materials."}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Overall report card banner if the quiz is finished */}
                  {quizFinished && (
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl text-white shadow-sm relative overflow-hidden animate-in fade-in duration-200">
                      <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="space-y-2 text-center md:text-left">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs font-semibold text-emerald-400">
                            Assessment Complete
                          </div>
                          <h4 className="text-xl font-bold tracking-tight text-white">
                            {percentage >= 70 ? "Assessment Passed" : "Assessment Complete"}
                          </h4>
                          <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
                            {percentage === 100 
                              ? "Perfect score! You have synthesized this study block completely." 
                              : percentage >= 70
                                ? "Excellent performance! Strong grasp of the key concepts."
                                : "Good benchmark. Review the study cards to reinforce missed topics."}
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-2 shrink-0 bg-white/5 border border-white/10 p-5 rounded-xl min-w-[160px] w-full md:w-auto">
                          <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center">
                            {percentage >= 70 ? <Trophy size={20} /> : <Award size={20} />}
                          </div>
                          <div className="text-center">
                            <span className="text-2xl font-bold text-white tracking-tight">{correctCount} <span className="text-slate-400 text-base font-normal">/ {totalQuestions}</span></span>
                            <p className="text-xs text-slate-400 mt-0.5">Score: {percentage}%</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-8 border-t border-white/5 mt-8 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
                        <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500 leading-none">KorsIQ Assessment Engine</p>
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
                    <div className="bg-slate-50 border border-slate-200 p-8 rounded-xl text-center space-y-4 max-w-lg mx-auto shadow-2xs">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mx-auto border border-blue-100">
                        <Award size={24} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-semibold text-slate-900">Start Mock Exam</h4>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                          You will have 5 minutes to complete {totalQuestions} questions. Score and detailed corrections are presented upon submission.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTestAnswers({});
                          setTestTimeRemaining(300);
                          setIsTestActive(true);
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        Start 5-Minute Exam
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {activeHub.tests.map((q, i) => {
                        const selectedOption = selectedTestAnswers[i];
                        const isChosen = (opt: string) => selectedOption === opt;

                        return (
                          <div 
                            key={i} 
                            className={`p-6 rounded-xl border transition-all duration-200 space-y-4 ${
                              isTestSubmitted
                                ? selectedOption === q.answer
                                  ? 'bg-emerald-50/20 border-emerald-200'
                                  : 'bg-rose-50/10 border-rose-200'
                                : selectedOption !== undefined
                                  ? 'bg-blue-50/20 border-blue-200'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
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
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                          >
                            Submit Practice Test
                          </button>
                        </div>
                      )}

                      {isTestSubmitted && (
                        <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl text-white shadow-sm relative overflow-hidden animate-in fade-in duration-200">
                          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="space-y-2 text-center md:text-left">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs font-semibold text-emerald-400">
                                Exam Results Finalized
                              </span>
                              <h4 className="text-xl font-bold tracking-tight text-white">
                                {percentage >= 70 ? "Practice Test Passed" : "Simulation Completed"}
                              </h4>
                              <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
                                {percentage === 100 
                                  ? "Astonishing achievement! Flawless accuracy on all questions."
                                  : percentage >= 70
                                    ? "Exceptional results! Well prepared for real examination conditions."
                                    : "Keep polishing! Review missed questions to reinforce conceptual clarity."}
                              </p>
                            </div>

                            <div className="flex flex-col items-center gap-2 shrink-0 bg-white/5 border border-white/10 p-5 rounded-xl min-w-[160px] w-full md:w-auto">
                              <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-lg flex items-center justify-center">
                                {percentage >= 70 ? <Trophy size={20} /> : <Award size={20} />}
                              </div>
                              <div className="text-center">
                                <span className="text-2xl font-bold text-white tracking-tight">{correctCount} <span className="text-slate-400 text-base font-normal">/ {totalQuestions}</span></span>
                                <p className="text-xs text-slate-400 mt-0.5">Score: {percentage}%</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="pt-6 border-t border-white/10 mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
                            <p className="text-xs text-slate-500 font-medium">KorsIQ Exam Simulation</p>
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
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors text-xs cursor-pointer min-h-[44px]"
                  >
                    Generate Practice Test — 2 credits
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
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors text-xs cursor-pointer min-h-[44px]"
                  >
                    Practice Quiz — 2 credits
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
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs transition-colors text-xs cursor-pointer min-h-[44px]"
                  >
                    Flashcards — 2 credits
                  </button>
              </div>
            )}

            {activeTool === 'podcast' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-6 gap-4">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">AI Podcast Overview</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Generate a two-host academic audio overview and transcript from your course material.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={generatePodcastTool}
                    className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer shrink-0"
                  >
                    {activeHub.transcript ? 'Regenerate AI Podcast — 6 credits' : 'AI Podcast — 6 credits'}
                  </button>
                </div>

                {activeHub.podcastUrl && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-slate-700">Audio Stream</p>
                    <audio ref={audioRef} controls src={activeHub.podcastUrl} className="w-full" />
                  </div>
                )}

                {activeHub.transcript ? (
                  <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 max-h-[420px] overflow-y-auto">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Podcast Script</p>
                    <div className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {activeHub.transcript}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[260px] gap-4 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                      <AudioWaveform size={28} />
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Turn your uploaded lecture notes into a structured study dialogue.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTool === 'library' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 border-b border-slate-100 pb-8">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Course Document Library</h3>
                    <p className="text-xs text-slate-500 font-normal">Archive syllabus, textbook chapters, and collective lecture notes.</p>
                  </div>
                  <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 font-medium flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Supabase Storage Connected
                  </div>
                </div>

                {/* Secure File Uploader Area */}
                <div 
                  onClick={() => libraryFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer relative group/libfile ${
                    isUploadingLibrary 
                      ? 'border-blue-300 bg-blue-50/20 pointer-events-none' 
                      : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
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
                    <div className="space-y-2">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 mb-1 mx-auto border border-blue-100">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <h4 className="font-semibold text-xs text-slate-800">Uploading to Storage...</h4>
                      <p className="text-xs text-slate-500">Encrypting and uploading file to storage bucket</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-blue-600 mb-2 mx-auto border border-slate-200 shadow-2xs">
                        <Upload size={18} />
                      </div>
                      <h4 className="font-semibold text-xs text-slate-800">
                        Upload Document to Course Library
                      </h4>
                      <p className="text-xs text-slate-500">
                        Click or drag PDF, TXT, or DOCX documents here
                      </p>
                    </div>
                  )}
                </div>

                {/* Stored Documents List */}
                <div className="space-y-4">
                  {(() => {
                    const allFiles = activeHub.libraryFiles || [];
                    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
                    const recentFiles = allFiles.filter(f => f.timestamp >= cutoff);
                    const displayedRecent = recentFiles.length > 0 ? recentFiles : allFiles.slice(0, 3);
                    const displayedFiles = libraryFilter === 'recent' ? displayedRecent : allFiles;

                    return (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-semibold text-slate-700">
                                {libraryFilter === 'recent' ? 'Recently Uploaded Documents' : 'All Course Materials'}
                              </h4>
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded text-[11px] border border-blue-100">
                                {displayedFiles.length} {displayedFiles.length === 1 ? 'file' : 'files'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {libraryFilter === 'recent'
                                ? 'Filtered to display recently uploaded course files in the main view.'
                                : 'Displaying complete archived course documents.'}
                            </p>
                          </div>

                          {/* Filter Toggle */}
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shrink-0">
                            <button
                              onClick={() => setLibraryFilter('recent')}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                libraryFilter === 'recent'
                                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Recently Uploaded
                            </button>
                            <button
                              onClick={() => setLibraryFilter('all')}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                libraryFilter === 'all'
                                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              All Documents ({allFiles.length})
                            </button>
                          </div>
                        </div>

                        {/* Informative Callout Banner */}
                        <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900">
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-blue-600 shrink-0" />
                            <span>
                              {libraryFilter === 'recent'
                                ? 'Only recently uploaded documents appear in this view. Use the document library below to search across all courses.'
                                : 'Full course list active. You can also search your entire multi-course file archive in the dedicated section below.'}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              const el = document.getElementById('recent-files-section');
                              if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md text-xs transition-colors cursor-pointer shrink-0 shadow-2xs flex items-center gap-1.5"
                          >
                            <span>Full Document Library</span>
                            <ArrowUpRight size={12} />
                          </button>
                        </div>

                        {displayedFiles.length === 0 ? (
                          <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center mx-auto mb-2">
                              <Folder size={18} />
                            </div>
                            <h5 className="font-semibold text-slate-700 text-xs mb-0.5">No Recent Files</h5>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                              No materials uploaded recently for this course. Upload a new document above or switch to 'All Documents'.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {displayedFiles.map((file) => {
                              const isPdf = file.fileName.toLowerCase().endsWith('.pdf') || file.fileType?.includes('pdf');
                              const isDocx = file.fileName.toLowerCase().endsWith('.docx') || file.fileType?.includes('document');
                              const fileColorClass = isPdf 
                                ? 'bg-rose-50 text-rose-600 border-rose-200' 
                                : isDocx 
                                  ? 'bg-blue-50 text-blue-600 border-blue-200' 
                                  : 'bg-slate-100 text-slate-600 border-slate-200';

                              return (
                                <div 
                                  key={file.id} 
                                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex flex-col justify-between h-36 group transition-all shadow-2xs"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-9 h-9 shrink-0 ${fileColorClass} rounded-lg flex items-center justify-center border`}>
                                      <File size={18} />
                                    </div>
                                    <div className="space-y-0.5 flex-1 min-w-0">
                                      <h5 
                                        className="text-xs font-semibold text-slate-800 leading-snug truncate"
                                        title={file.fileName}
                                      >
                                        {file.fileName}
                                      </h5>
                                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <span>{file.fileSize || 'N/A'}</span>
                                        <span>•</span>
                                        <span>{new Date(file.timestamp).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                    <button 
                                      onClick={() => handleDeleteLibraryFile(file.id)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                      title="Delete from Library"
                                    >
                                      <Trash2 size={13} />
                                    </button>

                                    <button 
                                      onClick={() => handleAccessLibraryFile(file)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-md text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                                    >
                                      <Download size={12} /> Access File
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* User Isolated Storage Recent Files */}
      <section id="recent-files-section" className="pt-8 border-t border-slate-100 mt-8 scroll-mt-6">
        <RecentFiles 
          userId={getCurrentUserId() || ''} 
          courses={courses} 
          onSelectFile={handleSelectRecentFile}
          refreshTrigger={refreshFilesTrigger}
        />
      </section>

      {/* 3-Source Upload Sheet Modal (From device / From my Library / From a link) */}
      {showUploadSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowUploadSheet(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-t-2xl sm:rounded-xl p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-[#111827] dark:text-white">
                  {uploadSheetTab === 'library'
                    ? 'Pick from my Library'
                    : uploadSheetTab === 'link'
                    ? 'Import from a link'
                    : 'Upload study material'}
                </h3>
                <p className="text-xs text-[#5B6472] dark:text-slate-400">
                  {currentCourse ? `${currentCourse.code}: ${currentCourse.title}` : 'Attach study material'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadSheet(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close upload options"
              >
                <X size={18} />
              </button>
            </div>

            {uploadSheetTab === 'options' && (
              <div className="space-y-2.5">
                {/* Option 1: From device */}
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadSheet(false);
                    deviceFileInputRef.current?.click();
                  }}
                  className="w-full p-3.5 rounded-xl border border-[#E5E7EB] dark:border-slate-800 hover:border-[#2563EB] hover:bg-blue-50/40 dark:hover:bg-slate-800 flex items-center gap-3.5 text-left transition-colors min-h-[56px] cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center shrink-0">
                    <Upload size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-[#111827] dark:text-white">
                      From device
                    </p>
                    <p className="text-xs text-[#5B6472] dark:text-slate-400">
                      Upload a PDF, Word document, slides, or notes from your phone or computer
                    </p>
                  </div>
                </button>

                {/* Option 2: From my Library */}
                <button
                  type="button"
                  onClick={() => setUploadSheetTab('library')}
                  className="w-full p-3.5 rounded-xl border border-[#E5E7EB] dark:border-slate-800 hover:border-[#2563EB] hover:bg-blue-50/40 dark:hover:bg-slate-800 flex items-center gap-3.5 text-left transition-colors min-h-[56px] cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center shrink-0">
                    <Folder size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-[#111827] dark:text-white">
                      From my Library ({userFiles.length})
                    </p>
                    <p className="text-xs text-[#5B6472] dark:text-slate-400">
                      Attach an existing file from your Library without re-uploading
                    </p>
                  </div>
                </button>

                {/* Option 3: From a link */}
                <button
                  type="button"
                  onClick={() => setUploadSheetTab('link')}
                  className="w-full p-3.5 rounded-xl border border-[#E5E7EB] dark:border-slate-800 hover:border-[#2563EB] hover:bg-blue-50/40 dark:hover:bg-slate-800 flex items-center gap-3.5 text-left transition-colors min-h-[56px] cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#2563EB] flex items-center justify-center shrink-0">
                    <LinkIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-[#111827] dark:text-white">
                      From a link
                    </p>
                    <p className="text-xs text-[#5B6472] dark:text-slate-400">
                      Paste a public URL to an article, syllabus page, or PDF document
                    </p>
                  </div>
                </button>
              </div>
            )}

            {uploadSheetTab === 'library' && (
              <div className="space-y-3">
                {userFiles.length === 0 ? (
                  <div className="p-6 text-center space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-[#E5E7EB] dark:border-slate-700">
                    <p className="text-xs font-semibold text-[#111827] dark:text-white">
                      Your Library is empty
                    </p>
                    <p className="text-xs text-[#5B6472] dark:text-slate-400">
                      Upload a file from your device first and it will appear in your Library.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-[#E5E7EB] dark:divide-slate-800 border border-[#E5E7EB] dark:border-slate-800 rounded-xl">
                    {userFiles.map(file => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => handleAttachFromLibrary(file)}
                        className="w-full px-3.5 py-3 text-left hover:bg-blue-50/60 dark:hover:bg-slate-800 flex items-center justify-between gap-3 transition-colors min-h-[48px] cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className="text-[#2563EB] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#111827] dark:text-white truncate">
                              {file.fileName}
                            </p>
                            <p className="text-[11px] text-[#5B6472] dark:text-slate-400">
                              {file.courseCode ? `${file.courseCode} · ` : ''}{file.fileSize || ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#2563EB] shrink-0">
                          Attach
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setUploadSheetTab('options')}
                    className="px-3 py-2 text-xs font-semibold text-[#5B6472] hover:text-[#111827] min-h-[44px] cursor-pointer"
                  >
                    &larr; Back
                  </button>
                </div>
              </div>
            )}

            {uploadSheetTab === 'link' && (
              <form onSubmit={handleExtractFromLink} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#111827] dark:text-white">
                    Document or webpage URL
                  </span>
                  <input
                    type="url"
                    required
                    autoFocus
                    value={linkUrlInput}
                    onChange={e => setLinkUrlInput(e.target.value)}
                    placeholder="https://example.edu/lecture-notes.pdf"
                    className="w-full px-3 py-2.5 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-[#E5E7EB] dark:border-slate-700 rounded-lg text-[#111827] dark:text-white focus:outline-none focus:border-[#2563EB] min-h-[44px]"
                  />
                </label>
                {linkErrorMsg && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2" role="alert">
                    {linkErrorMsg}
                  </p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkErrorMsg(null);
                      setUploadSheetTab('options');
                    }}
                    className="px-3 py-2 text-xs font-semibold text-[#5B6472] hover:text-[#111827] min-h-[44px] cursor-pointer"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="submit"
                    disabled={!linkUrlInput.trim()}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold rounded-lg min-h-[44px] cursor-pointer"
                  >
                    Import link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyHub;
