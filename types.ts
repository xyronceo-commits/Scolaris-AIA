
export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export type SubscriptionTier = 'free' | 'scholar' | 'sage' | 'plus' | 'studio';
export type SubscriptionPlanType = 'free' | 'plus' | 'studio';
export type PaymentStatus = 'none' | 'pending' | 'paid' | 'failed' | 'abandoned' | 'cancelled' | 'refunded';
export type SubscriptionStatus = 'active' | 'inactive' | 'pending' | 'past_due' | 'cancelled' | 'expired' | 'manual_active';

export interface UserSubscription {
  id?: string;
  userId: string;
  planTier: SubscriptionPlanType | SubscriptionTier;
  billingCycle: 'monthly' | 'annual';
  status: SubscriptionStatus;
  paymentProvider: 'paystack' | 'manual_admin' | 'manual' | 'test';
  paymentReference?: string;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd?: string;
  cancelledAt?: string;
  paystackSubscriptionCode?: string;
  paystackCustomerCode?: string;
  paystackPlanCode?: string;
  paystackAuthorizationCode?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

/** Check if user has an active paid plan (Plus or Studio / Scholar or Sage) */
export function isPaidUser(profile?: { tier?: string; isPro?: boolean } | null): boolean {
  if (!profile) return false;
  if (!profile.isPro) return false;
  const t = (profile.tier || '').toLowerCase();
  return t === 'plus' || t === 'studio' || t === 'scholar' || t === 'sage';
}

/** Check if user is entitled to Academic Studio workspace */
export function hasStudioPrivileges(profile?: { tier?: string; isPro?: boolean } | null): boolean {
  if (!profile) return false;
  if (!profile.isPro) return false;
  const t = (profile.tier || '').toLowerCase();
  return t === 'studio' || t === 'sage' || t === 'plus' || t === 'scholar';
}

/** Check if user is entitled to full Studio export and version history (Academic Studio plan) */
export function hasFullStudioPrivileges(profile?: { tier?: string; isPro?: boolean } | null): boolean {
  if (!profile) return false;
  if (!profile.isPro) return false;
  const t = (profile.tier || '').toLowerCase();
  return t === 'studio' || t === 'sage';
}

export interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  difficulty: Difficulty;
  description?: string;
  progress?: number; // 0 - 100%
  studyHours?: number; // total logged study hours
}

export interface NotificationSettings {
  messages: boolean;
  sessions: boolean;
  aiContent: boolean;
  browserPush?: boolean;
  reminderIntervalMinutes?: number;
  examReminders?: boolean;
  taskReminders?: boolean;
}

export type NotificationType = 'message' | 'session' | 'content' | 'task';

export interface AppNotification {
  id: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  link?: AppState;
  metadata?: any;
  createdAt?: string;
}

export type TaskCategory = 'assignment' | 'revision' | 'exam' | 'deadline' | 'general';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskReminder = 'none' | 'at_time' | '15_min' | '1_hour' | '1_day';

export interface AcademicTask {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: TaskCategory;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  priority: TaskPriority;
  reminder: TaskReminder;
  completed: boolean;
  completedAt?: string;
  courseId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  university: string;
  level: string;
  age: number;
  semesterEnd: string;
  targetCGPA?: number;
  gradingScale?: number | string;
  avatarIcon?: string;
  onboarded: boolean;
  tutorialSeen: boolean;
  isPro: boolean;
  tier: SubscriptionTier;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  paymentStatus?: PaymentStatus;
  subscriptionEnd?: string;
  notifications: NotificationSettings;
  department?: string;
  major?: string;
  academicGoals?: string;
  studyStyle?: string;
  assistanceAreas?: string[];
}

export interface StudySession {
  id: string;
  courseId: string;
  day: string; // 'Monday', 'Tuesday', etc.
  duration: number; // in minutes
  mode: 'Deep Dive' | 'Review' | 'Practice' | 'Reading';
  topic?: string;
  startTime?: string;
  endTime?: string;
  technique?: string;
  completed?: boolean;
  notes?: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
}

export interface UserFile {
  id: string;
  userId: string;
  courseId: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  storagePath: string;
  downloadUrl?: string;
  uploadedAt: string;
  timestamp: number;
  courseCode?: string;
  courseTitle?: string;
  status?: 'ready' | 'processing' | 'failed';
}

export interface LibraryFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize?: string;
  s3Key: string;
  s3Url?: string;
  timestamp: number;
}

