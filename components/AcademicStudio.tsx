import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Plus,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Download,
  Printer,
  Copy,
  Trash2,
  Edit3,
  History,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Layers,
  RefreshCw,
  Sliders,
  Check,
  X,
  ShieldAlert,
  GraduationCap,
  Quote,
  Eye,
  FileCheck,
  FileUp,
  RotateCcw,
  Maximize2,
  HelpCircle,
  Compass,
  Bookmark,
  Share2,
  Crown,
  ListOrdered,
  PenTool,
  Loader2
} from 'lucide-react';
import {
  AcademicDocument,
  AcademicDocumentType,
  CitationStyle,
  StudioDocumentStatus,
  StudioOutlineItem,
  StudioSection,
  StudioReference,
  StudioReviewSuggestion,
  StudioVersion,
  UserProfile,
  hasStudioPrivileges,
  hasFullStudioPrivileges
} from '../types';
import { DBService } from '../services/db';
import { GeminiService } from '../services/gemini';
import { generateDocxBlob, downloadDocx } from '../utils/docxExport';
import KorsIQLogo from './KorsIQLogo';
import SubscriptionCheckoutModal from './SubscriptionCheckoutModal';

interface AcademicStudioProps {
  userId: string;
  profile: UserProfile;
  setProfile?: (p: UserProfile) => void;
  onNavigateTab?: (tab: string) => void;
}

const DOCUMENT_TYPES: { id: AcademicDocumentType; label: string; desc: string; defaultWords: number }[] = [
  { id: 'assignment', label: 'Course Assignment', desc: 'Standard university coursework, problem set essays, or topical responses.', defaultWords: 1500 },
  { id: 'term_paper', label: 'Term Paper', desc: 'Comprehensive semester research paper integrating deep literature review.', defaultWords: 3500 },
  { id: 'essay', label: 'Academic Essay', desc: 'Argumentative, descriptive, or analytical thesis-driven essay.', defaultWords: 2000 },
  { id: 'research_proposal', label: 'Research Proposal', desc: 'Formal proposal outlining problem statement, methodology, and timeline.', defaultWords: 4000 },
  { id: 'thesis', label: 'Final Year Project / Thesis', desc: 'Multi-chapter dissertation (Chapters 1–5: Intro, Literature, Methodology, Findings, Conclusion).', defaultWords: 10000 },
  { id: 'literature_review', label: 'Literature Review', desc: 'Systematic or narrative synthesis of published peer-reviewed scholarship.', defaultWords: 4000 },
  { id: 'case_study', label: 'Case Study Analysis', desc: 'In-depth empirical investigation of an organizational or real-world scenario.', defaultWords: 2500 },
  { id: 'lab_report', label: 'Scientific Lab Report', desc: 'Empirical report with abstract, experimental setup, data, and discussion.', defaultWords: 2000 },
  { id: 'seminar_paper', label: 'Seminar Paper', desc: 'Conference or seminar paper prepared for scholarly presentation.', defaultWords: 3000 },
];

const CITATION_STYLES: { id: CitationStyle; label: string; desc: string }[] = [
  { id: 'APA', label: 'APA 7th Edition', desc: 'Author-Date standard (e.g. Smith, 2023) widely used in social sciences and sciences.' },
  { id: 'Harvard', label: 'Harvard Style', desc: 'Author-Date referencing common in business, humanities, and international institutions.' },
  { id: 'MLA', label: 'MLA 9th Edition', desc: 'Author-Page standard (e.g. Smith 45) preferred in literature, arts, and humanities.' },
  { id: 'IEEE', label: 'IEEE Style', desc: 'Numbered bracket citation [1] standard in engineering, computing, and technology.' },
];

