import { supabase, getAccessToken, getCurrentUserId } from '../lib/supabase';
import {
  UserProfile,
  Course,
  StudySession,
  StudyGroup,
  StudyHubData,
  Difficulty,
  SubscriptionTier,
  UserFile,
  GroupMember,
} from '../types';

const USER_FILES_BUCKET = 'user-files';
const GROUP_MATERIALS_BUCKET = 'group-materials';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// ---------- local cache helpers (offline fallback, scoped per user) ----------
const cacheKey = (kind: string, userId: string) => `scolaris_user_private_v1_${kind}_${userId}`;

function readCache<T>(kind: string, userId: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(cacheKey(kind, userId));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeCache(kind: string, userId: string, value: unknown) {
  try {
    localStorage.setItem(cacheKey(kind, userId), JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
const rand = (len = 5) => Math.random().toString(36).substring(2, 2 + len);

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function signedUrlMap(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  });
  return map;
}

// ---------- row <-> model mappers ----------
function rowToUserFile(row: any, urls: Record<string, string> = {}): UserFile {
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id || '',
    fileName: row.file_name || '',
    fileType: row.file_type || '',
    fileSize: row.file_size || '',
    storagePath: row.storage_path || '',
    downloadUrl: urls[row.storage_path] || '',
    uploadedAt: row.uploaded_at || new Date().toISOString(),
    timestamp: Number(row.ts) || Date.now(),
    courseCode: row.course_code || '',
    courseTitle: row.course_title || '',
  };
}

function rowToMaterial(row: any, urls: Record<string, string> = {}) {
  return {
    id: row.id,
    groupId: row.group_id,
    courseId: row.course_id || 'group_material',
    courseCode: row.course_code || row.file_name || '',
    sharedBy: row.uploaded_by_name || 'Member',
    uploadedBy: row.uploaded_by || '',
    uploadedByName: row.uploaded_by_name || 'Member',
    uploadedAt: row.uploaded_at || new Date().toISOString(),
    timestamp: Number(row.ts) || Date.now(),
    fileName: row.file_name || 'Document',
    fileType: row.file_type || 'application/pdf',
    fileSize: row.file_size || '',
    storagePath: row.storage_path || '',
    downloadUrl: urls[row.storage_path] || '',
    content: row.content || '',
  };
}

function rowToGroup(row: any, materials: any[] = []): StudyGroup {
  const members = (row.members || []) as (string | GroupMember)[];
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    course: row.course || 'General Study',
    type: row.type || 'private',
    visibility: row.visibility || (row.type === 'general' ? 'public' : 'private'),
    inviteCode: row.invite_code || '',
    department: row.department || '',
    level: row.level || '',
    university: row.university || '',
    academicSession: row.academic_session || '',
    groupImage: row.group_image || '',
    ownerId: row.owner_id || '',
    members,
    memberCount: row.member_count || members.length,
    messages: row.messages || [],
    sharedMaterials: materials,
    discussions: row.discussions || [],
    activityFeed: row.activity_feed || [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

async function loadGroupMaterials(groupIds: string[]): Promise<Record<string, any[]>> {
  if (groupIds.length === 0) return {};
  const { data, error } = await supabase
    .from('group_materials')
    .select('*')
    .in('group_id', groupIds)
    .order('ts', { ascending: false });
  if (error || !data) return {};

  const urls = await signedUrlMap(GROUP_MATERIALS_BUCKET, data.map((m) => m.storage_path));
  const byGroup: Record<string, any[]> = {};
  data.forEach((row) => {
    (byGroup[row.group_id] ||= []).push(rowToMaterial(row, urls));
  });
  return byGroup;
}

async function fetchGroupRow(groupId: string) {
  const { data, error } = await supabase.from('study_groups').select('*').eq('id', groupId).maybeSingle();
  if (error) throw error;
  return data;
}

function newActivity(groupId: string, type: string, title: string, description: string, actorName: string, actorId: string) {
  return {
    id: `act_${Date.now()}_${rand(3)}`,
    groupId,
    type,
    title,
    description,
    actorName,
    actorId,
    timestamp: Date.now(),
  };
}

export const DBService = {
  // ---------------- Profiles ----------------
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;

      if (!data) {
        return readCache<UserProfile | null>('profile', userId, null);
      }

      const profile: UserProfile = {
        name: data.name || '',
        email: data.email || '',
        university: data.institution || '',
        level: data.level || '',
        age: data.age || 18,
        semesterEnd: data.semester_end || '',
        targetCGPA: typeof data.target_cgpa === 'number' ? data.target_cgpa : Number(data.target_cgpa) || 4.5,
        avatarIcon: data.avatar_icon || 'graduation-cap',
        onboarded: data.onboarded ?? false,
        tutorialSeen: data.tutorial_seen ?? false,
        isPro: data.is_pro ?? false,
        tier: (data.tier || 'free') as SubscriptionTier,
        notifications: data.notifications || { messages: true, sessions: true, aiContent: true },
      };
      writeCache('profile', userId, profile);
      return profile;
    } catch (err) {
      console.error('getProfile error:', err);
      return readCache<UserProfile | null>('profile', userId, null);
    }
  },

  async saveProfile(userId: string, profile: UserProfile) {
    writeCache('profile', userId, profile);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: userId,
          name: profile.name,
          email: profile.email,
          institution: profile.university,
          level: profile.level,
          age: profile.age,
          semester_end: profile.semesterEnd || '',
          target_cgpa: profile.targetCGPA ?? 4.5,
          avatar_icon: profile.avatarIcon || 'graduation-cap',
          onboarded: profile.onboarded,
          tutorial_seen: profile.tutorialSeen,
          is_pro: profile.isPro,
          tier: profile.tier,
          notifications: profile.notifications,
        },
        { onConflict: 'id' }
      );
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.error('saveProfile error:', err);
      return { error: err };
    }
  },

  // ---------------- Courses ----------------
  async getCourses(userId: string): Promise<Course[]> {
    try {
      const { data, error } = await supabase.from('courses').select('*').eq('user_id', userId);
      if (error) throw error;

      const courses: Course[] = (data || []).map((c) => ({
        id: c.id,
        code: c.code || '',
        title: c.name || '',
        units: c.credits || 3,
        difficulty: (c.difficulty || 'Medium') as Difficulty,
        description: c.description || '',
      }));
      writeCache('courses', userId, courses);
      return courses;
    } catch (err) {
      console.error('getCourses error:', err);
      return readCache<Course[]>('courses', userId, []);
    }
  },

  async saveCourse(userId: string, course: Course) {
    try {
      const list = readCache<Course[]>('courses', userId, []);
      const courseId = course.id || `course_${Date.now()}`;
      const merged = { ...course, id: courseId };
      const idx = list.findIndex((c) => c.id === courseId);
      if (idx >= 0) list[idx] = merged;
      else list.push(merged);
      writeCache('courses', userId, list);

      const { error } = await supabase.from('courses').upsert(
        {
          id: courseId,
          user_id: userId,
          code: course.code,
          name: course.title,
          difficulty: course.difficulty,
          credits: course.units,
          description: course.description || '',
        },
        { onConflict: 'id' }
      );
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.error('saveCourse error:', err);
      return { error: err };
    }
  },

  async saveCourses(userId: string, courses: Course[]) {
    try {
      writeCache('courses', userId, courses);
      if (courses.length === 0) return { error: null };

      const rows = courses.map((c) => ({
        id: c.id || `course_${rand(8)}`,
        user_id: userId,
        code: c.code,
        name: c.title,
        difficulty: c.difficulty,
        credits: c.units,
        description: c.description || '',
      }));
      const { error } = await supabase.from('courses').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.error('saveCourses error:', err);
      return { error: err };
    }
  },

  // ---------------- Schedule ----------------
  async saveSchedule(userId: string, sessions: StudySession[]) {
    try {
      writeCache('schedule', userId, sessions);
      if (sessions.length === 0) return { error: null };

      const rows = sessions.map((s) => ({
        id: s.id || `session_${rand(8)}`,
        user_id: userId,
        course_id: s.courseId,
        day: s.day,
        duration: s.duration,
        mode: s.mode,
      }));
      const { error } = await supabase.from('study_sessions').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.error('saveSchedule error:', err);
      return { error: err };
    }
  },

  async getSchedule(userId: string): Promise<StudySession[]> {
    try {
      const { data, error } = await supabase.from('study_sessions').select('*').eq('user_id', userId);
      if (error) throw error;

      const sessions: StudySession[] = (data || []).map((s) => ({
        id: s.id,
        courseId: s.course_id || '',
        day: s.day || '',
        duration: s.duration || 30,
        mode: s.mode as StudySession['mode'],
      }));
      writeCache('schedule', userId, sessions);
      return sessions;
    } catch (err) {
      console.error('getSchedule error:', err);
      return readCache<StudySession[]>('schedule', userId, []);
    }
  },

  // ---------------- Health check ----------------
  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
      // An RLS-filtered empty result is still a healthy connection
      return !error;
    } catch {
      return false;
    }
  },

  // ---------------- Study Hubs ----------------
  async getHubs(userId: string): Promise<Record<string, StudyHubData>> {
    const cachedHubs = readCache<Record<string, StudyHubData>>('hubs', userId, {});
    try {
      const { data, error } = await supabase.from('study_hubs').select('*').eq('user_id', userId);
      if (error) throw error;

      const hubMap: Record<string, StudyHubData> = { ...cachedHubs };
      (data || []).forEach((h) => {
        hubMap[h.course_id] = {
          ...hubMap[h.course_id],
          courseId: h.course_id,
          summary: h.summary || hubMap[h.course_id]?.summary,
          flashcards: (h.flashcards as any[])?.length ? h.flashcards : hubMap[h.course_id]?.flashcards,
          quizzes: (h.quizzes as any[])?.length ? h.quizzes : hubMap[h.course_id]?.quizzes,
          tests: (h.tests as any[])?.length ? h.tests : hubMap[h.course_id]?.tests,
          podcastUrl: h.podcast_url || hubMap[h.course_id]?.podcastUrl,
          transcript: h.transcript || hubMap[h.course_id]?.transcript,
          fileContent: h.file_content || hubMap[h.course_id]?.fileContent,
          fileName: h.file_name || hubMap[h.course_id]?.fileName,
        };
      });
      writeCache('hubs', userId, hubMap);
      return hubMap;
    } catch (err) {
      console.error('getHubs error:', err);
      return cachedHubs;
    }
  },

  async saveHub(hub: StudyHubData, explicitUserId?: string) {
    const userId = explicitUserId || getCurrentUserId();
    if (!userId) {
      console.warn('saveHub skipped: no signed-in user.');
      return { error: null };
    }

    // 1. Local backup first so work is never lost
    const cachedHubs = readCache<Record<string, StudyHubData>>('hubs', userId, {});
    cachedHubs[hub.courseId] = { ...cachedHubs[hub.courseId], ...hub };
    writeCache('hubs', userId, cachedHubs);

    // 2. Persist
    try {
      const { error } = await supabase.from('study_hubs').upsert(
        {
          user_id: userId,
          course_id: hub.courseId,
          summary: hub.summary || '',
          flashcards: hub.flashcards || [],
          quizzes: hub.quizzes || [],
          tests: hub.tests || [],
          podcast_url: hub.podcastUrl || '',
          transcript: hub.transcript || '',
          file_content: hub.fileContent || '',
          file_name: hub.fileName || '',
        },
        { onConflict: 'user_id,course_id' }
      );
      if (error) throw error;
      return { error: null };
    } catch (err) {
      console.warn('saveHub warning:', err);
      return { error: null };
    }
  },

  // ---------------- Study Groups ----------------
  async getGroups(userId: string): Promise<StudyGroup[]> {
    const cachedGroups = readCache<StudyGroup[]>('groups', userId, []);
    try {
      // Row-level security already limits this to public groups + groups the user belongs to
      const { data, error } = await supabase
        .from('study_groups')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const rows = data || [];
      const materialsByGroup = await loadGroupMaterials(rows.map((r) => r.id));
      const groups = rows.map((row) => rowToGroup(row, materialsByGroup[row.id] || []));
      writeCache('groups', userId, groups);
      return groups;
    } catch (err) {
      console.error('getGroups error:', err);
      return cachedGroups;
    }
  },

  async createGroup(
    groupData: {
      name: string;
      description: string;
      course: string;
      type: 'general' | 'private';
      department?: string;
      level?: string;
      university?: string;
      academicSession?: string;
      groupImage?: string;
    },
    userId: string,
    userName: string
  ): Promise<StudyGroup> {
    const groupId = `group_${Date.now()}_${rand()}`;
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const createdAt = new Date().toISOString();

    const initialMember: GroupMember = {
      userId,
      name: userName || 'Group Creator',
      role: 'owner',
      joinedAt: createdAt,
    };
    const initialActivity = newActivity(
      groupId,
      'announcement',
      'Group Created',
      `Welcome to ${groupData.name}! Study group initialized by ${userName}.`,
      userName,
      userId
    );
    const welcomeMessage = {
      id: 'welcome',
      sender: 'Scolaris AI',
      text: `Welcome to ${groupData.name}! Upload study materials or start a discussion to collaborate.`,
      timestamp: Date.now(),
    };

    const { data, error } = await supabase
      .from('study_groups')
      .insert({
        id: groupId,
        name: groupData.name,
        description: groupData.description,
        course: groupData.course,
        type: groupData.type,
        visibility: groupData.type === 'general' ? 'public' : 'private',
        invite_code: inviteCode,
        department: groupData.department || '',
        level: groupData.level || '',
        university: groupData.university || '',
        academic_session: groupData.academicSession || '',
        group_image: groupData.groupImage || '',
        owner_id: userId,
        members: [initialMember],
        member_count: 1,
        messages: [welcomeMessage],
        discussions: [],
        activity_feed: [initialActivity],
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('createGroup error:', error);
      throw new Error(error?.message || 'Failed to create group.');
    }

    const newGroup = rowToGroup(data, []);
    const list = readCache<StudyGroup[]>('groups', userId, []);
    writeCache('groups', userId, [newGroup, ...list.filter((g) => g.id !== newGroup.id)]);
    return newGroup;
  },

  async joinGroup(
    groupId: string,
    inviteCode: string | null,
    userId: string,
    userName: string
  ): Promise<{ success: boolean; error?: string; group?: StudyGroup }> {
    try {
      const { data, error } = await supabase.rpc('join_group', {
        p_group_id: groupId,
        p_invite_code: inviteCode || '',
        p_name: userName,
      });
      if (error) throw error;

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to join group.' };
      }

      const materials = (await loadGroupMaterials([groupId]))[groupId] || [];
      return { success: true, group: rowToGroup(data.group, materials) };
    } catch (err: any) {
      console.error('joinGroup error:', err);
      return { success: false, error: err?.message || 'Failed to join group.' };
    }
  },

  async uploadGroupMaterial(
    groupId: string,
    file: File,
    uploaderId: string,
    uploaderName: string
  ): Promise<{ success: boolean; material?: any; error?: string }> {
    try {
      const materialId = `mat_${Date.now()}_${rand()}`;
      const storagePath = `groups/${groupId}/materials/${materialId}_${sanitizeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from(GROUP_MATERIALS_BUCKET)
        .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;

      // Extract plain text server-side so the group AI can use the material
      let extractedText = '';
      try {
        const token = await getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch('/api/files/extract', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            contentBase64: await fileToBase64(file),
          }),
        });
        if (resp.ok) {
          const resData = await resp.json();
          if (resData.success && resData.extractedText) extractedText = resData.extractedText;
        }
      } catch (extErr) {
        console.warn('Material text extraction warning:', extErr);
      }

      const { data: row, error: insertError } = await supabase
        .from('group_materials')
        .insert({
          id: materialId,
          group_id: groupId,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: formatSize(file.size),
          storage_path: storagePath,
          uploaded_by: uploaderId,
          uploaded_by_name: uploaderName,
          content: extractedText,
          course_id: 'group_material',
          course_code: file.name,
        })
        .select('*')
        .single();
      if (insertError || !row) {
        // Don't leave an orphaned object behind
        await supabase.storage.from(GROUP_MATERIALS_BUCKET).remove([storagePath]).catch(() => {});
        throw insertError || new Error('Failed to save material record.');
      }

      // Activity feed entry
      try {
        const group = await fetchGroupRow(groupId);
        if (group) {
          const activity = newActivity(
            groupId,
            'material_uploaded',
            'New Study Material Uploaded',
            `${uploaderName} uploaded "${file.name}"`,
            uploaderName,
            uploaderId
          );
          await supabase
            .from('study_groups')
            .update({ activity_feed: [activity, ...(group.activity_feed || [])] })
            .eq('id', groupId);
        }
      } catch (e) {
        console.warn('Activity feed update warning:', e);
      }

      const urls = await signedUrlMap(GROUP_MATERIALS_BUCKET, [storagePath]);
      return { success: true, material: rowToMaterial(row, urls) };
    } catch (err: any) {
      console.error('uploadGroupMaterial error:', err);
      return { success: false, error: err?.message || 'Failed to upload material.' };
    }
  },

  async createDiscussionPost(
    groupId: string,
    post: { title?: string; content: string; authorId: string; authorName: string; authorAvatar?: string }
  ): Promise<{ success: boolean; discussionPost?: any; error?: string }> {
    try {
      const postRecord = {
        id: `post_${Date.now()}_${rand()}`,
        groupId,
        authorId: post.authorId,
        authorName: post.authorName,
        authorAvatar: post.authorAvatar || 'user',
        title: post.title || '',
        content: post.content,
        timestamp: Date.now(),
        replies: [],
      };

      const group = await fetchGroupRow(groupId);
      if (!group) return { success: false, error: 'Group not found.' };

      const activity = newActivity(
        groupId,
        'discussion_created',
        'New Discussion Topic',
        `${post.authorName} started: "${(post.title || post.content).slice(0, 45)}..."`,
        post.authorName,
        post.authorId
      );

      const { error } = await supabase
        .from('study_groups')
        .update({
          discussions: [postRecord, ...(group.discussions || [])],
          activity_feed: [activity, ...(group.activity_feed || [])],
        })
        .eq('id', groupId);
      if (error) throw error;

      return { success: true, discussionPost: postRecord };
    } catch (err: any) {
      console.error('createDiscussionPost error:', err);
      return { success: false, error: err?.message || 'Failed to post discussion.' };
    }
  },

  async addDiscussionReply(
    groupId: string,
    postId: string,
    reply: { authorId: string; authorName: string; authorAvatar?: string; content: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const replyRecord = {
        id: `reply_${Date.now()}_${rand(4)}`,
        postId,
        authorId: reply.authorId,
        authorName: reply.authorName,
        authorAvatar: reply.authorAvatar || 'user',
        content: reply.content,
        timestamp: Date.now(),
      };

      const group = await fetchGroupRow(groupId);
      if (!group) return { success: false, error: 'Group not found.' };

      const discussions: any[] = group.discussions || [];
      const postIdx = discussions.findIndex((p) => p.id === postId);
      if (postIdx < 0) return { success: false, error: 'Discussion not found.' };

      discussions[postIdx] = { ...discussions[postIdx], replies: [...(discussions[postIdx].replies || []), replyRecord] };

      const { error } = await supabase.from('study_groups').update({ discussions }).eq('id', groupId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error('addDiscussionReply error:', err);
      return { success: false, error: err?.message || 'Failed to submit reply.' };
    }
  },

  async removeGroupMember(
    groupId: string,
    targetUserId: string,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const group = await fetchGroupRow(groupId);
      if (!group) return { success: false, error: 'Group not found.' };

      if (group.owner_id !== requesterId) {
        return { success: false, error: 'Only the group owner can remove members.' };
      }
      if (targetUserId === group.owner_id) {
        return { success: false, error: 'The group owner cannot be removed.' };
      }

      const members = ((group.members || []) as any[]).filter(
        (m) => (typeof m === 'string' ? m : m.userId) !== targetUserId
      );
      const { error } = await supabase
        .from('study_groups')
        .update({ members, member_count: members.length })
        .eq('id', groupId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to remove member.' };
    }
  },

  /**
   * Persists group details and the shared AI chat. Members, discussions, activity and materials are
   * written through their own methods so a stale local copy can never overwrite other people's changes.
   */
  async saveGroup(group: StudyGroup, userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('study_groups')
        .update({
          name: group.name,
          description: group.description,
          course: group.course,
          department: group.department || '',
          level: group.level || '',
          university: group.university || '',
          academic_session: group.academicSession || '',
          group_image: group.groupImage || '',
          messages: group.messages || [],
        })
        .eq('id', group.id)
        .select('id');
      if (error) throw error;

      if ((!data || data.length === 0) && (group.ownerId || userId) === userId) {
        const { error: insertError } = await supabase.from('study_groups').insert({
          id: group.id,
          name: group.name,
          description: group.description,
          course: group.course,
          type: group.type,
          visibility: group.type === 'general' ? 'public' : 'private',
          invite_code: group.inviteCode,
          department: group.department || '',
          level: group.level || '',
          university: group.university || '',
          academic_session: group.academicSession || '',
          group_image: group.groupImage || '',
          owner_id: userId,
          members: group.members || [],
          member_count: (group.members || []).length,
          messages: group.messages || [],
          discussions: group.discussions || [],
          activity_feed: group.activityFeed || [],
        });
        if (insertError) throw insertError;
      }

      const list = readCache<StudyGroup[]>('groups', userId, []);
      const idx = list.findIndex((g) => g.id === group.id);
      if (idx >= 0) list[idx] = group;
      else list.push(group);
      writeCache('groups', userId, list);
    } catch (err) {
      console.error('saveGroup error:', err);
    }
  },

  async updateGroupInviteCode(groupId: string, newCode: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase.from('study_groups').update({ invite_code: newCode }).eq('id', groupId);
      if (error) throw error;

      const list = readCache<StudyGroup[]>('groups', userId, []);
      writeCache('groups', userId, list.map((g) => (g.id === groupId ? { ...g, inviteCode: newCode } : g)));
    } catch (err) {
      console.error('updateGroupInviteCode error:', err);
    }
  },

  async findGroupByCode(inviteCode: string): Promise<StudyGroup | null> {
    try {
      const { data, error } = await supabase.rpc('find_group_by_code', { p_code: inviteCode.trim() });
      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name || '',
        description: data.description || '',
        course: data.course || 'General Study',
        type: data.type || 'private',
        visibility: data.visibility || 'private',
        inviteCode: data.invite_code,
        department: data.department || '',
        level: data.level || '',
        university: data.university || '',
        ownerId: data.owner_id || '',
        members: [],
        memberCount: data.member_count || 0,
        messages: [
          {
            id: 'welcome',
            sender: 'Scolaris AI',
            text: `You have found ${(data.name || '').toUpperCase()}. Join this group to view materials and collaborate!`,
            timestamp: Date.now(),
          },
        ],
        sharedMaterials: [],
        discussions: [],
        activityFeed: [],
      };
    } catch (err) {
      console.error('findGroupByCode error:', err);
      return null;
    }
  },

  async deleteGroupLocal(groupId: string, userId: string): Promise<void> {
    try {
      await supabase.from('study_groups').delete().eq('id', groupId);
      const list = readCache<StudyGroup[]>('groups', userId, []);
      writeCache('groups', userId, list.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error('deleteGroupLocal error:', err);
    }
  },

  // ---------------- User Files ----------------
  async getUserFiles(userId: string): Promise<UserFile[]> {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('user_files')
        .select('*')
        .eq('user_id', userId)
        .order('ts', { ascending: false });
      if (error) throw error;

      const rows = data || [];
      const urls = await signedUrlMap(USER_FILES_BUCKET, rows.map((r) => r.storage_path));
      const files = rows.map((r) => rowToUserFile(r, urls));
      writeCache('files', userId, files);
      return files;
    } catch (err) {
      console.error('getUserFiles error:', err);
      return readCache<UserFile[]>('files', userId, []);
    }
  },

  async uploadFileToStorage(
    userId: string,
    courseId: string,
    file: File,
    courseCode?: string,
    courseTitle?: string
  ): Promise<UserFile> {
    if (!userId) throw new Error('User must be authenticated to upload files');

    const fileId = `file_${Date.now()}_${rand()}`;
    // Isolated per-user path: users/{userId}/courses/{courseId}/{fileId}_{fileName}
    const storagePath = `users/${userId}/courses/${courseId}/${fileId}_${sanitizeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(USER_FILES_BUCKET)
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' });
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(uploadError.message || 'File upload failed.');
    }

    const { data: row, error: insertError } = await supabase
      .from('user_files')
      .insert({
        id: fileId,
        user_id: userId,
        course_id: courseId,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: formatSize(file.size),
        storage_path: storagePath,
        course_code: courseCode || '',
        course_title: courseTitle || '',
      })
      .select('*')
      .single();
    if (insertError || !row) {
      await supabase.storage.from(USER_FILES_BUCKET).remove([storagePath]).catch(() => {});
      console.error('Save user_files error:', insertError);
      throw new Error(insertError?.message || 'Failed to save file record.');
    }

    const urls = await signedUrlMap(USER_FILES_BUCKET, [storagePath]);
    const userFile = rowToUserFile(row, urls);

    const cached = readCache<UserFile[]>('files', userId, []);
    writeCache('files', userId, [userFile, ...cached.filter((f) => f.id !== fileId)]);
    return userFile;
  },

  async saveUserFileRecord(fileRecord: UserFile): Promise<{ error: any }> {
    try {
      const { error } = await supabase.from('user_files').upsert(
        {
          id: fileRecord.id,
          user_id: fileRecord.userId,
          course_id: fileRecord.courseId,
          file_name: fileRecord.fileName,
          file_type: fileRecord.fileType,
          file_size: fileRecord.fileSize,
          storage_path: fileRecord.storagePath,
          uploaded_at: fileRecord.uploadedAt,
          ts: fileRecord.timestamp,
          course_code: fileRecord.courseCode || '',
          course_title: fileRecord.courseTitle || '',
        },
        { onConflict: 'id' }
      );
      if (error) throw error;

      const list = readCache<UserFile[]>('files', fileRecord.userId, []);
      const idx = list.findIndex((f) => f.id === fileRecord.id);
      if (idx >= 0) list[idx] = fileRecord;
      else list.unshift(fileRecord);
      writeCache('files', fileRecord.userId, list);
      return { error: null };
    } catch (err) {
      console.error('saveUserFileRecord error:', err);
      return { error: err };
    }
  },

  async deleteUserFile(fileId: string, userId: string, storagePath?: string): Promise<void> {
    try {
      if (storagePath) {
        const { error: removeError } = await supabase.storage.from(USER_FILES_BUCKET).remove([storagePath]);
        if (removeError) console.warn('Storage file deletion warning:', removeError);
      }

      const { error } = await supabase.from('user_files').delete().eq('id', fileId);
      if (error) throw error;

      const list = readCache<UserFile[]>('files', userId, []);
      writeCache('files', userId, list.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('deleteUserFile error:', err);
      throw err;
    }
  },
};
