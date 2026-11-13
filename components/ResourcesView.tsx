import React, { useState, useEffect, useRef } from 'react';
import { UserFile, Course, UserProfile, StudyGroup } from '../types';
import { DBService } from '../services/db';
import { getCurrentUserId } from '../lib/supabase';
import { BETA_PLAN_LIMITS } from '../constants';
import { 
  Search, 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  BookOpen, 
  AlertCircle, 
  Loader2, 
  CheckCircle,
  HardDrive
} from 'lucide-react';

interface ResourcesViewProps {
  courses: Course[];
  groups?: StudyGroup[];
  profile: UserProfile | null;
  onOpenHub: (courseId: string) => void;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  courses,
  groups = [],
  profile,
  onOpenHub
}) => {
  const userId = getCurrentUserId() || '';
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'all' | 'my' | 'circles'>('all');
  const [uploadError, setUploadError] = useState<{ type: 'rejected' | 'storage' | 'db' | null; message: string | null }>({
    type: null,
    message: null
  });
  const [isUploading, setIsUploading] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      console.error('Failed to load resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [userId]);

  // Beta plan quota calculations with full plus, studio, scholar, sage support
  const rawPlan = (profile?.subscriptionTier || profile?.tier || 'free').toLowerCase();
  const userPlanKey = (rawPlan === 'studio' || rawPlan === 'sage') 
    ? 'studio' 
    : (rawPlan === 'plus' || rawPlan === 'scholar') 
    ? 'plus' 
    : 'free';
  const planLimits = BETA_PLAN_LIMITS[userPlanKey] || BETA_PLAN_LIMITS.free;

  // Calculate storage usage from real files
  const parseBytes = (fileSizeStr: string): number => {
    if (!fileSizeStr) return 0;
    const match = fileSizeStr.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return val * 1024 * 1024 * 1024;
    if (unit === 'MB') return val * 1024 * 1024;
    if (unit === 'KB') return val * 1024;
    return val;
  };

  const totalUsedBytes = files.reduce((acc, f) => acc + parseBytes(f.fileSize), 0);
  const totalUsedMB = (totalUsedBytes / (1024 * 1024)).toFixed(1);
  const maxStorageMB = (planLimits.storageLimitBytes / (1024 * 1024)).toFixed(0);
  const usagePercent = Math.min(100, Math.round((totalUsedBytes / planLimits.storageLimitBytes) * 100));

  // Uploads this month
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const uploadsThisMonth = files.filter(f => {
    const ts = f.timestamp || new Date(f.uploadedAt).getTime();
    return ts >= currentMonthStart;
  }).length;

  const isOverQuota = totalUsedBytes >= planLimits.storageLimitBytes;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError({ type: null, message: null });
    setUploadSuccessMsg(null);

    // 1. Check file rejection (e.g. file size > 30MB or unsupported type)
    const allowedExtensions = ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(ext)) {
      setUploadError({
        type: 'rejected',
        message: 'File rejected: only PDF, DOCX, TXT, and common images are supported.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setUploadError({
        type: 'rejected',
        message: 'File rejected: file size exceeds the 30 MB single-document limit.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (isOverQuota) {
      setUploadError({
        type: 'rejected',
        message: 'Storage quota reached. Delete existing files or upgrade your plan to upload more.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    const targetCourse = courses[0];
    const courseId = targetCourse?.id || 'general';
    const courseCode = targetCourse?.code || 'GEN';
    const courseTitle = targetCourse?.title || 'General Studies';

    try {
      const uploaded = await DBService.uploadFileToStorage(
        userId,
        courseId,
        file,
        courseCode,
        courseTitle,
        'processing'
      );

      if (!uploaded) {
        setUploadError({
          type: 'db',
          message: 'Details not saved: file transferred but record creation failed. Please retry.'
        });
      } else {
        fetchFiles();
        const extractRes = await DBService.retryUserFileExtraction(uploaded);
        if (extractRes.success) {
          setUploadSuccessMsg(`"${file.name}" uploaded and text extracted.`);
        } else {
          setUploadError({
            type: 'storage',
            message: `Uploaded "${file.name}", could not read text: ${extractRes.error || 'Use Retry on the file row.'}`
          });
        }
        fetchFiles();
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError({
        type: 'storage',
        message: err.message || 'Upload failed: network or storage connection interrupted.'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRetryExtraction = async (file: UserFile) => {
    setRetryingFileId(file.id);
    setUploadError({ type: null, message: null });
    try {
      const res = await DBService.retryUserFileExtraction(file);
      if (res.success) {
        setUploadSuccessMsg(`Successfully read text from "${file.fileName}".`);
      } else {
        setUploadError({
          type: 'storage',
          message: res.error || `Uploaded "${file.fileName}", could not read text.`
        });
      }
      await fetchFiles();
    } finally {
      setRetryingFileId(null);
    }
  };

  const handleDelete = async (file: UserFile) => {
    if (!window.confirm(`Delete "${file.fileName}"? This cannot be undone.`)) return;
    try {
      await DBService.deleteUserFile(file.id, userId, file.storagePath);
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const filteredFiles = files.filter(f => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = f.fileName.toLowerCase().includes(q);
      const matchCode = (f.courseCode || '').toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    if (filterChip === 'my') {
      return f.userId === userId;
    }
    if (filterChip === 'circles') {
      return false; // Circles shared files integration
    }
    return true;
  });

  // Largest files for quota sheet
  const largestFiles = [...files]
    .sort((a, b) => parseBytes(b.fileSize) - parseBytes(a.fileSize))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input 
        ref={fileInputRef}
        type="file" 
        className="hidden" 
        onChange={handleFileUpload}
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E5E7EB] dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white tracking-tight">
            Resources
          </h1>
          <p className="text-xs sm:text-sm text-[#5B6472] dark:text-slate-400 mt-0.5">
            Personal files, course materials and shared files
          </p>
        </div>

        {/* Single Primary Action Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-xs sm:text-sm font-medium rounded-lg shadow-sm min-h-[44px] transition-colors cursor-pointer"
        >
          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span>{isUploading ? 'Uploading file...' : 'Upload file'}</span>
        </button>
      </div>

      {/* Upload Messages */}
      {uploadError.message && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{uploadError.message}</span>
          </div>
          <button 
            onClick={() => setUploadError({ type: null, message: null })}
            className="text-rose-500 hover:text-rose-700 font-bold ml-2 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {uploadSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-600" />
            <span>{uploadSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setUploadSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold ml-2 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* Quota Banner if at or near limit */}
      {isOverQuota && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle size={16} className="text-amber-700" />
            <span>Storage quota full ({totalUsedMB} MB of {planLimits.storageLimitDisplay} used)</span>
          </div>
          <p className="text-amber-800">
            You have reached your storage limit. Delete large files or upgrade your plan to free up space.
          </p>
          {largestFiles.length > 0 && (
            <div className="pt-2 border-t border-amber-200/60">
              <p className="font-medium text-amber-900 mb-1">Largest files:</p>
              <div className="space-y-1">
                {largestFiles.map(lf => (
                  <div key={lf.id} className="flex items-center justify-between text-[11px] text-amber-800">
                    <span className="truncate max-w-xs">{lf.fileName}</span>
                    <span className="font-mono">{lf.fileSize}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search, Filter Chips and Quota Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5B6472]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search resources..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg text-xs text-[#111827] dark:text-white placeholder-[#5B6472] min-h-[44px] focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'my', label: 'My files' },
            { id: 'circles', label: 'Circles' }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setFilterChip(chip.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium min-h-[44px] transition-colors cursor-pointer ${
                filterChip === chip.id
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 text-[#5B6472] dark:text-slate-300 hover:border-slate-400'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Quota Bar */}
        <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#5B6472] dark:text-slate-400">
            <span className="font-medium text-[#111827] dark:text-white">
              {totalUsedMB} MB of {planLimits.storageLimitDisplay} used
            </span>
            <span>{uploadsThisMonth} uploads this month</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                usagePercent >= 90 ? 'bg-amber-500' : 'bg-[#2563EB]'
              }`}
              style={{ width: `${Math.max(2, usagePercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Files List / Table */}
      {loading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg">
          <Loader2 size={24} className="animate-spin text-[#2563EB] mx-auto mb-2" />
          <p className="text-xs text-[#5B6472] dark:text-slate-400">Loading resources...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg space-y-3">
          <HardDrive size={32} className="text-[#5B6472] mx-auto stroke-1" />
          <div>
            <h3 className="text-sm font-semibold text-[#111827] dark:text-white">No resources found</h3>
            <p className="text-xs text-[#5B6472] dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery ? 'No documents matched your search filter.' : 'Upload lecture notes, past questions, or reference PDFs to study.'}
            </p>
          </div>
          {!searchQuery && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#2563EB] bg-[#EFF6FF] rounded-lg hover:bg-blue-100 transition-colors cursor-pointer min-h-[44px]"
            >
              <Upload size={14} />
              <span>Upload your first document</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-lg overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#111827] dark:text-slate-200 divide-y divide-[#E5E7EB] dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-[#5B6472] dark:text-slate-400 font-semibold text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] dark:divide-slate-800">
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2.5">
                        <FileText size={16} className="text-[#2563EB] shrink-0" />
                        <span className="truncate max-w-xs">{file.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#5B6472] dark:text-slate-400">
                      {file.userId === userId ? 'You' : 'Circle'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6472] dark:text-slate-400 font-mono">
                      {file.fileSize || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#5B6472] dark:text-slate-400">
                      {new Date(file.timestamp || file.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {file.status && (
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            file.status === 'processing'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : file.status === 'failed'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950 dark:text-blue-300'
                          }`}>
                            {file.status === 'processing'
                              ? 'Processing'
                              : file.status === 'failed'
                              ? 'Uploaded, could not read text'
                              : 'Ready'}
                          </span>
                          {file.status === 'failed' && (
                            <button
                              type="button"
                              disabled={retryingFileId === file.id}
                              onClick={() => handleRetryExtraction(file)}
                              className="px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded text-[11px] font-semibold cursor-pointer"
                            >
                              {retryingFileId === file.id ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpenHub(file.courseId || courses[0]?.id || '')}
                          title="Open study tools"
                          aria-label={`Open study tools for ${file.fileName}`}
                          className="p-2 text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        >
                          <BookOpen size={16} />
                        </button>
                        {file.downloadUrl && (
                          <a
                            href={file.downloadUrl}
                            download={file.fileName}
                            title="Download file"
                            aria-label={`Download ${file.fileName}`}
                            className="p-2 text-[#5B6472] hover:text-[#111827] hover:bg-slate-100 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <Download size={16} />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(file)}
                          title="Delete file"
                          aria-label={`Delete ${file.fileName}`}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-[#E5E7EB] dark:divide-slate-800">
            {filteredFiles.map((file) => (
              <div key={file.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-[#2563EB] shrink-0" />
                    <span className="text-xs font-semibold text-[#111827] dark:text-white truncate">
                      {file.fileName}
                    </span>
                  </div>
                  {file.status && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        file.status === 'processing'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : file.status === 'failed'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {file.status === 'processing'
                          ? 'Processing'
                          : file.status === 'failed'
                          ? 'Uploaded, could not read text'
                          : 'Ready'}
                      </span>
                      {file.status === 'failed' && (
                        <button
                          type="button"
                          disabled={retryingFileId === file.id}
                          onClick={() => handleRetryExtraction(file)}
                          className="px-2 py-1 bg-[#2563EB] text-white rounded text-[10px] font-semibold cursor-pointer"
                        >
                          {retryingFileId === file.id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#5B6472] dark:text-slate-400">
                  <span>{file.userId === userId ? 'You' : 'Circle'} · {file.fileSize || '—'}</span>
                  <span>{new Date(file.timestamp || file.uploadedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                  <button
                    onClick={() => onOpenHub(file.courseId || courses[0]?.id || '')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg min-h-[44px] cursor-pointer"
                  >
                    <BookOpen size={14} />
                    <span>Study tools</span>
                  </button>
                  <button
                    onClick={() => handleDelete(file)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                    aria-label={`Delete ${file.fileName}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcesView;
