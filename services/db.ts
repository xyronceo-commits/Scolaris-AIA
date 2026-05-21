import { supabase } from '@/lib/supabase';
import { UserProfile, Course, StudySession, StudyGroup, StudyHubData, Difficulty, SubscriptionTier } from '../types';

export const DBService = {
  // Profiles
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      const cacheKey = `scolaris_user_private_v1_profile_${userId}`;
      if (error || !data) {
        console.warn('getProfile error or profile not found in DB. Checking private local cache...');
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch {
            return null;
          }
        }
        return null;
      }

      const profile: UserProfile = {
        name: data.name,
        email: data.email,
        university: data.institution || '',
        level: data.level || '',
        age: data.age || 18,
        semesterEnd: '',
        onboarded: data.onboarded,
        tutorialSeen: data.tutorial_seen,
        isPro: data.is_pro || false,
        tier: (data.tier || 'free') as SubscriptionTier,
        notifications: data.notifications || { messages: true, sessions: true, aiContent: true }
      };

      // Sync to private local cache
      localStorage.setItem(cacheKey, JSON.stringify(profile));
      return profile;
    } catch (err) {
      console.error('getProfile error:', err);
      const cached = localStorage.getItem(`scolaris_user_private_v1_profile_${userId}`);
      if (cached) {
        try { return JSON.parse(cached); } catch { return null; }
      }
      return null;
    }
  },

  async saveProfile(userId: string, profile: UserProfile) {
    try {
      const cacheKey = `scolaris_user_private_v1_profile_${userId}`;
      localStorage.setItem(cacheKey, JSON.stringify(profile));

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          name: profile.name,
          email: profile.email,
          institution: profile.university,
          level: profile.level,
          age: profile.age,
          onboarded: profile.onboarded,
          tutorial_seen: profile.tutorialSeen,
          is_pro: profile.isPro,
          tier: profile.tier,
          notifications: profile.notifications,
          updated_at: new Date()
        });
      return { error };
    } catch (err) {
      console.error('saveProfile error:', err);
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
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', userId);
      
      if (error) {
        console.warn('getCourses db error, falling back to private cache:', error.message);
        return cachedCourses;
      }

      const courses: Course[] = data.map(c => ({
        id: c.id,
        code: c.code,
        title: c.name,
        units: c.credits || 3,
        difficulty: c.difficulty as Difficulty,
        description: ''
      }));

      localStorage.setItem(cacheKey, JSON.stringify(courses));
      return courses;
    } catch (err) {
      console.error('getCourses error:', err);
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
      // Upsert local list
      const idx = list.findIndex(c => c.id === course.id);
      if (idx >= 0) {
        list[idx] = course;
      } else {
        list.push(course);
      }
      localStorage.setItem(cacheKey, JSON.stringify(list));

      const { error } = await supabase
        .from('courses')
        .upsert({
          id: course.id.includes('course-') ? undefined : (course.id.length > 20 ? undefined : course.id),
          user_id: userId,
          code: course.code,
          name: course.title,
          difficulty: course.difficulty,
          color: '#000000',
          credits: course.units,
          units: []
        });
      return { error };
    } catch (err) {
      console.error('saveCourse error:', err);
      return { error: err };
    }
  },

  async saveCourses(userId: string, courses: Course[]) {
    try {
      // Base file system cache
      const cacheKey = `scolaris_user_private_v1_courses_${userId}`;
      localStorage.setItem(cacheKey, JSON.stringify(courses));

      const formattedCourses = courses.map(c => ({
        id: c.id.length > 20 ? undefined : c.id, 
        user_id: userId,
        code: c.code,
        name: c.title,
        difficulty: c.difficulty,
        color: '#000000',
        credits: c.units,
        units: []
      }));

      const { error } = await supabase
        .from('courses')
        .upsert(formattedCourses);
      return { error };
    } catch (err) {
      console.error('saveCourses error:', err);
      return { error: err };
    }
  },

  async saveSchedule(userId: string, sessions: StudySession[]) {
    try {
      const cacheKey = `scolaris_user_private_v1_schedule_${userId}`;
      localStorage.setItem(cacheKey, JSON.stringify(sessions));

      const formattedSessions = sessions.map(s => ({
        id: s.id.length > 20 ? undefined : s.id,
        user_id: userId,
        course_id: s.courseId,
        day: s.day,
        duration: s.duration,
        mode: s.mode
      }));

      const { error } = await supabase
        .from('study_sessions')
        .upsert(formattedSessions);
      return { error };
    } catch (err) {
      console.error('saveSchedule error:', err);
      return { error: err };
    }
  },

  // Health Check
  async checkConnection(): Promise<boolean> {
    try {
      const { data, error } = await supabase.from('profiles').select('id').limit(1);
      if (error && error.code !== 'PGRST116') return false;
      return true;
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
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', userId);
      
      if (error) {
        console.warn('getSchedule db error, checking private cache:', error.message);
        return cachedSchedule;
      }

      const sessions: StudySession[] = data.map(s => ({
        id: s.id,
        courseId: s.course_id,
        day: s.day,
        duration: s.duration,
        mode: s.mode as any
      }));

      localStorage.setItem(cacheKey, JSON.stringify(sessions));
      return sessions;
    } catch (err) {
      console.error('getSchedule error:', err);
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
      const { data: courses, error: coursesError } = await supabase
        .from('courses')
        .select('id')
        .eq('user_id', userId);
      
      if (coursesError || !courses || courses.length === 0) {
        return cachedHubs;
      }

      const courseIds = courses.map(c => c.id);
      const { data: hubs, error } = await supabase
        .from('study_hubs')
        .select('*')
        .in('course_id', courseIds);
      
      if (error || !hubs) {
        console.warn('getHubs db error, checking private cache:', error?.message);
        return cachedHubs;
      }

      // Merge data
      const hubMap: Record<string, StudyHubData> = { ...cachedHubs };
      hubs.forEach(h => {
        hubMap[h.course_id] = {
          courseId: h.course_id,
          summary: h.summary || hubMap[h.course_id]?.summary,
          flashcards: h.flashcards || hubMap[h.course_id]?.flashcards,
          quizzes: h.quiz || hubMap[h.course_id]?.quizzes, 
          podcastUrl: h.podcast_url || hubMap[h.course_id]?.podcastUrl,
          transcript: h.transcript || hubMap[h.course_id]?.transcript,
          fileContent: h.file_content || hubMap[h.course_id]?.fileContent,
          fileName: h.file_name || hubMap[h.course_id]?.fileName
        };
      });

      localStorage.setItem(cacheKey, JSON.stringify(hubMap));
      return hubMap;
    } catch (err) {
      console.error('getHubs error:', err);
      return cachedHubs;
    }
  },

  async saveHub(hub: StudyHubData) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'anonymous';

      // 1. Immediately backup/persist to our private, secure local storage
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

      // 2. Try saving to Supabase (attempt both column schemas defensively)
      const { error } = await supabase
        .from('study_hubs')
        .upsert({
          course_id: hub.courseId,
          summary: hub.summary,
          flashcards: hub.flashcards,
          quiz: hub.quizzes, 
          podcast_url: hub.podcastUrl,
          transcript: hub.transcript,
          file_content: hub.fileContent,
          file_name: hub.fileName,
          updated_at: new Date()
        });

      if (error) {
        console.warn('saveHub with file columns failed. Retrying with basic study_hubs schema columns...', error.message);
        const { error: retryError } = await supabase
          .from('study_hubs')
          .upsert({
            course_id: hub.courseId,
            summary: hub.summary,
            flashcards: hub.flashcards,
            quiz: hub.quizzes, 
            podcast_url: hub.podcastUrl,
            transcript: hub.transcript,
            updated_at: new Date()
          });
        return { error: retryError };
      }

      return { error: null };
    } catch (err) {
      console.error('saveHub error:', err);
      return { error: err };
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
      const { data: memberships, error: memError } = await supabase
        .from('group_memberships')
        .select('group_id')
        .eq('user_id', userId);
      
      if (memError || !memberships || memberships.length === 0) {
        return cachedGroups;
      }

      const groupIds = memberships.map(m => m.group_id);
      const { data: groups, error: groupError } = await supabase
        .from('study_groups')
        .select('*, group_messages(*), shared_materials(*)')
        .in('id', groupIds);
      
      if (groupError || !groups) {
        return cachedGroups;
      }

      const syncedGroups: StudyGroup[] = groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        inviteCode: g.invite_code,
        visibility: g.visibility as any,
        members: [], 
        messages: (g.group_messages || []).map((m: any) => ({
          id: m.id,
          sender: m.sender_id, 
          text: m.text,
          timestamp: new Date(m.created_at).getTime(),
          isIrrelevant: m.is_irrelevant
        })),
        sharedMaterials: (g.shared_materials || []).map((sm: any) => ({
          courseId: sm.course_id || '',
          courseCode: sm.course_code || '',
          sharedBy: sm.uploader_id,
          timestamp: new Date(sm.created_at).getTime(),
          fileName: sm.file_name,
          content: sm.file_url 
        }))
      }));

      localStorage.setItem(cacheKey, JSON.stringify(syncedGroups));
      return syncedGroups;
    } catch (err) {
      console.error('getGroups error:', err);
      return cachedGroups;
    }
  },

  async saveGroup(group: StudyGroup, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('study_groups')
        .upsert({
          id: group.id,
          name: group.name,
          description: group.description,
          invite_code: group.inviteCode,
          visibility: group.visibility
        });
      
      if (error) {
        console.warn('saveGroup database warning:', error.message);
      }

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
      console.error('saveGroup error:', err);
    }
  },

  async updateGroupInviteCode(groupId: string, newCode: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('study_groups')
        .update({ invite_code: newCode })
        .eq('id', groupId);
      
      if (error) {
        console.warn('updateGroupInviteCode database warning:', error.message);
      }

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
      console.error('updateGroupInviteCode error:', err);
    }
  },

  async findGroupByCode(inviteCode: string): Promise<StudyGroup | null> {
    try {
      const { data, error } = await supabase
        .from('study_groups')
        .select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single();
      
      if (error || !data) {
        console.warn('findGroupByCode database search returned nothing or error:', error?.message);
        return null;
      }

      return {
        id: data.id,
        name: data.name,
        description: data.description || '',
        visibility: data.visibility || 'private',
        inviteCode: data.invite_code,
        members: [], 
        messages: [{
          id: 'welcome',
          sender: 'Scolaris AI',
          text: `You have successfully joined ${data.name.toUpperCase()}. Welcome to this private learning circle!`,
          timestamp: Date.now()
        }],
        sharedMaterials: []
      };
    } catch (err) {
      console.error('findGroupByCode error:', err);
      return null;
    }
  },

  async deleteGroupLocal(groupId: string, userId: string): Promise<void> {
    try {
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
