
import React from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  Calendar, 
  BrainCircuit, 
  Calculator, 
  Crown, 
  Settings,
  LogOut,
  Plus,
  Zap,
  Link,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Sparkles,
  Search,
  BookMarked,
  Microscope,
  Play,
  RotateCcw,
  CheckCircle2,
  FileText,
  AudioWaveform,
  Trophy,
  Users,
  MessageSquare,
  Share2,
  UserPlus,
  User,
  CreditCard,
  Trash2,
  ShieldCheck,
  Download,
  Upload,
  Folder,
  Timer,
  Clock,
  LayoutGrid,
  AlertCircle,
  Info,
  PieChart,
  Brain,
  Library,
  Bell
} from 'lucide-react';

export const ICONS = {
  Dashboard: <LayoutGrid size={20} />,
  Studio: <FileText size={20} />,
  Courses: <BookOpen size={20} />,
  Schedule: <Calendar size={20} />,
  Timetable: <Calendar size={20} />,
  Calendar: <Calendar size={20} />,
  StudyHub: <BrainCircuit size={20} />,
  Brain: <Brain size={20} />,
  Calculator: <Calculator size={20} />,
  Pomodoro: <Timer size={20} />,
  Groups: <MessageSquare size={20} />,
  Pro: <Crown size={20} />,
  Settings: <Settings size={20} />,
  Logout: <LogOut size={20} />,
  Plus: <Plus size={20} />,
  Zap: <Zap size={16} />,
  Link: <Link size={20} />,
  ChevronRight: <ChevronRight size={20} />,
  ChevronDown: <ChevronDown size={20} />,
  GraduationCap: <GraduationCap size={48} />,
  Sparkles: <Sparkles size={20} />,
  Search: <Search size={20} />,
  BookMarked: <BookMarked size={20} />,
  Folder: <Folder size={20} />,
  Microscope: <Microscope size={20} />,
  Play: <Play size={20} />,
  RotateCcw: <RotateCcw size={20} />,
  CheckCircle: <CheckCircle2 size={20} />,
  FileText: <FileText size={20} />,
  Audio: <AudioWaveform size={20} />,
  Trophy: <Trophy size={20} />,
  Users: <Users size={20} />,
  Message: <MessageSquare size={20} />,
  Share: <Share2 size={16} />,
  UserPlus: <UserPlus size={16} />,
  User: <User size={20} />,
  CreditCard: <CreditCard size={20} />,
  Trash: <Trash2 size={20} />,
  Shield: <ShieldCheck size={20} />,
  Download: <Download size={20} />,
  Upload: <Upload size={20} />,
  Clock: <Clock size={20} />,
  Info: <Info size={20} />,
  Alert: <AlertCircle size={20} />,
  Analytics: <PieChart size={20} />,
  Library: <Library size={20} />,
  Bell: <Bell size={20} />
};

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DIFFICULTY_COLORS = {
  Easy: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Medium: 'bg-amber-50 text-amber-700 border-amber-100',
  Hard: 'bg-rose-50 text-rose-700 border-rose-100'
};

// ==========================================
// BETA: Plan limits & feature allowances
// All values below are provisional beta limits pending 30-day review.
// ==========================================
export const BETA_PLAN_LIMITS = {
  free: {
    name: 'Free',
    price: '₦0',
    priceNumeric: 0,
    tagline: 'Get organised. Track your CGPA and plan your study time.',
    storageLimitBytes: 500 * 1024 * 1024, // 500 MB (beta)
    storageLimitDisplay: '500 MB',
    monthlyUploadsLimit: 15,
    aiCreditsAllowance: 0,
    hasStudioAccess: false,
    canCreateCircles: false, // can join only
    canExportDocxPdf: false,
    hasVersionHistory: false
  },
  plus: {
    name: 'Plus',
    price: '₦7,500 / month',
    priceNumeric: 7500,
    tagline: 'Study smarter. More AI help, storage and Lite Studio.',
    storageLimitBytes: 2 * 1024 * 1024 * 1024, // 2 GB (beta)
    storageLimitDisplay: '2 GB',
    monthlyUploadsLimit: 50,
    aiCreditsAllowance: 250,
    hasStudioAccess: true, // Lite studio
    canCreateCircles: true,
    canExportDocxPdf: true,
    hasVersionHistory: false
  },
  studio: {
    name: 'Academic Studio',
    price: '₦15,000 / month',
    priceNumeric: 15000,
    tagline: 'Research, write and produce. Full Studio workspace.',
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10 GB (beta)
    storageLimitDisplay: '10 GB',
    monthlyUploadsLimit: 200,
    aiCreditsAllowance: 1000,
    hasStudioAccess: true,
    canCreateCircles: true,
    canExportDocxPdf: true,
    hasVersionHistory: true
  }
} as const;