export interface StudyHubData {
  courseId: string;
  summary?: string;
  flashcards?: Flashcard[];
  quizzes?: QuizQuestion[];
  tests?: QuizQuestion[];
  podcastUrl?: string;
  transcript?: string;
  fileContent?: string;
  fileName?: string;
  libraryFiles?: LibraryFile[];
}

export interface GroupMember {
  userId: string;
  name: string;
  email?: string;
  avatarIcon?: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  joinedAt: string | number;
}

export interface GroupMaterial {
  id: string;
  groupId: string;
  courseId?: string;
  courseCode?: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  storagePath: string;
  downloadUrl?: string;
  uploadedBy: string; // userId
  uploadedByName: string;
  uploadedAt: string;
  timestamp: number;
  content?: string; // Extracted plain text for AI indexing & analysis
  s3Key?: string;
  s3Url?: string;
}

export interface GroupDiscussionReply {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  timestamp: number;
  quoteReplyId?: string;
  quoteReplyText?: string;
  quoteReplyAuthor?: string;
}

export interface GroupDiscussionPost {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title?: string;
  content: string;
  timestamp: number;
  postType?: 'thread' | 'material';
  isPinned?: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  repliesCount?: number;
  attachments?: { fileName: string; fileUrl?: string; storagePath?: string; fileType?: string }[];
  replies?: GroupDiscussionReply[];
}

export interface GroupActivity {
  id: string;
  groupId: string;
  type: 'material_uploaded' | 'discussion_created' | 'discussion_reply' | 'member_joined' | 'ai_resource_generated' | 'announcement';
  title: string;
  description: string;
  actorName: string;
  actorId?: string;
  timestamp: number;
  link?: string;
}

export interface GroupMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isIrrelevant?: boolean;
  senderId?: string;
  senderAvatar?: string;
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
  clientTempId?: string;
  status?: 'sending' | 'sent' | 'failed';
}

export interface SharedMaterial {
  id?: string;
  groupId?: string;
  courseId: string;
  courseCode: string;
  sharedBy: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: string;
  timestamp: number;
  fileName?: string;
  fileType?: string;
  fileSize?: string;
  storagePath?: string;
  downloadUrl?: string;
  content?: string; // For direct uploads or extracted text
  extractedText?: string;
  status?: 'pending' | 'processing' | 'ready' | 'failed';
  errorMessage?: string;
  fileSizeBytes?: number;
  s3Key?: string;   // Unique S3 object key
  s3Url?: string;   // Object storage URL (real-time generated or direct)
}

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  course: string; // Course / Subject
  type: 'general' | 'private';
  visibility?: 'public' | 'private'; // Backward compatibility fallback
  inviteCode: string;
  inviteCodeActive?: boolean;
  department?: string;
  level?: string;
  university?: string;
  academicSession?: string;
  groupImage?: string;
  ownerId: string;
  members: (string | GroupMember)[]; // Supports string[] or rich GroupMember[]
  memberCount?: number;
  messages: GroupMessage[];
  sharedMaterials: SharedMaterial[];
  discussions?: GroupDiscussionPost[];
  activityFeed?: GroupActivity[];
  createdAt?: string;
  updatedAt?: string;
}

export type AppState = 
  | 'overview' 
  | 'dashboard' 
  | 'planner' 
  | 'studio' 
  | 'circles' 
  | 'groups' 
  | 'resources' 
  | 'settings' 
  | 'courses' 
  | 'hub' 
  | 'schedule' 
  | 'timetable' 
  | 'calculator' 
  | 'pomodoro' 
  | 'profile' 
  | 'analytics' 
  | 'library' 
  | 'admin' 
  | 'onboarding';

export interface CGPACourseRecord {
  code: string;
  title?: string;
  creditUnits: number;
  grade: string; // 'A', 'B', 'C', 'D', 'E', 'F'
  score?: number;
}

export interface CGPASemester {
  id: number;
  label: string;
  gpa: number;
  totalCredits?: number;
  courses?: CGPACourseRecord[];
}

export interface CGPAAcademicConfig {
  gradingScale: 4.0 | 5.0;
  currentLevel: string;
  currentSemester: string;
  totalSemesters: number;
  completedSemesters: number;
  difficultCourses: string[];
  preferredStudyHours: number;
  examDate?: string;
}

