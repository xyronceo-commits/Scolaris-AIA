import { db, auth } from '../lib/firebase';
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
import { UserProfile, Course, StudySession, StudyGroup, StudyHubData, Difficulty, SubscriptionTier } from '../types';

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
        const members: string[] = g.members || [];
        if (g.visibility === 'public' || members.includes(userId) || g.ownerId === userId) {
          syncedGroups.push({
            id: docSnap.id,
            name: g.name || '',
            description: g.description || '',
            inviteCode: g.inviteCode || '',
            visibility: g.visibility || 'private',
            members: members,
            messages: (g.messages || []).map((m: any) => ({
              id: m.id || Math.random().toString(36).substring(2),
              sender: m.sender || m.sender_id || '',
              text: m.text || '',
              timestamp: m.timestamp || Date.now(),
              isIrrelevant: m.isIrrelevant || false
            })),
            sharedMaterials: (g.sharedMaterials || []).map((sm: any) => ({
              courseId: sm.courseId || sm.course_id || '',
              courseCode: sm.courseCode || sm.course_code || '',
              sharedBy: sm.sharedBy || sm.uploader_id || '',
              timestamp: sm.timestamp || Date.now(),
              fileName: sm.fileName || sm.file_name || '',
              content: sm.content || sm.file_url || ''
            }))
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

  async saveGroup(group: StudyGroup, userId: string): Promise<void> {
    try {
      const docRef = doc(db, 'study_groups', group.id);
      await setDoc(docRef, {
        id: group.id,
        name: group.name,
        description: group.description,
        inviteCode: group.inviteCode,
        visibility: group.visibility,
        members: Array.from(new Set([...(group.members || []), userId])),
        messages: group.messages || [],
        sharedMaterials: group.sharedMaterials || [],
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
      const q = query(collection(db, 'study_groups'), where('inviteCode', '==', inviteCode.trim().toUpperCase()));
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
        visibility: data.visibility || 'private',
        inviteCode: data.inviteCode,
        members: data.members || [],
        messages: [{
          id: 'welcome',
          sender: 'Scolaris AI',
          text: `You have successfully joined ${(data.name || '').toUpperCase()}. Welcome to this private learning circle!`,
          timestamp: Date.now()
        }],
        sharedMaterials: data.sharedMaterials || []
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
  }
};
