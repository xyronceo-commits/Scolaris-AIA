import { MAX_UPLOAD_BYTES } from './limits';

/**
 * Storage security and authorization rules for KorsIQ.
 * Ensures all storage access from the server strictly adheres to:
 * 1. Allowlisted storage buckets only
 * 2. Path directory traversal prevention
 * 3. Strict caller ownership for personal files (users/<userId>/...)
 * 4. Verified circle membership for circle files (groups/<circleId>/...)
 * 5. Strict 50 MB size ceiling
 */

export const ALLOWED_STORAGE_BUCKETS = ['user-files', 'group-materials', 'scolaris-library'] as const;
export type AllowedStorageBucket = (typeof ALLOWED_STORAGE_BUCKETS)[number];

export interface StorageAuthorizationParams {
  userId: string;
  storagePath: string;
  bucket?: string;
  isCircleMember?: (userId: string, circleId: string) => Promise<boolean> | boolean;
}

export interface StorageAuthorizationResult {
  allowed: boolean;
  statusCode: number; // 200, 400, 403, 413
  error?: string;
  circleId?: string;
  targetUserId?: string;
}

/**
 * Validates that a storage bucket name is in the authorized allowlist.
 */
export function validateStorageBucket(bucket: string | null | undefined): { allowed: boolean; bucket?: AllowedStorageBucket; error?: string } {
  if (!bucket || typeof bucket !== 'string') {
    return { allowed: false, error: 'Storage bucket is required.' };
  }
  const normalized = bucket.trim().toLowerCase();
  if (!(ALLOWED_STORAGE_BUCKETS as readonly string[]).includes(normalized)) {
    return {
      allowed: false,
      error: `Forbidden: bucket '${bucket}' is not an authorized storage bucket.`
    };
  }
  return { allowed: true, bucket: normalized as AllowedStorageBucket };
}

/**
 * Validates the storage path format and prevents directory traversal attacks.
 */
export function validateStoragePath(path: string | null | undefined): { allowed: boolean; cleanPath?: string; error?: string } {
  if (!path || typeof path !== 'string') {
    return { allowed: false, error: 'Storage path is required.' };
  }
  const cleanPath = path.trim();
  if (!cleanPath) {
    return { allowed: false, error: 'Storage path cannot be empty.' };
  }
  // Prevent directory traversal and malformed paths
  if (
    cleanPath.includes('..') ||
    cleanPath.includes('\\') ||
    cleanPath.startsWith('/') ||
    cleanPath.includes('//')
  ) {
    return {
      allowed: false,
      error: 'Forbidden: invalid storage path or directory traversal detected.'
    };
  }
  return { allowed: true, cleanPath };
}

/**
 * Validates file size against the 50 MB limit.
 */
export function validateFileSizeLimit(sizeInBytes: number): { allowed: boolean; statusCode: number; error?: string } {
  if (typeof sizeInBytes !== 'number' || isNaN(sizeInBytes) || sizeInBytes < 0) {
    return { allowed: false, statusCode: 400, error: 'Invalid file size.' };
  }
  if (sizeInBytes > MAX_UPLOAD_BYTES) {
    return {
      allowed: false,
      statusCode: 413,
      error: 'File exceeds 50 MB limit.'
    };
  }
  return { allowed: true, statusCode: 200 };
}

/**
 * Authorizes a user to access a specific storage path and bucket.
 */
export async function authorizeStorageAccess(
  params: StorageAuthorizationParams
): Promise<StorageAuthorizationResult> {
  const { userId, storagePath, bucket, isCircleMember } = params;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Forbidden: authentication required for storage access.'
    };
  }

  // 1. Bucket validation (if provided)
  if (bucket) {
    const bucketCheck = validateStorageBucket(bucket);
    if (!bucketCheck.allowed) {
      return {
        allowed: false,
        statusCode: 403,
        error: bucketCheck.error
      };
    }
  }

  // 2. Storage path format check (rejects .. and malformed strings)
  const pathCheck = validateStoragePath(storagePath);
  if (!pathCheck.allowed) {
    return {
      allowed: false,
      statusCode: 403,
      error: pathCheck.error
    };
  }
  const cleanPath = pathCheck.cleanPath!;

  // 3. Ownership / Path prefix check
  if (cleanPath.startsWith('users/')) {
    const parts = cleanPath.split('/');
    const pathUserId = parts[1];
    if (!pathUserId || pathUserId !== userId.trim()) {
      return {
        allowed: false,
        statusCode: 403,
        targetUserId: pathUserId,
        error: 'Forbidden: access denied to storage object.'
      };
    }
    return { allowed: true, statusCode: 200, targetUserId: pathUserId };
  }

  if (cleanPath.startsWith('groups/')) {
    const parts = cleanPath.split('/');
    const circleId = parts[1];
    if (!circleId) {
      return {
        allowed: false,
        statusCode: 403,
        error: 'Forbidden: invalid circle storage path.'
      };
    }

    if (isCircleMember) {
      const isMember = await isCircleMember(userId.trim(), circleId);
      if (!isMember) {
        return {
          allowed: false,
          statusCode: 403,
          circleId,
          error: 'Forbidden: user is not a member of this study circle.'
        };
      }
    }
    return { allowed: true, statusCode: 200, circleId };
  }

  // Any other path prefix is forbidden
  return {
    allowed: false,
    statusCode: 403,
    error: 'Forbidden: path must be under users/<userId>/ or groups/<circleId>/.'
  };
}
