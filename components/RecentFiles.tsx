import React, { useState, useEffect } from 'react';
import { UserFile, Course } from '../types';
import { DBService } from '../services/db';
import { 
  FileText, 
  Image as ImageIcon, 
  Clock, 
  Download, 
  BookOpen, 
  Loader2, 
  Trash2, 
  FolderOpen,
  Search,
  Filter,
  X,
  Sparkles
} from 'lucide-react';

interface RecentFilesProps {
  userId: string;
  courses?: Course[];
  onOpenHub?: (courseId: string) => void;
  onSelectFile?: (file: UserFile) => void;
  refreshTrigger?: number;
}

export const RecentFiles: React.FC<RecentFilesProps> = ({
  userId,
  courses = [],
  onOpenHub,
  onSelectFile,
  refreshTrigger = 0
}) => {
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('all');

  const fetchFiles = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const userFiles = await DBService.getUserFiles(userId);
      setFiles(userFiles);
    } catch (err) {
      console.error('Failed to load recent files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [userId, refreshTrigger]);

  const handleDelete = async (file: UserFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${file.fileName}"?`)) return;
    setDeletingId(file.id);
    try {
      await DBService.deleteUserFile(file.id, userId, file.storagePath);
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err) {
      console.error('Failed to delete file:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf' || fileType.includes('pdf')) {
      return <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center font-bold text-xs shrink-0">PDF</div>;
    }
    if (['doc', 'docx'].includes(ext) || fileType.includes('word')) {
      return <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0">DOC</div>;
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || fileType.includes('image')) {
      return <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0"><ImageIcon size={18} /></div>;
    }
    return <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0"><FileText size={18} /></div>;
  };

  const formatRelativeTime = (timestamp: number | string) => {
    const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (isNaN(ts) || ts <= 0) return 'Recently';

    const diffMs = Date.now() - ts;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(ts).toLocaleDateString();
  };

  const filteredFiles = files.filter(file => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = file.fileName.toLowerCase().includes(q);
      const matchCode = (file.courseCode || '').toLowerCase().includes(q);
      const matchTitle = (file.courseTitle || '').toLowerCase().includes(q);
      const matchType = (file.fileType || '').toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchTitle && !matchType) return false;
    }

    if (selectedCourseFilter !== 'ALL') {
      if (file.courseId !== selectedCourseFilter) return false;
    }

    const ts = file.timestamp || new Date(file.uploadedAt).getTime();
    if (timeFilter === 'today') {
      if (Date.now() - ts > 24 * 60 * 60 * 1000) return false;
    } else if (timeFilter === 'week') {
      if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-[2rem] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-serif font-bold text-slate-900 dark:text-slate-100">Full Document Library</h3>
            <p className="text-xs text-slate-400">Loading user-isolated storage records...</p>
          </div>
          <Loader2 size={18} className="animate-spin text-indigo-600" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-[2rem] shadow-sm text-center space-y-4">
        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-900">
          <FolderOpen size={22} />
        </div>
        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="text-base font-serif font-bold text-slate-900 dark:text-slate-100">No Uploaded Files Yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Upload study materials or course documents in your Study Hub to view and manage your full library here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 md:p-8 rounded-[2rem] shadow-sm space-y-6">
      {/* Header & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-serif font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Recent Files & Full Document Library
            </h3>
            <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-bold tracking-wider uppercase border border-indigo-100 dark:border-indigo-900">
              {files.length} {files.length === 1 ? 'file' : 'files'} archived
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Searchable complete library • Click any document to load into Study Hub
          </p>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setTimeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              timeFilter === 'all'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            All Files
          </button>
          <button
            onClick={() => setTimeFilter('today')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              timeFilter === 'today'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeFilter('week')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              timeFilter === 'week'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Past 7 Days
          </button>
        </div>
      </div>

      {/* Controls: Search & Course Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search document library by file name, course code, or type..."
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {courses.length > 0 && (
          <div className="relative w-full sm:w-56 shrink-0">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedCourseFilter}
              onChange={e => setSelectedCourseFilter(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none appearance-none cursor-pointer transition-all uppercase tracking-wider"
            >
              <option value="ALL">All Courses ({courses.length})</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code}: {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* File List */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            No files match your current search or filter criteria.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCourseFilter('ALL');
              setTimeFilter('all');
            }}
            className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-bold text-xs rounded-xl hover:bg-indigo-100 transition-all"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFiles.map((file) => {
            const associatedCourse = courses.find(c => c.id === file.courseId);
            const courseCodeDisplay = file.courseCode || associatedCourse?.code || 'COURSE';
            const courseTitleDisplay = file.courseTitle || associatedCourse?.title || '';
            const isRecentUpload = Date.now() - (file.timestamp || new Date(file.uploadedAt).getTime()) <= 24 * 60 * 60 * 1000;

            return (
              <div 
                key={file.id}
                onClick={() => {
                  if (onSelectFile) {
                    onSelectFile(file);
                  } else if (file.courseId && onOpenHub) {
                    onOpenHub(file.courseId);
                  }
                }}
                className="group bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 p-4 rounded-2xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-md"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {getFileIcon(file.fileType, file.fileName)}
                  
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md uppercase tracking-wider border border-indigo-100 dark:border-indigo-900">
                        📄 {courseCodeDisplay}
                      </span>
                      {courseTitleDisplay && (
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                          — {courseTitleDisplay}
                        </span>
                      )}
                      {isRecentUpload && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          <Sparkles size={10} /> Recently Uploaded
                        </span>
                      )}
                    </div>
                    
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {file.fileName}
                    </h4>
                    
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock size={12} />
                        Uploaded: {formatRelativeTime(file.timestamp || file.uploadedAt)}
                      </span>
                      {file.fileSize && <span>• {file.fileSize}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectFile) {
                        onSelectFile(file);
                      } else if (file.courseId && onOpenHub) {
                        onOpenHub(file.courseId);
                      }
                    }}
                    title="Load into Study Hub Workbench"
                    className="px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-xs flex items-center gap-1"
                  >
                    Load File
                  </button>

                  {file.downloadUrl && (
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Download / View File"
                      className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-xl transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900"
                    >
                      <Download size={16} />
                    </a>
                  )}
                  
                  {file.courseId && onOpenHub && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenHub(file.courseId);
                      }}
                      title="Open Study Hub"
                      className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-xl transition-all border border-transparent hover:border-emerald-100 dark:hover:border-emerald-900"
                    >
                      <BookOpen size={16} />
                    </button>
                  )}

                  <button
                    onClick={(e) => handleDelete(file, e)}
                    disabled={deletingId === file.id}
                    title="Delete File"
                    className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-xl transition-all border border-transparent hover:border-rose-100 dark:hover:border-rose-900 disabled:opacity-50"
                  >
                    {deletingId === file.id ? <Loader2 size={16} className="animate-spin text-rose-600" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecentFiles;
