import React, { useState, useRef, useEffect } from 'react';
import { Course, StudySession, UserProfile, Difficulty } from '../types';
import { DBService } from '../services/db';
import { GeminiService } from '../services/gemini';
import { getCurrentUserId, getAccessToken } from '../lib/supabase';
import {
  calculateSemesterGpaNeeded,
  calculateExamMarkNeeded,
  suggestRealisticGradeSpread,
  DEFAULT_GRADE_SCALE,
  SemesterGpaResult,
  CourseAimResult
} from '../lib/aimHigherMath';
import ReactMarkdown from 'react-markdown';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  Calendar,
  ArrowRight,
  TrendingUp,
  Target,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Loader2,
  Clock,
  BookOpen,
  Edit2
} from 'lucide-react';

interface CourseOutlineSectionProps {
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  schedule: StudySession[];
  setSchedule: React.Dispatch<React.SetStateAction<StudySession[]>>;
  profile: UserProfile;
  onUpdateProfile?: (updated: Partial<UserProfile>) => void;
  addNotification: (type: any, title?: any, message?: any, link?: any) => void;
  onOpenHub?: (courseId: string) => void;
  onNavigateToTimetable?: () => void;
}

interface ParsedCourseDraft {
  id: string;
  code: string;
  title: string;
  units: number;
  difficulty: Difficulty;
  topics: string[];
  caScore?: number;
  examWeight?: number;
  examDate?: string;
  isExisting?: boolean;
}

