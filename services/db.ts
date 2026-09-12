import { db, auth, storage } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { UserProfile, Course, StudySession, StudyGroup, StudyHubData, Difficulty, SubscriptionTier, UserFile } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const DBService = {
  // Profiles
  async getProfile(userId: string): Promise<UserProfile | null> {
    const cacheKey = `scolaris_user_private_v1_profile_${userId}`;
    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.warn('getProfile: profile not found in Firestore. Checking private local cache...');
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try { return JSON.parse(cached); } catch { return null; }
        }
        return null;
      }

      const data = docSnap.data();
      const profile: UserProfile = {
        name: data.name || '',
        email: data.email || '',
        university: data.institution || '',
        level: data.level || '',
        age: data.age || 18,
        semesterEnd: data.semesterEnd || '',
        targetCGPA: typeof data.targetCGPA === 'number' ? data.targetCGPA : (typeof data.target_cgpa === 'number' ? data.target_cgpa : 4.50),
        avatarIcon: data.avatarIcon || data.avatar_icon || 'graduation-cap',
        onboarded: data.onboarded ?? false,
        tutorialSeen: data.tutorial_seen ?? false,
        isPro: data.is_pro ?? false,
        tier: (data.tier || 'free') as SubscriptionTier,
        notifications: data.notifications || { messages: true, sessions: true, aiContent: true }
      };

      // Sync to private local cache
      localStorage.setItem(cacheKey, JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('getProfile Firestore error:', err);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try { return JSON.parse(cached); } catch { return null; }
      }
      return null;
    }
  },

  async saveProfile(userId: string, profile: UserProfile) {
    const cacheKey = `scolaris_user_private_v1_profile_${userId}`;
    localStorage.setItem(cacheKey, JSON.stringify(profile));

    try {
      const docRef = doc(db, 'profiles', userId);
      await setDoc(docRef, {
        userId,
        name: profile.name,
        email: profile.email,
        institution: profile.university,
        level: profile.level,
        age: profile.age,
        targetCGPA: profile.targetCGPA ?? 4.50,
        avatarIcon: profile.avatarIcon || 'graduation-cap',
        onboarded: profile.onboarded,
        tutorial_seen: profile.tutorialSeen,
        is_pro: profile.isPro,
        tier: profile.tier,
        notifications: profile.notifications,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return { error: null };
    } catch (err) {
      console.error('saveProfile Firestore error:', err);
      return { error: err };
    }
  },

  // Courses
  async getCourses(userId: string): Promise<Course[]> {
    const cacheKey = `scolaris_user_private_v1_courses_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let cachedCourses: Course[] = [];
    if (cached) {
      try { cachedCourses = JSON.parse(cached); } catch { cachedCourses = []; }
    }

    try {
      const q = query(collection(db, 'courses'), where('userId', '==', userId));
      const querySnap = await getDocs(q);

      if (querySnap.empty && cachedCourses.length > 0) {
        return cachedCourses;
      }

      const courses: Course[] = [];
      querySnap.forEach((docSnap) => {
        const c = docSnap.data();
        courses.push({
          id: docSnap.id,
          code: c.code || '',
          title: c.name || c.title || '',
          units: c.credits || c.units || 3,
          difficulty: (c.difficulty || 'Medium') as Difficulty,
          description: c.description || ''
        });
      });

      if (courses.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(courses));
        return courses;
      }
      return cachedCourses;
    } catch (err) {
      console.error('getCourses Firestore error:', err);
      return cachedCourses;
    }
  },

  async saveCourse(userId: string, course: Course) {
    try {
      const cacheKey = `scolaris_user_private_v1_courses_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      let list: Course[] = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch { list = []; }
      }
      const idx = list.findIndex(c => c.id === course.id);
      if (idx >= 0) {
        list[idx] = course;
      } else {
        list.push(course);
      }
      localStorage.setItem(cacheKey, JSON.stringify(list));

      const courseId = course.id || `course_${Date.now()}`;
      const docRef = doc(db, 'courses', courseId);
      await setDoc(docRef, {
        id: courseId,
        userId,
        code: course.code,
        name: course.title,
        difficulty: course.difficulty,
        credits: course.units,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { error: null };
    } catch (err) {
      console.error('saveCourse Firestore error:', err);
      return { error: err };
    }
  },

  async saveCourses(userId: string, courses: Course[]) {
    try {
      const cacheKey = `scolaris_user_private_v1_courses_${userId}`;
      localStorage.setItem(cacheKey, JSON.stringify(courses));

      const batch = writeBatch(db);
      courses.forEach((c) => {
        const courseId = c.id || `course_${Math.random().toString(36).substring(2, 10)}`;
        const docRef = doc(db, 'courses', courseId);
        batch.set(docRef, {
          id: courseId,
          userId,
          code: c.code,
          name: c.title,
          difficulty: c.difficulty,
          credits: c.units,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      return { error: null };
    } catch (err) {
      console.error('saveCourses Firestore error:', err);
      return { error: err };
    }
  },

  // Schedule
  async saveSchedule(userId: string, sessions: StudySession[]) {
    try {
      const cacheKey = `scolaris_user_private_v1_schedule_${userId}`;
      localStorage.setItem(cacheKey, JSON.stringify(sessions));

      const batch = writeBatch(db);
      sessions.forEach((s) => {
        const sessionId = s.id || `session_${Math.random().toString(36).substring(2, 10)}`;
        const docRef = doc(db, 'study_sessions', sessionId);
        batch.set(docRef, {
          id: sessionId,
          userId,
          courseId: s.courseId,
          day: s.day,
          duration: s.duration,
          mode: s.mode,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      return { error: null };
    } catch (err) {
      console.error('saveSchedule Firestore error:', err);
      return { error: err };
    }
  },

  // Health Check
  async checkConnection(): Promise<boolean> {
    try {
      return !!db;
    } catch {
      return false;
    }
  },

  // Schedule
  async getSchedule(userId: string): Promise<StudySession[]> {
    const cacheKey = `scolaris_user_private_v1_schedule_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let cachedSchedule: StudySession[] = [];
    if (cached) {
      try { cachedSchedule = JSON.parse(cached); } catch { cachedSchedule = []; }
    }

    try {
      const q = query(collection(db, 'study_sessions'), where('userId', '==', userId));
      const querySnap = await getDocs(q);

      if (querySnap.empty && cachedSchedule.length > 0) {
        return cachedSchedule;
      }

      const sessions: StudySession[] = [];
      querySnap.forEach((docSnap) => {
        const s = docSnap.data();
        sessions.push({
          id: docSnap.id,
          courseId: s.courseId || '',
          day: s.day || '',
          duration: s.duration || 30,
          mode: s.mode as any
        });
      });

      if (sessions.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(sessions));
        return sessions;
      }
      return cachedSchedule;
    } catch (err) {
      console.error('getSchedule Firestore error:', err);
      return cachedSchedule;
    }
  },

  // Study Hubs
  async getHubs(userId: string): Promise<Record<string, StudyHubData>> {
    const cacheKey = `scolaris_user_private_v1_hubs_${userId}`;
    const cachedRaw = localStorage.getItem(cacheKey);
    let cachedHubs: Record<string, StudyHubData> = {};
    if (cachedRaw) {
      try { cachedHubs = JSON.parse(cachedRaw); } catch { cachedHubs = {}; }
    }

    try {
      const q = query(collection(db, 'study_hubs'), where('userId', '==', userId));
      const querySnap = await getDocs(q);

      const hubMap: Record<string, StudyHubData> = { ...cachedHubs };
      querySnap.forEach((docSnap) => {
        const h = docSnap.data();
        if (h.courseId) {
          hubMap[h.courseId] = {
            courseId: h.courseId,
            summary: h.summary || hubMap[h.courseId]?.summary,
            flashcards: h.flashcards || hubMap[h.courseId]?.flashcards,
            quizzes: h.quizzes || h.quiz || hubMap[h.courseId]?.quizzes,
            podcastUrl: h.podcastUrl || h.podcast_url || hubMap[h.courseId]?.podcastUrl,
            transcript: h.transcript || hubMap[h.courseId]?.transcript,
            fileContent: h.fileContent || h.file_content || hubMap[h.courseId]?.fileContent,
            fileName: h.fileName || h.file_name || hubMap[h.courseId]?.fileName
          };
        }
      });

      localStorage.setItem(cacheKey, JSON.stringify(hubMap));
      return hubMap;
    } catch (err) {
      console.error('getHubs Firestore error:', err);
      return cachedHubs;
    }
  },

  async saveHub(hub: StudyHubData, explicitUserId?: string) {
    try {
      const user = auth.currentUser;
      let userId = explicitUserId || user?.uid;
      if (!userId) {
        const sim = localStorage.getItem('supabase_simulated_user');
        if (sim) {
          try { userId = JSON.parse(sim).id; } catch {}
        }
      }
      if (!userId) userId = 'anonymous';

      // 1. Immediately backup/persist to local storage
      const cacheKey = `scolaris_user_private_v1_hubs_${userId}`;
      const cachedRaw = localStorage.getItem(cacheKey);
      let cachedHubs: Record<string, StudyHubData> = {};
      if (cachedRaw) {
        try { cachedHubs = JSON.parse(cachedRaw); } catch { cachedHubs = {}; }
      }
      cachedHubs[hub.courseId] = {
        ...cachedHubs[hub.courseId],
        ...hub
      };
      localStorage.setItem(cacheKey, JSON.stringify(cachedHubs));

      // 2. Save to Firestore
      const docId = `${userId}_${hub.courseId}`;
      const docRef = doc(db, 'study_hubs', docId);
      await setDoc(docRef, {
        userId,
        courseId: hub.courseId,
        summary: hub.summary || '',
        flashcards: hub.flashcards || [],
        quizzes: hub.quizzes || [],
        podcastUrl: hub.podcastUrl || '',
        transcript: hub.transcript || '',
        fileContent: hub.fileContent || '',
        fileName: hub.fileName || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { error: null };
    } catch (err) {
      console.warn('saveHub Firestore warning:', err);
      return { error: null };
    }
  },

  // Study Groups
  async getGroups(userId: string): Promise<StudyGroup[]> {
    const cacheKey = `scolaris_user_private_v1_groups_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let cachedGroups: StudyGroup[] = [];
    if (cached) {
      try { cachedGroups = JSON.parse(cached); } catch { cachedGroups = []; }
    }

    try {
      const querySnap = await getDocs(collection(db, 'study_groups'));
      if (querySnap.empty) {
        return cachedGroups;
      }

      const syncedGroups: StudyGroup[] = [];
      querySnap.forEach((docSnap) => {
        const g = docSnap.data();
        const membersList: any[] = g.members || [];
        const memberIds = membersList.map(m => typeof m === 'string' ? m : (m.userId || m.uid));
        
        const isGeneral = g.type === 'general' || g.visibility === 'public';
        const isMember = memberIds.includes(userId) || g.ownerId === userId;

        if (isGeneral || isMember) {
          syncedGroups.push({
            id: docSnap.id,
            name: g.name || '',
            description: g.description || '',
            course: g.course || g.subject || 'General Study',
            type: g.type || (g.visibility === 'public' ? 'general' : 'private'),
            visibility: g.visibility || (g.type === 'general' ? 'public' : 'private'),
            inviteCode: g.inviteCode || '',
            department: g.department || '',
            level: g.level || '',
            university: g.university || '',
            academicSession: g.academicSession || '',
            groupImage: g.groupImage || '',
            ownerId: g.ownerId || '',
            members: membersList,
            memberCount: g.memberCount || membersList.length,
            messages: (g.messages || []).map((m: any) => ({
              id: m.id || Math.random().toString(36).substring(2),
              sender: m.sender || m.sender_id || '',
              text: m.text || '',
              timestamp: m.timestamp || Date.now(),
              isIrrelevant: m.isIrrelevant || false
            })),
            sharedMaterials: (g.sharedMaterials || []).map((sm: any) => ({
              id: sm.id || Math.random().toString(36).substring(2),
              groupId: docSnap.id,
              courseId: sm.courseId || sm.course_id || '',
              courseCode: sm.courseCode || sm.course_code || '',
              sharedBy: sm.sharedBy || sm.uploadedByName || sm.uploader_id || 'Member',
              uploadedBy: sm.uploadedBy || sm.sharedBy || '',
              uploadedByName: sm.uploadedByName || sm.sharedBy || 'Member',
              uploadedAt: sm.uploadedAt || new Date().toISOString(),
              timestamp: sm.timestamp || Date.now(),
              fileName: sm.fileName || sm.file_name || 'Document',
              fileType: sm.fileType || 'application/pdf',
              fileSize: sm.fileSize || '1 MB',
              storagePath: sm.storagePath || '',
              downloadUrl: sm.downloadUrl || sm.s3Url || '',
              content: sm.content || ''
            })),
            discussions: g.discussions || [],
            activityFeed: g.activityFeed || [],
            createdAt: g.createdAt || new Date().toISOString(),
            updatedAt: g.updatedAt || new Date().toISOString()
          });
        }
      });

      if (syncedGroups.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(syncedGroups));
        return syncedGroups;
      }
      return cachedGroups;
    } catch (err) {
      console.error('getGroups Firestore error:', err);
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
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const createdAt = new Date().toISOString();

    const initialMember = {
      userId,
      name: userName || 'Group Creator',
      role: 'owner' as const,
      joinedAt: createdAt
    };

    const initialActivity = {
      id: `act_${Date.now()}`,
      groupId,
      type: 'announcement' as const,
      title: 'Group Created',
      description: `Welcome to ${groupData.name}! Study group initialized by ${userName}.`,
      actorName: userName,
      actorId: userId,
      timestamp: Date.now()
    };

    const newGroup: StudyGroup = {
      id: groupId,
      name: groupData.name,
      description: groupData.description,
      course: groupData.course,
      type: groupData.type,
      visibility: groupData.type === 'general' ? 'public' : 'private',
      inviteCode,
      department: groupData.department || '',
      level: groupData.level || '',
      university: groupData.university || '',
      academicSession: groupData.academicSession || '',
      groupImage: groupData.groupImage || '',
      ownerId: userId,
      members: [initialMember, userId],
      memberCount: 1,
      messages: [{
        id: 'welcome',
        sender: 'Scolaris AI',
        text: `Welcome to ${groupData.name}! Upload study materials or start a discussion to collaborate.`,
        timestamp: Date.now()
      }],
      sharedMaterials: [],
      discussions: [],
      activityFeed: [initialActivity],
      createdAt,
      updatedAt: createdAt
    };

    try {
      const docRef = doc(db, 'study_groups', groupId);
      await setDoc(docRef, newGroup, { merge: true });

      // Create activity subcollection record
      try {
        const actRef = doc(db, 'study_groups', groupId, 'activity', initialActivity.id);
        await setDoc(actRef, initialActivity);
      } catch (e) {
        console.warn('Activity subcollection write notice:', e);
      }
    } catch (err) {
      console.error('createGroup Firestore error:', err);
    }

    // Cache update
    const cacheKey = `scolaris_user_private_v1_groups_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let list: StudyGroup[] = [];
    if (cached) {
      try { list = JSON.parse(cached); } catch { list = []; }
    }
    list.unshift(newGroup);
    localStorage.setItem(cacheKey, JSON.stringify(list));

    return newGroup;
  },

  async joinGroup(groupId: string, inviteCode: string | null, userId: string, userName: string): Promise<{ success: boolean; error?: string; group?: StudyGroup }> {
    try {
      const docRef = doc(db, 'study_groups', groupId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return { success: false, error: 'Group not found.' };
      }

      const g = docSnap.data();
      const type = g.type || (g.visibility === 'public' ? 'general' : 'private');

      if (type === 'private' && inviteCode) {
        if ((g.inviteCode || '').trim().toUpperCase() !== inviteCode.trim().toUpperCase()) {
          return { success: false, error: 'Invalid invite code.' };
        }
      }

      const membersList: any[] = g.members || [];
      const alreadyMember = membersList.some(m => {
        if (typeof m === 'string') return m === userId || m === userName;
        return m.userId === userId || m.name === userName;
      });

      if (!alreadyMember) {
        const newMember = {
          userId,
          name: userName || 'Student',
          role: 'member' as const,
          joinedAt: new Date().toISOString()
        };

        const updatedMembers = [...membersList, newMember, userId];
        const newActivity = {
          id: `act_${Date.now()}`,
          groupId,
          type: 'member_joined' as const,
          title: 'New Member Joined',
          description: `${userName} joined the study group.`,
          actorName: userName,
          actorId: userId,
          timestamp: Date.now()
        };

        const existingActivity: any[] = g.activityFeed || [];
        const updatedActivity = [newActivity, ...existingActivity];

        await setDoc(docRef, {
          members: updatedMembers,
          memberCount: updatedMembers.length,
          activityFeed: updatedActivity,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        try {
          const actRef = doc(db, 'study_groups', groupId, 'activity', newActivity.id);
          await setDoc(actRef, newActivity);
        } catch (e) {}
      }

      const updatedSnap = await getDoc(docRef);
      const data = updatedSnap.data()!;

      const fullGroup: StudyGroup = {
        id: groupId,
        name: data.name || '',
        description: data.description || '',
        course: data.course || 'General Study',
        type: data.type || 'general',
        visibility: data.visibility || 'public',
        inviteCode: data.inviteCode || '',
        department: data.department || '',
        level: data.level || '',
        university: data.university || '',
        academicSession: data.academicSession || '',
        groupImage: data.groupImage || '',
        ownerId: data.ownerId || '',
        members: data.members || [],
        memberCount: data.memberCount || (data.members || []).length,
        messages: data.messages || [],
        sharedMaterials: data.sharedMaterials || [],
        discussions: data.discussions || [],
        activityFeed: data.activityFeed || [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      };

      return { success: true, group: fullGroup };
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
      const materialId = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `groups/${groupId}/materials/${materialId}_${sanitizedFileName}`;

      let downloadUrl = '';
      try {
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, file);
        downloadUrl = await getDownloadURL(fileRef);
      } catch (sErr) {
        console.warn('Group material storage upload warning:', sErr);
      }

      // Convert file to base64 to extract text server-side
      let extractedText = '';
      try {
        const arrayBuf = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const extractResp = await fetch('/api/files/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            contentBase64: base64
          })
        });
        if (extractResp.ok) {
          const resData = await extractResp.json();
          if (resData.success && resData.extractedText) {
            extractedText = resData.extractedText;
          }
        }
      } catch (extErr) {
        console.warn('Material text extraction warning:', extErr);
      }

      const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      };

      const materialRecord = {
        id: materialId,
        groupId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: formatSize(file.size),
        storagePath,
        downloadUrl,
        uploadedBy: uploaderId,
        uploadedByName: uploaderName,
        uploadedAt: new Date().toISOString(),
        timestamp: Date.now(),
        content: extractedText,
        // SharedMaterial backwards compatibility
        courseId: 'group_material',
        courseCode: file.name,
        sharedBy: uploaderName
      };

      // Write to subcollection /study_groups/{groupId}/materials/{materialId}
      try {
        const matRef = doc(db, 'study_groups', groupId, 'materials', materialId);
        await setDoc(matRef, materialRecord);
      } catch (e) {
        console.warn('Material subcollection write warning:', e);
      }

      // Update parent document's sharedMaterials and activityFeed
      const docRef = doc(db, 'study_groups', groupId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const g = docSnap.data();
        const existingMaterials = g.sharedMaterials || [];
        const updatedMaterials = [materialRecord, ...existingMaterials];

        const newActivity = {
          id: `act_${Date.now()}`,
          groupId,
          type: 'material_uploaded' as const,
          title: 'New Study Material Uploaded',
          description: `${uploaderName} uploaded "${file.name}"`,
          actorName: uploaderName,
          actorId: uploaderId,
          timestamp: Date.now()
        };

        const existingActivity = g.activityFeed || [];
        const updatedActivity = [newActivity, ...existingActivity];

        await setDoc(docRef, {
          sharedMaterials: updatedMaterials,
          activityFeed: updatedActivity,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        try {
          const actRef = doc(db, 'study_groups', groupId, 'activity', newActivity.id);
          await setDoc(actRef, newActivity);
        } catch (e) {}
      }

      return { success: true, material: materialRecord };
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
      const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const postRecord = {
        id: postId,
        groupId,
        authorId: post.authorId,
        authorName: post.authorName,
        authorAvatar: post.authorAvatar || 'user',
        title: post.title || '',
        content: post.content,
        timestamp: Date.now(),
        replies: []
      };

      try {
        const discRef = doc(db, 'study_groups', groupId, 'discussions', postId);
        await setDoc(discRef, postRecord);
      } catch (e) {}

      const docRef = doc(db, 'study_groups', groupId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const g = docSnap.data();
        const existingDiscussions = g.discussions || [];
        const updatedDiscussions = [postRecord, ...existingDiscussions];

        const newActivity = {
          id: `act_${Date.now()}`,
          groupId,
          type: 'discussion_created' as const,
          title: 'New Discussion Topic',
          description: `${post.authorName} started: "${(post.title || post.content).slice(0, 45)}..."`,
          actorName: post.authorName,
          actorId: post.authorId,
          timestamp: Date.now()
        };

        const existingActivity = g.activityFeed || [];
        const updatedActivity = [newActivity, ...existingActivity];

        await setDoc(docRef, {
          discussions: updatedDiscussions,
          activityFeed: updatedActivity,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        try {
          const actRef = doc(db, 'study_groups', groupId, 'activity', newActivity.id);
          await setDoc(actRef, newActivity);
        } catch (e) {}
      }

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
        id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        postId,
        authorId: reply.authorId,
        authorName: reply.authorName,
        authorAvatar: reply.authorAvatar || 'user',
        content: reply.content,
        timestamp: Date.now()
      };

      const docRef = doc(db, 'study_groups', groupId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const g = docSnap.data();
        const discussions: any[] = g.discussions || [];
        const postIdx = discussions.findIndex(p => p.id === postId);

        if (postIdx >= 0) {
          const post = discussions[postIdx];
          const updatedReplies = [...(post.replies || []), replyRecord];
          discussions[postIdx] = { ...post, replies: updatedReplies };

          await setDoc(docRef, { discussions, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }

      return { success: true };
    } catch (err: any) {
      console.error('addDiscussionReply error:', err);
      return { success: false, error: err?.message || 'Failed to submit reply.' };
    }
  },

  async removeGroupMember(groupId: string, targetUserId: string, requesterId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, 'study_groups', groupId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return { success: false, error: 'Group not found.' };

      const g = docSnap.data();
      if (g.ownerId !== requesterId && requesterId !== 'admin') {
        return { success: false, error: 'Only the group owner or admin can remove members.' };
      }

      const members: any[] = g.members || [];
      const updatedMembers = members.filter(m => (typeof m === 'string' ? m : m.userId) !== targetUserId);

      await setDoc(docRef, {
        members: updatedMembers,
        memberCount: updatedMembers.length,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to remove member.' };
    }
  },

  async saveGroup(group: StudyGroup, userId: string): Promise<void> {
    try {
      const docRef = doc(db, 'study_groups', group.id);
      await setDoc(docRef, {
        id: group.id,
        name: group.name,
        description: group.description,
        course: group.course,
        type: group.type,
        visibility: group.type === 'general' ? 'public' : 'private',
        inviteCode: group.inviteCode,
        department: group.department || '',
        level: group.level || '',
        university: group.university || '',
        academicSession: group.academicSession || '',
        groupImage: group.groupImage || '',
        ownerId: group.ownerId || userId,
        members: group.members || [],
        memberCount: (group.members || []).length,
        messages: group.messages || [],
        sharedMaterials: group.sharedMaterials || [],
        discussions: group.discussions || [],
        activityFeed: group.activityFeed || [],
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Sync to private local cache
      const cacheKey = `scolaris_user_private_v1_groups_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      let list: StudyGroup[] = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch { list = []; }
      }
      const idx = list.findIndex(g => g.id === group.id);
      if (idx >= 0) {
        list[idx] = group;
      } else {
        list.push(group);
      }
      localStorage.setItem(cacheKey, JSON.stringify(list));
    } catch (err) {
      console.error('saveGroup Firestore error:', err);
    }
  },

  async updateGroupInviteCode(groupId: string, newCode: string, userId: string): Promise<void> {
    try {
      const docRef = doc(db, 'study_groups', groupId);
      await setDoc(docRef, { inviteCode: newCode, updatedAt: new Date().toISOString() }, { merge: true });

      // Sync to local cache
      const cacheKey = `scolaris_user_private_v1_groups_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const list: StudyGroup[] = JSON.parse(cached);
          const updated = list.map(g => g.id === groupId ? { ...g, inviteCode: newCode } : g);
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch (err) {
          console.error('updateGroupInviteCode cache update error:', err);
        }
      }
    } catch (err) {
      console.error('updateGroupInviteCode Firestore error:', err);
    }
  },

  async findGroupByCode(inviteCode: string): Promise<StudyGroup | null> {
    try {
      const cleanCode = inviteCode.trim().toUpperCase();
      const q = query(collection(db, 'study_groups'), where('inviteCode', '==', cleanCode));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        return null;
      }

      const docSnap = querySnap.docs[0];
      const data = docSnap.data();

      return {
        id: docSnap.id,
        name: data.name || '',
        description: data.description || '',
        course: data.course || 'General Study',
        type: data.type || 'private',
        visibility: data.visibility || 'private',
        inviteCode: data.inviteCode,
        ownerId: data.ownerId || '',
        members: data.members || [],
        memberCount: data.memberCount || (data.members || []).length,
        messages: [{
          id: 'welcome',
          sender: 'Scolaris AI',
          text: `You have found ${(data.name || '').toUpperCase()}. Join this group to view materials and collaborate!`,
          timestamp: Date.now()
        }],
        sharedMaterials: data.sharedMaterials || [],
        discussions: data.discussions || [],
        activityFeed: data.activityFeed || []
      };
    } catch (err) {
      console.error('findGroupByCode Firestore error:', err);
      return null;
    }
  },

  async deleteGroupLocal(groupId: string, userId: string): Promise<void> {
    try {
      const docRef = doc(db, 'study_groups', groupId);
      await deleteDoc(docRef).catch(() => {});

      const cacheKey = `scolaris_user_private_v1_groups_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const list: StudyGroup[] = JSON.parse(cached);
          const filtered = list.filter(g => g.id !== groupId);
          localStorage.setItem(cacheKey, JSON.stringify(filtered));
        } catch (err) {
          console.error('deleteGroupLocal cache error:', err);
        }
      }
    } catch (err) {
      console.error('deleteGroupLocal error:', err);
    }
  },

  // User Isolated File Storage
  async getUserFiles(userId: string): Promise<UserFile[]> {
    if (!userId) return [];
    const cacheKey = `scolaris_user_private_v1_files_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let cachedFiles: UserFile[] = [];
    if (cached) {
      try { cachedFiles = JSON.parse(cached); } catch { cachedFiles = []; }
    }

    try {
      const q = query(collection(db, 'user_files'), where('userId', '==', userId));
      const querySnap = await getDocs(q);

      const files: UserFile[] = [];
      querySnap.forEach((docSnap) => {
        const d = docSnap.data();
        files.push({
          id: docSnap.id,
          userId: d.userId,
          courseId: d.courseId || '',
          fileName: d.fileName || '',
          fileType: d.fileType || '',
          fileSize: d.fileSize || '',
          storagePath: d.storagePath || '',
          downloadUrl: d.downloadUrl || '',
          uploadedAt: d.uploadedAt || new Date().toISOString(),
          timestamp: d.timestamp || Date.now(),
          courseCode: d.courseCode || '',
          courseTitle: d.courseTitle || ''
        });
      });

      // Sort by timestamp descending (most recent first)
      files.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      if (files.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(files));
        return files;
      }
      return cachedFiles;
    } catch (err) {
      console.error('getUserFiles Firestore error:', err);
      return cachedFiles;
    }
  },

  async uploadFileToStorage(
    userId: string, 
    courseId: string, 
    file: File, 
    courseCode?: string, 
    courseTitle?: string
  ): Promise<UserFile> {
    if (!userId) {
      throw new Error('User must be authenticated to upload files');
    }

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    // Isolated storage path: users/{userId}/courses/{courseId}/{fileId}_{fileName}
    const storagePath = `users/${userId}/courses/${courseId}/${fileId}_${sanitizedFileName}`;

    let downloadUrl = '';
    try {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      downloadUrl = await getDownloadURL(fileRef);
    } catch (storageErr) {
      console.warn('Firebase Storage upload warning (metadata stored):', storageErr);
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const userFile: UserFile = {
      id: fileId,
      userId: userId,
      courseId: courseId,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: formatSize(file.size),
      storagePath: storagePath,
      downloadUrl: downloadUrl,
      uploadedAt: new Date().toISOString(),
      timestamp: Date.now(),
      courseCode: courseCode || '',
      courseTitle: courseTitle || ''
    };

    // Save metadata record in Firestore under user_files collection
    try {
      const docRef = doc(db, 'user_files', fileId);
      await setDoc(docRef, userFile, { merge: true });
    } catch (dbErr) {
      console.error('Save user_files Firestore error:', dbErr);
      handleFirestoreError(dbErr, OperationType.WRITE, `user_files/${fileId}`);
    }

    // Update local cache
    const cacheKey = `scolaris_user_private_v1_files_${userId}`;
    const cached = localStorage.getItem(cacheKey);
    let cachedFiles: UserFile[] = [];
    if (cached) {
      try { cachedFiles = JSON.parse(cached); } catch { cachedFiles = []; }
    }
    cachedFiles = [userFile, ...cachedFiles.filter(f => f.id !== fileId)];
    localStorage.setItem(cacheKey, JSON.stringify(cachedFiles));

    return userFile;
  },

  async saveUserFileRecord(fileRecord: UserFile): Promise<{ error: any }> {
    try {
      const docRef = doc(db, 'user_files', fileRecord.id);
      await setDoc(docRef, fileRecord, { merge: true });

      const cacheKey = `scolaris_user_private_v1_files_${fileRecord.userId}`;
      const cached = localStorage.getItem(cacheKey);
      let list: UserFile[] = [];
      if (cached) {
        try { list = JSON.parse(cached); } catch { list = []; }
      }
      const idx = list.findIndex(f => f.id === fileRecord.id);
      if (idx >= 0) list[idx] = fileRecord;
      else list.unshift(fileRecord);
      localStorage.setItem(cacheKey, JSON.stringify(list));

      return { error: null };
    } catch (err) {
      console.error('saveUserFileRecord Firestore error:', err);
      return { error: err };
    }
  },

  async deleteUserFile(fileId: string, userId: string, storagePath?: string): Promise<void> {
    try {
      if (storagePath) {
        try {
          const fileRef = ref(storage, storagePath);
          await deleteObject(fileRef);
        } catch (e) {
          console.warn('Storage file deletion warning:', e);
        }
      }

      const docRef = doc(db, 'user_files', fileId);
      await deleteDoc(docRef);

      const cacheKey = `scolaris_user_private_v1_files_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const list: UserFile[] = JSON.parse(cached);
          const filtered = list.filter(f => f.id !== fileId);
          localStorage.setItem(cacheKey, JSON.stringify(filtered));
        } catch {}
      }
    } catch (err) {
      console.error('deleteUserFile error:', err);
      handleFirestoreError(err, OperationType.DELETE, `user_files/${fileId}`);
    }
  }
};
