import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeStorageAccess,
  validateStorageBucket,
  validateStoragePath,
  validateFileSizeLimit,
  ALLOWED_STORAGE_BUCKETS
} from './storageSecurity';
import { MAX_UPLOAD_BYTES } from './limits';

test('Storage Security: bucket allowlist validation', () => {
  // Authorized buckets
  for (const bucket of ALLOWED_STORAGE_BUCKETS) {
    const res = validateStorageBucket(bucket);
    assert.equal(res.allowed, true);
    assert.equal(res.bucket, bucket);
  }

  // Unknown bucket -> rejected
  const unknown1 = validateStorageBucket('random-bucket');
  assert.equal(unknown1.allowed, false);
  assert.match(unknown1.error || '', /Forbidden: bucket 'random-bucket' is not an authorized storage bucket/i);

  const unknown2 = validateStorageBucket('admin-secrets');
  assert.equal(unknown2.allowed, false);

  const empty = validateStorageBucket('');
  assert.equal(empty.allowed, false);
});

test('Storage Security: path validation and directory traversal prevention', () => {
  // Path containing .. -> rejected
  const traversal1 = validateStoragePath('users/user-123/../../etc/passwd');
  assert.equal(traversal1.allowed, false);
  assert.match(traversal1.error || '', /directory traversal/i);

  const traversal2 = validateStoragePath('groups/circle-1/..');
  assert.equal(traversal2.allowed, false);

  const backslash = validateStoragePath('users\\user-123\\doc.pdf');
  assert.equal(backslash.allowed, false);

  const leadingSlash = validateStoragePath('/users/user-123/doc.pdf');
  assert.equal(leadingSlash.allowed, false);

  const doubleSlash = validateStoragePath('users//user-123/doc.pdf');
  assert.equal(doubleSlash.allowed, false);

  const empty = validateStoragePath('');
  assert.equal(empty.allowed, false);

  // Valid paths
  const validUser = validateStoragePath('users/user-123/document.pdf');
  assert.equal(validUser.allowed, true);
  assert.equal(validUser.cleanPath, 'users/user-123/document.pdf');
});

test('Storage Security: someone else\'s users/ path -> rejected', async () => {
  const currentUserId = 'user-alice-123';
  const otherUserId = 'user-bob-999';

  // Requesting own file -> allowed
  const ownRes = await authorizeStorageAccess({
    userId: currentUserId,
    storagePath: `users/${currentUserId}/lecture_notes.pdf`,
    bucket: 'user-files'
  });
  assert.equal(ownRes.allowed, true);
  assert.equal(ownRes.statusCode, 200);

  // Requesting someone else's file -> rejected with 403
  const otherRes = await authorizeStorageAccess({
    userId: currentUserId,
    storagePath: `users/${otherUserId}/exam_answers.pdf`,
    bucket: 'user-files'
  });
  assert.equal(otherRes.allowed, false);
  assert.equal(otherRes.statusCode, 403);
  assert.match(otherRes.error || '', /access denied to storage object/i);
});

test('Storage Security: circle the student has not joined -> rejected', async () => {
  const userId = 'student-42';
  const joinedCircleId = 'circle-joined-101';
  const unjoinedCircleId = 'circle-secret-999';

  // Mock membership database check
  const mockIsCircleMember = async (uid: string, cid: string) => {
    return uid === userId && cid === joinedCircleId;
  };

  // Accessing circle where user is a member -> allowed
  const joinedRes = await authorizeStorageAccess({
    userId,
    storagePath: `groups/${joinedCircleId}/syllabus.pdf`,
    bucket: 'group-materials',
    isCircleMember: mockIsCircleMember
  });
  assert.equal(joinedRes.allowed, true);
  assert.equal(joinedRes.statusCode, 200);
  assert.equal(joinedRes.circleId, joinedCircleId);

  // Accessing circle where user is NOT a member -> rejected with 403
  const unjoinedRes = await authorizeStorageAccess({
    userId,
    storagePath: `groups/${unjoinedCircleId}/secret_study_guide.pdf`,
    bucket: 'group-materials',
    isCircleMember: mockIsCircleMember
  });
  assert.equal(unjoinedRes.allowed, false);
  assert.equal(unjoinedRes.statusCode, 403);
  assert.match(unjoinedRes.error || '', /not a member of this study circle/i);
});

test('Storage Security: path containing .. -> rejected via authorizeStorageAccess', async () => {
  const userId = 'user-alice-123';

  const traversalRes = await authorizeStorageAccess({
    userId,
    storagePath: 'users/user-alice-123/../../../sensitive.env',
    bucket: 'user-files'
  });
  assert.equal(traversalRes.allowed, false);
  assert.equal(traversalRes.statusCode, 403);
  assert.match(traversalRes.error || '', /directory traversal/i);
});

test('Storage Security: unknown bucket -> rejected via authorizeStorageAccess', async () => {
  const userId = 'user-alice-123';

  const badBucketRes = await authorizeStorageAccess({
    userId,
    storagePath: 'users/user-alice-123/document.pdf',
    bucket: 'unauthorized-external-bucket'
  });
  assert.equal(badBucketRes.allowed, false);
  assert.equal(badBucketRes.statusCode, 403);
  assert.match(badBucketRes.error || '', /not an authorized storage bucket/i);
});

test('Storage Security: unapproved root prefix -> rejected', async () => {
  const userId = 'user-alice-123';

  const rootRes = await authorizeStorageAccess({
    userId,
    storagePath: 'system/configs/settings.json',
    bucket: 'user-files'
  });
  assert.equal(rootRes.allowed, false);
  assert.equal(rootRes.statusCode, 403);
  assert.match(rootRes.error || '', /path must be under users\/<userId>\/ or groups\/<circleId>\//i);
});

test('Storage Security: file size limit (50 MB) enforcement', () => {
  // Exactly 50 MB -> allowed
  const exact50MB = validateFileSizeLimit(MAX_UPLOAD_BYTES);
  assert.equal(exact50MB.allowed, true);
  assert.equal(exact50MB.statusCode, 200);

  // 10 MB -> allowed
  const small = validateFileSizeLimit(10 * 1024 * 1024);
  assert.equal(small.allowed, true);

  // 50 MB + 1 byte -> rejected with 413
  const overLimit = validateFileSizeLimit(MAX_UPLOAD_BYTES + 1);
  assert.equal(overLimit.allowed, false);
  assert.equal(overLimit.statusCode, 413);
  assert.match(overLimit.error || '', /File exceeds 50 MB limit/i);

  // 75 MB -> rejected with 413
  const huge = validateFileSizeLimit(75 * 1024 * 1024);
  assert.equal(huge.allowed, false);
  assert.equal(huge.statusCode, 413);
});
