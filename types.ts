
export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export type SubscriptionTier = 'free' | 'scholar' | 'sage';

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
}

export type NotificationType = 'message' | 'session' | 'content';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  link?: AppState;
  metadata?: any;
}

export interface UserProfile {
  name: string;
  email: string;
  university: string;
  level: string;
  age: number;
  semesterEnd: string;
  targetCGPA?: number;
  avatarIcon?: string;
  onboarded: boolean;
  tutorialSeen: boolean;
  isPro: boolean;
  tier: SubscriptionTier;
  notifications: NotificationSettings;
}

export interface StudySession {
  id: string;
  courseId: string;
  day: string; // 'Monday', 'Tuesday', etc.
  duration: number; // in minutes
  mode: 'Deep Dive' | 'Review' | 'Practice' | 'Reading';
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
  role: 'owner' | 'admin' | 'member';
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

export type AppState = 'onboarding' | 'dashboard' | 'courses' | 'hub' | 'schedule' | 'timetable' | 'calculator' | 'pomodoro' | 'groups' | 'profile' | 'analytics' | 'library' | 'admin';
