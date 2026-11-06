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
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-slate-900">Document Library</h3>
            <p className="text-xs text-slate-500">Loading stored course files...</p>
          </div>
          <Loader2 size={16} className="animate-spin text-blue-600" />
        </div>
        <div className="space-y-2 pt-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse border border-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-2xs text-center space-y-3">
        <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-lg flex items-center justify-center mx-auto border border-slate-200">
          <FolderOpen size={18} />
        </div>
        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="text-sm font-semibold text-slate-900">No Uploaded Documents</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Upload study materials or course documents in your Study Hub to view and manage your library here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-xl shadow-2xs space-y-4">
      {/* Header & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Recent Files & Full Document Library
            </h3>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[11px] font-semibold border border-blue-100">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Searchable library • Click any document to load into Study Hub
          </p>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shrink-0">
          <button
            onClick={() => setTimeFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              timeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Files
          </button>
          <button
            onClick={() => setTimeFilter('today')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              timeFilter === 'today'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeFilter('week')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              timeFilter === 'week'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past 7 Days
          </button>
        </div>
      </div>

      {/* Controls: Search & Course Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search document library by file name, course code, or type..."
            className="w-full h-9 bg-white border border-slate-300 rounded-lg pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-normal"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {courses.length > 0 && (
          <div className="relative w-full sm:w-52 shrink-0">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedCourseFilter}
              onChange={e => setSelectedCourseFilter(e.target.value)}
              className="w-full h-9 bg-white border border-slate-300 rounded-lg pl-8 pr-7 text-xs font-medium text-slate-700 outline-none appearance-none cursor-pointer focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
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
        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200 space-y-2">
          <p className="text-xs text-slate-500 font-normal">
            No files match your current search or filter criteria.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCourseFilter('ALL');
              setTimeFilter('all');
            }}
            className="px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-md transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
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
                className="group bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-slate-300 p-3.5 rounded-lg transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {getFileIcon(file.fileType, file.fileName)}
                  
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        {courseCodeDisplay}
                      </span>
                      {courseTitleDisplay && (
                        <span className="text-xs font-normal text-slate-500 truncate max-w-[200px]">
                          — {courseTitleDisplay}
                        </span>
                      )}
                      {isRecentUpload && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 flex items-center gap-1">
                          <Sparkles size={10} /> Recent
                        </span>
                      )}
                    </div>
                    
                    <h4 className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {file.fileName}
                    </h4>
                    
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
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
                    title="Load into Study Hub"
                    className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs font-medium transition-colors shadow-2xs flex items-center gap-1"
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
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <Download size={15} />
                    </a>
                  )}
                  
                  {file.courseId && onOpenHub && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenHub(file.courseId);
                      }}
                      title="Open Study Hub"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <BookOpen size={15} />
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
