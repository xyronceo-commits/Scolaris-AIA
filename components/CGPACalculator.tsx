import React, { useState, useEffect, useRef } from 'react';
import { ICONS } from '../constants';
import { 
  Trash2, Edit2, Check, Target, Sparkles, Upload, FileText, Calendar, 
  Clock, BookOpen, AlertCircle, CheckCircle2, ChevronRight, MessageSquare, 
  Send, RefreshCw, Layers, Award, Bell, Download, ExternalLink, ShieldAlert,
  Brain, RotateCcw, PenTool, BookMarked, HelpCircle, ArrowRight, X, AlertTriangle
} from 'lucide-react';
import { 
  UserProfile, Course, StudySession, AppNotification, AppState, 
  CGPASemester, CGPACourseRecord, CGPAAcademicConfig, AICgpaAnalysisResult, 
  AIStudyTimetableEntry, AIRepetitionPlan 
} from '../types';
import { GeminiService } from '../services/gemini';
import { DBService } from '../services/db';

interface CGPACalculatorProps {
  profile?: UserProfile | null;
  onUpdateProfile?: (profile: UserProfile) => void;
  courses?: Course[];
  schedule?: StudySession[];
  setSchedule?: React.Dispatch<React.SetStateAction<StudySession[]>>;
  addNotification?: (type: AppNotification['type'], title: string, message: string, link?: AppState) => void;
  onOpenHub?: (courseId: string) => void;
}

const READING_TECHNIQUES_INFO = [
  {
    name: 'Active Recall',
    tag: 'Memory Retention',
    icon: Brain,
    desc: 'Testing knowledge from memory without looking at notes. Strengthens neural connections.',
    whenToUse: 'After completing reading modules, before problem sets, and during flashcard reviews.'
  },
  {
    name: 'Spaced Repetition',
    tag: 'Long-term Storage',
    icon: RotateCcw,
    desc: 'Reviewing information at increasing intervals (e.g. Day 1, Day 3, Day 7, Day 14).',
    whenToUse: 'For courses with high conceptual volume, definitions, and formulas.'
  },
  {
    name: 'Feynman Technique',
    tag: 'Deep Comprehension',
    icon: HelpCircle,
    desc: 'Explaining a complex topic in the simplest possible language as if teaching a beginner.',
    whenToUse: 'When encountering abstract theoretical topics or difficult course chapters.'
  },
  {
    name: 'Past Question Practice',
    tag: 'Exam Readiness',
    icon: PenTool,
    desc: 'Solving previous examination questions under simulated timed conditions.',
    whenToUse: 'Final 4-6 weeks before midterm and final examinations.'
  },
  {
    name: 'Pomodoro Technique',
    tag: 'Focus Optimization',
    icon: Clock,
    desc: '25-minute uninterrupted deep focus sessions followed by 5-minute structured recovery breaks.',
    whenToUse: 'During dense textbook reading sessions and long assignment drafts.'
  },
  {
    name: 'Practice-Based Learning',
    tag: 'Calculation Mastery',
    icon: BookMarked,
    desc: 'Working through step-by-step mathematical proofs, code exercises, and quantitative problems.',
    whenToUse: 'For engineering, mathematics, physics, accounting, and technical modules.'
  },
  {
    name: 'Interleaved Learning',
    tag: 'Cognitive Agility',
    icon: Layers,
    desc: 'Alternating between different subjects or problem categories in a single study block.',
    whenToUse: 'Synthesizing related courses and preventing study fatigue.'
  }
];

