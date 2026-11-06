import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Plus,
  Sparkles,
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
  Wand2,
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
  Zap,
  Bookmark,
  Share2,
  Crown
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
  UserProfile
} from '../types';
import { DBService } from '../services/db';
import { GeminiService } from '../services/gemini';
import { generateDocxBlob, downloadDocx } from '../utils/docxExport';
import KorsIQLogo from './KorsIQLogo';

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
  const isPremium = profile.isPro || profile.tier === 'scholar' || profile.tier === 'sage';
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
      showToast('Could not generate plan right now. Please try again.');
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
      showToast('Section generation failed. Please try again.');
    } finally {
      setIsSectionGenerating(false);
    }
  };

  // BATCH GENERATE ALL EMPTY/APPROVED SECTIONS SEQUENTIALLY
  const handleBatchGenerateAll = async () => {
    if (!activeDocument) return;
    const pendingSections = activeDocument.sections.filter((s) => !s.content || s.content.trim().length === 0);
    if (pendingSections.length === 0) {
      showToast('All sections already have content. Use single-section regeneration to rewrite.');
      return;
    }

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
      } catch (err) {
        console.warn(`Batch failed on section ${sec.title}:`, err);
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

  // IN-CONTEXT AI TEXT ASSISTANT
  const handleContextualAssist = async (instruction: string) => {
    if (!activeDocument || !editorText) return;

    const textToTransform = selectedTextSnippet || editorText;
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
    } catch (err) {
      console.error('Contextual assist error:', err);
      showToast('AI assistance failed.');
    } finally {
      setIsAssistLoading(false);
    }
  };

  // =========================================================
  // DOCUMENT REVIEW & QUALITY AUDIT
  // =========================================================

  const handleRunDocumentReview = async () => {
    if (!activeDocument) return;
    const fullText = activeDocument.sections.map((s) => `## ${s.title}\n${s.content}`).join('\n\n');

    if (!fullText || fullText.trim().length < 50) {
      showToast('Please draft your document sections before running an audit.');
      return;
    }

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
      showToast('Failed to complete document audit.');
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
        <div className="space-y-8">
          {/* Top Banner / Studio Branding */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold uppercase tracking-widest border border-indigo-400/30">
                  <Sparkles size={12} className="text-indigo-400" />
                  <span>KorsIQ Academic Studio</span>
                  <span className="bg-amber-400 text-slate-950 text-[9px] px-1.5 py-0.2 rounded font-black">PRO</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white leading-tight">
                  Academic Planning, Writing &amp; Review Studio
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Formulate tailored academic plans, inspect and approve outlines before generation, draft section-by-section with genuine reference intelligence, and export publication-ready Word DOCX and PDF documents.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  onClick={handleStartCreation}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={16} />
                  <span>New Document</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-800/80">
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Papers</p>
                <p className="text-xl font-bold text-white mt-0.5">{documents.length}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Words Generated</p>
                <p className="text-xl font-bold text-indigo-300 mt-0.5">{overallWordCount.toLocaleString()}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doc Types</p>
                <p className="text-xl font-bold text-white mt-0.5">{DOCUMENT_TYPES.length} Supported</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Export Formats</p>
                <p className="text-xl font-bold text-emerald-400 mt-0.5">DOCX &amp; PDF</p>
              </div>
            </div>
          </div>

          {/* Search, Filter & Quick Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search manuscripts by title, course..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-medium outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {['assignment', 'term_paper', 'thesis', 'research_proposal'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    typeFilter === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Document Cards Grid */}
          {isLoadingDocs ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Loading Academic Manuscripts...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-4">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto">
                <FileText size={28} />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-serif font-bold text-lg text-slate-900 dark:text-white">No academic documents yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Start your first university assignment, term paper, or dissertation. KorsIQ generates custom chapter outlines based on your assignment instructions.
                </p>
              </div>
              <button
                onClick={handleStartCreation}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                <Plus size={16} />
                <span>Create New Paper</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDocuments.map((doc) => {
                const progressPct = Math.min(100, Math.round(((doc.currentWordCount || 0) / (doc.targetWordCount || 1)) * 100));
                const statusColor =
                  doc.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : doc.status === 'review'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : doc.status === 'planning'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200';

                return (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200 flex flex-col justify-between group cursor-pointer"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {doc.docType.replace('_', ' ')}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                          {doc.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-serif font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                          {doc.title}
                        </h3>
                        {doc.subject && (
                          <p className="text-xs text-slate-400 font-medium truncate">
                            {doc.subject}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 pt-5 mt-4 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                          <span>{doc.currentWordCount.toLocaleString()} / {doc.targetWordCount.toLocaleString()} words</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{progressPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400">
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
                            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
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
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-wider cursor-pointer transition-colors"
            >
              <ArrowLeft size={16} />
              <span>Back to Documents</span>
            </button>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-3 py-1 rounded-full">
              Outline Approval Required
            </span>
          </div>

          {/* Outline Inspection Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                {activeDocument.docType.replace('_', ' ')} • {activeDocument.citationStyle} Citation
              </span>
              <h2 className="font-serif font-bold text-2xl text-slate-950 dark:text-white">
                {activeDocument.title}
              </h2>
              {activeDocument.metadata?.abstract && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                  <strong>AI Strategic Plan: </strong>
                  {activeDocument.metadata.abstract}
                </div>
              )}
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl flex items-start gap-3">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-300">
                  Student Verification Mandatory Before Generation
                </p>
                <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                  You are in complete control of this manuscript. Review the recommended structure below, reorder chapters, edit titles, add custom guidance, or remove unwanted sections. KorsIQ will only generate approved sections.
                </p>
              </div>
            </div>

            {/* Editable Outline List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-base text-slate-900 dark:text-white">
                  Document Outline &amp; Chapters ({activeDocument.outline.length} Sections)
                </h3>
                <button
                  onClick={handleAddOutlineItem}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Section</span>
                </button>
              </div>

              <div className="space-y-3">
                {activeDocument.outline.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl space-y-3 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateOutlineItemTitle(item.id, e.target.value)}
                          className="font-serif font-bold text-sm text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none w-full"
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
                        <div className="text-[11px] text-indigo-700 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/40 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                          <span className="font-bold">Why AI Recommends This: </span>
                          {item.rationale}
                        </div>
                      )}

                      {/* Personal Student Guidance input */}
                      <div className="pt-2">
                        <input
                          type="text"
                          value={item.personalInstructions || ''}
                          onChange={(e) => handleUpdateOutlineItemInstructions(item.id, e.target.value)}
                          placeholder="Add custom instructions for this section (optional, e.g. cite 2023 IEEE papers)..."
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approval Action Footer */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium">
                Allocated word goal: <strong>{activeDocument.targetWordCount.toLocaleString()} words</strong> across {activeDocument.outline.length} sections.
              </div>

              <button
                type="button"
                onClick={handleApproveEntireOutline}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 transition-all"
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
          {/* Top Control Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveDocId(null)}
                className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Back to Documents"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h2 className="font-serif font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                  {activeDocument.title}
                </h2>
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  {activeDocument.docType.replace('_', ' ')} • {activeDocument.citationStyle} • {activeDocument.currentWordCount.toLocaleString()} words
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchGenerateAll}
                disabled={isSectionGenerating || !!batchProgress}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Wand2 size={14} className="text-indigo-600" />
                <span>Batch Generate All</span>
              </button>

              <button
                onClick={handleRunDocumentReview}
                disabled={isReviewLoading}
                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileCheck size={14} />
                <span>Run Audit</span>
              </button>

              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                <Download size={14} />
                <span>Export DOCX / PDF</span>
              </button>
            </div>
          </div>

          {/* Batch Progress Modal */}
          {batchProgress && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-indigo-900 dark:text-indigo-200">
                    Drafting Section {batchProgress.current} of {batchProgress.total}
                  </p>
                  <p className="text-indigo-700 dark:text-indigo-400 truncate max-w-sm">
                    {batchProgress.title}
                  </p>
                </div>
              </div>
              <div className="text-xs font-bold text-indigo-600">
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </div>
            </div>
          )}

          {/* 3-COLUMN WORKSPACE GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[650px]">
            {/* COLUMN 1: LEFT SIDEBAR - OUTLINE & NAVIGATION (3 Cols) */}
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-4 h-full flex flex-col justify-between shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Sections ({activeDocument.sections.length})
                    </span>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">
                      {Math.min(100, Math.round((activeDocument.currentWordCount / activeDocument.targetWordCount) * 100))}% Complete
                    </span>
                  </div>

                  {/* Section List */}
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                    {activeDocument.sections.map((sec, idx) => {
                      const isActive = sec.id === activeSectionId;
                      const hasContent = sec.content && sec.content.trim().length > 0;

                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setActiveSectionId(sec.id)}
                          className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer flex items-start gap-2.5 ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                              : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : hasContent
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {hasContent ? '✓' : idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate leading-tight">
                              {sec.title}
                            </p>
                            <p className={`text-[10px] mt-0.5 ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                              {sec.wordCount || 0} words
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-[11px] text-slate-500 space-y-1 border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between font-semibold">
                    <span>Target Word Goal:</span>
                    <span>{activeDocument.targetWordCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Written So Far:</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {activeDocument.currentWordCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: CENTER - RICH DOCUMENT EDITOR (6 Cols) */}
            <div className="lg:col-span-6 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs flex flex-col h-full">
                {/* Active Section Header */}
                {(() => {
                  const currentSec = activeDocument.sections.find((s) => s.id === activeSectionId);
                  const currentOutline = activeDocument.outline.find((o) => o.id === currentSec?.outlineItemId);

                  return (
                    <div className="space-y-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">
                          Section {currentSec?.order || 1} of {activeDocument.sections.length}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          Target: ~{currentOutline?.targetWords || 400} words
                        </span>
                      </div>
                      <h3 className="font-serif font-bold text-lg text-slate-900 dark:text-white">
                        {currentSec?.title || 'Section Editor'}
                      </h3>
                      {currentOutline?.description && (
                        <p className="text-xs text-slate-500 italic">
                          {currentOutline.description}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* AI Section Generation Tools */}
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleGenerateActiveSection('generate')}
                    disabled={isSectionGenerating}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Wand2 size={12} />
                    <span>{isSectionGenerating ? 'Generating...' : 'Generate Draft'}</span>
                  </button>

                  <button
                    onClick={() => handleGenerateActiveSection('expand')}
                    disabled={isSectionGenerating || !editorText}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-40"
                  >
                    Expand
                  </button>

                  <button
                    onClick={() => handleGenerateActiveSection('academic_tone')}
                    disabled={isSectionGenerating || !editorText}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-40"
                  >
                    Academic Tone
                  </button>

                  <button
                    onClick={() => handleGenerateActiveSection('grammar')}
                    disabled={isSectionGenerating || !editorText}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-40"
                  >
                    Grammar
                  </button>

                  <button
                    onClick={() => handleGenerateActiveSection('regenerate')}
                    disabled={isSectionGenerating}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-40 ml-auto"
                    title="Regenerate Section"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* Editor Textarea */}
                <div className="flex-1 flex flex-col relative">
                  <textarea
                    value={editorText}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    onSelect={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      const sel = target.value.substring(target.selectionStart, target.selectionEnd);
                      if (sel && sel.trim().length > 3) {
                        setSelectedTextSnippet(sel);
                        setEditorSelectionRange({ start: target.selectionStart, end: target.selectionEnd });
                      }
                    }}
                    placeholder="Draft your section content here in scholarly prose, or click 'Generate Draft' to create the initial section based on your approved outline and uploaded reference materials..."
                    className="w-full flex-1 min-h-[380px] p-4 bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-serif text-sm leading-relaxed text-slate-800 dark:text-slate-200 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-600 transition-all resize-none custom-scrollbar"
                  />

                  {/* Selected Text Floating Helper */}
                  {selectedTextSnippet && (
                    <div className="absolute bottom-4 left-4 right-4 bg-slate-950 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3 text-xs border border-slate-800">
                      <div className="truncate flex-1">
                        <span className="text-indigo-400 font-bold">Selected: </span>
                        <span className="italic truncate">"{selectedTextSnippet}"</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleContextualAssist('Elevate academic tone and vocabulary')}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                        >
                          Scholarly Rewrite
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
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    Words in section: <strong className="text-slate-700 dark:text-slate-300">{editorText.trim().split(/\s+/).filter(Boolean).length}</strong>
                  </span>
                  <span>Autosaved locally &amp; to cloud</span>
                </div>
              </div>
            </div>

            {/* COLUMN 3: RIGHT SIDEBAR - TABBED ASSISTANT (3 Cols) */}
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-4 h-full flex flex-col shadow-xs">
                {/* Tabs */}
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-[10px] font-bold uppercase tracking-wider">
                  <button
                    onClick={() => setActiveRightTab('assistant')}
                    className={`flex-1 py-1.5 rounded-xl cursor-pointer transition-colors ${
                      activeRightTab === 'assistant' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Assistant
                  </button>
                  <button
                    onClick={() => setActiveRightTab('references')}
                    className={`flex-1 py-1.5 rounded-xl cursor-pointer transition-colors ${
                      activeRightTab === 'references' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Sources
                  </button>
                  <button
                    onClick={() => setActiveRightTab('review')}
                    className={`flex-1 py-1.5 rounded-xl cursor-pointer transition-colors ${
                      activeRightTab === 'review' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Review
                  </button>
                  <button
                    onClick={() => setActiveRightTab('versions')}
                    className={`flex-1 py-1.5 rounded-xl cursor-pointer transition-colors ${
                      activeRightTab === 'versions' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Versions
                  </button>
                </div>

                {/* TAB CONTENT A: IN-CONTEXT ASSISTANT */}
                {activeRightTab === 'assistant' && (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 text-xs space-y-1">
                        <p className="font-bold text-indigo-900 dark:text-indigo-300">Contextual Writing AI</p>
                        <p className="text-indigo-800 dark:text-indigo-300/80 text-[11px]">
                          Select text in your editor to transform specific paragraphs, or request section-wide improvements below.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Quick Actions
                        </label>
                        <div className="space-y-1">
                          {[
                            'Add empirical evidence & statistics',
                            'Synthesize theoretical counter-arguments',
                            'Improve sentence variety & flow',
                            'Formulate concluding paragraph',
                          ].map((chip) => (
                            <button
                              key={chip}
                              onClick={() => handleContextualAssist(chip)}
                              disabled={isAssistLoading}
                              className="w-full text-left p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-[11px] text-slate-700 dark:text-slate-300 hover:text-indigo-600 font-medium transition-colors cursor-pointer border border-slate-100 dark:border-slate-800"
                            >
                              + {chip}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <textarea
                        value={contextualAssistPrompt}
                        onChange={(e) => setContextualAssistPrompt(e.target.value)}
                        placeholder="Custom instruction for AI (e.g. 'Draft 2 sentences bridging to Chapter 3')..."
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none focus:border-indigo-600 border border-slate-200 dark:border-slate-700 resize-none h-20"
                      />
                      <button
                        onClick={() => {
                          if (contextualAssistPrompt.trim()) {
                            handleContextualAssist(contextualAssistPrompt.trim());
                            setContextualAssistPrompt('');
                          }
                        }}
                        disabled={isAssistLoading || !contextualAssistPrompt.trim()}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                      >
                        {isAssistLoading ? 'Processing...' : 'Apply Instruction'}
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT B: REFERENCE SOURCES */}
                {activeRightTab === 'references' && (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Linked Sources ({activeDocument.references.length})
                        </span>
                        <button
                          onClick={() => setShowAddRefModal(true)}
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          + Add Source
                        </button>
                      </div>

                      {activeDocument.references.length === 0 ? (
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                          <p>No reference materials linked yet.</p>
                          <button
                            onClick={() => setShowAddRefModal(true)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                          >
                            Add First Source
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                          {activeDocument.references.map((ref) => (
                            <div
                              key={ref.id}
                              className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 rounded-2xl space-y-1.5 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-slate-900 dark:text-white line-clamp-2">
                                  {ref.title}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleInsertCitation(ref)}
                                  className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md text-[10px] font-bold hover:bg-indigo-200 cursor-pointer shrink-0"
                                  title="Insert in-text citation at cursor"
                                >
                                  Cite
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {ref.authors} ({ref.year || 'n.d.'})
                              </p>
                              {ref.contentSnippet && (
                                <p className="text-[10px] text-slate-400 italic line-clamp-2 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                  "{ref.contentSnippet}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB CONTENT C: COMPREHENSIVE DOCUMENT REVIEW */}
                {activeRightTab === 'review' && (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    {isReviewLoading ? (
                      <div className="p-8 text-center space-y-2 my-auto">
                        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs text-slate-400 font-semibold">Running 9-Dimension Scholarly Audit...</p>
                      </div>
                    ) : !reviewResult ? (
                      <div className="p-4 text-center space-y-3 my-auto text-xs text-slate-500">
                        <p>Evaluate your document across grammar, tone, citation integrity, and unsupported claims.</p>
                        <button
                          onClick={handleRunDocumentReview}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm"
                        >
                          Start Academic Review
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                        {/* Score Card */}
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-widest">
                              Academic Quality
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                              {reviewResult.summary}
                            </p>
                          </div>
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 ml-2">
                            {reviewResult.academicQualityScore}%
                          </span>
                        </div>

                        {/* Suggestions List */}
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Suggestions ({reviewResult.suggestions.length})
                          </p>
                          {reviewResult.suggestions.map((sug) => {
                            if (sug.status !== 'pending') return null;

                            return (
                              <div
                                key={sug.id}
                                className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                    {sug.type}
                                  </span>
                                  <span className="text-[9px] text-slate-400 capitalize">
                                    {sug.severity}
                                  </span>
                                </div>
                                <p className="font-bold text-slate-900 dark:text-white leading-tight">
                                  {sug.title}
                                </p>
                                <p className="text-[11px] text-slate-500 leading-snug">
                                  {sug.explanation}
                                </p>

                                {sug.suggestedReplacement && (
                                  <div className="p-2 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 text-[11px] text-emerald-800 dark:text-emerald-300">
                                    <strong>Recommended: </strong>"{sug.suggestedReplacement}"
                                  </div>
                                )}

                                <div className="flex items-center justify-end gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDismissReviewSuggestion(sug.id)}
                                    className="px-2 py-1 text-slate-400 hover:text-slate-600 text-[10px] font-semibold cursor-pointer"
                                  >
                                    Dismiss
                                  </button>
                                  {sug.suggestedReplacement && (
                                    <button
                                      type="button"
                                      onClick={() => handleApplyReviewSuggestion(sug)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      Accept
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB CONTENT D: VERSION HISTORY */}
                {activeRightTab === 'versions' && (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={versionNote}
                          onChange={(e) => setVersionNote(e.target.value)}
                          placeholder="Note for snapshot (e.g. Before Chapter 3 rewrite)..."
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700"
                        />
                        <button
                          onClick={handleSaveVersionSnapshot}
                          disabled={isVersionSaving}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          {isVersionSaving ? 'Saving...' : 'Save Snapshot'}
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                        {versions.map((ver) => (
                          <div
                            key={ver.id}
                            className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {ver.wordCount.toLocaleString()} words
                              </span>
                              <button
                                onClick={() => handleRestoreVersion(ver)}
                                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Restore
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {new Date(ver.createdAt).toLocaleString()}
                            </p>
                            {ver.notes && (
                              <p className="text-[11px] text-slate-500 italic">
                                {ver.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: NEW DOCUMENT CREATION WIZARD                     */}
      {/* ========================================================= */}
      {isCreatingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                  Step {wizardStep} of 3
                </span>
                <h3 className="font-serif font-bold text-xl text-slate-900 dark:text-white">
                  {wizardStep === 1 ? 'Manuscript Parameters' : wizardStep === 2 ? 'Assignment Prompt & Instructions' : 'Reference Materials & Sources'}
                </h3>
              </div>
              <button
                onClick={() => setIsCreatingDoc(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* STEP 1: Title, Document Type, Subject, Words, Style */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Document Title or Working Topic *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="e.g. Distributed Consensus in Cloud Infrastructure: An Empirical Comparison"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Document Type
                    </label>
                    <select
                      value={newDocType}
                      onChange={(e) => {
                        const t = e.target.value as AcademicDocumentType;
                        setNewDocType(t);
                        const match = DOCUMENT_TYPES.find((d) => d.id === t);
                        if (match) setNewDocWords(match.defaultWords);
                      }}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-indigo-600"
                    >
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Citation Style
                    </label>
                    <select
                      value={newDocCitation}
                      onChange={(e) => setNewDocCitation(e.target.value as CitationStyle)}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-indigo-600"
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Course Code / Subject
                    </label>
                    <input
                      type="text"
                      value={newDocSubject}
                      onChange={(e) => setNewDocSubject(e.target.value)}
                      placeholder="e.g. CSC 401"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Target Word Count Goal
                    </label>
                    <input
                      type="number"
                      step={100}
                      value={newDocWords}
                      onChange={(e) => setNewDocWords(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newDocTitle.trim()) {
                        showToast('Please enter a title or topic.');
                        return;
                      }
                      setWizardStep(2);
                    }}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>Next: Assignment Prompt</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Assignment Instructions & Cover Details */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Assignment Instructions / Rubric Guidelines
                  </label>
                  <textarea
                    rows={5}
                    value={newDocInstructions}
                    onChange={(e) => setNewDocInstructions(e.target.value)}
                    placeholder="Paste your lecturer's assignment instructions, guidelines, specific questions to address, or theoretical expectations here..."
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-600"
                  />
                  <p className="text-[11px] text-slate-400">
                    The AI planning engine strictly follows these instructions when structuring chapters.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Department / Faculty
                    </label>
                    <input
                      type="text"
                      value={newDocDepartment}
                      onChange={(e) => setNewDocDepartment(e.target.value)}
                      placeholder="e.g. Department of Computer Science"
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Lecturer / Supervisor Name
                    </label>
                    <input
                      type="text"
                      value={newDocLecturer}
                      onChange={(e) => setNewDocLecturer(e.target.value)}
                      placeholder="e.g. Prof. R. Sterling"
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-bold uppercase cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
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
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      Reference Material ({newDocReferences.length} added)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddRefModal(true)}
                      className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      + Add Reference
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    KorsIQ associates generated arguments with real references. Never fabricates citations.
                  </p>
                </div>

                <div className="flex justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-bold uppercase cursor-pointer"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateOutline}
                    disabled={isPlanningLoading}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-2xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                  >
                    {isPlanningLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Formulating Plan &amp; Outline...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 size={16} />
                        <span>Generate Academic Plan</span>
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-serif font-bold text-base text-slate-900 dark:text-white">
                Add Reference Source
              </h3>
              <button
                onClick={() => setShowAddRefModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Paper / Book Title *
                </label>
                <input
                  type="text"
                  value={newRefTitle}
                  onChange={(e) => setNewRefTitle(e.target.value)}
                  placeholder="e.g. Deep Residual Learning for Image Recognition"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Authors *
                </label>
                <input
                  type="text"
                  value={newRefAuthors}
                  onChange={(e) => setNewRefAuthors(e.target.value)}
                  placeholder="e.g. He, K., Zhang, X., Ren, S., & Sun, J."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Year of Publication
                  </label>
                  <input
                    type="text"
                    value={newRefYear}
                    onChange={(e) => setNewRefYear(e.target.value)}
                    placeholder="2023"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    DOI / Link
                  </label>
                  <input
                    type="text"
                    value={newRefDoi}
                    onChange={(e) => setNewRefDoi(e.target.value)}
                    placeholder="10.1109/CVPR.2016.90"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Relevant Excerpt / Key Findings
                </label>
                <textarea
                  rows={3}
                  value={newRefSnippet}
                  onChange={(e) => setNewRefSnippet(e.target.value)}
                  placeholder="Paste excerpt or key quotation for the AI to synthesize..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none border border-slate-200 dark:border-slate-700 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddRefModal(false)}
                className="px-4 py-2 text-slate-500 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveManualReference}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                  Manuscript Export &amp; Print
                </span>
                <h3 className="font-serif font-bold text-xl text-slate-900 dark:text-white">
                  Document Assembly Preview
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Export Actions */}
            <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <button
                onClick={handleExportDocx}
                disabled={isExportingDocx}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-600 active:scale-95 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-md shadow-blue-700/20 disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isExportingDocx ? 'Exporting Word...' : 'Microsoft Word (.docx)'}</span>
              </button>

              <button
                onClick={handlePrintPdf}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20"
              >
                <Printer size={14} />
                <span>Print / Save as PDF</span>
              </button>

              <div className="text-xs text-slate-400 ml-auto font-medium">
                {activeDocument.currentWordCount.toLocaleString()} total words • {activeDocument.citationStyle}
              </div>
            </div>

            {/* Live Visual Academic Preview */}
            <div className="p-8 sm:p-12 bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-inner font-serif text-sm space-y-8 max-h-[500px] overflow-y-auto custom-scrollbar">
              {/* Cover Page */}
              <div className="text-center space-y-6 pb-12 border-b border-dashed border-slate-300">
                <p className="text-sm font-bold uppercase tracking-wider">
                  {activeDocument.metadata?.institution || 'INSTITUTION OF HIGHER LEARNING'}
                </p>
                <p className="text-xs uppercase font-medium">
                  {activeDocument.metadata?.faculty || activeDocument.metadata?.department || 'FACULTY OF ACADEMIC STUDIES'}
                </p>
                <div className="py-8">
                  <h1 className="text-2xl font-bold uppercase tracking-wide leading-tight max-w-xl mx-auto">
                    {activeDocument.title}
                  </h1>
                  <p className="text-xs italic mt-3 text-slate-600">
                    A {activeDocument.docType.replace('_', ' ').toUpperCase()} SUBMITTED FOR {activeDocument.metadata?.courseCode || activeDocument.subject || 'ACADEMIC COURSE'}
                  </p>
                </div>
                <div className="space-y-1 text-xs">
                  <p className="uppercase text-[11px] text-slate-500 font-sans font-bold">BY</p>
                  <p className="font-bold text-sm">{activeDocument.metadata?.studentName || profile.name}</p>
                  {activeDocument.metadata?.studentId && <p>ID: {activeDocument.metadata.studentId}</p>}
                </div>
                {activeDocument.metadata?.lecturerName && (
                  <p className="text-xs pt-4">
                    SUPERVISOR / LECTURER: <strong>{activeDocument.metadata.lecturerName}</strong>
                  </p>
                )}
                <p className="text-xs font-sans text-slate-400 pt-4">
                  {activeDocument.metadata?.submissionDate || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>

              {/* Sections & Body Content */}
              <div className="space-y-8">
                {activeDocument.sections.map((sec, idx) => (
                  <div key={sec.id} className="space-y-3">
                    <h2 className="text-lg font-bold uppercase tracking-wide border-b border-slate-100 pb-1">
                      {sec.level === 1 ? `CHAPTER ${idx + 1}: ` : ''}{sec.title}
                    </h2>
                    <div className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-serif indent-6">
                      {sec.content || '[Section under active development]'}
                    </div>
                  </div>
                ))}
              </div>

              {/* References List */}
              {activeDocument.references.length > 0 && (
                <div className="pt-8 border-t border-slate-200 space-y-3">
                  <h2 className="text-lg font-bold uppercase tracking-wide">REFERENCES</h2>
                  <div className="space-y-2 text-xs font-serif pl-6 -indent-6">
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/20">
              <Crown size={32} />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900">
                Exclusive Scholar Tier
              </span>
              <h3 className="font-serif font-bold text-2xl text-slate-900 dark:text-white">
                Unlock KorsIQ Academic Studio
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Academic Studio gives you multi-chapter dissertation planning, student outline approval, section-by-section writing, genuine reference intelligence, and export to Microsoft Word &amp; PDF.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-left space-y-2 text-xs border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Multi-chapter Dissertation, Term Paper &amp; Proposal generation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Reference Intelligence: Real source citations in APA, Harvard, MLA &amp; IEEE</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Export directly to formatted Microsoft Word (.docx) &amp; PDF</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Comprehensive 9-dimension scholarly peer review audit</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  const updatedProfile: UserProfile = {
                    ...profile,
                    isPro: true,
                    tier: 'scholar',
                  };
                  if (setProfile) setProfile(updatedProfile);
                  await DBService.saveProfile(userId, updatedProfile);
                  setShowUpgradeModal(false);
                  showToast('Upgraded to Scholar Tier! Academic Studio unlocked.');
                  handleStartCreation();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                Upgrade to Scholar Plan
              </button>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-2.5 text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicStudio;
