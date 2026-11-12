import React from 'react';
import { formatBytes } from '../lib/limits';
import { X, RefreshCw, AlertCircle, CheckCircle2, Loader2, HardDrive } from 'lucide-react';

export interface UploadProgressBarProps {
  fileName: string;
  fileSize: number;
  percent: number;
  bytesUploaded?: number;
  bytesTotal?: number;
  status: 'idle' | 'uploading' | 'processing' | 'error' | 'success';
  errorMessage?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({
  fileName,
  fileSize,
  percent,
  bytesUploaded,
  bytesTotal,
  status,
  errorMessage,
  onCancel,
  onRetry,
}) => {
  if (status === 'idle') return null;

  const uploadedDisplay = bytesUploaded !== undefined && bytesUploaded > 0
    ? formatBytes(bytesUploaded)
    : formatBytes((fileSize * (percent || 0)) / 100);

  const totalDisplay = bytesTotal !== undefined && bytesTotal > 0
    ? formatBytes(bytesTotal)
    : formatBytes(fileSize);

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-colors ${
        status === 'error'
          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
          : status === 'success'
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
      }`}
    >
      {/* Top Header: File Info & Actions */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            {status === 'uploading' ? (
              <Loader2 size={16} className="animate-spin text-blue-600" />
            ) : status === 'processing' ? (
              <Loader2 size={16} className="animate-spin text-purple-600" />
            ) : status === 'error' ? (
              <AlertCircle size={16} className="text-rose-600" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate text-slate-900 dark:text-white">
              {fileName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {status === 'uploading' && `Uploading: ${uploadedDisplay} of ${totalDisplay} (${percent}%)`}
              {status === 'processing' && 'Upload complete • Extracting syllabus text...'}
              {status === 'error' && (errorMessage || 'Upload failed')}
              {status === 'success' && `Uploaded successfully (${totalDisplay})`}
            </p>
          </div>
        </div>

        {/* Action Buttons (Min 44px touch targets) */}
        <div className="flex items-center gap-1 shrink-0">
          {status === 'uploading' && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] min-w-[44px] p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
              title="Cancel upload"
              aria-label="Cancel upload"
            >
              <X size={18} />
            </button>
          )}

          {status === 'error' && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Track */}
      {(status === 'uploading' || status === 'processing') && (
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 rounded-full ${
                status === 'processing' ? 'bg-purple-600 animate-pulse w-full' : 'bg-blue-600'
              }`}
              style={status === 'uploading' ? { width: `${Math.max(2, percent)}%` } : undefined}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>{status === 'processing' ? 'Processing' : `${percent}%`}</span>
            <span>{totalDisplay}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadProgressBar;
