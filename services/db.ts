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
  GroupActivity,
  AcademicDocument,
  StudioVersion,
  AcademicTask,
  AppNotification,
  GroupMessage,
  GroupDiscussionPost,
  GroupDiscussionReply,
  SharedMaterial,
} from '../types';

const USER_FILES_BUCKET = 'user-files';
const GROUP_MATERIALS_BUCKET = 'group-materials';
const FALLBACK_BUCKET = 'scolaris-library';
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
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    if (!error && data && data.length > 0 && data.some(d => d.signedUrl)) {
      const map: Record<string, string> = {};
      data.forEach((entry) => {
        if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
      });
      return map;
    }
  } catch (err) {
    console.warn(`signedUrlMap primary bucket '${bucket}' error:`, err);
  }

  // Fallback to FALLBACK_BUCKET if different
  if (bucket !== FALLBACK_BUCKET) {
    try {
      const { data: fbData, error: fbErr } = await supabase.storage.from(FALLBACK_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
      if (!fbErr && fbData) {
        const map: Record<string, string> = {};
        fbData.forEach((entry) => {
          if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
        });
        return map;
      }
    } catch {
      // non-blocking
    }
  }

  return {};
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
    status: row.status || (row.storage_path ? 'ready' : undefined),
  };
}

function rowToMaterial(row: any, urls: Record<string, string> = {}) {
  return {
    id: row.id,
    groupId: row.group_id,
    courseId: row.course_id || 'group_material',
    courseCode: row.course_code || row.file_name || '',
    sharedBy: row.uploaded_by_name || row.uploader_name || 'Member',
    uploadedBy: row.uploaded_by || row.uploader_id || '',
    uploadedByName: row.uploaded_by_name || row.uploader_name || 'Member',
    uploadedAt: row.uploaded_at || row.created_at || new Date().toISOString(),
    timestamp: Number(row.ts) || (row.created_at ? new Date(row.created_at).getTime() : Date.now()),
    fileName: row.file_name || 'Document',
    fileType: row.file_type || 'application/pdf',
    fileSize: row.file_size || (row.file_size_bytes ? formatSize(row.file_size_bytes) : ''),
    fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : undefined,
    storagePath: row.storage_path || '',
    downloadUrl: urls[row.storage_path] || '',
    content: row.extracted_text || row.content || '',
    extractedText: row.extracted_text || row.content || '',
    status: (row.status as 'pending' | 'processing' | 'ready' | 'failed') || 'ready',
    errorMessage: row.error_message || undefined,
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
    inviteCodeActive: row.invite_code_active !== false,
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

export function generateCircleInviteCode(): string {
  // Format: KQ-XXXX-XX (e.g. KQ-7F3A-92, excluding ambiguous 0, O, 1, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let p1 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  let p2 = '';
  for (let i = 0; i < 2; i++) {
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `KQ-${p1}-${p2}`;
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

function newActivity(groupId: string, type: GroupActivity['type'], title: string, description: string, actorName: string, actorId: string): GroupActivity {
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
        targetCGPA: typeof data.target_cgpa === 'number' ? data.target_cgpa : (data.target_cgpa !== null && data.target_cgpa !== undefined && !isNaN(Number(data.target_cgpa)) ? Number(data.target_cgpa) : 0.00),
        avatarIcon: data.avatar_icon || 'graduation-cap',
        onboarded: data.onboarded ?? false,
        tutorialSeen: data.tutorial_seen ?? false,
        isPro: data.is_pro ?? false,
        tier: (data.subscription_tier || data.tier || 'free') as SubscriptionTier,
        subscriptionTier: (data.subscription_tier || data.tier || 'free') as SubscriptionTier,
        subscriptionStatus: data.subscription_status || (data.is_pro ? 'active' : 'inactive'),
        paymentStatus: data.payment_status || 'none',
        subscriptionEnd: data.subscription_end || '',
        notifications: data.notifications || { messages: true, sessions: true, aiContent: true },
        department: data.department || '',
        major: data.major || '',
        academicGoals: data.academic_goals || '',
        studyStyle: data.study_style || '',
        assistanceAreas: data.assistance_areas || [],
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
      const basePayload: Record<string, any> = {
        id: userId,
        name: profile.name,
        email: profile.email,
        institution: profile.university,
        level: profile.level,
        age: profile.age,
        semester_end: profile.semesterEnd || '',
        target_cgpa: profile.targetCGPA !== undefined ? profile.targetCGPA : 0.00,
        avatar_icon: profile.avatarIcon || 'graduation-cap',
        onboarded: profile.onboarded,
        tutorial_seen: profile.tutorialSeen,
        is_pro: profile.isPro,
        tier: profile.tier,
        notifications: profile.notifications,
      };

      const fullPayload = { ...basePayload };
      if (profile.department !== undefined) fullPayload.department = profile.department;
      if (profile.major !== undefined) fullPayload.major = profile.major;
      if (profile.academicGoals !== undefined) fullPayload.academic_goals = profile.academicGoals;
      if (profile.studyStyle !== undefined) fullPayload.study_style = profile.studyStyle;
      if (profile.assistanceAreas !== undefined) fullPayload.assistance_areas = profile.assistanceAreas;

      let { error } = await supabase.from('profiles').upsert(fullPayload, { onConflict: 'id' });
      let droppedExtendedFields = false;

      // If database table doesn't have the extended columns yet, fall back gracefully to base columns
      if (error && (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
        console.warn('Extended profile columns missing from remote DB, saving core profile fields:', error.message);
        const retry = await supabase.from('profiles').upsert(basePayload, { onConflict: 'id' });
        error = retry.error;
        // department/major etc. were NOT saved; callers must not report success for those fields
        droppedExtendedFields = true;
      }

      if (error) throw error;
      return { error: null, droppedExtendedFields };
    } catch (err) {
      console.error('saveProfile error:', err);
      return { error: err, droppedExtendedFields: false };
    }
  },

  async getSubscription(userId: string) {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('getSubscription warning:', error.message);
      }
      return data || null;
    } catch (err) {
      console.warn('getSubscription error:', err);
      return null;
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
      const courseId = course.id || `course_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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

  async addCourse(userId: string, course: Course) {
    return this.saveCourse(userId, course);
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
      inviteCode?: string;
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
    const inviteCode = groupData.inviteCode?.trim().toUpperCase() || generateCircleInviteCode();
    const createdAt = new Date().toISOString();

    const initialMember: GroupMember = {
      userId,
      name: userName || 'Circle Creator',
      role: 'owner',
      joinedAt: createdAt,
    };
    const initialActivity = newActivity(
      groupId,
      'announcement',
      'Circle Created',
      `Welcome to ${groupData.name}! Study circle initialized by ${userName || 'Creator'}.`,
      userName || 'Creator',
      userId
    );
    const welcomeMessage = {
      id: 'welcome',
      sender: 'KorsIQ',
      text: `Welcome to ${groupData.name}! Upload study materials or start a discussion to collaborate.`,
      timestamp: Date.now(),
    };

    // 1. Try Backend Server API (service-role authenticated)
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/circles/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...groupData,
          inviteCode,
          ownerId: userId,
          ownerName: userName
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.group) {
          const newGroup: StudyGroup = json.group;
          const list = readCache<StudyGroup[]>('groups', userId, []);
          writeCache('groups', userId, [newGroup, ...list.filter((g) => g.id !== newGroup.id)]);
          return newGroup;
        }
      }
    } catch (apiErr) {
      console.warn('Backend /api/circles/create fallback:', apiErr);
    }

    // 2. Direct Supabase insert fallback
    try {
      const payload: any = {
        id: groupId,
        name: groupData.name,
        description: groupData.description,
        course: groupData.course,
        type: groupData.type,
        visibility: groupData.type === 'general' ? 'public' : 'private',
        invite_code: inviteCode,
        invite_code_active: true,
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
      };

      let { data, error } = await supabase
        .from('study_groups')
        .insert(payload)
        .select('*')
        .maybeSingle();

      if (error && (error.message?.includes('invite_code_active') || error.code === 'PGRST204')) {
        delete payload.invite_code_active;
        const retry = await supabase
          .from('study_groups')
          .insert(payload)
          .select('*')
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      }

      if (!error && data) {
        const newGroup = rowToGroup(data, []);
        const list = readCache<StudyGroup[]>('groups', userId, []);
        writeCache('groups', userId, [newGroup, ...list.filter((g) => g.id !== newGroup.id)]);
        return newGroup;
      }
    } catch (supabaseErr) {
      console.warn('Direct supabase study_groups insert fallback:', supabaseErr);
    }

    // 3. Resilient Local & Cache Creation Fallback (Never drop user circle)
    const localGroup: StudyGroup = {
      id: groupId,
      name: groupData.name,
      description: groupData.description || '',
      course: groupData.course,
      type: groupData.type,
      visibility: groupData.type === 'general' ? 'public' : 'private',
      inviteCode,
      inviteCodeActive: true,
      department: groupData.department || '',
      level: groupData.level || '',
      university: groupData.university || '',
      academicSession: groupData.academicSession || '',
      groupImage: groupData.groupImage || '',
      ownerId: userId,
      members: [initialMember],
      memberCount: 1,
      messages: [welcomeMessage],
      sharedMaterials: [],
      discussions: [],
      activityFeed: [initialActivity],
      createdAt,
      updatedAt: createdAt
    };

    const list = readCache<StudyGroup[]>('groups', userId, []);
    writeCache('groups', userId, [localGroup, ...list.filter((g) => g.id !== localGroup.id)]);
    return localGroup;
  },

  async joinGroup(
    groupId: string,
    inviteCode: string | null,
    userId: string,
    userName: string
  ): Promise<{ success: boolean; error?: string; group?: StudyGroup; isAlreadyMember?: boolean }> {
    try {
      const codeTrimmed = (inviteCode || '').trim().toUpperCase();

      // Check current group status
      const existingGroup = await fetchGroupRow(groupId);
      if (existingGroup) {
        // 1. Check if user is already a member
        const currentMembers = (existingGroup.members || []) as any[];
        const alreadyMember = currentMembers.some((m) => 
          (typeof m === 'string' ? m === userId : m?.userId === userId)
        );
        if (alreadyMember) {
          const materials = (await loadGroupMaterials([groupId]))[groupId] || [];
          return {
            success: false,
            error: 'You are already a member of this circle.',
            isAlreadyMember: true,
            group: rowToGroup(existingGroup, materials),
          };
        }

        // 2. If private group, check invite code & active status
        if (existingGroup.type === 'private' || existingGroup.visibility === 'private') {
          if (existingGroup.invite_code_active === false) {
            return {
              success: false,
              error: 'This invitation code has been revoked by the circle creator.',
            };
          }
          if ((existingGroup.invite_code || '').trim().toUpperCase() !== codeTrimmed) {
            return {
              success: false,
              error: 'Invalid invitation code.',
            };
          }
        }

        // 3. Check membership limit
        if (currentMembers.length >= 100) {
          return {
            success: false,
            error: 'Circle membership limit reached (maximum 100 members).',
          };
        }
      }

      // First attempt Supabase RPC join_group if available
      try {
        const { data, error } = await supabase.rpc('join_group', {
          p_group_id: groupId,
          p_invite_code: codeTrimmed,
          p_name: userName,
        });
        if (!error && data?.success) {
          const materials = (await loadGroupMaterials([groupId]))[groupId] || [];
          return { success: true, group: rowToGroup(data.group, materials) };
        }
      } catch (rpcErr) {
        console.warn('RPC join_group skipped or failed, fallback to direct membership:', rpcErr);
      }

      // Direct join fallback
      if (existingGroup) {
        const newMember: GroupMember = {
          userId,
          name: userName || 'Member',
          role: 'member',
          joinedAt: new Date().toISOString(),
        };
        const updatedMembers = [...(existingGroup.members || []), newMember];
        const activity = newActivity(
          groupId,
          'member_joined',
          'Member Joined Circle',
          `${userName} joined the study circle.`,
          userName,
          userId
        );

        const { data: updatedData, error: updateError } = await supabase
          .from('study_groups')
          .update({
            members: updatedMembers,
            member_count: updatedMembers.length,
            activity_feed: [activity, ...(existingGroup.activity_feed || [])],
          })
          .eq('id', groupId)
          .select('*')
          .single();

        if (updateError || !updatedData) {
          throw updateError || new Error('Failed to join circle.');
        }

        const materials = (await loadGroupMaterials([groupId]))[groupId] || [];
        const joinedGroup = rowToGroup(updatedData, materials);

        // Ensure relational membership for RLS
        try {
          await supabase
            .from('circle_members')
            .upsert(
              {
                circle_id: groupId,
                user_id: userId,
                user_name: userName || 'Member',
                role: 'member',
                joined_at: new Date().toISOString(),
              },
              { onConflict: 'circle_id,user_id' }
            );
        } catch {
          /* non-blocking */
        }

        const list = readCache<StudyGroup[]>('groups', userId, []);
        writeCache('groups', userId, [joinedGroup, ...list.filter((g) => g.id !== joinedGroup.id)]);
        return { success: true, group: joinedGroup };
      }

      return { success: false, error: 'Study circle not found.' };
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

      let usedBucket = GROUP_MATERIALS_BUCKET;
      let { error: uploadError } = await supabase.storage
        .from(GROUP_MATERIALS_BUCKET)
        .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });

      if (uploadError) {
        console.warn(`Upload to '${GROUP_MATERIALS_BUCKET}' warning: ${uploadError.message}. Retrying with '${FALLBACK_BUCKET}'...`);
        const fbRes = await supabase.storage
          .from(FALLBACK_BUCKET)
          .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
        if (!fbRes.error) {
          uploadError = null;
          usedBucket = FALLBACK_BUCKET;
        } else {
          uploadError = fbRes.error;
        }
      }

      if (uploadError) throw uploadError;

      // Extract plain text server-side so the group AI can use the material
      let extractedText = '';
      let processingStatus: 'ready' | 'processing' | 'failed' = 'processing';
      let extractionError: string | null = null;

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
          if (resData.success && resData.extractedText) {
            extractedText = resData.extractedText;
            processingStatus = 'ready';
          } else {
            processingStatus = 'failed';
            extractionError = resData.error || 'Text extraction was unable to parse this document structure.';
          }
        } else {
          processingStatus = 'failed';
          extractionError = 'Text extraction server request failed.';
        }
      } catch (extErr: any) {
        processingStatus = 'failed';
        extractionError = extErr?.message || 'Text extraction failed.';
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
          file_size_bytes: file.size,
          storage_path: storagePath,
          uploaded_by: uploaderId,
          uploaded_by_name: uploaderName,
          uploader_id: uploaderId,
          uploader_name: uploaderName,
          content: extractedText,
          extracted_text: extractedText,
          status: processingStatus,
          error_message: extractionError,
          course_id: 'group_material',
          course_code: file.name,
        })
        .select('*')
        .single();
      if (insertError || !row) {
        // Don't leave an orphaned object behind
        await supabase.storage.from(usedBucket).remove([storagePath]).catch(() => {});
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
      try {
        await supabase
          .from('circle_members')
          .delete()
          .eq('circle_id', groupId)
          .eq('user_id', targetUserId);
      } catch {
        /* non-blocking */
      }
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

  async updateGroupInviteCode(groupId: string, newCode: string, userId: string): Promise<boolean> {
    try {
      const group = await fetchGroupRow(groupId);
      if (group && group.owner_id && group.owner_id !== userId) {
        throw new Error('Unauthorized to regenerate circle invite code.');
      }

      let { error } = await supabase
        .from('study_groups')
        .update({ invite_code: newCode, invite_code_active: true })
        .eq('id', groupId);

      if (error && (error.message?.includes('invite_code_active') || error.code === 'PGRST204')) {
        const retry = await supabase
          .from('study_groups')
          .update({ invite_code: newCode })
          .eq('id', groupId);
        error = retry.error;
      }
      if (error) throw error;

      const list = readCache<StudyGroup[]>('groups', userId, []);
      writeCache('groups', userId, list.map((g) => (g.id === groupId ? { ...g, inviteCode: newCode, inviteCodeActive: true } : g)));
      return true;
    } catch (err) {
      console.error('updateGroupInviteCode error:', err);
      return false;
    }
  },

  async revokeGroupInviteCode(groupId: string, userId: string): Promise<boolean> {
    try {
      const group = await fetchGroupRow(groupId);
      if (group && group.owner_id && group.owner_id !== userId) {
        throw new Error('Unauthorized to revoke circle invite code.');
      }

      let { error } = await supabase
        .from('study_groups')
        .update({ invite_code_active: false })
        .eq('id', groupId);

      if (error && (error.message?.includes('invite_code_active') || error.code === 'PGRST204')) {
        const retry = await supabase
          .from('study_groups')
          .update({ invite_code: 'REVOKED_' + Date.now().toString(36) })
          .eq('id', groupId);
        error = retry.error;
      }
      if (error) throw error;

      const list = readCache<StudyGroup[]>('groups', userId, []);
      writeCache('groups', userId, list.map((g) => (g.id === groupId ? { ...g, inviteCodeActive: false } : g)));
      return true;
    } catch (err) {
      console.error('revokeGroupInviteCode error:', err);
      return false;
    }
  },

  async findGroupByCode(inviteCode: string): Promise<{ group?: StudyGroup; error?: string } | null> {
    const trimmed = (inviteCode || '').trim().toUpperCase();
    if (!trimmed) return null;

    // 1. Try Backend API lookup
    try {
      const res = await fetch(`/api/circles/find?code=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.group) {
          return { group: json.group };
        }
        if (json.error) {
          return { error: json.error };
        }
      } else if (res.status === 404) {
        const json = await res.json().catch(() => ({}));
        if (json.error) return { error: json.error };
      }
    } catch (apiErr) {
      console.warn('Backend /api/circles/find check skipped:', apiErr);
    }

    try {
      // 2. Direct select from study_groups
      const { data: directData } = await supabase
        .from('study_groups')
        .select('*')
        .ilike('invite_code', trimmed)
        .maybeSingle();

      if (directData) {
        if (directData.invite_code_active === false) {
          return { error: 'This invitation code has been revoked by the circle creator.' };
        }
        return { group: rowToGroup(directData, []) };
      }

      // 3. RPC fallback
      const { data, error } = await supabase.rpc('find_group_by_code', { p_code: trimmed });
      if (!error && data) {
        if (data.invite_code_active === false) {
          return { error: 'This invitation code has been revoked by the circle creator.' };
        }
        return {
          group: {
            id: data.id,
            name: data.name || '',
            description: data.description || '',
            course: data.course || 'General Study',
            type: data.type || 'private',
            visibility: data.visibility || 'private',
            inviteCode: data.invite_code,
            inviteCodeActive: data.invite_code_active !== false,
            department: data.department || '',
            level: data.level || '',
            university: data.university || '',
            ownerId: data.owner_id || '',
            members: [],
            memberCount: data.member_count || 0,
            messages: [
              {
                id: 'welcome',
                sender: 'KorsIQ',
                text: `You have found ${(data.name || '').toUpperCase()}. Join this group to view materials and collaborate!`,
                timestamp: Date.now(),
              },
            ],
            sharedMaterials: [],
            discussions: [],
            activityFeed: [],
          }
        };
      }

      // 4. Fallback: Search local cached circles across all users
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('_groups_')) {
          try {
            const cachedList = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(cachedList)) {
              const matched = cachedList.find((g: any) => (g.inviteCode || '').toUpperCase() === trimmed);
              if (matched) {
                if (matched.inviteCodeActive === false) {
                  return { error: 'This invitation code has been revoked by the circle creator.' };
                }
                return { group: matched };
              }
            }
          } catch {}
        }
      }

      return null;
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

  // ---------------- Relational Realtime Circle Chat, Forum & Resources ----------------
  async getCircleMessages(circleId: string): Promise<GroupMessage[]> {
    try {
      const { data, error } = await supabase
        .from('circle_messages')
        .select('*')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('circle_messages select notice:', error.message);
        const group = await fetchGroupRow(circleId);
        return (group?.messages || []) as GroupMessage[];
      }

      if (data && data.length > 0) {
        return data.map((r: any) => ({
          id: r.id,
          sender: r.sender_name,
          senderId: r.sender_id,
          senderAvatar: r.sender_avatar,
          text: r.text,
          timestamp: new Date(r.created_at).getTime(),
          replyToId: r.reply_to_id,
          replyToText: r.reply_to_text,
          replyToSender: r.reply_to_sender,
          clientTempId: r.client_temp_id,
          status: 'sent',
        }));
      }

      const group = await fetchGroupRow(circleId);
      return (group?.messages || []) as GroupMessage[];
    } catch (err) {
      console.warn('getCircleMessages error:', err);
      return [];
    }
  },

  async sendCircleMessage(
    circleId: string,
    senderId: string,
    senderName: string,
    text: string,
    options?: {
      replyToId?: string;
      replyToText?: string;
      replyToSender?: string;
      clientTempId?: string;
      senderAvatar?: string;
    }
  ): Promise<{ success: boolean; message?: GroupMessage; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('circle_messages')
        .insert({
          circle_id: circleId,
          sender_id: senderId,
          sender_name: senderName,
          sender_avatar: options?.senderAvatar || 'user',
          text: text.trim(),
          reply_to_id: options?.replyToId || null,
          reply_to_text: options?.replyToText || null,
          reply_to_sender: options?.replyToSender || null,
          client_temp_id: options?.clientTempId || null,
        })
        .select('*')
        .single();

      if (error) {
        console.warn('Fallback to study_groups.messages array:', error.message);
        const group = await fetchGroupRow(circleId);
        const msgId = options?.clientTempId || `msg_${Date.now()}_${rand()}`;
        const msgObj: GroupMessage = {
          id: msgId,
          sender: senderName,
          senderId,
          text: text.trim(),
          timestamp: Date.now(),
          replyToId: options?.replyToId,
          replyToText: options?.replyToText,
          replyToSender: options?.replyToSender,
          clientTempId: options?.clientTempId,
          status: 'sent',
        };
        if (group) {
          await supabase
            .from('study_groups')
            .update({ messages: [...(group.messages || []), msgObj] })
            .eq('id', circleId);
        }
        return { success: true, message: msgObj };
      }

      const msg: GroupMessage = {
        id: data.id,
        sender: data.sender_name,
        senderId: data.sender_id,
        senderAvatar: data.sender_avatar,
        text: data.text,
        timestamp: new Date(data.created_at).getTime(),
        replyToId: data.reply_to_id,
        replyToText: data.reply_to_text,
        replyToSender: data.reply_to_sender,
        clientTempId: data.client_temp_id,
        status: 'sent',
      };
      return { success: true, message: msg };
    } catch (err: any) {
      console.error('sendCircleMessage error:', err);
      return { success: false, error: err?.message || 'Failed to send message.' };
    }
  },

  async deleteCircleMessage(messageId: string, circleId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('circle_messages').delete().eq('id', messageId);
      if (error && circleId) {
        const group = await fetchGroupRow(circleId);
        if (group && group.messages) {
          const filtered = (group.messages as any[]).filter(
            (m) => m.id !== messageId && m.clientTempId !== messageId
          );
          await supabase.from('study_groups').update({ messages: filtered }).eq('id', circleId);
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete message.' };
    }
  },

  async getCircleDiscussions(circleId: string): Promise<GroupDiscussionPost[]> {
    try {
      const [discRes, repliesRes] = await Promise.all([
        supabase
          .from('circle_discussions')
          .select('*')
          .eq('circle_id', circleId)
          .order('created_at', { ascending: false }),
        supabase
          .from('circle_discussion_replies')
          .select('*')
          .eq('circle_id', circleId)
          .order('created_at', { ascending: true }),
      ]);

      if (!discRes.error && discRes.data && discRes.data.length > 0) {
        const repliesByDisc: Record<string, GroupDiscussionReply[]> = {};
        (repliesRes.data || []).forEach((r: any) => {
          (repliesByDisc[r.discussion_id] ||= []).push({
            id: r.id,
            postId: r.discussion_id,
            authorId: r.author_id,
            authorName: r.author_name,
            authorAvatar: r.author_avatar,
            content: r.content,
            timestamp: new Date(r.created_at).getTime(),
            quoteReplyId: r.quote_reply_id,
            quoteReplyText: r.quote_reply_text,
            quoteReplyAuthor: r.quote_reply_author,
          });
        });

        return discRes.data.map((d: any) => ({
          id: d.id,
          groupId: d.circle_id,
          authorId: d.author_id,
          authorName: d.author_name,
          authorAvatar: d.author_avatar,
          title: d.title,
          content: d.content,
          postType: d.post_type || 'thread',
          isPinned: Boolean(d.is_pinned),
          fileUrl: d.file_url,
          fileName: d.file_name,
          fileSize: d.file_size,
          fileType: d.file_type,
          repliesCount: d.replies_count || (repliesByDisc[d.id] || []).length,
          timestamp: new Date(d.created_at).getTime(),
          replies: repliesByDisc[d.id] || [],
        }));
      }

      const group = await fetchGroupRow(circleId);
      return (group?.discussions || []) as GroupDiscussionPost[];
    } catch (err) {
      console.warn('getCircleDiscussions error:', err);
      return [];
    }
  },

  async createCircleDiscussion(
    circleId: string,
    post: {
      title?: string;
      content: string;
      authorId: string;
      authorName: string;
      authorAvatar?: string;
      postType?: 'thread' | 'material';
      isPinned?: boolean;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      fileType?: string;
    }
  ): Promise<{ success: boolean; post?: GroupDiscussionPost; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('circle_discussions')
        .insert({
          circle_id: circleId,
          author_id: post.authorId,
          author_name: post.authorName,
          author_avatar: post.authorAvatar || 'user',
          title: (post.title || '').trim(),
          content: post.content.trim(),
          post_type: post.postType || 'thread',
          is_pinned: post.isPinned || false,
          file_url: post.fileUrl || null,
          file_name: post.fileName || null,
          file_size: post.fileSize || 0,
          file_type: post.fileType || null
        })
        .select('*')
        .single();

      if (error) {
        console.warn('Fallback to legacy createDiscussionPost:', error.message);
        const legacyRes = await DBService.createDiscussionPost(circleId, post);
        return { success: legacyRes.success, post: legacyRes.discussionPost, error: legacyRes.error };
      }

      const createdPost: GroupDiscussionPost = {
        id: data.id,
        groupId: data.circle_id,
        authorId: data.author_id,
        authorName: data.author_name,
        authorAvatar: data.author_avatar,
        title: data.title,
        content: data.content,
        postType: data.post_type || 'thread',
        isPinned: Boolean(data.is_pinned),
        fileUrl: data.file_url,
        fileName: data.file_name,
        fileSize: data.file_size,
        fileType: data.file_type,
        repliesCount: 0,
        timestamp: new Date(data.created_at).getTime(),
        replies: [],
      };

      try {
        const group = await fetchGroupRow(circleId);
        if (group) {
          await supabase
            .from('study_groups')
            .update({ discussions: [createdPost, ...(group.discussions || [])] })
            .eq('id', circleId);
        }
      } catch {}

      return { success: true, post: createdPost };
    } catch (err: any) {
      console.error('createCircleDiscussion error:', err);
      return { success: false, error: err?.message || 'Failed to post discussion.' };
    }
  },

  async togglePinPost(postId: string, isPinned: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('circle_discussions')
        .update({ is_pinned: isPinned })
        .eq('id', postId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to toggle pin state.' };
    }
  },

  async savePost(circleId: string, postId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('circle_saved_posts')
        .upsert({ circle_id: circleId, post_id: postId, user_id: userId }, { onConflict: 'user_id,post_id' });
      return !error;
    } catch {
      return false;
    }
  },

  async unsavePost(postId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('circle_saved_posts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      return !error;
    } catch {
      return false;
    }
  },

  async getSavedPostIds(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('circle_saved_posts')
        .select('post_id')
        .eq('user_id', userId);
      if (error || !data) return [];
      return data.map((r: any) => r.post_id);
    } catch {
      return [];
    }
  },

  async deleteCircleDiscussion(discussionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('circle_discussions').delete().eq('id', discussionId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete discussion.' };
    }
  },

  async addCircleReply(
    circleId: string,
    discussionId: string,
    reply: {
      authorId: string;
      authorName: string;
      authorAvatar?: string;
      content: string;
      quoteReplyId?: string;
      quoteReplyText?: string;
      quoteReplyAuthor?: string;
    }
  ): Promise<{ success: boolean; reply?: GroupDiscussionReply; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('circle_discussion_replies')
        .insert({
          discussion_id: discussionId,
          circle_id: circleId,
          author_id: reply.authorId,
          author_name: reply.authorName,
          author_avatar: reply.authorAvatar || 'user',
          content: reply.content.trim(),
          quote_reply_id: reply.quoteReplyId || null,
          quote_reply_text: reply.quoteReplyText || null,
          quote_reply_author: reply.quoteReplyAuthor || null,
        })
        .select('*')
        .single();

      if (error) {
        console.warn('Fallback to legacy addDiscussionReply:', error.message);
        return await DBService.addDiscussionReply(circleId, discussionId, reply);
      }

      const createdReply: GroupDiscussionReply = {
        id: data.id,
        postId: data.discussion_id,
        authorId: data.author_id,
        authorName: data.author_name,
        authorAvatar: data.author_avatar,
        content: data.content,
        timestamp: new Date(data.created_at).getTime(),
        quoteReplyId: data.quote_reply_id,
        quoteReplyText: data.quote_reply_text,
        quoteReplyAuthor: data.quote_reply_author,
      };

      return { success: true, reply: createdReply };
    } catch (err: any) {
      console.error('addCircleReply error:', err);
      return { success: false, error: err?.message || 'Failed to submit reply.' };
    }
  },

  async deleteCircleReply(replyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('circle_discussion_replies').delete().eq('id', replyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete reply.' };
    }
  },

  async getCircleMaterials(circleId: string): Promise<SharedMaterial[]> {
    try {
      const { data, error } = await supabase
        .from('group_materials')
        .select('*')
        .eq('group_id', circleId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = data || [];
      const urls = await signedUrlMap(GROUP_MATERIALS_BUCKET, rows.map((r) => r.storage_path));
      return rows.map((r) => rowToMaterial(r, urls));
    } catch (err) {
      console.error('getCircleMaterials error:', err);
      return [];
    }
  },

  async retryMaterialExtraction(
    materialId: string,
    storagePath: string,
    fileName: string,
    fileType: string
  ): Promise<{ success: boolean; extractedText?: string; error?: string }> {
    try {
      const { data: blob, error: dlError } = await supabase.storage.from(GROUP_MATERIALS_BUCKET).download(storagePath);
      if (dlError || !blob) {
        throw dlError || new Error('Could not download file from storage.');
      }

      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const token = await getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch('/api/files/extract', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileName, fileType, contentBase64: base64 }),
      });

      if (!resp.ok) {
        throw new Error(`Server returned HTTP ${resp.status}`);
      }

      const resJson = await resp.json();
      if (!resJson.success || !resJson.extractedText) {
        await supabase
          .from('group_materials')
          .update({
            status: 'failed',
            error_message: resJson.error || 'Text extraction unsuccessful.',
          })
          .eq('id', materialId);
        return { success: false, error: resJson.error || 'Extraction failed' };
      }

      await supabase
        .from('group_materials')
        .update({
          extracted_text: resJson.extractedText,
          content: resJson.extractedText,
          status: 'ready',
          error_message: null,
        })
        .eq('id', materialId);

      return { success: true, extractedText: resJson.extractedText };
    } catch (err: any) {
      console.error('retryMaterialExtraction error:', err);
      await supabase
        .from('group_materials')
        .update({
          status: 'failed',
          error_message: err?.message || 'Extraction retry failed.',
        })
        .eq('id', materialId);
      return { success: false, error: err?.message || 'Extraction retry failed.' };
    }
  },

  clearUserCache(userId?: string): void {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('scolaris_user_private_v1_') || (userId && key.includes(userId)))) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
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

    let usedBucket = USER_FILES_BUCKET;
    let { error: uploadError } = await supabase.storage
      .from(USER_FILES_BUCKET)
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });

    if (uploadError) {
      console.warn(`Upload to '${USER_FILES_BUCKET}' warning: ${uploadError.message}. Retrying with '${FALLBACK_BUCKET}'...`);
      const fbRes = await supabase.storage
        .from(FALLBACK_BUCKET)
        .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
      if (!fbRes.error) {
        uploadError = null;
        usedBucket = FALLBACK_BUCKET;
      } else {
        uploadError = fbRes.error;
      }
    }

    if (uploadError) {
      console.error('Storage upload error across buckets:', uploadError);
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
      await supabase.storage.from(usedBucket).remove([storagePath]).catch(() => {});
      console.error('Save user_files error:', insertError);
      throw new Error(insertError?.message || 'Failed to save file record.');
    }

    const urls = await signedUrlMap(usedBucket, [storagePath]);
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

  // ==========================================
  // KORSIQ ACADEMIC STUDIO
  // ==========================================

  async getAcademicDocuments(userId: string): Promise<AcademicDocument[]> {
    try {
      const cached = readCache<AcademicDocument[]>('academic_docs', userId, []);
      const { data, error } = await supabase
        .from('academic_documents')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error || !data) {
        return cached;
      }

      const docs: AcademicDocument[] = data.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        docType: r.doc_type,
        subject: r.subject || '',
        instructions: r.instructions || '',
        targetWordCount: r.target_word_count || 1500,
        currentWordCount: r.current_word_count || 0,
        citationStyle: r.citation_style || 'APA',
        status: r.status || 'planning',
        outline: r.outline || [],
        sections: r.sections || [],
        references: r.references || [],
        metadata: r.metadata || {},
        version: r.version || 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      writeCache('academic_docs', userId, docs);
      return docs;
    } catch (err) {
      console.warn('getAcademicDocuments fallback to cache:', err);
      return readCache<AcademicDocument[]>('academic_docs', userId, []);
    }
  },

  async getAcademicDocument(docId: string, userId: string): Promise<AcademicDocument | null> {
    try {
      const cachedList = readCache<AcademicDocument[]>('academic_docs', userId, []);
      const localDoc = cachedList.find((d) => d.id === docId);

      const { data, error } = await supabase
        .from('academic_documents')
        .select('*')
        .eq('id', docId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        return localDoc || null;
      }

      const doc: AcademicDocument = {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        docType: data.doc_type,
        subject: data.subject || '',
        instructions: data.instructions || '',
        targetWordCount: data.target_word_count || 1500,
        currentWordCount: data.current_word_count || 0,
        citationStyle: data.citation_style || 'APA',
        status: data.status || 'planning',
        outline: data.outline || [],
        sections: data.sections || [],
        references: data.references || [],
        metadata: data.metadata || {},
        version: data.version || 1,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      return doc;
    } catch {
      const cachedList = readCache<AcademicDocument[]>('academic_docs', userId, []);
      return cachedList.find((d) => d.id === docId) || null;
    }
  },

  async saveAcademicDocument(doc: AcademicDocument): Promise<AcademicDocument> {
    const now = new Date().toISOString();
    const updatedDoc: AcademicDocument = {
      ...doc,
      updatedAt: now,
    };

    // Update local cache immediately
    const list = readCache<AcademicDocument[]>('academic_docs', doc.userId, []);
    const idx = list.findIndex((d) => d.id === doc.id);
    if (idx >= 0) list[idx] = updatedDoc;
    else list.unshift(updatedDoc);
    writeCache('academic_docs', doc.userId, list);

    try {
      const { error } = await supabase.from('academic_documents').upsert(
        {
          id: doc.id,
          user_id: doc.userId,
          title: doc.title,
          doc_type: doc.docType,
          subject: doc.subject || '',
          instructions: doc.instructions || '',
          target_word_count: doc.targetWordCount,
          current_word_count: doc.currentWordCount,
          citation_style: doc.citationStyle,
          status: doc.status,
          outline: doc.outline || [],
          sections: doc.sections || [],
          references: doc.references || [],
          metadata: doc.metadata || {},
          version: doc.version || 1,
          updated_at: now,
        },
        { onConflict: 'id' }
      );
      if (error) console.warn('Supabase saveAcademicDocument warning:', error);
    } catch (err) {
      console.warn('saveAcademicDocument remote error, cached locally:', err);
    }

    return updatedDoc;
  },

  async deleteAcademicDocument(docId: string, userId: string): Promise<void> {
    const list = readCache<AcademicDocument[]>('academic_docs', userId, []);
    writeCache('academic_docs', userId, list.filter((d) => d.id !== docId));

    try {
      await supabase.from('academic_documents').delete().eq('id', docId).eq('user_id', userId);
    } catch (err) {
      console.warn('deleteAcademicDocument remote warning:', err);
    }
  },

  async duplicateAcademicDocument(docId: string, userId: string): Promise<AcademicDocument | null> {
    const original = await this.getAcademicDocument(docId, userId);
    if (!original) return null;

    const newDoc: AcademicDocument = {
      ...original,
      id: crypto.randomUUID(),
      title: `${original.title} (Copy)`,
      status: 'planning',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return await this.saveAcademicDocument(newDoc);
  },

  async saveDocumentVersion(
    docId: string,
    userId: string,
    title: string,
    snapshot: string,
    wordCount: number,
    notes?: string
  ): Promise<StudioVersion> {
    const version: StudioVersion = {
      id: crypto.randomUUID(),
      documentId: docId,
      versionNumber: Date.now(),
      title,
      createdAt: new Date().toISOString(),
      snapshot,
      wordCount,
      notes,
    };

    const cacheKeyName = `studio_versions_${docId}`;
    const list = readCache<StudioVersion[]>(cacheKeyName, userId, []);
    writeCache(cacheKeyName, userId, [version, ...list]);

    try {
      await supabase.from('academic_versions').insert({
        id: version.id,
        document_id: docId,
        user_id: userId,
        version_number: version.versionNumber,
        title: version.title,
        snapshot: JSON.parse(snapshot),
        word_count: wordCount,
        notes: notes || '',
      });
    } catch (err) {
      console.warn('saveDocumentVersion remote warning:', err);
    }

    return version;
  },

  async getDocumentVersions(docId: string, userId: string): Promise<StudioVersion[]> {
    const cacheKeyName = `studio_versions_${docId}`;
    const cached = readCache<StudioVersion[]>(cacheKeyName, userId, []);

    try {
      const { data, error } = await supabase
        .from('academic_versions')
        .select('*')
        .eq('document_id', docId)
        .order('created_at', { ascending: false });

      if (error || !data) return cached;

      const versions: StudioVersion[] = data.map((r: any) => ({
        id: r.id,
        documentId: r.document_id,
        versionNumber: r.version_number,
        title: r.title,
        createdAt: r.created_at,
        snapshot: typeof r.snapshot === 'string' ? r.snapshot : JSON.stringify(r.snapshot),
        wordCount: r.word_count || 0,
        notes: r.notes || '',
      }));

      writeCache(cacheKeyName, userId, versions);
      return versions;
    } catch {
      return cached;
    }
  },

  // ==========================================
  // ACADEMIC TASKS MANAGEMENT
  // ==========================================
  async getTasks(userId: string): Promise<AcademicTask[]> {
    const cached = readCache<AcademicTask[]>('academic_tasks', userId, []);
    if (!userId) return cached;

    try {
      const { data, error } = await supabase
        .from('academic_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true })
        .order('priority', { ascending: false });

      if (error) {
        console.warn('getTasks remote fallback:', error.message);
        return cached;
      }

      if (data) {
        const tasks: AcademicTask[] = data.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          title: r.title,
          description: r.description || '',
          category: r.category || 'assignment',
          dueDate: r.due_date,
          dueTime: r.due_time ? r.due_time.substring(0, 5) : undefined,
          priority: r.priority || 'medium',
          reminder: r.reminder || 'none',
          completed: !!r.completed,
          completedAt: r.completed_at || undefined,
          courseId: r.course_id || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        writeCache('academic_tasks', userId, tasks);
        return tasks;
      }
      return cached;
    } catch (err) {
      console.warn('getTasks exception fallback:', err);
      return cached;
    }
  },

  async createTask(
    userId: string,
    taskData: Omit<AcademicTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<AcademicTask> {
    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newTask: AcademicTask = {
      id: taskId,
      userId,
      title: taskData.title,
      description: taskData.description || '',
      category: taskData.category,
      dueDate: taskData.dueDate,
      dueTime: taskData.dueTime,
      priority: taskData.priority,
      reminder: taskData.reminder,
      completed: taskData.completed ?? false,
      completedAt: taskData.completedAt,
      courseId: taskData.courseId,
      createdAt: now,
      updatedAt: now,
    };

    // Update local cache immediately
    const cached = readCache<AcademicTask[]>('academic_tasks', userId, []);
    writeCache('academic_tasks', userId, [newTask, ...cached]);

    try {
      const { error } = await supabase.from('academic_tasks').insert({
        id: newTask.id,
        user_id: userId,
        title: newTask.title,
        description: newTask.description,
        category: newTask.category,
        due_date: newTask.dueDate,
        due_time: newTask.dueTime || null,
        priority: newTask.priority,
        reminder: newTask.reminder,
        completed: newTask.completed,
        completed_at: newTask.completedAt || null,
        course_id: newTask.courseId || null,
        created_at: now,
        updated_at: now,
      });

      if (error) {
        console.warn('createTask remote warning:', error.message);
      }
    } catch (err) {
      console.warn('createTask exception:', err);
    }

    return newTask;
  },

  async updateTask(
    userId: string,
    taskId: string,
    updates: Partial<AcademicTask>
  ): Promise<AcademicTask | null> {
    const cached = readCache<AcademicTask[]>('academic_tasks', userId, []);
    const existing = cached.find((t) => t.id === taskId);
    const now = new Date().toISOString();

    const updatedTask: AcademicTask = {
      ...(existing || ({} as AcademicTask)),
      ...updates,
      id: taskId,
      userId,
      updatedAt: now,
    };

    const nextList = cached.map((t) => (t.id === taskId ? updatedTask : t));
    writeCache('academic_tasks', userId, nextList);

    try {
      const dbPayload: any = { updated_at: now };
      if (updates.title !== undefined) dbPayload.title = updates.title;
      if (updates.description !== undefined) dbPayload.description = updates.description;
      if (updates.category !== undefined) dbPayload.category = updates.category;
      if (updates.dueDate !== undefined) dbPayload.due_date = updates.dueDate;
      if (updates.dueTime !== undefined) dbPayload.due_time = updates.dueTime || null;
      if (updates.priority !== undefined) dbPayload.priority = updates.priority;
      if (updates.reminder !== undefined) dbPayload.reminder = updates.reminder;
      if (updates.completed !== undefined) {
        dbPayload.completed = updates.completed;
        dbPayload.completed_at = updates.completed ? (updates.completedAt || now) : null;
      }
      if (updates.courseId !== undefined) dbPayload.course_id = updates.courseId || null;

      await supabase
        .from('academic_tasks')
        .update(dbPayload)
        .eq('id', taskId)
        .eq('user_id', userId);
    } catch (err) {
      console.warn('updateTask remote error:', err);
    }

    return updatedTask;
  },

  async deleteTask(userId: string, taskId: string): Promise<boolean> {
    const cached = readCache<AcademicTask[]>('academic_tasks', userId, []);
    writeCache(
      'academic_tasks',
      userId,
      cached.filter((t) => t.id !== taskId)
    );

    try {
      const { error } = await supabase
        .from('academic_tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', userId);
      return !error;
    } catch {
      return true;
    }
  },

  async toggleTaskCompleted(userId: string, taskId: string): Promise<AcademicTask | null> {
    const cached = readCache<AcademicTask[]>('academic_tasks', userId, []);
    const task = cached.find((t) => t.id === taskId);
    if (!task) return null;

    const nextCompleted = !task.completed;
    const now = new Date().toISOString();

    return this.updateTask(userId, taskId, {
      completed: nextCompleted,
      completedAt: nextCompleted ? now : undefined,
    });
  },

  // ==========================================
  // PERSISTENT NOTIFICATIONS MANAGEMENT
  // ==========================================
  async getNotifications(userId: string): Promise<AppNotification[]> {
    const cached = readCache<AppNotification[]>('user_notifications', userId, []);
    if (!userId) return cached;

    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('getNotifications remote fallback:', error.message);
        return cached;
      }

      if (data) {
        const notifs: AppNotification[] = data.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          type: r.type || 'session',
          title: r.title,
          message: r.message,
          read: !!r.read,
          link: r.link || undefined,
          metadata: r.metadata || {},
          timestamp: new Date(r.created_at).getTime(),
          createdAt: r.created_at,
        }));
        writeCache('user_notifications', userId, notifs);
        return notifs;
      }
      return cached;
    } catch (err) {
      console.warn('getNotifications exception fallback:', err);
      return cached;
    }
  },

  async createNotification(
    userId: string,
    notif: Omit<AppNotification, 'id' | 'timestamp'>
  ): Promise<AppNotification> {
    const notifId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newNotif: AppNotification = {
      ...notif,
      id: notifId,
      userId,
      timestamp: Date.now(),
      createdAt: now,
      read: notif.read ?? false,
    };

    const cached = readCache<AppNotification[]>('user_notifications', userId, []);
    // Prevent strict duplicate messages within recent timeframe
    const isDuplicate = cached.some(
      (c) => c.title === notif.title && c.message === notif.message && Date.now() - c.timestamp < 60000
    );
    if (isDuplicate) return cached[0];

    writeCache('user_notifications', userId, [newNotif, ...cached]);

    try {
      await supabase.from('user_notifications').insert({
        id: notifId,
        user_id: userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: newNotif.read,
        link: notif.link || null,
        metadata: notif.metadata || {},
        created_at: now,
      });
    } catch (err) {
      console.warn('createNotification remote error:', err);
    }

    return newNotif;
  },

  async markNotificationAsRead(userId: string, notifId: string): Promise<boolean> {
    const cached = readCache<AppNotification[]>('user_notifications', userId, []);
    const updated = cached.map((n) => (n.id === notifId ? { ...n, read: true } : n));
    writeCache('user_notifications', userId, updated);

    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read: true })
        .eq('id', notifId)
        .eq('user_id', userId);
      return !error;
    } catch {
      return true;
    }
  },

  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    const cached = readCache<AppNotification[]>('user_notifications', userId, []);
    const updated = cached.map((n) => ({ ...n, read: true }));
    writeCache('user_notifications', userId, updated);

    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      return !error;
    } catch {
      return true;
    }
  },

  async clearAllNotifications(userId: string): Promise<boolean> {
    writeCache('user_notifications', userId, []);

    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('user_id', userId);
      return !error;
    } catch {
      return true;
    }
  },
};
