// ============================================================================
// KorsIQ File & Upload Limits — Single Source of Truth
// ============================================================================

/** Maximum allowed file size for storage uploads across KorsIQ (50 MB) */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_UPLOAD_MB = 50;

/** Threshold above which browser uploads switch to chunked resumable TUS upload (6 MB) */
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024; // 6 MB
export const RESUMABLE_THRESHOLD_MB = 6;

/** Chunk size for Supabase Resumable (TUS) uploads (6 MB) */
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024; // 6 MB

/** Maximum size for client-to-server request body payload (Vercel hard limit ~4.5 MB) */
export const BASE64_FALLBACK_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

/** Allowed file extensions for study documents, materials, and notes */
export const ALLOWED_FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'rtf',
  'md',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'tiff',
  'bmp'
] as const;

/** Allowed MIME types */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/rtf',
  'application/rtf',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp'
] as const;

/**
 * Validates whether a file extension or MIME type is supported by KorsIQ document extraction.
 */
export function isAllowedFileType(fileName: string, mimeType?: string): boolean {
  if (!fileName && !mimeType) return false;
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (ext && (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return true;
  }
  if (mimeType) {
    const cleanMime = mimeType.toLowerCase().split(';')[0].trim();
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(cleanMime)) {
      return true;
    }
    if (cleanMime.startsWith('text/') || cleanMime.startsWith('image/')) {
      return true;
    }
  }
  return false;
}

/**
 * Formats byte size into human readable string (e.g. "45.2 MB")
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}
