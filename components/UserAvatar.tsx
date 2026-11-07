import React from 'react';
import { 
  GraduationCap, 
  User, 
  UserCircle, 
  Brain, 
  Sparkles, 
  Trophy, 
  Crown, 
  Microscope, 
  BookOpen,
  Award,
  Zap
} from 'lucide-react';

export interface AvatarOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  bgClass: string;
  badgeClass: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'graduation-cap',
    name: 'Scholar',
    icon: <GraduationCap size={20} />,
    bgClass: 'bg-indigo-600 text-white',
    badgeClass: 'bg-indigo-600'
  },
  {
    id: 'user-circle',
    name: 'Classic Student',
    icon: <UserCircle size={20} />,
    bgClass: 'bg-blue-600 text-white',
    badgeClass: 'bg-blue-600'
  },
  {
    id: 'brain',
    name: 'Genius Mind',
    icon: <Brain size={20} />,
    bgClass: 'bg-purple-600 text-white',
    badgeClass: 'bg-purple-600'
  },
  {
    id: 'sparkles',
    name: 'Visionary',
    icon: <Sparkles size={20} />,
    bgClass: 'bg-amber-500 text-white',
    badgeClass: 'bg-amber-500'
  },
  {
    id: 'trophy',
    name: 'High Achiever',
    icon: <Trophy size={20} />,
    bgClass: 'bg-emerald-600 text-white',
    badgeClass: 'bg-emerald-600'
  },
  {
    id: 'crown',
    name: 'Honor Roll',
    icon: <Crown size={20} />,
    bgClass: 'bg-rose-600 text-white',
    badgeClass: 'bg-rose-600'
  },
  {
    id: 'microscope',
    name: 'Researcher',
    icon: <Microscope size={20} />,
    bgClass: 'bg-cyan-600 text-white',
    badgeClass: 'bg-cyan-600'
  },
  {
    id: 'book-open',
    name: 'Avid Reader',
    icon: <BookOpen size={20} />,
    bgClass: 'bg-teal-600 text-white',
    badgeClass: 'bg-teal-600'
  }
];

interface UserAvatarProps {
  avatarIcon?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showStatus?: boolean;
  isOnline?: boolean;
  useInitials?: boolean;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarIcon = 'graduation-cap',
  name = 'User',
  size = 'md',
  className = '',
  showStatus = false,
  isOnline = true,
  useInitials = false,
}) => {
  const selected = AVATAR_OPTIONS.find((a) => a.id === avatarIcon) || AVATAR_OPTIONS[0];

  const sizeMap = {
    xs: {
      container: 'w-7 h-7 rounded-lg text-xs',
      iconSize: 13,
      dot: 'w-1.5 h-1.5 -bottom-0.5 -right-0.5 border',
    },
    sm: {
      container: 'w-8 h-8 rounded-lg text-xs font-semibold',
      iconSize: 16,
      dot: 'w-2 h-2 -bottom-0.5 -right-0.5 border',
    },
    md: {
      container: 'w-10 h-10 rounded-lg text-sm font-semibold',
      iconSize: 20,
      dot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 border-2',
    },
    lg: {
      container: 'w-14 h-14 rounded-lg text-lg font-bold',
      iconSize: 26,
      dot: 'w-3.5 h-3.5 -bottom-1 -right-1 border-2',
    },
    xl: {
      container: 'w-20 h-20 rounded-xl text-2xl font-bold',
      iconSize: 36,
      dot: 'w-5 h-5 -bottom-1 -right-1 border-2',
    },
  };

  const currentSize = sizeMap[size];

  // Derive initials from name
  const getInitials = (str: string) => {
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (str.trim().slice(0, 2) || 'U').toUpperCase();
  };

  // Helper to render icon with appropriate scale
  const renderIcon = () => {
    if (useInitials) {
      return <span>{getInitials(name)}</span>;
    }
    switch (selected.id) {
      case 'user-circle':
        return <UserCircle size={currentSize.iconSize} />;
      case 'brain':
        return <Brain size={currentSize.iconSize} />;
      case 'sparkles':
        return <Sparkles size={currentSize.iconSize} />;
      case 'trophy':
        return <Trophy size={currentSize.iconSize} />;
      case 'crown':
        return <Crown size={currentSize.iconSize} />;
      case 'microscope':
        return <Microscope size={currentSize.iconSize} />;
      case 'book-open':
        return <BookOpen size={currentSize.iconSize} />;
      case 'graduation-cap':
      default:
        return <GraduationCap size={currentSize.iconSize} />;
    }
  };

  const bgStyle = useInitials 
    ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
    : selected.bgClass;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 font-sans shadow-sm ${bgStyle} ${currentSize.container} ${className}`}>
      {renderIcon()}

      {showStatus && (
        <div className={`absolute ${currentSize.dot} border-white dark:border-slate-900 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          {isOnline && <div className="w-full h-full rounded-full bg-emerald-400 animate-ping opacity-75" />}
        </div>
      )}
    </div>
  );
};
