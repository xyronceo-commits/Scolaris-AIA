
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

export interface GroupMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isIrrelevant?: boolean;
}

export interface SharedMaterial {
  courseId: string;
  courseCode: string;
  sharedBy: string;
  timestamp: number;
  fileName?: string;
  content?: string; // For direct uploads
  s3Key?: string;   // Unique S3 object key
  s3Url?: string;   // Object storage URL (real-time generated or direct)
}

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  inviteCode: string;
  members: string[];
  messages: GroupMessage[];
  sharedMaterials: SharedMaterial[];
}

export type AppState = 'onboarding' | 'dashboard' | 'courses' | 'hub' | 'schedule' | 'timetable' | 'calculator' | 'pomodoro' | 'pro' | 'groups' | 'profile' | 'analytics' | 'library';