export const CGPACalculator: React.FC<CGPACalculatorProps> = ({ 
  profile, 
  onUpdateProfile,
  courses = [],
  schedule = [],
  setSchedule,
  addNotification,
  onOpenHub
}) => {
  // Navigation Tabs within Academic Planner
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'analysis' | 'timetable' | 'techniques' | 'chat' | 'calendar'>('overview');

  // Academic Configuration State
  const [gradingScale, setGradingScale] = useState<4.0 | 5.0>(() => {
    const saved = localStorage.getItem('korsiq_cgpa_scale');
    return saved === '4.0' ? 4.0 : 5.0;
  });

  const [academicConfig, setAcademicConfig] = useState<CGPAAcademicConfig>(() => {
    const saved = localStorage.getItem('korsiq_academic_config');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      gradingScale: 5.0,
      currentLevel: profile?.level || '200L',
      currentSemester: 'First Semester',
      totalSemesters: 8,
      completedSemesters: 2,
      difficultCourses: [],
      preferredStudyHours: 3,
      examDate: ''
    };
  });

  // Target CGPA (New user default MUST initially be 0.00!)
  const getInitialTarget = () => {
    if (profile?.targetCGPA !== undefined && profile?.targetCGPA !== null) {
      return profile.targetCGPA;
    }
    const local = localStorage.getItem('scolaris_target_cgpa');
    if (local !== null && local !== undefined) {
      const parsed = parseFloat(local);
      if (!isNaN(parsed)) return parsed;
    }
    return 0.00; // STRICT REQUIREMENT: Initial target must be 0.00
  };

  const [targetCGPA, setTargetCGPA] = useState<number>(getInitialTarget);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTargetInput, setTempTargetInput] = useState<string>(getInitialTarget().toFixed(2));
  const [targetSavedSuccess, setTargetSavedSuccess] = useState(false);

  // Semesters & Courses Records State
  const [semesters, setSemesters] = useState<CGPASemester[]>(() => {
    const saved = localStorage.getItem('scolaris_cgpa_semesters');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  // AI CGPA Analysis Result State
  const [aiAnalysis, setAiAnalysis] = useState<AICgpaAnalysisResult | null>(() => {
    const saved = localStorage.getItem('korsiq_cgpa_analysis');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI Personalized Timetable & Revision State
  const [plannedTimetable, setPlannedTimetable] = useState<AIStudyTimetableEntry[]>(() => {
    const saved = localStorage.getItem('korsiq_study_timetable');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });
  const [revisionPlans, setRevisionPlans] = useState<AIRepetitionPlan[]>(() => {
    const saved = localStorage.getItem('korsiq_revision_plans');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Transcript Upload & Review Modal State
  const [isUploadingTranscript, setIsUploadingTranscript] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [extractedCoursesReview, setExtractedCoursesReview] = useState<CGPACourseRecord[]>([]);
  const [transcriptSemesterLabel, setTranscriptSemesterLabel] = useState('Imported Semester');
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  // Conversational Academic Adviser Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; sender: 'user' | 'assistant'; text: string; timestamp: number }>>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello! I am your KorsIQ Academic Adviser. I am ready to analyze your course credit weights, assess your target CGPA feasibility, and tailor a weekly study timetable. What questions do you have about your academic goals?",
      timestamp: Date.now()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Calendar & Reminder Integration State
  const [calendarConnected, setCalendarConnected] = useState<boolean>(() => {
    return localStorage.getItem('korsiq_calendar_connected') === 'true';
  });
  const [browserPushEnabled, setBrowserPushEnabled] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });
  const [reminderInterval, setReminderInterval] = useState<number>(() => {
    return profile?.notifications?.reminderIntervalMinutes || 30;
  });
  const [copiedIcs, setCopiedIcs] = useState(false);

  // Sync state if profile targetCGPA updates externally
  useEffect(() => {
    if (profile?.targetCGPA !== undefined && profile?.targetCGPA !== null) {
      setTargetCGPA(profile.targetCGPA);
      setTempTargetInput(profile.targetCGPA.toFixed(2));
    }
  }, [profile?.targetCGPA]);

  // Persist Semesters
  const updateSemesters = (newSemesters: CGPASemester[]) => {
    setSemesters(newSemesters);
    localStorage.setItem('scolaris_cgpa_semesters', JSON.stringify(newSemesters));
  };

  // Grade point mapping based on scale
  const getGradePoint = (grade: string, scale: number): number => {
    const clean = grade.toUpperCase().trim();
    if (scale === 4.0) {
      if (clean === 'A' || clean === 'A+') return 4.0;
      if (clean === 'B' || clean === 'B+') return 3.0;
      if (clean === 'C') return 2.0;
      if (clean === 'D') return 1.0;
      return 0.0;
    }
    // 5.0 scale (standard university)
    if (clean === 'A' || clean === 'A+') return 5.0;
    if (clean === 'B') return 4.0;
    if (clean === 'C') return 3.0;
    if (clean === 'D') return 2.0;
    if (clean === 'E') return 1.0;
    return 0.0;
  };

  // Calculate Cumulative CGPA
  const calculateCurrentCgpa = (): number => {
    if (semesters.length === 0) return 0;
    let totalQualityPoints = 0;
    let totalCredits = 0;

    semesters.forEach(sem => {
      if (sem.courses && sem.courses.length > 0) {
        sem.courses.forEach(c => {
          const pts = getGradePoint(c.grade, gradingScale) * (c.creditUnits || 3);
          totalQualityPoints += pts;
          totalCredits += (c.creditUnits || 3);
        });
      } else {
        // Fallback to sem.gpa with default 20 units
        totalQualityPoints += sem.gpa * 20;
        totalCredits += 20;
      }
    });

    return totalCredits > 0 ? parseFloat((totalQualityPoints / totalCredits).toFixed(2)) : 0;
  };

  const currentCGPA = calculateCurrentCgpa();

  // Save Target CGPA
  const handleSaveTargetCGPA = (valToSave?: number) => {
    const rawVal = valToSave !== undefined ? valToSave : parseFloat(tempTargetInput);
    if (isNaN(rawVal)) return;

    // Validate against grading scale
    const clamped = Math.min(gradingScale, Math.max(0.00, parseFloat(rawVal.toFixed(2))));
    setTargetCGPA(clamped);
    setTempTargetInput(clamped.toFixed(2));
    setIsEditingTarget(false);
    localStorage.setItem('scolaris_target_cgpa', clamped.toString());

    if (profile && onUpdateProfile) {
      onUpdateProfile({
        ...profile,
        targetCGPA: clamped
      });
    }

    setTargetSavedSuccess(true);
    setTimeout(() => setTargetSavedSuccess(false), 2500);

    if (addNotification) {
      addNotification('content', 'Target CGPA Updated', `Your target CGPA is now set to ${clamped.toFixed(2)} on a ${gradingScale.toFixed(2)} scale.`, 'calculator');
    }
  };

  // Handle Academic Config Change
  const updateAcademicConfig = (newConfig: Partial<CGPAAcademicConfig>) => {
    const updated = { ...academicConfig, ...newConfig };
    setAcademicConfig(updated);
    localStorage.setItem('korsiq_academic_config', JSON.stringify(updated));
  };

  // Run AI CGPA Analysis
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const remainingSem = Math.max(1, academicConfig.totalSemesters - academicConfig.completedSemesters);
      const res = await GeminiService.analyzeCgpa({
        currentCgpa: currentCGPA,
        targetCgpa: targetCGPA,
        gradingScale,
        currentLevel: academicConfig.currentLevel,
        completedSemesters: academicConfig.completedSemesters,
        remainingSemesters: remainingSem,
        courses: courses.map(c => ({ code: c.code, title: c.title, units: c.units, difficulty: c.difficulty })),
        difficultCourses: academicConfig.difficultCourses,
        studyPreferences: profile?.studyStyle || 'Focused active recall'
      });

      if (res.success && res.analysis) {
        setAiAnalysis(res.analysis);
        localStorage.setItem('korsiq_cgpa_analysis', JSON.stringify(res.analysis));
        setActiveTab('analysis');
        if (addNotification) {
          addNotification('content', 'Academic Reasoning Ready', 'KorsIQ evaluated your target CGPA and generated an academic improvement report.', 'calculator');
        }
      }
    } catch (err) {
      console.error('runAiAnalysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Run AI Study Timetable & Revision Generator
  const runAiPlanner = async () => {
    setIsGeneratingPlan(true);
    try {
      const res = await GeminiService.generateAcademicPlan({
        courses: courses.map(c => ({ code: c.code, title: c.title, units: c.units, difficulty: c.difficulty })),
        targetCgpa: targetCGPA,
        currentCgpa: currentCGPA,
        preferredStudyHours: academicConfig.preferredStudyHours,
        examDate: academicConfig.examDate
      });

      if (res.success) {
        if (res.timetable) {
          setPlannedTimetable(res.timetable);
          localStorage.setItem('korsiq_study_timetable', JSON.stringify(res.timetable));

          // Also convert to schedule sessions if setSchedule is provided
          if (setSchedule) {
            const mappedSessions: StudySession[] = res.timetable.map((t, idx) => {
              const matchedCourse = courses.find(c => c.code.toLowerCase() === t.courseCode.toLowerCase());
              return {
                id: `session-${Date.now()}-${idx}`,
                courseId: matchedCourse?.id || courses[0]?.id || 'course-default',
                day: t.day,
                duration: 90,
                mode: (t.recommendedTechnique === 'Practice-Based Learning' ? 'Practice' : (t.recommendedTechnique === 'Spaced Repetition' ? 'Review' : 'Deep Dive')),
                topic: t.topic,
                startTime: t.startTime,
                endTime: t.endTime,
                technique: t.recommendedTechnique,
                completed: false
              };
            });
            setSchedule(mappedSessions);
            const uid = profile?.email || 'guest';
            DBService.saveSchedule(uid, mappedSessions);
          }
        }
        if (res.revisionPlans) {
          setRevisionPlans(res.revisionPlans);
          localStorage.setItem('korsiq_revision_plans', JSON.stringify(res.revisionPlans));
        }
        setActiveTab('timetable');
        if (addNotification) {
          addNotification('session', 'Study Timetable Generated', 'Your personalized academic study schedule has been built from your course load.', 'calculator');
        }
      }
    } catch (err) {
      console.error('runAiPlanner error:', err);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Transcript File Upload & Text Extraction
  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingTranscript(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const extractRes = await GeminiService.extractFileText(file.name, file.type, base64);
        
        if (extractRes.success && extractRes.extractedText) {
          // Parse course records via server AI
          const parseRes = await GeminiService.parseTranscript(extractRes.extractedText);
          if (parseRes.success && parseRes.courses && parseRes.courses.length > 0) {
            setExtractedCoursesReview(parseRes.courses);
            setTranscriptSemesterLabel(file.name.replace(/\.[^/.]+$/, '').slice(0, 30));
            setShowReviewModal(true);
          } else {
            alert("No course grade records could be detected in this document. Please check the document format or enter courses manually.");
          }
        } else {
          alert(extractRes.error || "Unable to extract text from this document. Please try a clearer scan or PDF.");
        }
        setIsUploadingTranscript(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('handleTranscriptUpload error:', err);
      setIsUploadingTranscript(false);
      alert("Error reading document. Please try again.");
    }
  };

  // Confirm Extracted Transcript after User Review
  const handleConfirmTranscript = () => {
    if (extractedCoursesReview.length === 0) return;

    let semPoints = 0;
    let semCredits = 0;
    extractedCoursesReview.forEach(c => {
      const pts = getGradePoint(c.grade, gradingScale) * (c.creditUnits || 3);
      semPoints += pts;
      semCredits += (c.creditUnits || 3);
    });

    const semGpa = semCredits > 0 ? parseFloat((semPoints / semCredits).toFixed(2)) : 0;
    const newSemester: CGPASemester = {
      id: Date.now(),
      label: transcriptSemesterLabel || `Semester ${semesters.length + 1}`,
      gpa: semGpa,
      totalCredits: semCredits,
      courses: extractedCoursesReview
    };

    const next = [...semesters, newSemester];
    updateSemesters(next);
    setShowReviewModal(false);
    setExtractedCoursesReview([]);

    if (addNotification) {
      addNotification('content', 'Transcript Imported', `Successfully added "${newSemester.label}" with ${newSemester.courses?.length} verified courses (GPA: ${semGpa.toFixed(2)}).`, 'calculator');
    }
  };

  // Toggle Session Completed
  const toggleSessionCompleted = (sessionId: string) => {
    const updated = plannedTimetable.map(s => s.id === sessionId ? { ...s, completed: !s.completed } : s);
    setPlannedTimetable(updated);
    localStorage.setItem('korsiq_study_timetable', JSON.stringify(updated));

    if (setSchedule) {
      setSchedule(prev => prev.map(s => s.id === sessionId ? { ...s, completed: !s.completed } : s));
    }
  };

  // Conversational Academic Adviser Chat Submit
  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || isChatThinking) return;

    const userText = chatInput.trim();
    const userMsg = {
      id: `msg-${Date.now()}`,
      sender: 'user' as const,
      text: userText,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatThinking(true);

    try {
      const academicContext = {
        currentCgpa: currentCGPA,
        targetCgpa: targetCGPA,
        gradingScale,
        currentLevel: academicConfig.currentLevel,
        remainingSemesters: Math.max(1, academicConfig.totalSemesters - academicConfig.completedSemesters),
        courses: courses.map(c => ({ code: c.code, title: c.title, units: c.units, difficulty: c.difficulty })),
        difficultCourses: academicConfig.difficultCourses
      };

      const res = await GeminiService.sendAcademicChat([...chatMessages, userMsg], academicContext);
      const aiReply = {
        id: `reply-${Date.now()}`,
        sender: 'assistant' as const,
        text: res.text || "I recommend allocating focused 25-minute Pomodoro intervals for your highest-credit courses.",
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, aiReply]);
    } catch (err) {
      console.error('handleSendChat error:', err);
    } finally {
      setIsChatThinking(false);
      setTimeout(() => {
        chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // iCal / .ics File Export
  const handleExportIcs = () => {
    const now = new Date();
    const dayOffsets: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };
    const pad = (n: number) => n < 10 ? '0' + n : '' + n;
    const formatDateISO = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

    const sessions = plannedTimetable.length > 0 ? plannedTimetable : schedule.map((s, idx) => ({
      id: s.id || `session-${idx}`,
      day: s.day as any,
      startTime: s.startTime || '16:00',
      endTime: s.endTime || '17:30',
      courseCode: courses.find(c => c.id === s.courseId)?.code || 'Course',
      courseTitle: courses.find(c => c.id === s.courseId)?.title || 'Study Session',
      topic: s.topic || 'Core Concept Mastery',
      activity: s.mode || 'Deep Dive',
      recommendedTechnique: (s.technique || 'Active Recall') as any,
      instructions: s.notes || 'Review syllabus and practice past questions.'
    }));

    let icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KorsIQ//Smart Academic Study Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:KorsIQ Academic Schedule',
      `X-WR-TIMEZONE:${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}`
    ];

    sessions.forEach((s) => {
      const nowDay = now.getDay();
      const distanceToMonday = (nowDay + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - distanceToMonday);

      const offset = dayOffsets[s.day] ?? 0;
      const sessionDate = new Date(monday);
      sessionDate.setDate(monday.getDate() + offset);

      const [startH, startM] = (s.startTime || '16:00').split(':').map(Number);
      sessionDate.setHours(startH || 16, startM || 0, 0, 0);

      const [endH, endM] = (s.endTime || '17:30').split(':').map(Number);
      const endDate = new Date(sessionDate);
      endDate.setHours(endH || 17, endM || 30, 0, 0);

      const summary = `KorsIQ: ${s.courseCode} — ${s.topic}`;
      const desc = `Course: ${s.courseCode} (${s.courseTitle})\\nTopic: ${s.topic}\\nActivity: ${s.activity}\\nRecommended Technique: ${s.recommendedTechnique}\\nInstructions: ${s.instructions || ''}`;

      icsLines.push(
        'BEGIN:VEVENT',
        `UID:korsiq-plan-${s.id}-${Date.now()}@korsiq.ai`,
        `DTSTAMP:${formatDateISO(now)}`,
        `DTSTART:${formatDateISO(sessionDate)}`,
        `DTEND:${formatDateISO(endDate)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${s.day.substring(0, 2).toUpperCase()}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        'BEGIN:VALARM',
        `TRIGGER:-PT${reminderInterval}M`,
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: Your ${s.courseCode} study session begins in ${reminderInterval} minutes.`,
        'END:VALARM',
        'END:VEVENT'
      );
    });

    icsLines.push('END:VCALENDAR');
    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `korsiq_study_schedule_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setCopiedIcs(true);
    setTimeout(() => setCopiedIcs(false), 2500);
  };

  // Google Calendar URL generator for single session
  const getGoogleCalendarUrl = (entry: AIStudyTimetableEntry) => {
    const pad = (n: number) => n < 10 ? '0' + n : '' + n;
    const now = new Date();
    const nowDay = now.getDay();
    const distanceToMonday = (nowDay + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);

    const dayOffsets: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };

    const sessionDate = new Date(monday);
    sessionDate.setDate(monday.getDate() + (dayOffsets[entry.day] ?? 0));
    const [startH, startM] = (entry.startTime || '16:00').split(':').map(Number);
    sessionDate.setHours(startH || 16, startM || 0, 0, 0);

    const endDate = new Date(sessionDate);
    const [endH, endM] = (entry.endTime || '17:30').split(':').map(Number);
    endDate.setHours(endH || 17, endM || 30, 0, 0);

    const formatGCal = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

    const title = encodeURIComponent(`KorsIQ: ${entry.courseCode} (${entry.recommendedTechnique})`);
    const details = encodeURIComponent(`Topic: ${entry.topic}\nActivity: ${entry.activity}\nTechnique: ${entry.recommendedTechnique}\nInstructions: ${entry.instructions || 'Review key formulas and solve practice questions.'}`);
    const dates = `${formatGCal(sessionDate)}/${formatGCal(endDate)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${dates}&recur=RRULE:FREQ=WEEKLY`;
  };

  // Enable Browser Push Notifications
  const requestBrowserPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert("Browser push notifications are not supported by your current browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setBrowserPushEnabled(true);
        if (profile && onUpdateProfile) {
          onUpdateProfile({
            ...profile,
            notifications: {
              ...profile.notifications,
              browserPush: true
            }
          });
        }
        new Notification("KorsIQ Smart Reminders Active", {
          body: "You will now receive smart reminders before your scheduled study sessions.",
          icon: '/korsiq-logo-192.png'
        });
      } else {
        setBrowserPushEnabled(false);
      }
    } catch (err) {
      console.warn("Notification request error:", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-24 max-w-7xl mx-auto">
      
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
              Academic Intelligence
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-500">Grading System: {gradingScale.toFixed(2)} Scale</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-sans font-bold text-slate-900 tracking-tight mt-1.5">
            CGPA Target & Study Planner
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-sans mt-0.5">
            Intelligent academic forecasting, personalized study schedules, and cognitive revision strategies.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Target size={13} />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'records' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={13} />
            <span>Records</span>
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'analysis' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles size={13} />
            <span>AI Reasoning</span>
          </button>
          <button
            onClick={() => setActiveTab('timetable')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'timetable' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar size={13} />
            <span>Timetable</span>
          </button>
          <button
            onClick={() => setActiveTab('techniques')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'techniques' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Brain size={13} />
            <span>Techniques</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'chat' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare size={13} />
            <span>Adviser Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'calendar' ? 'bg-white text-blue-600 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bell size={13} />
            <span>Reminders</span>
          </button>
        </div>
      </div>

      {/* ---------------- 1. OVERVIEW & CGPA TARGET TAB ---------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Key Metric Cards per Spec: Current, Target, Projected */}
          {(() => {
            const completedUnits = semesters.reduce((sum, s) => sum + (s.totalCredits || 0), 0);
            const remainingSemesters = Math.max(1, academicConfig.totalSemesters - academicConfig.completedSemesters);
            const currentSemesterUnits = courses.reduce((sum, c) => sum + (c.units || 0), 0) || 18;
            const estimatedRemainingUnits = remainingSemesters * currentSemesterUnits;
            const projectedCGPA = (completedUnits > 0 && targetCGPA > 0)
              ? ((currentCGPA * completedUnits) + (targetCGPA * estimatedRemainingUnits)) / (completedUnits + estimatedRemainingUnits)
              : (targetCGPA > 0 ? targetCGPA : currentCGPA > 0 ? currentCGPA : 0.00);

            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                
                {/* 1. Current CGPA Card */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 flex flex-col justify-between col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B6472]">Current CGPA</span>
                    <span className="text-[10px] font-semibold text-[#5B6472] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {semesters.length} {semesters.length === 1 ? 'Period' : 'Periods'}
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-3xl font-bold text-[#111827] dark:text-white tracking-tight font-sans">
                      {currentCGPA > 0 ? currentCGPA.toFixed(2) : '0.00'}
                    </div>
                    <p className="text-xs text-[#5B6472] font-medium mt-1">
                      {currentCGPA > 0 
                        ? (currentCGPA >= 4.5 ? 'First Class Standing' : (currentCGPA >= 3.5 ? 'Second Class Upper' : 'Second Class Standing'))
                        : 'No academic records added yet.'}
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('records')}
                    className="text-xs text-[#2563EB] font-medium hover:underline flex items-center gap-1 cursor-pointer self-start min-h-[44px]"
                  >
                    <span>Manage Course Records</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                {/* 2. Target CGPA Card (Shows 0.00 until set) */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 flex flex-col justify-between relative col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#2563EB] flex items-center gap-1.5">
                      <Target size={12} />
                      Target CGPA
                      {targetSavedSuccess && (
                        <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                          Saved
                        </span>
                      )}
                    </span>
                    
                    {!isEditingTarget ? (
                      <button
                        onClick={() => {
                          setTempTargetInput(targetCGPA.toFixed(2));
                          setIsEditingTarget(true);
                        }}
                        className="text-[10px] font-medium text-[#2563EB] hover:text-[#1D4ED8] bg-[#EFF6FF] dark:bg-blue-950 px-2 py-1 rounded cursor-pointer min-h-[44px] flex items-center justify-center"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsEditingTarget(false)}
                        className="text-[10px] font-medium text-[#5B6472] hover:text-[#111827] cursor-pointer min-h-[44px] flex items-center justify-center"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {!isEditingTarget ? (
                    <div className="my-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-[#2563EB] tracking-tight font-sans">
                          {targetCGPA > 0 ? targetCGPA.toFixed(2) : '0.00'}
                        </span>
                        <span className="text-xs text-[#5B6472] font-semibold">/ {gradingScale.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-[#5B6472] font-medium mt-1">
                        {targetCGPA <= 0.00 ? (
                          <span className="text-[#5B6472]">0.00 until target is set</span>
                        ) : (
                          currentCGPA >= targetCGPA 
                            ? 'Target achieved.' 
                            : `${(targetCGPA - currentCGPA).toFixed(2)} point target delta`
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="my-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.00"
                          max={gradingScale}
                          value={tempTargetInput}
                          onChange={e => setTempTargetInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveTargetCGPA(); }}
                          className="w-20 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-bold text-[#111827] dark:text-white outline-none min-h-[44px]"
                          placeholder="0.00"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveTargetCGPA()}
                          className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-medium cursor-pointer min-h-[44px]"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E7EB] dark:border-slate-800">
                    <span className="text-[#5B6472]">Scale: {gradingScale.toFixed(1)}</span>
                    <button
                      onClick={() => setGradingScale(gradingScale === 5.0 ? 4.0 : 5.0)}
                      className="text-[10px] text-[#2563EB] hover:underline cursor-pointer"
                    >
                      Switch to {gradingScale === 5.0 ? '4.0' : '5.0'}
                    </button>
                  </div>
                </div>

                {/* 3. Projected CGPA Card per Spec */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-[#E5E7EB] dark:border-slate-800 flex flex-col justify-between col-span-2 md:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B6472]">Projected</span>
                    <span className="text-[10px] font-semibold text-[#5B6472] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {remainingSemesters} sem left
                    </span>
                  </div>
                  <div className="my-3">
                    <div className="text-3xl font-bold text-[#111827] dark:text-white tracking-tight font-sans">
                      {projectedCGPA.toFixed(2)}
                    </div>
                    <p className="text-xs text-[#5B6472] font-medium mt-1">
                      Based on your target and remaining units
                    </p>
                  </div>
                  
                  {/* Named AI Primary Action Button per Spec */}
                  <button
                    onClick={runAiAnalysis}
                    disabled={isAnalyzing}
                    className="w-full py-2.5 px-3 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
                  >
                    {isAnalyzing ? 'Calculating explanation...' : 'Explain my CGPA'}
                  </button>
                </div>

              </div>
            );
          })()}

          {/* Quick Actions & AI Overview Summary */}
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-md text-[10px] font-semibold uppercase tracking-wider">
                    AI Academic Guidance
                  </span>
                  <span className="text-xs text-slate-400">• Grounded Analysis</span>
                </div>
                <h3 className="text-xl font-sans font-bold text-slate-900 tracking-tight">
                  {targetCGPA <= 0
                    ? "Set your Target CGPA to unlock full academic reasoning"
                    : `Academic Path to ${targetCGPA.toFixed(2)} CGPA`}
                </h3>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                  {targetCGPA <= 0
                    ? "KorsIQ requires your target goal and registered courses to calculate the required semester GPA, identify high-credit weight priorities, and build your revision schedule."
                    : (aiAnalysis?.advisorySummary || `Your goal of ${targetCGPA.toFixed(2)} on a ${gradingScale.toFixed(2)} scale requires focused mastery on your 3-unit and 4-unit courses. Run the evaluation to generate your personalized timetable.`)}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
                <button
                  onClick={runAiAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={14} className={isAnalyzing ? 'animate-spin' : ''} />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Analyze CGPA Feasibility'}</span>
                </button>
                <button
                  onClick={runAiPlanner}
                  disabled={isGeneratingPlan}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Calendar size={14} />
                  <span>{isGeneratingPlan ? 'Generating...' : 'Build Timetable'}</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ---------------- 2. RECORDS & TRANSCRIPT IMPORT TAB ---------------- */}
      {activeTab === 'records' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-sans font-bold text-slate-900">Academic Records & Transcripts</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload official transcripts or past semester results (PDF or photo) to automatically import your grades.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={transcriptInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleTranscriptUpload}
                className="hidden"
              />
              <button
                onClick={() => transcriptInputRef.current?.click()}
                disabled={isUploadingTranscript}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload size={14} className={isUploadingTranscript ? 'animate-bounce' : ''} />
                <span>{isUploadingTranscript ? 'Extracting Results...' : 'Upload Transcript (PDF/Image)'}</span>
              </button>
            </div>
          </div>

          {/* Semesters & Courses List */}
          <div className="space-y-4">
            {semesters.length === 0 ? (
              <div className="bg-white p-10 rounded-xl border border-dashed border-slate-200 text-center space-y-3">
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 mx-auto border border-slate-100">
                  <FileText size={18} />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">No Academic Records Added Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Upload an academic transcript document above to extract all course units and grades, or add past semester scores to begin calculating your CGPA trajectory.
                </p>
              </div>
            ) : (
              semesters.map((sem, sIdx) => (
                <div key={sem.id || sIdx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-base font-sans font-bold text-slate-900">{sem.label}</h4>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                        {sem.courses?.length || 0} Registered Courses • Total Units: {sem.totalCredits || 20}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Semester GPA</span>
                        <span className="text-lg font-bold text-blue-600 font-mono">{sem.gpa.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => {
                          const updated = semesters.filter((_, idx) => idx !== sIdx);
                          updateSemesters(updated);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Delete semester record"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {sem.courses && sem.courses.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-400 uppercase text-[9px] font-semibold border-b border-slate-100">
                            <th className="pb-2">Course Code</th>
                            <th className="pb-2">Title</th>
                            <th className="pb-2 text-center">Credit Units</th>
                            <th className="pb-2 text-center">Grade</th>
                            <th className="pb-2 text-right">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sem.courses.map((c, cIdx) => (
                            <tr key={cIdx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-bold text-slate-900 font-mono">{c.code}</td>
                              <td className="py-2.5 text-slate-600">{c.title || 'Course Module'}</td>
                              <td className="py-2.5 text-center font-semibold text-slate-700">{c.creditUnits}</td>
                              <td className="py-2.5 text-center">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold font-mono">
                                  {c.grade}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-semibold text-slate-800 font-mono">
                                {(getGradePoint(c.grade, gradingScale) * (c.creditUnits || 3)).toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ---------------- 3. AI REASONING & PERFORMANCE ANALYSIS TAB ---------------- */}
      {activeTab === 'analysis' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {aiAnalysis ? (
            <div className="space-y-5">
              
              {/* Feasibility Alert Card */}
              <div className={`p-5 rounded-xl border ${
                aiAnalysis.isAchievable ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/50 border-amber-200'
              } space-y-3`}>
                <div className="flex items-center gap-2">
                  {aiAnalysis.isAchievable ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={18} className="text-amber-600" />
                  )}
                  <h3 className="text-base font-sans font-bold text-slate-900">
                    {aiAnalysis.isAchievable
                      ? 'Target CGPA is Mathematically Achievable'
                      : 'Target CGPA Requires Adjustment'}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {aiAnalysis.advisorySummary}
                </p>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                  <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Current CGPA</span>
                    <span className="text-base font-bold text-slate-900 font-mono">{aiAnalysis.currentCgpa.toFixed(2)}</span>
                  </div>
                  <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Target CGPA</span>
                    <span className="text-base font-bold text-blue-600 font-mono">{aiAnalysis.targetCgpa.toFixed(2)}</span>
                  </div>
                  <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Required Semester GPA</span>
                    <span className={`text-base font-bold font-mono ${aiAnalysis.requiredSemesterGpa > gradingScale ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {aiAnalysis.requiredSemesterGpa.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Max Achievable</span>
                    <span className="text-base font-bold text-slate-900 font-mono">{aiAnalysis.maxPossibleCgpa.toFixed(2)}</span>
                  </div>
                </div>

                {!aiAnalysis.isAchievable && aiAnalysis.alternativeTarget && (
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-amber-300">
                    <div>
                      <span className="text-xs font-semibold text-slate-900">Recommended Alternative Goal:</span>
                      <span className="text-xs text-slate-500 ml-1">
                        Achieving perfect {gradingScale.toFixed(2)} GPAs yields {aiAnalysis.maxPossibleCgpa.toFixed(2)}. Consider aiming for {aiAnalysis.alternativeTarget.toFixed(2)}.
                      </span>
                    </div>
                    <button
                      onClick={() => handleSaveTargetCGPA(aiAnalysis.alternativeTarget)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                    >
                      Adopt {aiAnalysis.alternativeTarget.toFixed(2)} Target
                    </button>
                  </div>
                )}
              </div>

              {/* Strategic Action Checklist */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-sm font-sans font-bold text-slate-900 uppercase tracking-wide">
                  Strategic Steps for Academic Excellence
                </h4>
                <div className="space-y-2">
                  {aiAnalysis.strategicSteps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[11px]">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700 leading-relaxed font-medium">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* High-Credit Unit Leverage Ranking */}
              {aiAnalysis.highCreditPriorities && aiAnalysis.highCreditPriorities.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-sans font-bold text-slate-900 uppercase tracking-wide">
                      High-Credit Courses Weighting (Highest Leverage)
                    </h4>
                    <span className="text-[10px] text-slate-400 font-semibold">Priority weighting</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {aiAnalysis.highCreditPriorities.map((item, idx) => (
                      <div key={idx} className="p-3.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 font-mono text-sm">{item.code}</span>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-md text-[10px] font-semibold">
                            {item.units} Credit Units
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white p-10 rounded-xl border border-dashed border-slate-200 text-center space-y-3">
              <Sparkles size={24} className="text-blue-600 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-800">No Analysis Generated Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click below to have KorsIQ evaluate your courses, credit weight distribution, and required GPA trajectory.
              </p>
              <button
                onClick={runAiAnalysis}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles size={13} className={isAnalyzing ? 'animate-spin' : ''} />
                <span>{isAnalyzing ? 'Analyzing...' : 'Generate Academic Analysis'}</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* ---------------- 4. PERSONALIZED AI STUDY TIMETABLE TAB ---------------- */}
      {activeTab === 'timetable' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="text-base font-sans font-bold text-slate-900">Personalized Weekly Timetable</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated from your registered courses, credit weights, and cognitive reading techniques.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportIcs}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Download .ics file for Google Calendar, Apple Calendar, and Outlook"
              >
                <Download size={13} />
                <span>{copiedIcs ? 'Calendar Exported!' : 'Export .ICS'}</span>
              </button>
              <button
                onClick={runAiPlanner}
                disabled={isGeneratingPlan}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={isGeneratingPlan ? 'animate-spin' : ''} />
                <span>{isGeneratingPlan ? 'Building...' : 'Regenerate Schedule'}</span>
              </button>
            </div>
          </div>

          {plannedTimetable.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-dashed border-slate-200 text-center space-y-3">
              <Calendar size={24} className="text-slate-400 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-800">No Timetable Generated Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                KorsIQ can assemble a balanced weekly study schedule that balances hard courses with proven techniques and spaced recovery intervals.
              </p>
              <button
                onClick={runAiPlanner}
                disabled={isGeneratingPlan}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles size={13} />
                <span>Generate Weekly Schedule</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plannedTimetable.map((session) => (
                <div
                  key={session.id}
                  className={`p-4 rounded-xl border transition-all ${
                    session.completed 
                      ? 'bg-slate-50 border-slate-200 opacity-60' 
                      : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-md text-xs font-semibold uppercase tracking-wider font-mono">
                        {session.day}
                      </span>
                      <span className="text-xs text-slate-400 font-mono font-semibold">
                        {session.startTime} – {session.endTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={getGoogleCalendarUrl(session)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                        title="Add this session to Google Calendar"
                      >
                        <ExternalLink size={13} />
                      </a>
                      <button
                        onClick={() => toggleSessionCompleted(session.id)}
                        className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all cursor-pointer ${
                          session.completed 
                            ? 'bg-emerald-600 border-emerald-600 text-white' 
                            : 'border-slate-300 hover:border-blue-500 text-transparent'
                        }`}
                        title={session.completed ? 'Mark uncompleted' : 'Mark completed'}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 font-mono">{session.courseCode}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-600 truncate">{session.courseTitle}</span>
                    </div>
                    <p className="text-xs font-semibold text-blue-700">{session.topic}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-1">{session.instructions}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 uppercase font-semibold text-[9px] tracking-wider">Method:</span>
                    <span className="font-semibold text-slate-700 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200">
                      {session.recommendedTechnique}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ---------------- 5. READING TECHNIQUES & REVISION STRATEGIES TAB ---------------- */}
      {activeTab === 'techniques' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-sans font-bold text-slate-900">Evidence-Based Academic Techniques</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              KorsIQ leverages cognitive science methodologies to maximize retention, recall speed, and exam performance.
            </p>
          </div>

          {/* Techniques Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {READING_TECHNIQUES_INFO.map((tech, idx) => {
              const IconComp = tech.icon;
              return (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                      <IconComp size={16} />
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {tech.tag}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-sans font-bold text-slate-900">{tech.name}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{tech.desc}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Best Application:</span>
                    <span className="text-slate-700 font-medium">{tech.whenToUse}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Course-by-Course Revision Plans */}
          {revisionPlans.length > 0 && (
            <div className="space-y-4 pt-2">
              <h3 className="text-base font-sans font-bold text-slate-900">Personalized Course Revision Blueprints</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {revisionPlans.map((plan, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900 text-sm">{plan.courseCode}</span>
                        <span className="text-xs text-slate-500 ml-2">{plan.courseTitle}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        plan.priority === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {plan.priority} priority
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold">Assigned Technique: </span>
                        <span className="font-semibold text-blue-700">{plan.readingTechnique}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Revision Frequency: </span>
                        <span className="text-slate-700">{plan.revisionFrequency}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Practice Strategy: </span>
                        <span className="text-slate-700">{plan.practiceStrategy}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold">Mastery Benchmark: </span>
                        <span className="text-slate-700">{plan.assessmentMethod}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ---------------- 6. CONVERSATIONAL ACADEMIC ADVISER CHAT TAB ---------------- */}
      {activeTab === 'chat' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <Sparkles size={16} />
              </span>
              <div>
                <h3 className="text-sm font-sans font-bold text-slate-900">KorsIQ Academic Mentor</h3>
                <p className="text-xs text-slate-500">Ask questions regarding your CGPA target, course prioritization, and study schedules.</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Context Active</span>
            </div>
          </div>

          {/* Chat Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[520px] overflow-hidden">
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3.5 text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-50 border border-slate-200 text-slate-800 space-y-1'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span className={`text-[9px] block text-right mt-1 ${msg.sender === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isChatThinking && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs flex items-center gap-2 text-slate-500">
                    <Sparkles size={13} className="animate-spin text-blue-600" />
                    <span>KorsIQ is evaluating your academic records...</span>
                  </div>
                </div>
              )}
              <div ref={chatScrollRef} />
            </div>

            {/* Suggested Prompts */}
            <div className="px-5 py-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-600 bg-slate-50/50">
              <span className="font-semibold text-slate-400 shrink-0">Ask:</span>
              {[
                "Which courses should I prioritize?",
                "Can I still graduate with my target CGPA?",
                "Recommend study techniques for difficult topics",
                "How do I structure my daily 2-hour study block?"
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setChatInput(prompt);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 rounded-md border border-slate-200 shrink-0 cursor-pointer transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendChat} className="p-3.5 border-t border-slate-200 flex items-center gap-2 bg-white">
              <input
                type="text"
                placeholder="Ask KorsIQ about your academic plan..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs outline-none focus:border-blue-500 focus:bg-white text-slate-800"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatThinking}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={13} />
                <span>Send</span>
              </button>
            </form>
          </div>

        </div>
      )}

      {/* ---------------- 7. CALENDAR & SMART STUDY REMINDERS TAB ---------------- */}
      {activeTab === 'calendar' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
            <h3 className="text-base font-sans font-bold text-slate-900">Calendar Integration & Smart Notifications</h3>
            <p className="text-xs text-slate-500">
              Connect your study timetable to Google Calendar and configure smart reminders so you never miss a revision session.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Google Calendar & Export Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    <Calendar size={16} />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">External Calendar Sync</h4>
                    <p className="text-[11px] text-slate-500">Google Calendar, Apple Calendar, & Outlook</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const next = !calendarConnected;
                    setCalendarConnected(next);
                    localStorage.setItem('korsiq_calendar_connected', next.toString());
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    calendarConnected 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {calendarConnected ? 'Connected' : 'Disconnected'}
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Export your full recurring study schedule into Google Calendar with RFC-5545 compliant `.ics` formatting, including custom alarm triggers and course instructions.
                </p>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-150 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Local Time Zone:</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Timetable Sessions:</span>
                    <span className="font-semibold text-slate-800">{plannedTimetable.length || schedule.length} Sessions</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={handleExportIcs}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Download size={14} />
                    <span>{copiedIcs ? 'ICS Downloaded!' : 'Download Complete Schedule (.ICS)'}</span>
                  </button>
                  <a
                    href="https://calendar.google.com/calendar/r/settings/export"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                  >
                    <ExternalLink size={14} />
                    <span>Google Calendar Import</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Smart Study Notification Preferences */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Bell size={16} />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Smart Study Notifications</h4>
                  <p className="text-[11px] text-slate-500">In-App & Browser Push Reminders</p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* Browser Push Permission */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-150">
                  <div>
                    <span className="font-semibold text-slate-900 block">Browser Push Notifications</span>
                    <span className="text-[11px] text-slate-500">Receive system notifications when a session approaches</span>
                  </div>
                  <button
                    onClick={requestBrowserPush}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                      browserPushEnabled 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {browserPushEnabled ? 'Enabled' : 'Enable'}
                  </button>
                </div>

                {/* Reminder Timing Interval */}
                <div className="space-y-2">
                  <label className="font-semibold text-slate-700 block uppercase text-[10px] tracking-wider">
                    Reminder Notification Timing
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[15, 30, 60].map(mins => (
                      <button
                        key={mins}
                        onClick={() => {
                          setReminderInterval(mins);
                          if (profile && onUpdateProfile) {
                            onUpdateProfile({
                              ...profile,
                              notifications: {
                                ...profile.notifications,
                                reminderIntervalMinutes: mins
                              }
                            });
                          }
                        }}
                        className={`py-2 rounded-lg border text-center font-semibold text-xs transition-colors cursor-pointer ${
                          reminderInterval === mins 
                            ? 'bg-blue-50 border-blue-200 text-blue-700' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {mins} Mins Before
                      </button>
                    ))}
                  </div>
                </div>

                {/* Examination Countdown Reminder */}
                <div className="space-y-1.5 pt-1">
                  <label className="font-semibold text-slate-700 block uppercase text-[10px] tracking-wider">
                    Upcoming Examination Date
                  </label>
                  <input
                    type="date"
                    value={academicConfig.examDate || ''}
                    onChange={e => updateAcademicConfig({ examDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <p className="text-[10px] text-slate-400 italic">
                    KorsIQ dispatches 1-day advance revision countdown alerts prior to registered exams.
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ---------------- REVIEW EXTRACTED TRANSCRIPT MODAL ---------------- */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-xl border border-slate-200 space-y-4 animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-sans font-bold text-slate-900">Review Extracted Academic Results</h3>
                <p className="text-xs text-slate-500">
                  Verify course credit units and grades extracted from your document before adding to your official records.
                </p>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Semester Label:</label>
                <input
                  type="text"
                  value={transcriptSemesterLabel}
                  onChange={e => setTranscriptSemesterLabel(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[9px] font-semibold border-b border-slate-100">
                      <th className="pb-2">Course Code</th>
                      <th className="pb-2">Units</th>
                      <th className="pb-2">Grade</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extractedCoursesReview.map((c, idx) => (
                      <tr key={idx}>
                        <td className="py-2">
                          <input
                            type="text"
                            value={c.code}
                            onChange={e => {
                              const updated = [...extractedCoursesReview];
                              updated[idx].code = e.target.value.toUpperCase();
                              setExtractedCoursesReview(updated);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono font-bold text-xs w-28 uppercase"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="1"
                            max="6"
                            value={c.creditUnits}
                            onChange={e => {
                              const updated = [...extractedCoursesReview];
                              updated[idx].creditUnits = parseInt(e.target.value, 10) || 1;
                              setExtractedCoursesReview(updated);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-xs w-16 text-center"
                          />
                        </td>
                        <td className="py-2">
                          <select
                            value={c.grade}
                            onChange={e => {
                              const updated = [...extractedCoursesReview];
                              updated[idx].grade = e.target.value.toUpperCase();
                              setExtractedCoursesReview(updated);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-xs font-mono"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                            <option value="E">E</option>
                            <option value="F">F</option>
                          </select>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => {
                              setExtractedCoursesReview(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => {
                  setExtractedCoursesReview(prev => [
                    ...prev,
                    { code: 'COURSE', creditUnits: 3, grade: 'A' }
                  ]);
                }}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                + Add Another Course Row
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTranscript}
                disabled={extractedCoursesReview.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                Save & Add to Academic Records
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default CGPACalculator;