export interface AICgpaAnalysisResult {
  currentCgpa: number;
  targetCgpa: number;
  gradingScale: number;
  gap: number;
  isAchievable: boolean;
  maxPossibleCgpa: number;
  requiredSemesterGpa: number;
  alternativeTarget?: number;
  advisorySummary: string;
  strategicSteps: string[];
  highCreditPriorities: { code: string; units: number; reason: string }[];
  weakAreas: string[];
  strengths: string[];
  studyPlanRecommendations: string[];
}

export interface AIStudyTimetableEntry {
  id: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  startTime: string;
  endTime: string;
  courseCode: string;
  courseTitle: string;
  topic: string;
  activity: string;
  recommendedTechnique: 'Active Recall' | 'Spaced Repetition' | 'Feynman Technique' | 'Past Question Practice' | 'Pomodoro Technique' | 'Interleaved Learning' | 'Practice-Based Learning';
  instructions?: string;
  completed?: boolean;
}

export interface AIRepetitionPlan {
  courseCode: string;
  courseTitle: string;
  creditUnits: number;
  priority: 'high' | 'medium' | 'low';
  readingTechnique: string;
  topicsToPrioritize: string[];
  revisionFrequency: string;
  practiceStrategy: string;
  assessmentMethod: string;
  countdownDays?: number;
}

// ==========================================
// KORSIQ ACADEMIC STUDIO TYPES
// ==========================================

export type AcademicDocumentType = 
  | 'assignment' 
  | 'term_paper' 
  | 'essay' 
  | 'research_proposal' 
  | 'thesis' 
  | 'literature_review' 
  | 'case_study' 
  | 'lab_report' 
  | 'seminar_paper';

export type CitationStyle = 'APA' | 'Harvard' | 'MLA' | 'IEEE';

export type StudioDocumentStatus = 
  | 'planning' 
  | 'outline_approved' 
  | 'drafting' 
  | 'review' 
  | 'completed';

export interface StudioOutlineItem {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  order: number;
  description: string;
  rationale?: string;
  targetWords: number;
  approved: boolean;
  personalInstructions?: string;
  subsections?: StudioOutlineItem[];
}

export interface StudioCitation {
  id: string;
  referenceId: string;
  sourceTitle: string;
  authors?: string;
  year?: string;
  page?: string;
  quote?: string;
  formattedCitation: string;
}

export interface StudioSection {
  id: string;
  outlineItemId: string;
  title: string;
  level: 1 | 2 | 3;
  order: number;
  content: string;
  status: 'empty' | 'generating' | 'drafted' | 'approved';
  wordCount: number;
  citations: StudioCitation[];
  lastEditedAt: string;
}

export interface StudioReference {
  id: string;
  title: string;
  authors: string;
  year?: string;
  sourceType: 'pdf' | 'docx' | 'book' | 'journal' | 'website' | 'group_material';
  contentSnippet?: string;
  fileName?: string;
  fileUrl?: string;
  doi?: string;
  verified: boolean;
}

export interface StudioReviewSuggestion {
  id: string;
  type: 'grammar' | 'tone' | 'structure' | 'citation' | 'unsupported_claim' | 'clarity';
  title: string;
  explanation: string;
  originalText?: string;
  suggestedReplacement?: string;
  severity: 'critical' | 'improvement' | 'minor';
  status: 'pending' | 'accepted' | 'rejected';
}

export interface StudioVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  createdAt: string;
  snapshot: string;
  wordCount: number;
  notes?: string;
}

export interface AcademicDocumentMetadata {
  studentName?: string;
  studentId?: string;
  department?: string;
  faculty?: string;
  institution?: string;
  courseCode?: string;
  courseTitle?: string;
  lecturerName?: string;
  submissionDate?: string;
  abstract?: string;
  includeCoverPage?: boolean;
  includeTableOfContents?: boolean;
  includeReferences?: boolean;
  includeAppendices?: boolean;
}

export interface AcademicDocument {
  id: string;
  userId: string;
  title: string;
  docType: AcademicDocumentType;
  subject: string;
  instructions: string;
  targetWordCount: number;
  currentWordCount: number;
  citationStyle: CitationStyle;
  status: StudioDocumentStatus;
  outline: StudioOutlineItem[];
  sections: StudioSection[];
  references: StudioReference[];
  metadata: AcademicDocumentMetadata;
  createdAt: string;
  updatedAt: string;
  version: number;
}