export const CourseOutlineSection: React.FC<CourseOutlineSectionProps> = ({
  courses,
  setCourses,
  schedule,
  setSchedule,
  profile,
  onUpdateProfile,
  addNotification,
  onNavigateToTimetable
}) => {
  const userId = getCurrentUserId() || (profile as any)?.id || '';

  // Step state: 1 = Upload, 2 = Review, 3 = Plan
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(courses.length > 0 ? 2 : 1);
  const [showAimHigherPanel, setShowAimHigherPanel] = useState<boolean>(true);

  // STEP 1: Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState<string>('');
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // STEP 2: Review state
  const [reviewCourses, setReviewCourses] = useState<ParsedCourseDraft[]>(() => {
    return courses.map(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      units: c.units,
      difficulty: c.difficulty,
      topics: c.topics || [],
      caScore: c.caScore,
      examWeight: c.examWeight || 70,
      examDate: c.examDate,
      isExisting: true
    }));
  });
  const [isSavingCourses, setIsSavingCourses] = useState<boolean>(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);

  // STEP 3: Plan state
  const [examStartDate, setExamStartDate] = useState<string>(profile.semesterEnd || '');
  const [studyDaysPerWeek, setStudyDaysPerWeek] = useState<number>(5);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  const [proposedSchedule, setProposedSchedule] = useState<StudySession[] | null>(null);
  const [isApprovingPlan, setIsApprovingPlan] = useState<boolean>(false);
  const [planApprovedMsg, setPlanApprovedMsg] = useState<string | null>(null);

  // AIM HIGHER PANEL STATE
  const [currentCgpaInput, setCurrentCgpaInput] = useState<string>('3.80');
  const [earnedUnitsInput, setEarnedUnitsInput] = useState<string>('60');
  const [targetCgpaInput, setTargetCgpaInput] = useState<string>(
    profile.targetCGPA ? String(profile.targetCGPA) : '4.00'
  );
  const [gradingScale, setGradingScale] = useState<number>(
    typeof profile.gradingScale === 'number' ? profile.gradingScale : 5.0
  );

  // "Explain my plan" state
  const [isExplainingPlan, setIsExplainingPlan] = useState<boolean>(false);
  const [planExplanation, setPlanExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Keep review courses in sync if parent courses list changes externally
  useEffect(() => {
    if (reviewCourses.length === 0 && courses.length > 0) {
      setReviewCourses(courses.map(c => ({
        id: c.id,
        code: c.code,
        title: c.title,
        units: c.units,
        difficulty: c.difficulty,
        topics: c.topics || [],
        caScore: c.caScore,
        examWeight: c.examWeight || 70,
        examDate: c.examDate,
        isExisting: true
      })));
    }
  }, [courses]);

  // --------------------------------------------------------------------------
  // CLIENT-SIDE FILE HANDLING & COMPRESSION
  // --------------------------------------------------------------------------

  const compressImageFile = async (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1800;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = maxDim / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Could not initialize canvas context for photo compression.'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const base64 = dataUrl.split(',')[1] || '';
            resolve({ base64, mimeType: 'image/jpeg' });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Could not decode the image file.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read the file from your device.'));
      reader.readAsDataURL(file);
    });
  };

  const processFileToBase64 = async (file: File): Promise<{ base64: string; mimeType: string }> => {
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
    const MAX_BYTES = 3 * 1024 * 1024; // 3 MB raw limit

    if (isImage) {
      // Compress photos on the device before sending
      return await compressImageFile(file);
    }

    if (file.size > MAX_BYTES) {
      throw new Error(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please upload a file under 3 MB.`);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.split(',')[1] || '';
        resolve({ base64, mimeType: file.type || 'application/pdf' });
      };
      reader.onerror = () => reject(new Error('Failed to read file from your device.'));
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const newFiles = Array.from(files);

    // Immediate device size pre-check
    for (const f of newFiles) {
      const isImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name);
      if (!isImage && f.size > 3 * 1024 * 1024) {
        setUploadError(`"${f.name}" exceeds 3 MB. Please upload a smaller PDF or Word file.`);
        return;
      }
    }

    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // STEP 1: EXTRACT & PARSE
  const handleExtractAndParse = async () => {
    setUploadError(null);
    if (selectedFiles.length === 0 && (!pastedText || pastedText.trim().length < 15)) {
      setUploadError('Please select a course outline file (PDF, Word, photo) or paste syllabus text.');
      return;
    }

    setIsProcessingUpload(true);
    let extractedTextCombined = pastedText.trim();

    try {
      const token = await getAccessToken();

      // Extract each file via /api/files/extract
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProcessingStatus(`Reading file ${i + 1} of ${selectedFiles.length}: ${file.name}...`);

        const { base64, mimeType } = await processFileToBase64(file);

        setProcessingStatus(`Extracting text from ${file.name}...`);
        const extractRes = await fetch('/api/files/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: mimeType,
            contentBase64: base64
          })
        });

        const extractData = await extractRes.json();
        if (!extractData.success) {
          throw new Error(extractData.error || `Could not read text from "${file.name}". Try a clearer photo or paste the text directly.`);
        }

        if (extractData.extractedText) {
          extractedTextCombined += `\n\n--- Document: ${file.name} ---\n` + extractData.extractedText;
        }
      }

      if (!extractedTextCombined || extractedTextCombined.trim().length < 15) {
        throw new Error('No readable syllabus content was extracted. Please paste the course outline text directly.');
      }

      setProcessingStatus('Analyzing syllabus and extracting courses, units, and topics...');

      // Call POST /api/ai/course-outline (no credits, rate-limited standard feature)
      const parseResult = await GeminiService.parseCourseOutline(extractedTextCombined);

      if (!parseResult.success || !parseResult.courses || parseResult.courses.length === 0) {
        throw new Error(parseResult.error || 'No courses found in this syllabus. Check the text and try again.');
      }

      // Convert parsed courses to review draft items
      const existingCodeMap = new Map(courses.map(c => [c.code.trim().toUpperCase(), c]));
      const newDrafts: ParsedCourseDraft[] = parseResult.courses.map(c => {
        const existing = existingCodeMap.get(c.code.trim().toUpperCase());
        return {
          id: existing ? existing.id : `course_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: c.code.trim(),
          title: c.title.trim(),
          units: typeof c.units === 'number' && c.units >= 1 && c.units <= 6 ? c.units : 3,
          difficulty: existing?.difficulty || Difficulty.MEDIUM,
          topics: c.topics && c.topics.length > 0 ? c.topics : (existing?.topics || []),
          caScore: existing?.caScore,
          examWeight: existing?.examWeight || 70,
          examDate: c.examDate || existing?.examDate,
          isExisting: !!existing
        };
      });

      setReviewCourses(newDrafts);
      setCurrentStep(2);
      addNotification('success', 'Outline Parsed', `Found ${newDrafts.length} courses from your outline.`);
    } catch (err: any) {
      console.error('Course outline parsing error:', err);
      setUploadError(err?.message || 'Failed to process course outline. Please try pasting the syllabus text.');
    } finally {
      setIsProcessingUpload(false);
      setProcessingStatus('');
    }
  };

  // --------------------------------------------------------------------------
  // STEP 2: REVIEW ACTIONS
  // --------------------------------------------------------------------------

  const handleUpdateCourseDraft = (id: string, updates: Partial<ParsedCourseDraft>) => {
    setReviewCourses(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAddTopic = (courseId: string, topicText: string) => {
    const trimmed = topicText.trim();
    if (!trimmed) return;
    setReviewCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const cur = c.topics || [];
      if (cur.includes(trimmed)) return c;
      return { ...c, topics: [...cur, trimmed].slice(0, 15) };
    }));
  };

  const handleRemoveTopic = (courseId: string, indexToRemove: number) => {
    setReviewCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      return { ...c, topics: c.topics.filter((_, idx) => idx !== indexToRemove) };
    }));
  };

  const handleRemoveCourseRow = async (id: string) => {
    const draft = reviewCourses.find(c => c.id === id);
    if (!draft) return;

    setReviewCourses(prev => prev.filter(c => c.id !== id));

    // If already saved to database, delete must persist
    if (draft.isExisting && userId) {
      try {
        await DBService.deleteCourse(userId, id);
        setCourses(prev => prev.filter(c => c.id !== id));
        addNotification('info', 'Course Deleted', `${draft.code} removed from your courses.`);
      } catch (err) {
        console.warn('Failed to delete course row:', err);
      }
    }
  };

  const handleAddBlankCourse = () => {
    const newCourse: ParsedCourseDraft = {
      id: `course_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: '',
      title: '',
      units: 3,
      difficulty: Difficulty.MEDIUM,
      topics: [],
      examWeight: 70,
      isExisting: false
    };
    setReviewCourses(prev => [...prev, newCourse]);
  };

  const handleSaveCoursesToDatabase = async () => {
    if (!userId) {
      setUploadError('Please log in to save your courses.');
      return;
    }

    const validCourses = reviewCourses.filter(c => c.code.trim().length > 0);
    if (validCourses.length === 0) {
      setUploadError('Please specify at least one course code.');
      return;
    }

    setIsSavingCourses(true);
    setReviewSuccessMsg(null);

    try {
      // Deduplicate: merge review courses with existing courses by code
      const mergedMap = new Map<string, Course>();

      // Keep existing courses
      for (const ec of courses) {
        mergedMap.set(ec.code.trim().toUpperCase(), ec);
      }

      // Update or add from review
      for (const rc of validCourses) {
        const key = rc.code.trim().toUpperCase();
        const existing = mergedMap.get(key);
        mergedMap.set(key, {
          id: existing ? existing.id : rc.id,
          code: rc.code.trim(),
          title: rc.title.trim() || rc.code.trim(),
          units: rc.units || 3,
          difficulty: rc.difficulty,
          topics: rc.topics,
          caScore: rc.caScore,
          examWeight: rc.examWeight || 70,
          examDate: rc.examDate
        });
      }

      const finalList = Array.from(mergedMap.values());
      const res = await DBService.saveCourses(userId, finalList);

      if (res && res.error) {
        throw new Error(res.error.message || 'Failed to save courses.');
      }

      setCourses(finalList);
      setReviewSuccessMsg(`Saved ${finalList.length} courses to your profile!`);
      addNotification('success', 'Courses Saved', `${finalList.length} courses are now saved.`);

      // Update review courses existing flags
      setReviewCourses(prev => prev.map(c => ({ ...c, isExisting: true })));

      // Advance to Step 3 (Plan)
      setCurrentStep(3);
    } catch (err: any) {
      console.error('Save courses error:', err);
      setUploadError(err?.message || 'Could not save courses.');
    } finally {
      setIsSavingCourses(false);
    }
  };

  // --------------------------------------------------------------------------
  // STEP 3: PLAN (Nothing scheduled until approved)
  // --------------------------------------------------------------------------

  const handleBuildStudyPlan = async () => {
    if (courses.length === 0 && reviewCourses.length === 0) {
      setUploadError('Please review and save your courses first.');
      return;
    }

    setIsGeneratingPlan(true);
    setPlanApprovedMsg(null);

    try {
      const activeCourses = courses.length > 0 ? courses : reviewCourses.map(rc => ({
        id: rc.id,
        code: rc.code,
        title: rc.title,
        units: rc.units,
        difficulty: rc.difficulty,
        topics: rc.topics
      }));

      // Call existing generateSchedule (POST /api/ai/schedule)
      const rawSchedule = await GeminiService.generateSchedule(activeCourses, profile.university || 'University');

      if (!Array.isArray(rawSchedule) || rawSchedule.length === 0) {
        throw new Error('AI could not produce a weekly schedule. Please verify your internet connection.');
      }

      const formatted: StudySession[] = rawSchedule.map((s: any) => ({
        id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        courseId: s.courseId || activeCourses[0]?.id || '',
        day: s.day || 'Monday',
        duration: typeof s.duration === 'number' ? s.duration : 60,
        mode: s.mode || 'Practice'
      }));

      setProposedSchedule(formatted);
      addNotification('info', 'Study Plan Generated', 'Review your proposed schedule below and click Approve to activate it.');
    } catch (err: any) {
      console.error('Plan generation failed:', err);
      setUploadError(err?.message || 'Could not generate plan.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!proposedSchedule || proposedSchedule.length === 0 || !userId) return;

    setIsApprovingPlan(true);
    try {
      const res = await DBService.saveSchedule(userId, proposedSchedule);
      if (res && res.error) {
        throw new Error(res.error.message || 'Failed to save timetable schedule.');
      }

      setSchedule(proposedSchedule);
      setPlanApprovedMsg('Plan approved! Your weekly study schedule has been added to your Timetable.');
      addNotification('success', 'Plan Approved', 'Your weekly study schedule is active in your Timetable.');
    } catch (err: any) {
      console.error('Plan approval failed:', err);
      setUploadError(err?.message || 'Could not save schedule.');
    } finally {
      setIsApprovingPlan(false);
    }
  };

  // --------------------------------------------------------------------------
  // AIM HIGHER PANEL (Deterministic Math - Zero Credits)
  // --------------------------------------------------------------------------

  const currentCgpa = parseFloat(currentCgpaInput) || 0;
  const earnedUnits = parseFloat(earnedUnitsInput) || 0;
  const targetCgpa = parseFloat(targetCgpaInput) || 0;

  // Active semester units from saved or review courses
  const activeSemesterCourses = courses.length > 0 ? courses : reviewCourses;
  const semesterUnits = activeSemesterCourses.reduce((sum, c) => sum + (c.units || 0), 0) || 18;

  // Live deterministic calculation
  const semGpaResult: SemesterGpaResult = calculateSemesterGpaNeeded(
    currentCgpa,
    earnedUnits,
    targetCgpa,
    semesterUnits,
    gradingScale
  );

  // Realistic grade spread suggested
  const gradeSpread: CourseAimResult[] = suggestRealisticGradeSpread(
    activeSemesterCourses.map(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      units: c.units || 3,
      difficulty: c.difficulty,
      caScore: c.caScore,
      examWeight: c.examWeight || 70
    })),
    semGpaResult.isReachable ? semGpaResult.neededGpa : gradingScale,
    DEFAULT_GRADE_SCALE
  );

  const handleUpdateCourseCa = async (courseId: string, newCaScore: number) => {
    // Update local state
    setReviewCourses(prev => prev.map(c => c.id === courseId ? { ...c, caScore: newCaScore } : c));
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, caScore: newCaScore } : c));

    // Persist to database if course exists
    if (userId) {
      const existing = courses.find(c => c.id === courseId);
      if (existing) {
        await DBService.saveCourse(userId, { ...existing, caScore: newCaScore });
      }
    }
  };

  const handleUpdateCourseExamWeight = async (courseId: string, newWeight: number) => {
    setReviewCourses(prev => prev.map(c => c.id === courseId ? { ...c, examWeight: newWeight } : c));
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, examWeight: newWeight } : c));

    if (userId) {
      const existing = courses.find(c => c.id === courseId);
      if (existing) {
        await DBService.saveCourse(userId, { ...existing, examWeight: newWeight });
      }
    }
  };

  // Optional "Explain my plan" button (Free academic chat, zero credit charge)
  const handleExplainPlan = async () => {
    setIsExplainingPlan(true);
    setExplainError(null);
    setPlanExplanation(null);

    try {
      const prompt = `Student Academic Target Breakdown:
- Current CGPA: ${currentCgpa.toFixed(2)} (${earnedUnits} credit units completed)
- Target CGPA: ${targetCgpa.toFixed(2)} (Semester GPA needed: ${semGpaResult.neededGpa.toFixed(2)} on a ${gradingScale}.0 scale)
- Semester Courses (${semesterUnits} units):
${activeSemesterCourses.map(c => `- ${c.code}: ${c.title} (${c.units} units, CA Score: ${c.caScore ?? 'Not set'}/${100 - (c.examWeight || 70)}, Exam weight: ${c.examWeight || 70}). Topics: ${c.topics?.join(', ') || 'General'}`).join('\n')}

Please provide a concise, high-yield academic battle plan:
1. **Strategic Priorities**: Which high-unit courses need the highest focus and why.
2. **CA vs Exam Strategy**: How to turn the continuous assessment into safe exam margins.
3. **Weekly Study Rhythm**: How to conquer the outline topics efficiently.
Use clear markdown with bold headers and actionable bullet points.`;

      const response = await GeminiService.sendAcademicChat(
        [{ role: 'user', content: prompt }],
        {
          currentCgpa,
          targetCgpa,
          gradingScale,
          courses: activeSemesterCourses
        }
      );

      if (!response || !response.text) {
        throw new Error('Unable to retrieve academic explanation right now.');
      }

      setPlanExplanation(response.text);
    } catch (err: any) {
      console.error('Explain plan error:', err);
      setExplainError(err?.message || 'Failed to explain plan. Please try again.');
    } finally {
      setIsExplainingPlan(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  const renderBadge = (status: 'Secured' | 'Needed' | 'Stretch' | 'Not reachable') => {
    switch (status) {
      case 'Secured':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 size={12} />
            Secured
          </span>
        );
      case 'Needed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            Needed
          </span>
        );
      case 'Stretch':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Stretch
          </span>
        );
      case 'Not reachable':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
            Not reachable
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 3-Step Wizard Navigation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 sm:p-3">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setCurrentStep(1)}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              currentStep === 1
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">1</span>
            <span>Upload</span>
          </button>

          <button
            onClick={() => setCurrentStep(2)}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              currentStep === 2
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">2</span>
            <span>Review</span>
          </button>

          <button
            onClick={() => setCurrentStep(3)}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              currentStep === 3
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Plan</span>
          </button>
        </div>
      </div>

      {/* Inline Notifications & Errors (never alert(), never stuck spinner) */}
      {uploadError && (
        <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-start gap-3 text-red-800 dark:text-red-200 text-xs">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Notice</p>
            <p className="mt-0.5">{uploadError}</p>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors"
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {reviewSuccessMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-lg p-4 flex items-center justify-between gap-3 text-emerald-800 dark:text-emerald-200 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{reviewSuccessMsg}</span>
          </div>
          <button
            onClick={() => setReviewSuccessMsg(null)}
            className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 1: UPLOAD                                                       */}
      {/* ==================================================================== */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Step 1: Upload Course Outline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Drop your syllabus document (PDF, Word, or photo) or paste the outline text below. KorsIQ will automatically detect your courses, credit units, and topic modules.
            </p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFilesSelect(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,image/*"
              className="hidden"
              onChange={(e) => handleFilesSelect(e.target.files)}
            />
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UploadCloud size={24} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                Click to browse or drag and drop your outline
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                PDF, Word (.docx), or photos up to 3 MB (several files supported)
              </p>
            </div>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Selected Documents ({selectedFiles.length}):
              </p>
              <div className="space-y-1.5">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-blue-600 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paste Text Area */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Or Paste Outline / Syllabus Text
            </label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste course descriptions, weekly schedule, or syllabus text here..."
              rows={5}
              className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 font-sans"
            />
          </div>

          {/* Processing Status / Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            {processingStatus ? (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <Loader2 size={16} className="animate-spin" />
                <span>{processingStatus}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Free feature • No AI credits deducted
              </div>
            )}

            <button
              onClick={handleExtractAndParse}
              disabled={isProcessingUpload || (selectedFiles.length === 0 && pastedText.trim().length < 15)}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isProcessingUpload ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Analyzing Outline...</span>
                </>
              ) : (
                <>
                  <span>Extract Courses</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 2: REVIEW (Student stays in control)                             */}
      {/* ==================================================================== */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Step 2: Review & Edit Courses
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Verify courses, units, and syllabus topics. You can edit values, add new courses, or remove unwanted rows.
              </p>
            </div>
            <button
              onClick={handleAddBlankCourse}
              className="min-h-[44px] px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>+ Add Course</span>
            </button>
          </div>

          {/* Courses Table / Mobile Cards */}
          {reviewCourses.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
              <BookOpen size={32} className="mx-auto text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No courses added yet. Upload an outline in Step 1 or add a course manually.
              </p>
              <button
                onClick={() => setCurrentStep(1)}
                className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Go to Upload
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewCourses.map((c, idx) => (
                <div
                  key={c.id || idx}
                  className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3"
                >
                  {/* Top row: Code, Title, Units, Difficulty, Delete */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Course Code
                      </label>
                      <input
                        type="text"
                        value={c.code}
                        onChange={(e) => handleUpdateCourseDraft(c.id, { code: e.target.value.toUpperCase() })}
                        placeholder="e.g. CSC 201"
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Course Title
                      </label>
                      <input
                        type="text"
                        value={c.title}
                        onChange={(e) => handleUpdateCourseDraft(c.id, { title: e.target.value })}
                        placeholder="e.g. Data Structures & Algorithms"
                        className="w-full min-h-[44px] px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Units (1-6)
                      </label>
                      <select
                        value={c.units}
                        onChange={(e) => handleUpdateCourseDraft(c.id, { units: parseInt(e.target.value, 10) || 3 })}
                        className="w-full min-h-[44px] px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6].map(u => (
                          <option key={u} value={u}>{u} {u === 1 ? 'Unit' : 'Units'}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Difficulty
                      </label>
                      <select
                        value={c.difficulty}
                        onChange={(e) => handleUpdateCourseDraft(c.id, { difficulty: e.target.value as Difficulty })}
                        className="w-full min-h-[44px] px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white cursor-pointer"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>

                    <div className="sm:col-span-1 flex items-end justify-end">
                      <button
                        onClick={() => handleRemoveCourseRow(c.id)}
                        className="min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors"
                        title="Delete course"
                        aria-label="Delete course"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Topics Tags List */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Topics ({c.topics.length})
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 items-center">
                      {c.topics.map((topic, tIdx) => (
                        <span
                          key={tIdx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                        >
                          <span>{topic}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTopic(c.id, tIdx)}
                            className="text-slate-400 hover:text-red-500 cursor-pointer ml-0.5"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}

                      {/* Add topic input */}
                      <input
                        type="text"
                        placeholder="+ Add topic (Enter)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTopic(c.id, e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setCurrentStep(1)}
              className="text-xs text-slate-600 dark:text-slate-400 hover:underline min-h-[44px] flex items-center cursor-pointer"
            >
              ← Back to Upload
            </button>

            <button
              onClick={handleSaveCoursesToDatabase}
              disabled={isSavingCourses || reviewCourses.length === 0}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              {isSavingCourses ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving Courses...</span>
                </>
              ) : (
                <>
                  <span>Add to my courses</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STEP 3: PLAN (Nothing scheduled until approved)                      */}
      {/* ==================================================================== */}
      {currentStep === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Step 3: Build & Approve Study Plan
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generate a weekly study schedule tailored to your courses and topics. Nothing is scheduled until you approve it.
            </p>
          </div>

          {/* Optional Inputs: Exam Start Date & Study Days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Exam Start Date (Optional)
              </label>
              <input
                type="date"
                value={examStartDate}
                onChange={(e) => setExamStartDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Study Days Per Week: {studyDaysPerWeek} Days
              </label>
              <div className="flex gap-1.5 pt-1">
                {[3, 4, 5, 6, 7].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setStudyDaysPerWeek(num)}
                    className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      studyDaysPerWeek === num
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {num}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Build Button */}
          {!proposedSchedule && (
            <div className="flex justify-end">
              <button
                onClick={handleBuildStudyPlan}
                disabled={isGeneratingPlan}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isGeneratingPlan ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Analyzing Outline & Generating Plan...</span>
                  </>
                ) : (
                  <>
                    <Calendar size={16} />
                    <span>Build my study plan</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Proposed Plan Preview & Approval */}
          {proposedSchedule && proposedSchedule.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Proposed Weekly Plan ({proposedSchedule.length} sessions)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Review the allocated study blocks before activating them in your timetable.
                  </p>
                </div>

                <button
                  onClick={handleBuildStudyPlan}
                  disabled={isGeneratingPlan}
                  className="text-xs text-blue-600 hover:underline min-h-[44px] flex items-center"
                >
                  Regenerate
                </button>
              </div>

              {/* Sessions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {proposedSchedule.map((session, sIdx) => {
                  const course = courses.find(c => c.id === session.courseId) || reviewCourses.find(c => c.id === session.courseId);
                  return (
                    <div
                      key={session.id || sIdx}
                      className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-600 font-mono">
                          {course ? course.code : 'COURSE'}
                        </span>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {session.day}
                        </span>
                      </div>
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {course?.title || 'Study Session'}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {session.duration} mins
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                          {session.mode}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Approval Success or Approve Button */}
              {planApprovedMsg ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="shrink-0" />
                    <span className="font-semibold">{planApprovedMsg}</span>
                  </div>
                  {onNavigateToTimetable && (
                    <button
                      onClick={onNavigateToTimetable}
                      className="min-h-[44px] px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
                    >
                      View in Timetable →
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleApprovePlan}
                    disabled={isApprovingPlan}
                    className="w-full sm:w-auto min-h-[44px] px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    {isApprovingPlan ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Saving to Timetable...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Approve plan</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* AIM HIGHER PANEL (Deterministic Math - Zero Credits)                 */}
      {/* ==================================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Aim Higher: CGPA Target & Exam Marks
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Deterministic calculations based on your syllabus credit units and continuous assessment marks.
            </p>
          </div>

          <button
            onClick={handleExplainPlan}
            disabled={isExplainingPlan}
            className="min-h-[44px] px-4 py-2 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            {isExplainingPlan ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Analyzing Strategy...</span>
              </>
            ) : (
              <>
                <Info size={14} />
                <span>Explain plan</span>
              </>
            )}
          </button>
        </div>

        {/* Explain My Plan Modal / Expandable View */}
        {planExplanation && (
          <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Info size={14} />
                Academic Strategy Breakdown
              </span>
              <button
                onClick={() => setPlanExplanation(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="prose prose-xs dark:prose-invert max-w-none text-xs text-slate-800 dark:text-slate-200">
              <ReactMarkdown>{planExplanation}</ReactMarkdown>
            </div>
          </div>
        )}

        {explainError && (
          <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs rounded-lg flex items-center justify-between">
            <span>{explainError}</span>
            <button onClick={() => setExplainError(null)} className="p-1"><X size={14} /></button>
          </div>
        )}

        {/* Target Inputs: Current CGPA, Earned Units, Target CGPA, Scale */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Current CGPA
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={gradingScale}
              value={currentCgpaInput}
              onChange={(e) => setCurrentCgpaInput(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Earned Units
            </label>
            <input
              type="number"
              min="0"
              max="240"
              value={earnedUnitsInput}
              onChange={(e) => setEarnedUnitsInput(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Target CGPA
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={gradingScale}
              value={targetCgpaInput}
              onChange={(e) => {
                setTargetCgpaInput(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && onUpdateProfile) {
                  onUpdateProfile({ targetCGPA: val });
                }
              }}
              className="w-full min-h-[44px] px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Grading Scale
            </label>
            <select
              value={gradingScale}
              onChange={(e) => setGradingScale(parseFloat(e.target.value) || 5.0)}
              className="w-full min-h-[44px] px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white cursor-pointer"
            >
              <option value="5.0">5.0 Scale (A: 70+)</option>
              <option value="4.0">4.0 Scale (A: 70+)</option>
            </select>
          </div>
        </div>

        {/* Live Calculation Result Banner */}
        <div className={`p-4 rounded-lg border text-xs space-y-1.5 ${
          !semGpaResult.isReachable
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900 text-amber-900 dark:text-amber-200'
            : semGpaResult.alreadyReached
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
            : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-950 dark:text-blue-100'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">
              {!semGpaResult.isReachable ? (
                `Target ${targetCgpa.toFixed(2)} requires GPA ${semGpaResult.neededGpa.toFixed(2)} (Exceeds ${gradingScale.toFixed(2)} Scale)`
              ) : semGpaResult.alreadyReached ? (
                `Target Already Met: Current CGPA (${currentCgpa.toFixed(2)}) ≥ Target (${targetCgpa.toFixed(2)})`
              ) : (
                `Semester GPA Needed: ${semGpaResult.neededGpa.toFixed(2)}`
              )}
            </span>
            <span className="font-mono text-[11px] font-semibold">
              {semesterUnits} Semester Units
            </span>
          </div>

          <p className="text-[11px]">
            {!semGpaResult.isReachable ? (
              `To reach ${targetCgpa.toFixed(2)} this semester is mathematically impossible. The maximum reachable CGPA this semester with straight A's is ${semGpaResult.maxReachableCgpa.toFixed(2)}.`
            ) : semGpaResult.alreadyReached ? (
              `Keep up your study momentum! Scoring a ${currentCgpa.toFixed(2)} this semester protects your standing.`
            ) : (
              `With ${earnedUnits} earned units and ${semesterUnits} semester units, you need quality points of ${(semGpaResult.neededGpa * semesterUnits).toFixed(1)} this semester.`
            )}
          </p>
        </div>

        {/* Per-Course CA and Exam Marks Needed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Per-Course Targets &amp; Continuous Assessment
            </h3>
            <span className="text-[11px] text-slate-500">
              Default split: CA 30 / Exam 70
            </span>
          </div>

          {gradeSpread.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-dashed rounded-lg">
              Add courses above to calculate target exam marks.
            </p>
          ) : (
            <div className="space-y-2.5">
              {gradeSpread.map((item) => {
                const originalCourse = activeSemesterCourses.find(c => c.id === item.courseId);
                const caScore = originalCourse?.caScore ?? 0;
                const examWeight = originalCourse?.examWeight ?? 70;

                return (
                  <div
                    key={item.courseId}
                    className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 text-xs space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blue-600 font-mono text-sm">
                          {item.code}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {item.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                          {item.units} {item.units === 1 ? 'Unit' : 'Units'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          {item.difficulty}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Target: {item.targetGrade} ({item.gradeThreshold}+ marks)
                        </span>
                        {renderBadge(item.status)}
                      </div>
                    </div>

                    {/* CA Input & Exam Needed Output */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                      <div className="sm:col-span-4 flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          CA Score:
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={100 - examWeight}
                          value={caScore || ''}
                          placeholder="0"
                          onChange={(e) => handleUpdateCourseCa(item.courseId, parseFloat(e.target.value) || 0)}
                          className="w-20 min-h-[36px] px-2.5 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                        />
                        <span className="text-[11px] text-slate-400">/ {100 - examWeight}</span>
                      </div>

                      <div className="sm:col-span-8 flex items-center justify-between sm:justify-end gap-3">
                        <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                          Exam Mark Needed:
                        </span>
                        <span className={`font-bold font-mono text-xs px-2.5 py-1 rounded-md ${
                          item.status === 'Secured'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : item.status === 'Not reachable'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : item.status === 'Stretch'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {item.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseOutlineSection;
