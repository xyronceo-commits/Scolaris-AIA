// ============================================================================
// KorsIQ Resumable Upload Helper (Supabase TUS Protocol)
// ============================================================================
import * as tus from 'tus-js-client';
import { getAccessToken } from './supabase';
import { TUS_CHUNK_SIZE_BYTES } from './limits';

export interface ResumableUploadOptions {
  bucket: string;
  storagePath: string;
  file: File;
  onProgress?: (percent: number, bytesUploaded: number, bytesTotal: number) => void;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

export class ResumableUploadController {
  private uploadInstance: tus.Upload | null = null;
  private isCancelled = false;

  public async start(options: ResumableUploadOptions): Promise<void> {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Your session has expired. Please sign in again to upload files.');
    }

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
    let projectRef = '';
    try {
      projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    } catch {
      // fallback
    }

    if (!projectRef) {
      throw new Error('Supabase configuration missing project reference for resumable upload.');
    }

    const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

    return new Promise((resolve, reject) => {
      this.isCancelled = false;
      this.uploadInstance = new tus.Upload(options.file, {
        endpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${token}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: TUS_CHUNK_SIZE_BYTES, // 6 MB chunks
        metadata: {
          bucketName: options.bucket,
          objectName: options.storagePath,
          contentType: options.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        onError: (err) => {
          if (this.isCancelled) {
            reject(new Error('Upload cancelled by user.'));
            return;
          }
          const msg = err.message || '';
          if (msg.includes('401') || msg.includes('JWT') || msg.includes('token') || msg.includes('expired')) {
            reject(new Error('Your session has expired. Please sign in again to upload files.'));
          } else if (msg.includes('413') || msg.includes('too large') || msg.includes('exceeded')) {
            reject(new Error('File exceeds the storage upload limit (50 MB).'));
          } else {
            reject(new Error(`Upload failed: ${msg}`));
          }
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          if (this.isCancelled) return;
          if (options.onProgress) {
            const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
            options.onProgress(percent, bytesUploaded, bytesTotal);
          }
        },
        onSuccess: () => {
          if (this.isCancelled) return;
          if (options.onSuccess) options.onSuccess();
          resolve();
        },
      });

      // Automatically resume previous incomplete upload if present
      this.uploadInstance.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0 && !this.isCancelled) {
          this.uploadInstance?.resumeFromPreviousUpload(previousUploads[0]);
        }
        if (!this.isCancelled) {
          this.uploadInstance?.start();
        }
      }).catch(() => {
        if (!this.isCancelled) {
          this.uploadInstance?.start();
        }
      });
    });
  }

  public abort(): void {
    this.isCancelled = true;
    if (this.uploadInstance) {
      try {
        this.uploadInstance.abort();
      } catch {}
    }
  }
}

/**
 * Uploads a file directly to Supabase Storage using TUS resumable upload.
 */
export async function uploadResumableFile(
  bucket: string,
  storagePath: string,
  file: File,
  onProgress?: (percent: number, bytesUploaded: number, bytesTotal: number) => void,
  controllerRef?: { current: ResumableUploadController | null }
): Promise<void> {
  const controller = new ResumableUploadController();
  if (controllerRef) {
    controllerRef.current = controller;
  }
  return controller.start({
    bucket,
    storagePath,
    file,
    onProgress,
  });
}