export const AcademicStudio: React.FC<AcademicStudioProps> = ({
  userId,
  profile,
  setProfile,
  onNavigateTab
}) => {
  // Subscription Entitlement Check
  const isPremium = hasStudioPrivileges(profile);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'plus' | 'studio'>('studio');

  // Studio Document State
  const [documents, setDocuments] = useState<AcademicDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Active Document Workspace State
  const activeDocument = useMemo(() => {
    return documents.find((d) => d.id === activeDocId) || null;
  }, [documents, activeDocId]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<'assistant' | 'references' | 'review' | 'versions'>('assistant');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Creation Wizard State
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<AcademicDocumentType>('assignment');
  const [newDocSubject, setNewDocSubject] = useState('');
  const [newDocWords, setNewDocWords] = useState(1500);
  const [newDocCitation, setNewDocCitation] = useState<CitationStyle>('APA');
  const [newDocInstructions, setNewDocInstructions] = useState('');
  const [newDocDepartment, setNewDocDepartment] = useState(profile.department || '');
  const [newDocInstitution, setNewDocInstitution] = useState(profile.university || '');
  const [newDocLecturer, setNewDocLecturer] = useState('');
  const [newDocReferences, setNewDocReferences] = useState<StudioReference[]>([]);
  const [isPlanningLoading, setIsPlanningLoading] = useState(false);

  // Editor State
  const [editorText, setEditorText] = useState('');
  const [isSectionGenerating, setIsSectionGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [contextualAssistPrompt, setContextualAssistPrompt] = useState('');
  const [isAssistLoading, setIsAssistLoading] = useState(false);
  const [selectedTextSnippet, setSelectedTextSnippet] = useState('');
  const [editorSelectionRange, setEditorSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // Document Review State
  const [reviewResult, setReviewResult] = useState<{
    academicQualityScore: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: StudioReviewSuggestion[];
  } | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  // Preview & Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [insufficientCreditsNotice, setInsufficientCreditsNotice] = useState<{
    required: number;
    balance: number;
    resetDate?: string;
  } | null>(null);

  // Mobile Bottom Sheets & Quiet Upgrade State
  const [mobileSheet, setMobileSheet] = useState<'outline' | 'sources' | 'cite' | 'versions' | null>(null);
  const [showQuietUpgrade, setShowQuietUpgrade] = useState<{ feature: string; description: string } | null>(null);
  const [editorHistory, setEditorHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const isExportAllowed = hasStudioPrivileges(profile);
  const isVersionsAllowed = hasFullStudioPrivileges(profile);

  const handleEditorChangeWithHistory = (newVal: string) => {
    handleEditorChange(newVal);
    setEditorHistory((prev) => {
      const updated = [...prev.slice(0, historyIndex + 1), newVal];
      if (updated.length > 25) updated.shift();
      return updated;
    });
    setHistoryIndex((prev) => prev + 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevVal = editorHistory[historyIndex - 1];
      setHistoryIndex((prev) => prev - 1);
      handleEditorChange(prevVal);
    }
  };

  const handleRedo = () => {
    if (historyIndex < editorHistory.length - 1) {
      const nextVal = editorHistory[historyIndex + 1];
      setHistoryIndex((prev) => prev + 1);
      handleEditorChange(nextVal);
    }
  };

  // Version History State
  const [versions, setVersions] = useState<StudioVersion[]>([]);
  const [isVersionSaving, setIsVersionSaving] = useState(false);
  const [versionNote, setVersionNote] = useState('');

  // Toast feedback helper
  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // 1. Initial Load of Documents
  useEffect(() => {
    const loadDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const list = await DBService.getAcademicDocuments(userId);
        setDocuments(list);
      } catch (err) {
        console.error('Failed to load academic documents:', err);
      } finally {
        setIsLoadingDocs(false);
      }
    };
    loadDocs();
  }, [userId]);

  // Sync editor text when switching sections
  useEffect(() => {
    if (!activeDocument) return;
    if (!activeSectionId && activeDocument.sections.length > 0) {
      setActiveSectionId(activeDocument.sections[0].id);
    }
  }, [activeDocument, activeSectionId]);

  useEffect(() => {
    if (!activeDocument || !activeSectionId) {
      setEditorText('');
      return;
    }
    const sec = activeDocument.sections.find((s) => s.id === activeSectionId);
    setEditorText(sec ? sec.content : '');
  }, [activeSectionId, activeDocument]);

  // Load versions when document opens
  useEffect(() => {
    if (!activeDocId) return;
    const fetchVersions = async () => {
      const v = await DBService.getDocumentVersions(activeDocId, userId);
      setVersions(v);
    };
    fetchVersions();
  }, [activeDocId, userId]);

  // Helper: Save active document to DB & Cache
  const persistDocument = async (updated: AcademicDocument) => {
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    await DBService.saveAcademicDocument(updated);
  };

  // Helper: Auto-save current editor text to active section
  const handleEditorChange = (newText: string) => {
    setEditorText(newText);
    if (!activeDocument || !activeSectionId) return;

    const words = newText.trim().split(/\s+/).filter(Boolean).length;
    const updatedSections = activeDocument.sections.map((s) =>
      s.id === activeSectionId
        ? {
            ...s,
            content: newText,
            wordCount: words,
            status: (words > 0 ? (s.status === 'empty' ? 'drafted' : s.status) : 'empty') as 'empty' | 'generating' | 'drafted' | 'approved',
            lastEditedAt: new Date().toISOString(),
          }
        : s
    );

    const totalWords = updatedSections.reduce((acc, curr) => acc + (curr.wordCount || 0), 0);
    const updatedDoc: AcademicDocument = {
      ...activeDocument,
      sections: updatedSections,
      currentWordCount: totalWords,
      status: activeDocument.status === 'outline_approved' ? 'drafting' : activeDocument.status,
    };

    persistDocument(updatedDoc);
  };

  // =========================================================
  // CREATION & OUTLINE PLANNING
  // =========================================================

  const handleStartCreation = () => {
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    setNewDocTitle('');
    setNewDocType('assignment');
    setNewDocSubject('');
    setNewDocWords(1500);
    setNewDocCitation('APA');
    setNewDocInstructions('');
    setNewDocReferences([]);
    setWizardStep(1);
    setIsCreatingDoc(true);
  };

  const handleGenerateOutline = async () => {
    if (!newDocTitle.trim()) {
      showToast('Please provide a document title or topic.');
      return;
    }

    setIsPlanningLoading(true);
    try {
      const planResult = await GeminiService.generateStudioPlan({
        title: newDocTitle.trim(),
        docType: newDocType,
        subject: newDocSubject.trim(),
        instructions: newDocInstructions.trim(),
        targetWordCount: newDocWords,
        citationStyle: newDocCitation,
        references: newDocReferences,
      });

      const initialOutline: StudioOutlineItem[] = (planResult.outline || []).map((item: any, idx: number) => ({
        id: item.id || `outline-sec-${idx + 1}`,
        title: item.title,
        level: item.level || 1,
        order: idx + 1,
        description: item.description || '',
        rationale: item.rationale || '',
        targetWords: item.targetWords || Math.round(newDocWords / Math.max(1, planResult.outline.length)),
        approved: false,
        personalInstructions: '',
        subsections: (item.subsections || []).map((sub: any, sIdx: number) => ({
          id: sub.id || `outline-sub-${idx + 1}-${sIdx + 1}`,
          title: sub.title,
          level: 2,
          order: sIdx + 1,
          description: sub.description || '',
          rationale: sub.rationale || '',
          targetWords: sub.targetWords || 200,
          approved: false,
        })),
      }));

      // Flatten into initial sections for writing workspace
      const initialSections: StudioSection[] = initialOutline.map((item, idx) => ({
        id: `sec-${Date.now()}-${idx + 1}`,
        outlineItemId: item.id,
        title: item.title,
        level: item.level,
        order: item.order,
        content: '',
        status: 'empty',
        wordCount: 0,
        citations: [],
        lastEditedAt: new Date().toISOString(),
      }));

      const newDoc: AcademicDocument = {
        id: crypto.randomUUID(),
        userId,
        title: newDocTitle.trim(),
        docType: newDocType,
        subject: newDocSubject.trim(),
        instructions: newDocInstructions.trim(),
        targetWordCount: newDocWords,
        currentWordCount: 0,
        citationStyle: newDocCitation,
        status: 'planning', // Student must review & approve outline first!
        outline: initialOutline,
        sections: initialSections,
        references: newDocReferences,
        metadata: {
          studentName: profile.name,
          department: newDocDepartment || profile.department || '',
          institution: newDocInstitution || profile.university || '',
          courseCode: newDocSubject.trim(),
          lecturerName: newDocLecturer.trim(),
          abstract: planResult.abstractPlan || '',
          includeCoverPage: true,
          includeTableOfContents: true,
          includeReferences: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      await DBService.saveAcademicDocument(newDoc);
      setDocuments((prev) => [newDoc, ...prev]);
      setActiveDocId(newDoc.id);
      setIsCreatingDoc(false);
      showToast('Academic plan & outline generated! Please review and approve your outline.');
    } catch (err: any) {
      console.error('Failed to generate studio plan:', err);
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setIsCreatingDoc(false);
        setInsufficientCreditsNotice({
          required: err.required ?? 2,
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      showToast(err?.message || 'Could not generate plan right now. Please try again.');
    } finally {
      setIsPlanningLoading(false);
    }
  };

  // Outline Editing Handlers
  const handleToggleApproveOutlineItem = (itemId: string) => {
    if (!activeDocument) return;
    const updated = activeDocument.outline.map((o) =>
      o.id === itemId ? { ...o, approved: !o.approved } : o
    );
    persistDocument({ ...activeDocument, outline: updated });
  };

  const handleUpdateOutlineItemTitle = (itemId: string, newTitle: string) => {
    if (!activeDocument) return;
    const updatedOutline = activeDocument.outline.map((o) =>
      o.id === itemId ? { ...o, title: newTitle } : o
    );
    // Also sync matching section title
    const updatedSections = activeDocument.sections.map((s) =>
      s.outlineItemId === itemId ? { ...s, title: newTitle } : s
    );
    persistDocument({ ...activeDocument, outline: updatedOutline, sections: updatedSections });
  };

  const handleUpdateOutlineItemInstructions = (itemId: string, instructions: string) => {
    if (!activeDocument) return;
    const updated = activeDocument.outline.map((o) =>
      o.id === itemId ? { ...o, personalInstructions: instructions } : o
    );
    persistDocument({ ...activeDocument, outline: updated });
  };

  const handleMoveOutlineItem = (index: number, direction: 'up' | 'down') => {
    if (!activeDocument) return;
    const newItems = [...activeDocument.outline];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;

    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIdx, 0, moved);

    const reordered = newItems.map((item, idx) => ({ ...item, order: idx + 1 }));
    // Sync sections order as well
    const reorderedSections = activeDocument.sections.map((sec) => {
      const match = reordered.find((o) => o.id === sec.outlineItemId);
      return match ? { ...sec, order: match.order } : sec;
    }).sort((a, b) => a.order - b.order);

    persistDocument({ ...activeDocument, outline: reordered, sections: reorderedSections });
  };

  const handleDeleteOutlineItem = (itemId: string) => {
    if (!activeDocument) return;
    if (activeDocument.outline.length <= 1) {
      showToast('A document must have at least one section.');
      return;
    }
    const filteredOutline = activeDocument.outline.filter((o) => o.id !== itemId);
    const filteredSections = activeDocument.sections.filter((s) => s.outlineItemId !== itemId);
    persistDocument({ ...activeDocument, outline: filteredOutline, sections: filteredSections });
  };

  const handleAddOutlineItem = () => {
    if (!activeDocument) return;
    const newOrder = activeDocument.outline.length + 1;
    const newItemId = `sec-custom-${Date.now()}`;
    const newItem: StudioOutlineItem = {
      id: newItemId,
      title: `Section ${newOrder}: Additional Analytical Dimension`,
      level: 1,
      order: newOrder,
      description: 'Custom research and analysis added by the student.',
      rationale: 'Deepens the investigation into specific course requirements.',
      targetWords: 350,
      approved: false,
    };

    const newSection: StudioSection = {
      id: `sec-${Date.now()}-${newOrder}`,
      outlineItemId: newItemId,
      title: newItem.title,
      level: 1,
      order: newOrder,
      content: '',
      status: 'empty',
      wordCount: 0,
      citations: [],
      lastEditedAt: new Date().toISOString(),
    };

    persistDocument({
      ...activeDocument,
      outline: [...activeDocument.outline, newItem],
      sections: [...activeDocument.sections, newSection],
    });
  };

  // APPROVE OUTLINE AND COMMIT TO WRITING
  const handleApproveEntireOutline = async () => {
    if (!activeDocument) return;
    const approvedOutline = activeDocument.outline.map((o) => ({ ...o, approved: true }));
    const updatedDoc: AcademicDocument = {
      ...activeDocument,
      status: 'outline_approved',
      outline: approvedOutline,
    };
    await persistDocument(updatedDoc);
    if (updatedDoc.sections.length > 0) {
      setActiveSectionId(updatedDoc.sections[0].id);
    }
    showToast('Outline approved! Academic Writing Workspace is now active.');
  };

  // =========================================================
  // SECTION-BY-SECTION GENERATION & WRITING ENGINE
  // =========================================================

  const handleGenerateActiveSection = async (mode: 'generate' | 'regenerate' | 'expand' | 'simplify' | 'academic_tone' | 'grammar' | 'citations' = 'generate') => {
    if (!activeDocument || !activeSectionId) return;
    const sec = activeDocument.sections.find((s) => s.id === activeSectionId);
    if (!sec) return;

    const outlineItem = activeDocument.outline.find((o) => o.id === sec.outlineItemId);
    const targetWordGoal = outlineItem?.targetWords || 400;

    setInsufficientCreditsNotice(null);
    setIsSectionGenerating(true);
    try {
      const result = await GeminiService.generateStudioSection({
        docTitle: activeDocument.title,
        docType: activeDocument.docType,
        sectionTitle: sec.title,
        sectionDescription: outlineItem?.description,
        sectionRationale: outlineItem?.rationale,
        targetWords: targetWordGoal,
        citationStyle: activeDocument.citationStyle,
        studentInstructions: outlineItem?.personalInstructions,
        references: activeDocument.references,
        existingContent: sec.content,
        mode,
      });

      handleEditorChange(result.content);
      showToast(`Section "${sec.title}" generated successfully!`);
    } catch (err: any) {
      console.error('Section generation failed:', err);
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientCreditsNotice({
          required: err.required ?? 3,
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      showToast(err?.message || 'Section generation failed. Please try again.');
    } finally {
      setIsSectionGenerating(false);
    }
  };

  // BATCH GENERATE ALL EMPTY/APPROVED SECTIONS SEQUENTIALLY (10 credits total)
  const handleBatchGenerateAll = async () => {
    if (!activeDocument) return;
    const pendingSections = activeDocument.sections.filter((s) => !s.content || s.content.trim().length === 0);
    if (pendingSections.length === 0) {
      showToast('All sections already have content. Use single-section regeneration to rewrite.');
      return;
    }

    setInsufficientCreditsNotice(null);
    setBatchProgress({ current: 0, total: pendingSections.length, title: 'Starting sequential generation...' });

    let updatedSections = [...activeDocument.sections];

    for (let i = 0; i < pendingSections.length; i++) {
      const sec = pendingSections[i];
      const outlineItem = activeDocument.outline.find((o) => o.id === sec.outlineItemId);
      setBatchProgress({ current: i + 1, total: pendingSections.length, title: sec.title });

      try {
        const result = await GeminiService.generateStudioSection({
          docTitle: activeDocument.title,
          docType: activeDocument.docType,
          sectionTitle: sec.title,
          sectionDescription: outlineItem?.description,
          sectionRationale: outlineItem?.rationale,
          targetWords: outlineItem?.targetWords || 400,
          citationStyle: activeDocument.citationStyle,
          studentInstructions: outlineItem?.personalInstructions,
          references: activeDocument.references,
          mode: 'generate',
          isFullDocumentFirstSection: i === 0,
          isFullDocumentContinuation: i > 0,
        });

        const words = result.content.trim().split(/\s+/).filter(Boolean).length;
        updatedSections = updatedSections.map((s) =>
          s.id === sec.id
            ? { ...s, content: result.content, wordCount: words, status: 'drafted', lastEditedAt: new Date().toISOString() }
            : s
        );

        // Update UI progressively
        if (sec.id === activeSectionId) {
          setEditorText(result.content);
        }
      } catch (err: any) {
        console.warn(`Batch failed on section ${sec.title}:`, err);
        if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
          setBatchProgress(null);
          setInsufficientCreditsNotice({
            required: err.required ?? 10,
            balance: err.balance ?? 0,
            resetDate: err.resetDate
          });
          return;
        }
        break;
      }
    }

    const totalWords = updatedSections.reduce((acc, curr) => acc + (curr.wordCount || 0), 0);
    const updatedDoc: AcademicDocument = {
      ...activeDocument,
      sections: updatedSections,
      currentWordCount: totalWords,
      status: 'drafting',
    };

    await persistDocument(updatedDoc);
    setBatchProgress(null);
    showToast('Batch generation complete! All sections drafted.');
  };

  // IN-CONTEXT AI TEXT ASSISTANT (1 credit)
  const handleContextualAssist = async (instruction: string) => {
    if (!activeDocument || !editorText) return;

    const textToTransform = selectedTextSnippet || editorText;
    setInsufficientCreditsNotice(null);
    setIsAssistLoading(true);

    try {
      const currentSec = activeDocument.sections.find((s) => s.id === activeSectionId);
      const res = await GeminiService.assistStudioText({
        selectedText: textToTransform,
        instruction,
        docTitle: activeDocument.title,
        sectionTitle: currentSec?.title,
      });

      if (selectedTextSnippet && editorSelectionRange) {
        const before = editorText.substring(0, editorSelectionRange.start);
        const after = editorText.substring(editorSelectionRange.end);
        handleEditorChange(before + res.text + after);
      } else {
        handleEditorChange(res.text);
      }
      setSelectedTextSnippet('');
      showToast('Text updated by AI assistant.');
    } catch (err: any) {
      console.error('Contextual assist error:', err);
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientCreditsNotice({
          required: err.required ?? 1,
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      showToast(err?.message || 'AI assistance failed.');
    } finally {
      setIsAssistLoading(false);
    }
  };

  // =========================================================
  // DOCUMENT REVIEW & QUALITY AUDIT (1 credit)
  // =========================================================

  const handleRunDocumentReview = async () => {
    if (!activeDocument) return;
    const fullText = activeDocument.sections.map((s) => `## ${s.title}\n${s.content}`).join('\n\n');

    if (!fullText || fullText.trim().length < 50) {
      showToast('Please draft your document sections before running an audit.');
      return;
    }

    setInsufficientCreditsNotice(null);
    setIsReviewLoading(true);
    setActiveRightTab('review');
    try {
      const audit = await GeminiService.reviewStudioDocument({
        docTitle: activeDocument.title,
        docType: activeDocument.docType,
        fullContent: fullText,
        citationStyle: activeDocument.citationStyle,
        references: activeDocument.references,
      });

      setReviewResult({
        academicQualityScore: audit.academicQualityScore || 90,
        summary: audit.summary || 'Manuscript successfully reviewed against scholarly standards.',
        strengths: audit.strengths || [],
        weaknesses: audit.weaknesses || [],
        suggestions: (audit.suggestions || []).map((s: any) => ({
          ...s,
          status: 'pending',
        })),
      });
      showToast('Academic audit complete!');
    } catch (err: any) {
      console.error('Audit failed:', err);
      if (err?.status === 402 || err?.code === 'INSUFFICIENT_CREDITS') {
        setInsufficientCreditsNotice({
          required: err.required ?? 1,
          balance: err.balance ?? 0,
          resetDate: err.resetDate
        });
        return;
      }
      showToast(err?.message || 'Failed to complete document audit.');
    } finally {
      setIsReviewLoading(false);
    }
  };

  const handleApplyReviewSuggestion = (suggestion: StudioReviewSuggestion) => {
    if (!activeDocument || !suggestion.originalText || !suggestion.suggestedReplacement) return;
    if (!editorText.includes(suggestion.originalText)) {
      showToast('Could not find the target phrase in this active section. Please select the relevant section.');
      return;
    }

    const updatedText = editorText.replace(suggestion.originalText, suggestion.suggestedReplacement);
    handleEditorChange(updatedText);

    if (reviewResult) {
      setReviewResult({
        ...reviewResult,
        suggestions: reviewResult.suggestions.map((s) =>
          s.id === suggestion.id ? { ...s, status: 'accepted' } : s
        ),
      });
    }
    showToast('Suggestion applied to manuscript.');
  };

  const handleDismissReviewSuggestion = (suggestionId: string) => {
    if (!reviewResult) return;
    setReviewResult({
      ...reviewResult,
      suggestions: reviewResult.suggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: 'rejected' } : s
      ),
    });
  };

  // =========================================================
  // REFERENCE CITATION INSERTION
  // =========================================================

  const handleInsertCitation = (ref: StudioReference) => {
    if (!activeDocument) return;
    let formatted = '';
    if (activeDocument.citationStyle === 'IEEE') {
      const refIdx = activeDocument.references.findIndex((r) => r.id === ref.id);
      formatted = `[${refIdx >= 0 ? refIdx + 1 : 1}]`;
    } else if (activeDocument.citationStyle === 'MLA') {
      formatted = `(${ref.authors.split(',')[0]} 12)`;
    } else {
      // APA & Harvard
      const firstAuthor = ref.authors.split('&')[0].split(',')[0].trim();
      formatted = `(${firstAuthor}, ${ref.year || 'n.d.'})`;
    }

    handleEditorChange(editorText + ' ' + formatted);
    showToast(`Inserted citation: ${formatted}`);
  };

  // Manual Add Reference
  const [showAddRefModal, setShowAddRefModal] = useState(false);
  const [newRefTitle, setNewRefTitle] = useState('');
  const [newRefAuthors, setNewRefAuthors] = useState('');
  const [newRefYear, setNewRefYear] = useState('');
  const [newRefSnippet, setNewRefSnippet] = useState('');
  const [newRefDoi, setNewRefDoi] = useState('');

  const handleSaveManualReference = () => {
    if (!newRefTitle.trim() || !newRefAuthors.trim()) {
      showToast('Please enter both title and authors.');
      return;
    }
    const newRef: StudioReference = {
      id: `ref-${Date.now()}`,
      title: newRefTitle.trim(),
      authors: newRefAuthors.trim(),
      year: newRefYear.trim() || undefined,
      contentSnippet: newRefSnippet.trim() || undefined,
      doi: newRefDoi.trim() || undefined,
      sourceType: 'journal',
      verified: true,
    };

    if (activeDocument) {
      persistDocument({
        ...activeDocument,
        references: [...activeDocument.references, newRef],
      });
    } else {
      setNewDocReferences((prev) => [...prev, newRef]);
    }

    setNewRefTitle('');
    setNewRefAuthors('');
    setNewRefYear('');
    setNewRefSnippet('');
    setNewRefDoi('');
    setShowAddRefModal(false);
    showToast('Reference added to library.');
  };

  // =========================================================
  // DOCUMENT VERSIONS / SNAPSHOTS
  // =========================================================

  const handleSaveVersionSnapshot = async () => {
    if (!activeDocument) return;
    setIsVersionSaving(true);
    try {
      const snapJson = JSON.stringify(activeDocument);
      const v = await DBService.saveDocumentVersion(
        activeDocument.id,
        userId,
        activeDocument.title,
        snapJson,
        activeDocument.currentWordCount,
        versionNote.trim() || 'Manual revision snapshot'
      );
      setVersions((prev) => [v, ...prev]);
      setVersionNote('');
      showToast('Version snapshot saved.');
    } catch (err) {
      console.error('Failed to save version:', err);
      showToast('Could not save version snapshot.');
    } finally {
      setIsVersionSaving(false);
    }
  };

  const handleRestoreVersion = async (v: StudioVersion) => {
    if (!window.confirm(`Restore version from ${new Date(v.createdAt).toLocaleString()}? Unsaved edits will be replaced.`)) {
      return;
    }
    try {
      const parsed: AcademicDocument = JSON.parse(v.snapshot);
      await persistDocument(parsed);
      setEditorText(parsed.sections.find((s) => s.id === activeSectionId)?.content || '');
      showToast('Document restored to selected version.');
    } catch (err) {
      showToast('Failed to restore version snapshot.');
    }
  };

  // =========================================================
  // EXPORT HANDLERS (DOCX & PDF)
  // =========================================================

  const handleExportDocx = async () => {
    if (!activeDocument) return;
    setIsExportingDocx(true);
    try {
      const blob = await generateDocxBlob(activeDocument);
      const safeTitle = activeDocument.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadDocx(blob, `${safeTitle}.docx`);
      showToast('Word document exported successfully!');
    } catch (err) {
      console.error('DOCX export failed:', err);
      showToast('Failed to export DOCX document.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Document Management Operations
  const handleDuplicateDocument = async (docId: string) => {
    try {
      const dup = await DBService.duplicateAcademicDocument(docId, userId);
      if (dup) {
        setDocuments((prev) => [dup, ...prev]);
        showToast('Document duplicated successfully.');
      }
    } catch (err) {
      showToast('Failed to duplicate document.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this academic document? This cannot be undone.')) {
      return;
    }
    try {
      await DBService.deleteAcademicDocument(docId, userId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (activeDocId === docId) {
        setActiveDocId(null);
      }
      showToast('Document deleted.');
    } catch (err) {
      showToast('Failed to delete document.');
    }
  };

  // Filtered documents list for main dashboard
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || doc.docType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [documents, searchQuery, typeFilter]);

  // Total words written across all documents
  const overallWordCount = useMemo(() => {
    return documents.reduce((sum, d) => sum + (d.currentWordCount || 0), 0);
  }, [documents]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16 font-sans text-slate-900 dark:text-slate-100">
      {insufficientCreditsNotice && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold">
                Not enough credits ({insufficientCreditsNotice.balance} remaining, {insufficientCreditsNotice.required} required)
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                {insufficientCreditsNotice.resetDate
                  ? `Your monthly credits reset on ${new Date(insufficientCreditsNotice.resetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. `
                  : ''}
                Upgrade your plan for up to 200 monthly AI credits.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCheckoutPlan('studio');
                setShowCheckoutModal(true);
              }}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold min-h-[40px] cursor-pointer"
            >
              Upgrade
            </button>
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

      {/* Toast Banner */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700"
          >
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{feedbackToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* VIEW 1: MAIN DASHBOARD & DOCUMENT LIST                    */}
      {/* ========================================================= */}
      {!activeDocument && (
        <div className="space-y-6">
          {/* Top Clean Header / Studio Overview */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-md text-xs font-medium">
                  <span>Academic Studio</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Academic Planning, Writing &amp; Review Studio
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                  Formulate tailored academic plans, review and approve outlines before generation, draft section-by-section with genuine source citations, and export formatted Word (.docx) and PDF documents.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleStartCreation}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus size={16} />
                  <span>New Document</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500">Active papers</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{documents.length}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500">Words written</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">{overallWordCount.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500">Document types</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{DOCUMENT_TYPES.length} formats</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/60 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500">Supported exports</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Word &amp; PDF</p>
              </div>
            </div>
          </div>

          {/* Search, Filter & Quick Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents by title or subject..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                All
              </button>
              {['assignment', 'term_paper', 'thesis', 'research_proposal'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    typeFilter === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Document Cards Grid */}
          {isLoadingDocs ? (
            <div className="p-12 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl flex items-center justify-center mx-auto">
                <FileText size={24} />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-semibold text-base text-slate-900 dark:text-white">No academic documents yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Start your first assignment, term paper, or dissertation outline. KorsIQ structures chapters based on your course syllabus and assignment instructions.
                </p>
              </div>
              <button
                onClick={handleStartCreation}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={15} />
                <span>Create New Document</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => {
                const progressPct = Math.min(100, Math.round(((doc.currentWordCount || 0) / (doc.targetWordCount || 1)) * 100));
                const statusColor =
                  doc.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : doc.status === 'review'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : doc.status === 'planning'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200';

                return (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between group cursor-pointer"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium capitalize px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {doc.docType.replace('_', ' ')}
                        </span>
                        <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded border ${statusColor}`}>
                          {doc.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors line-clamp-2">
                          {doc.title}
                        </h3>
                        {doc.subject && (
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {doc.subject}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{doc.currentWordCount.toLocaleString()} / {doc.targetWordCount.toLocaleString()} words</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{progressPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400">
                          {doc.citationStyle} • {doc.sections.length} Sections
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateDocument(doc.id);
                            }}
                            title="Duplicate Document"
                            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDocument(doc.id);
                            }}
                            title="Delete Document"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: OUTLINE APPROVAL WORKSPACE                        */}
      {/* (When active document status === 'planning')              */}
      {/* ========================================================= */}
      {activeDocument && activeDocument.status === 'planning' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header & Back Action */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setActiveDocId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Back to Documents</span>
            </button>
            <span className="text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-3 py-1 rounded-md">
              Outline Approval Required
            </span>
          </div>

          {/* Outline Inspection Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="space-y-2">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 capitalize">
                {activeDocument.docType.replace('_', ' ')} • {activeDocument.citationStyle} Citation
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {activeDocument.title}
              </h2>
              {activeDocument.metadata?.abstract && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white">Strategic Plan: </strong>
                  {activeDocument.metadata.abstract}
                </div>
              )}
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg flex items-start gap-3">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Outline Verification Mandatory Before Generation
                </p>
                <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                  You are in complete control of this manuscript. Review the recommended structure below, reorder chapters, edit titles, add custom guidance, or remove unwanted sections. KorsIQ will only generate approved sections.
                </p>
              </div>
            </div>

            {/* Editable Outline List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                  Document Outline ({activeDocument.outline.length} Sections)
                </h3>
                <button
                  onClick={handleAddOutlineItem}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Section</span>
                </button>
              </div>

              <div className="space-y-3">
                {activeDocument.outline.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg space-y-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateOutlineItemTitle(item.id, e.target.value)}
                          className="font-semibold text-sm text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-600 focus:outline-none w-full"
                        />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveOutlineItem(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOutlineItem(idx, 'down')}
                          disabled={idx === activeDocument.outline.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move Down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOutlineItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer ml-1"
                          title="Delete Section"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Section Rationale & Description */}
                    <div className="pl-8 space-y-1.5 text-xs">
                      {item.description && (
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                      {item.rationale && (
                        <div className="text-xs text-blue-800 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/40 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/60 leading-relaxed">
                          <span className="font-semibold">Why AI Recommends This: </span>
                          {item.rationale}
                        </div>
                      )}

                      {/* Personal Student Guidance input */}
                      <div className="pt-1">
                        <input
                          type="text"
                          value={item.personalInstructions || ''}
                          onChange={(e) => handleUpdateOutlineItemInstructions(item.id, e.target.value)}
                          placeholder="Add custom instructions for this section (optional)..."
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approval Action Footer */}
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium">
                Allocated word goal: <strong>{activeDocument.targetWordCount.toLocaleString()} words</strong> across {activeDocument.outline.length} sections.
              </div>

              <button
                type="button"
                onClick={handleApproveEntireOutline}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <Check size={16} />
                <span>Approve Outline &amp; Begin Writing</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: 3-COLUMN ACADEMIC WRITING WORKSPACE               */}
      {/* (When status === 'outline_approved' | 'drafting' | ...)    */}
      {/* ========================================================= */}
      {activeDocument && activeDocument.status !== 'planning' && (
        <div className="space-y-4">
          {/* Top Control Bar per Spec: Title, Saved State, Undo/Redo, Export */}
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setActiveDocId(null)}
                className="p-2 text-[#5B6472] hover:text-[#111827] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Back to Documents"
                aria-label="Back to Documents"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-sm text-[#111827] dark:text-white truncate max-w-xs sm:max-w-md">
                  {activeDocument.title}
                </h2>
                <div className="flex items-center gap-2 text-[11px] text-[#5B6472]">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 size={12} />
                    <span>Saved</span>
                  </span>
                  <span>•</span>
                  <span>{activeDocument.currentWordCount.toLocaleString()} words</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Undo / Redo */}
              <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-lg border border-[#E5E7EB] dark:border-slate-700 p-0.5">
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="px-2.5 py-1.5 text-xs text-[#5B6472] hover:text-[#111827] disabled:opacity-40 min-h-[44px] flex items-center gap-1 cursor-pointer"
                  title="Undo change"
                  aria-label="Undo"
                >
                  <RotateCcw size={13} />
                  <span>Undo</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700 px-1">|</span>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= editorHistory.length - 1}
                  className="px-2.5 py-1.5 text-xs text-[#5B6472] hover:text-[#111827] disabled:opacity-40 min-h-[44px] flex items-center gap-1 cursor-pointer"
                  title="Redo change"
                  aria-label="Redo"
                >
                  <span>Redo</span>
                </button>
              </div>

              {/* Primary Action Button: Export (Gated with Quiet Upgrade Prompt where excluded) */}
              <button
                onClick={() => {
                  if (!isExportAllowed) {
                    setShowQuietUpgrade({
                      feature: 'Export Manuscript',
                      description: 'Exporting formatted Microsoft Word (.docx) and PDF documents is included in the Plus and Academic Studio plans.'
                    });
                  } else {
                    setShowExportModal(true);
                  }
                }}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm min-h-[44px]"
              >
                <Download size={14} />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Batch Progress Bar */}
          {batchProgress && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-blue-900 dark:text-blue-200">
                    Drafting Section {batchProgress.current} of {batchProgress.total}
                  </p>
                  <p className="text-blue-700 dark:text-blue-400 truncate max-w-sm">
                    {batchProgress.title}
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold text-blue-600">
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </div>
            </div>
          )}

          {/* 3-COLUMN WORKSPACE GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[640px]">
            {/* COLUMN 1: LEFT SIDEBAR - OUTLINE & NAVIGATION (3 Cols on Desktop) */}
            <div className="hidden lg:block lg:col-span-3 space-y-3">
              <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-3.5 space-y-3 h-full flex flex-col justify-between shadow-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-[#5B6472]">
                      Outline ({activeDocument.sections.length})
                    </span>
                    <span className="text-[10px] font-semibold text-[#2563EB] bg-[#EFF6FF] dark:bg-blue-950/60 px-2 py-0.5 rounded">
                      {Math.min(100, Math.round((activeDocument.currentWordCount / activeDocument.targetWordCount) * 100))}%
                    </span>
                  </div>

                  {/* Section List */}
                  <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                    {activeDocument.sections.map((sec, idx) => {
                      const isActive = sec.id === activeSectionId;
                      const hasContent = sec.content && sec.content.trim().length > 0;

                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setActiveSectionId(sec.id)}
                          className={`w-full text-left p-2.5 rounded-lg transition-colors cursor-pointer flex items-start gap-2.5 ${
                            isActive
                              ? 'bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] font-semibold border-l-2 border-[#2563EB]'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-[#111827] dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                              isActive
                                ? 'bg-[#2563EB] text-white'
                                : hasContent
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-[#5B6472]'
                            }`}
                          >
                            {hasContent ? '✓' : idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate leading-tight">
                              {sec.title}
                            </p>
                            <p className="text-[10px] text-[#5B6472] mt-0.5">
                              {sec.wordCount || 0} words
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-[#5B6472] space-y-1 border border-[#E5E7EB] dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>Goal:</span>
                    <span>{activeDocument.targetWordCount.toLocaleString()} words</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Written:</span>
                    <span className="text-[#2563EB] dark:text-blue-400">
                      {activeDocument.currentWordCount.toLocaleString()} words
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: CENTER - NOTION / WORD PAPER CANVAS (6 Cols on Desktop, Full on Mobile) */}
            <div className="col-span-1 lg:col-span-6 space-y-3">
              <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-5 sm:p-6 space-y-4 shadow-xs flex flex-col h-full">
                {/* Active Section Header */}
                {(() => {
                  const currentSec = activeDocument.sections.find((s) => s.id === activeSectionId);
                  const currentOutline = activeDocument.outline.find((o) => o.id === currentSec?.outlineItemId);

                  return (
                    <div className="space-y-1 pb-3 border-b border-[#E5E7EB] dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] dark:bg-blue-950/60 px-2 py-0.5 rounded">
                          Section {currentSec?.order || 1} of {activeDocument.sections.length}
                        </span>
                        <span className="text-xs text-[#5B6472] font-medium">
                          Goal: ~{currentOutline?.targetWords || 400} words
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-[#111827] dark:text-white">
                        {currentSec?.title || 'Section Editor'}
                      </h3>
                      <p className="text-xs text-[#5B6472]">
                        Draft the next paragraph yourself, or ask for a suggested draft of this section.
                      </p>
                    </div>
                  );
                })()}

                {/* Editor Textarea (Clean Paper Canvas) */}
                <div className="flex-1 flex flex-col relative">
                  <textarea
                    value={editorText}
                    onChange={(e) => handleEditorChangeWithHistory(e.target.value)}
                    onSelect={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      const sel = target.value.substring(target.selectionStart, target.selectionEnd);
                      if (sel && sel.trim().length > 3) {
                        setSelectedTextSnippet(sel);
                        setEditorSelectionRange({ start: target.selectionStart, end: target.selectionEnd });
                      }
                    }}
                    placeholder="Start writing, or ask for a suggested draft."
                    className="w-full flex-1 min-h-[380px] p-4 bg-white dark:bg-slate-950 border border-[#E5E7EB] dark:border-slate-800 rounded-lg font-sans text-sm leading-relaxed text-[#111827] dark:text-slate-100 outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors resize-none"
                  />

                  {/* Selected Text Floating Helper */}
                  {selectedTextSnippet && (
                    <div className="absolute bottom-4 left-4 right-4 bg-[#111827] text-white p-3 rounded-lg shadow-xl flex items-center justify-between gap-3 text-xs border border-slate-800">
                      <div className="truncate flex-1">
                        <span className="text-blue-400 font-semibold">Selected: </span>
                        <span className="italic truncate">"{selectedTextSnippet}"</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleContextualAssist('Elevate academic tone and vocabulary')}
                          className="px-2.5 py-1 bg-[#2563EB] hover:bg-blue-500 rounded text-xs font-semibold cursor-pointer"
                        >
                          Rewrite — 1 credit
                        </button>
                        <button
                          onClick={() => setSelectedTextSnippet('')}
                          className="p-1 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Editor Footer Status */}
                <div className="flex items-center justify-between text-xs text-[#5B6472] pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                  <span>
                    Words in section: <strong className="text-[#111827] dark:text-slate-300 font-semibold">{editorText.trim().split(/\s+/).filter(Boolean).length}</strong>
                  </span>
                  <span>Autosaved</span>
                </div>
              </div>
            </div>

            {/* COLUMN 3: RIGHT SIDEBAR - BRIEF, SOURCES & ACTIONS (3 Cols on Desktop) */}
            <div className="hidden lg:block lg:col-span-3 space-y-3">
              <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-3.5 space-y-3.5 h-full flex flex-col shadow-xs">
                {/* Brief Card */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-[#E5E7EB] dark:border-slate-800 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-[#5B6472]">Brief</p>
                  <p className="text-xs font-semibold text-[#111827] dark:text-white capitalize">
                    {activeDocument.docType.replace('_', ' ')} · {activeDocument.targetWordCount.toLocaleString()} words · {profile?.level || 'undergraduate'} · {activeDocument.citationStyle}
                  </p>
                </div>

                {/* Action Buttons: Write Section (3), Full Document (10), Rewrite (1), Review (1) */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateActiveSection('generate')}
                    disabled={isSectionGenerating || !!batchProgress}
                    className="w-full py-2.5 px-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 min-h-[44px]"
                  >
                    {isSectionGenerating ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                    <span>{isSectionGenerating ? 'Drafting...' : 'Write section, 3 credits'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBatchGenerateAll}
                    disabled={isSectionGenerating || !!batchProgress}
                    className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-[#2563EB]/40 hover:bg-blue-50/50 dark:hover:bg-slate-700 text-[#2563EB] dark:text-blue-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 min-h-[44px]"
                  >
                    <Layers size={14} />
                    <span>{batchProgress ? 'Drafting full document...' : 'Generate full document, 10 credits'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTextSnippet) {
                        handleContextualAssist('Elevate academic tone and vocabulary');
                      } else {
                        handleContextualAssist('Improve academic clarity, structure, and scholarly tone');
                      }
                    }}
                    disabled={isSectionGenerating || isAssistLoading || !editorText}
                    className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#111827] dark:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 min-h-[44px]"
                  >
                    <span>{isAssistLoading ? 'Rewriting...' : 'Rewrite, 1 credit'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRunDocumentReview}
                    disabled={isReviewLoading}
                    className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-[#111827] dark:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 min-h-[44px]"
                  >
                    <span>{isReviewLoading ? 'Checking...' : 'Check citations, 1 credit'}</span>
                  </button>
                </div>

                {/* Sources List & Citation Chips */}
                <div className="flex-1 flex flex-col justify-between space-y-2 pt-2 border-t border-[#E5E7EB] dark:border-slate-800">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#5B6472]">
                        Sources ({activeDocument.references.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddRefModal(true)}
                        className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                      >
                        + Add Source
                      </button>
                    </div>

                    {activeDocument.references.length === 0 ? (
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-center text-xs text-[#5B6472] space-y-2">
                        <p>No attached sources yet.</p>
                        <button
                          type="button"
                          onClick={() => setShowAddRefModal(true)}
                          className="px-3 py-1.5 bg-[#2563EB] text-white rounded text-xs font-semibold cursor-pointer"
                        >
                          Attach Source
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {activeDocument.references.map((ref) => {
                          const leadAuthor = ref.authors.split(',')[0].split(' ')[0];
                          const chipLabel = `(${leadAuthor}, ${ref.year || 'n.d.'})`;
                          return (
                            <div
                              key={ref.id}
                              className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-[#E5E7EB] dark:border-slate-800 rounded-lg space-y-1.5 text-xs"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <p className="font-semibold text-[#111827] dark:text-white line-clamp-2 text-xs">
                                  {ref.title}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleInsertCitation(ref)}
                                  className="px-2 py-1 bg-[#EFF6FF] text-[#2563EB] hover:bg-[#2563EB] hover:text-white rounded text-[11px] font-bold cursor-pointer shrink-0 transition-colors"
                                  title={`Insert citation chip ${chipLabel} at cursor`}
                                >
                                  {chipLabel}
                                </button>
                              </div>
                              <p className="text-[11px] text-[#5B6472]">
                                {ref.authors} ({ref.year || 'n.d.'})
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Versions access */}
                  <div className="pt-2 border-t border-[#E5E7EB] dark:border-slate-800 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isVersionsAllowed) {
                          setShowQuietUpgrade({
                            feature: 'Version History',
                            description: 'Document versioning and revision history are available in the Academic Studio plan.'
                          });
                        } else {
                          setActiveRightTab('versions');
                        }
                      }}
                      className="text-xs text-[#5B6472] hover:text-[#2563EB] flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <History size={13} />
                      <span>Versions</span>
                    </button>
                    <span className="text-[10px] text-[#5B6472]">KorsIQ Studio</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE FOCUSED MODE BOTTOM BAR (Visible on < lg) */}
          <div className="lg:hidden fixed bottom-14 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-[#E5E7EB] dark:border-slate-800 px-3 py-1.5 flex items-center justify-around shadow-md">
            <button
              type="button"
              onClick={() => setMobileSheet('outline')}
              className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] text-[11px] font-semibold text-[#5B6472] hover:text-[#2563EB]"
            >
              <ListOrdered size={16} />
              <span>Outline</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileSheet('sources')}
              className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] text-[11px] font-semibold text-[#5B6472] hover:text-[#2563EB]"
            >
              <BookOpen size={16} />
              <span>Sources</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileSheet('cite')}
              className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] text-[11px] font-semibold text-[#5B6472] hover:text-[#2563EB]"
            >
              <Quote size={16} />
              <span>Cite</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isVersionsAllowed) {
                  setShowQuietUpgrade({
                    feature: 'Version History',
                    description: 'Document versioning and revision history are available in the Academic Studio plan.'
                  });
                } else {
                  setMobileSheet('versions');
                }
              }}
              className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] text-[11px] font-semibold text-[#5B6472] hover:text-[#2563EB]"
            >
              <History size={16} />
              <span>Versions</span>
            </button>
          </div>

          {/* MOBILE BOTTOM SHEETS */}
          {mobileSheet && (
            <div className="fixed inset-0 z-50 bg-[#111827]/40 flex flex-col justify-end">
              <div className="bg-white dark:bg-slate-900 border-t border-[#E5E7EB] dark:border-slate-800 rounded-t-xl max-h-[75vh] flex flex-col p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                  <h3 className="font-bold text-sm text-[#111827] dark:text-white capitalize">
                    {mobileSheet === 'outline' ? 'Document Outline' : mobileSheet === 'sources' ? 'Attached Sources' : mobileSheet === 'cite' ? 'Insert Citation' : 'Version History'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMobileSheet(null)}
                    className="p-2 text-[#5B6472] hover:text-[#111827] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label="Close sheet"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 py-1">
                  {mobileSheet === 'outline' && (
                    <div className="space-y-1.5">
                      {activeDocument.sections.map((sec, idx) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => {
                            setActiveSectionId(sec.id);
                            setMobileSheet(null);
                          }}
                          className={`w-full text-left p-3 rounded-lg border min-h-[44px] flex items-center justify-between cursor-pointer ${
                            sec.id === activeSectionId
                              ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] font-bold'
                              : 'border-[#E5E7EB] hover:bg-slate-50 text-[#111827]'
                          }`}
                        >
                          <span className="text-xs truncate">{idx + 1}. {sec.title}</span>
                          <span className="text-[11px] text-[#5B6472]">{sec.wordCount || 0} w</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {mobileSheet === 'sources' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet(null);
                          setShowAddRefModal(true);
                        }}
                        className="w-full py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer"
                      >
                        + Add Source
                      </button>
                      {activeDocument.references.length === 0 ? (
                        <p className="text-xs text-[#5B6472] text-center py-4">No sources attached yet.</p>
                      ) : (
                        activeDocument.references.map((ref) => (
                          <div key={ref.id} className="p-2.5 bg-slate-50 rounded-lg border border-[#E5E7EB] text-xs">
                            <p className="font-semibold text-[#111827]">{ref.title}</p>
                            <p className="text-[11px] text-[#5B6472]">{ref.authors} ({ref.year || 'n.d.'})</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {mobileSheet === 'cite' && (
                    <div className="space-y-2">
                      <p className="text-xs text-[#5B6472]">Tap a citation chip to insert into the active section:</p>
                      {activeDocument.references.length === 0 ? (
                        <div className="text-center py-4 text-xs text-[#5B6472]">
                          <p>No attached sources to cite.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileSheet(null);
                              setShowAddRefModal(true);
                            }}
                            className="mt-2 px-3 py-1.5 bg-[#2563EB] text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer"
                          >
                            Add Source
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {activeDocument.references.map((ref) => {
                            const leadAuthor = ref.authors.split(',')[0].split(' ')[0];
                            const chipLabel = `(${leadAuthor}, ${ref.year || 'n.d.'})`;
                            return (
                              <button
                                key={ref.id}
                                type="button"
                                onClick={() => {
                                  handleInsertCitation(ref);
                                  setMobileSheet(null);
                                  showToast(`Inserted citation: ${chipLabel}`);
                                }}
                                className="px-3 py-2 bg-[#EFF6FF] border border-[#2563EB]/40 text-[#2563EB] hover:bg-[#2563EB] hover:text-white rounded-lg text-xs font-semibold cursor-pointer min-h-[44px] flex items-center gap-1.5"
                              >
                                <Quote size={12} />
                                <span>{chipLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {mobileSheet === 'versions' && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleSaveVersionSnapshot}
                        disabled={isVersionSaving}
                        className="w-full py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold min-h-[44px] cursor-pointer"
                      >
                        {isVersionSaving ? 'Saving...' : 'Save Current Snapshot'}
                      </button>
                      {versions.length === 0 ? (
                        <p className="text-xs text-[#5B6472] text-center py-4">No snapshots saved yet.</p>
                      ) : (
                        versions.map((ver) => (
                          <div key={ver.id} className="p-2.5 bg-slate-50 rounded-lg border border-[#E5E7EB] text-xs flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{ver.wordCount.toLocaleString()} words</p>
                              <p className="text-[10px] text-[#5B6472]">{new Date(ver.createdAt).toLocaleString()}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleRestoreVersion(ver);
                                setMobileSheet(null);
                              }}
                              className="text-xs font-semibold text-[#2563EB] p-2 min-h-[44px] cursor-pointer"
                            >
                              Restore
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: NEW DOCUMENT CREATION WIZARD                     */}
      {/* ========================================================= */}
      {isCreatingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Step {wizardStep} of 3
                </span>
                <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                  {wizardStep === 1 ? 'Manuscript Parameters' : wizardStep === 2 ? 'Assignment Prompt & Instructions' : 'Reference Materials & Sources'}
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingDoc(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* STEP 1: Title, Document Type, Subject, Words, Style */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Document title or working topic *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="e.g. Distributed Consensus in Cloud Infrastructure: An Empirical Comparison"
                    className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Document type
                    </label>
                    <select
                      value={newDocType}
                      onChange={(e) => {
                        const t = e.target.value as AcademicDocumentType;
                        setNewDocType(t);
                        const match = DOCUMENT_TYPES.find((d) => d.id === t);
                        if (match) setNewDocWords(match.defaultWords);
                      }}
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none focus:border-blue-600"
                    >
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Citation style
                    </label>
                    <select
                      value={newDocCitation}
                      onChange={(e) => setNewDocCitation(e.target.value as CitationStyle)}
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none focus:border-blue-600"
                    >
                      {CITATION_STYLES.map((cs) => (
                        <option key={cs.id} value={cs.id}>
                          {cs.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Course code / subject
                    </label>
                    <input
                      type="text"
                      value={newDocSubject}
                      onChange={(e) => setNewDocSubject(e.target.value)}
                      placeholder="e.g. CSC 401"
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Target word count goal
                    </label>
                    <input
                      type="number"
                      step={100}
                      value={newDocWords}
                      onChange={(e) => setNewDocWords(Number(e.target.value))}
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newDocTitle.trim()) {
                        showToast('Please enter a title or topic.');
                        return;
                      }
                      setWizardStep(2);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: Assignment Guidelines</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Assignment Instructions & Cover Details */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Assignment instructions / rubric guidelines
                  </label>
                  <textarea
                    rows={5}
                    value={newDocInstructions}
                    onChange={(e) => setNewDocInstructions(e.target.value)}
                    placeholder="Paste assignment instructions, questions to address, or theoretical scope here..."
                    className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-blue-600 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    The planning engine structures chapters based directly on these instructions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Department / Faculty
                    </label>
                    <input
                      type="text"
                      value={newDocDepartment}
                      onChange={(e) => setNewDocDepartment(e.target.value)}
                      placeholder="e.g. Department of Computer Science"
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Lecturer / supervisor name
                    </label>
                    <input
                      type="text"
                      value={newDocLecturer}
                      onChange={(e) => setNewDocLecturer(e.target.value)}
                      placeholder="e.g. Prof. R. Sterling"
                      className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Next: References</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Reference Intelligence */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      Reference Material ({newDocReferences.length} added)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddRefModal(true)}
                      className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      + Add Reference
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    KorsIQ grounds arguments in real references. Never fabricates citations.
                  </p>
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateOutline}
                    disabled={isPlanningLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isPlanningLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Formulating Plan &amp; Outline...</span>
                      </>
                    ) : (
                      <>
                        <ListOrdered size={14} />
                        <span>Generate outline, 2 credits</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: ADD REFERENCE MODAL                              */}
      {/* ========================================================= */}
      {showAddRefModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Add Reference Source
              </h3>
              <button
                onClick={() => setShowAddRefModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Paper / book title *
                </label>
                <input
                  type="text"
                  value={newRefTitle}
                  onChange={(e) => setNewRefTitle(e.target.value)}
                  placeholder="e.g. Deep Residual Learning for Image Recognition"
                  className="w-full p-2 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none border border-slate-200 dark:border-slate-700 focus:border-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Authors *
                </label>
                <input
                  type="text"
                  value={newRefAuthors}
                  onChange={(e) => setNewRefAuthors(e.target.value)}
                  placeholder="e.g. He, K., Zhang, X., Ren, S., & Sun, J."
                  className="w-full p-2 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none border border-slate-200 dark:border-slate-700 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Year
                  </label>
                  <input
                    type="text"
                    value={newRefYear}
                    onChange={(e) => setNewRefYear(e.target.value)}
                    placeholder="2023"
                    className="w-full p-2 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none border border-slate-200 dark:border-slate-700 focus:border-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    DOI / Link
                  </label>
                  <input
                    type="text"
                    value={newRefDoi}
                    onChange={(e) => setNewRefDoi(e.target.value)}
                    placeholder="10.1109/CVPR.2016.90"
                    className="w-full p-2 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none border border-slate-200 dark:border-slate-700 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Relevant excerpt / key findings
                </label>
                <textarea
                  rows={3}
                  value={newRefSnippet}
                  onChange={(e) => setNewRefSnippet(e.target.value)}
                  placeholder="Paste excerpt or key quotation for the AI to synthesize..."
                  className="w-full p-2 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none border border-slate-200 dark:border-slate-700 resize-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddRefModal(false)}
                className="px-3 py-1.5 text-slate-500 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveManualReference}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Save Reference
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: EXPORT & PRINT PREVIEW MODAL                     */}
      {/* ========================================================= */}
      {showExportModal && activeDocument && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-4xl w-full p-6 space-y-5 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-xs font-medium text-blue-600">
                  Export &amp; Print
                </span>
                <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                  Manuscript Preview
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Export Actions */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-800">
              <button
                onClick={handleExportDocx}
                disabled={isExportingDocx}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Download size={13} />
                <span>{isExportingDocx ? 'Exporting...' : 'Microsoft Word (.docx)'}</span>
              </button>

              <button
                onClick={handlePrintPdf}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer size={13} />
                <span>Print / Save as PDF</span>
              </button>

              <div className="text-xs text-slate-500 ml-auto font-medium">
                {activeDocument.currentWordCount.toLocaleString()} words • {activeDocument.citationStyle}
              </div>
            </div>

            {/* Live Visual Academic Preview */}
            <div className="p-8 sm:p-10 bg-white text-slate-900 border border-slate-200 rounded-lg shadow-inner font-sans text-sm space-y-6 max-h-[480px] overflow-y-auto custom-scrollbar">
              {/* Cover Page */}
              <div className="text-center space-y-4 pb-8 border-b border-dashed border-slate-300">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  {activeDocument.metadata?.institution || 'INSTITUTION OF HIGHER LEARNING'}
                </p>
                <p className="text-[11px] uppercase text-slate-500">
                  {activeDocument.metadata?.faculty || activeDocument.metadata?.department || 'FACULTY OF ACADEMIC STUDIES'}
                </p>
                <div className="py-4">
                  <h1 className="text-xl font-bold uppercase tracking-wide leading-tight max-w-xl mx-auto">
                    {activeDocument.title}
                  </h1>
                  <p className="text-xs italic mt-2 text-slate-600">
                    A {activeDocument.docType.replace('_', ' ').toUpperCase()} SUBMITTED FOR {activeDocument.metadata?.courseCode || activeDocument.subject || 'ACADEMIC COURSE'}
                  </p>
                </div>
                <div className="space-y-0.5 text-xs">
                  <p className="text-[10px] text-slate-400 font-sans uppercase">BY</p>
                  <p className="font-bold">{activeDocument.metadata?.studentName || profile.name}</p>
                  {activeDocument.metadata?.studentId && <p className="text-slate-500">ID: {activeDocument.metadata.studentId}</p>}
                </div>
                {activeDocument.metadata?.lecturerName && (
                  <p className="text-xs pt-2 text-slate-600">
                    SUPERVISOR / LECTURER: <strong>{activeDocument.metadata.lecturerName}</strong>
                  </p>
                )}
                <p className="text-xs font-sans text-slate-400 pt-2">
                  {activeDocument.metadata?.submissionDate || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>

              {/* Sections & Body Content */}
              <div className="space-y-6">
                {activeDocument.sections.map((sec, idx) => (
                  <div key={sec.id} className="space-y-2">
                    <h2 className="text-base font-bold uppercase tracking-wide border-b border-slate-100 pb-1">
                      {sec.level === 1 ? `CHAPTER ${idx + 1}: ` : ''}{sec.title}
                    </h2>
                    <div className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans indent-6">
                      {sec.content || '[Section under active development]'}
                    </div>
                  </div>
                ))}
              </div>

              {/* References List */}
              {activeDocument.references.length > 0 && (
                <div className="pt-6 border-t border-slate-200 space-y-2">
                  <h2 className="text-base font-bold uppercase tracking-wide">REFERENCES</h2>
                  <div className="space-y-1.5 text-xs font-sans pl-6 -indent-6">
                    {activeDocument.references.map((ref) => (
                      <p key={ref.id} className="leading-relaxed">
                        {ref.authors} ({ref.year || 'n.d.'}). {ref.title}. {ref.doi && `https://doi.org/${ref.doi}`}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: PREMIUM UPGRADE PROMPT                           */}
      {/* ========================================================= */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto">
              <Crown size={24} />
            </div>

            <div className="space-y-1 max-w-sm mx-auto">
              <span className="text-xs font-medium text-blue-600">
                Studio Plan Feature
              </span>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                Academic Studio
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Academic Studio provides multi-chapter dissertation planning, student outline approval, section-by-section writing, real source citations, and Word &amp; PDF export.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-left space-y-1.5 text-xs border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>Multi-chapter Thesis, Term Paper &amp; Proposal generation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>Source Citations: APA, Harvard, MLA &amp; IEEE styles</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>Direct export to formatted Microsoft Word (.docx) &amp; PDF</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan('studio');
                  setShowCheckoutModal(true);
                  setShowUpgradeModal(false);
                }}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors min-h-[44px]"
              >
                Upgrade to Academic Studio
              </button>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-medium cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================= */}
      {/* MODAL 5: QUIET UPGRADE PROMPT (SPEC: ONE CARD, ONE PRIMARY BUTTON) */}
      {/* ========================================================= */}
      {showQuietUpgrade && (
        <div className="fixed inset-0 z-50 bg-[#111827]/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg max-w-sm w-full p-6 space-y-4 shadow-lg text-left">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#2563EB]">
                Plus &amp; Studio Feature
              </span>
              <h3 className="font-bold text-base text-[#111827] dark:text-white">
                {showQuietUpgrade.feature}
              </h3>
              <p className="text-xs text-[#5B6472] dark:text-slate-400 leading-relaxed">
                {showQuietUpgrade.description}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(showQuietUpgrade.feature.includes('Version') ? 'studio' : 'plus');
                  setShowQuietUpgrade(null);
                  setShowCheckoutModal(true);
                }}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm min-h-[44px]"
              >
                See plans &amp; Upgrade
              </button>
              <button
                type="button"
                onClick={() => setShowQuietUpgrade(null)}
                className="w-full py-2 text-[#5B6472] hover:text-[#111827] text-xs font-medium cursor-pointer min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Checkout Modal */}
      <SubscriptionCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        initialPlan={checkoutPlan}
        currentProfile={profile}
        onSubscriptionUpdated={(upd) => {
          if (setProfile) setProfile(upd);
          setShowCheckoutModal(false);
          showToast(`Upgraded to ${upd.tier === 'studio' ? 'Academic Studio' : 'Plus'}! Workspace unlocked.`);
          handleStartCreation();
        }}
      />
    </div>
  );
};

export default AcademicStudio;
