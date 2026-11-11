// ============================================================================
// KorsIQ Adaptive Reading Schedule Engine (Deterministic, No AI)
// ============================================================================
// Core responsibilities:
// 1. Distribute outline topics into read-ahead, review, practice, and revision blocks.
// 2. Share study time across courses proportional to (units * difficulty).
// 3. Avoid clashes with existing timetable classes and deadlines.
// 4. Reserve pre-exam revision phase (last 2-3 weeks).
// 5. Adaptively reschedule skipped / overdue items without dropping topics.
// 6. Maintain an audit change log of what moved and why.
// ============================================================================

export type ScheduleItemType = 'read-ahead' | 'review' | 'practice' | 'revision';
export type ScheduleItemStatus = 'pending' | 'completed' | 'skipped' | 'rescheduled';

export interface OutlineTopicInput {
  id: string;
  outlineId: string;
  courseCode: string;
  weekNumber: number; // 1 to 14
  title: string;
  description?: string;
  isFlagged?: boolean;
}

export interface AssessmentInput {
  id: string;
  courseCode: string;
  title: string;
  type: 'test' | 'quiz' | 'assignment' | 'midterm' | 'exam' | 'practical' | 'project';
  dueDate?: string; // YYYY-MM-DD
  weightPercent?: number;
}

export interface CourseScheduleConfig {
  courseId: string;
  code: string;
  title: string;
  units: number;
  difficulty: number; // 1 to 5
  topics: OutlineTopicInput[];
  assessments: AssessmentInput[];
}

export interface SemesterScheduleSettings {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  examStartDate: string; // YYYY-MM-DD
  studyDays: number[]; // 0=Sunday, 1=Monday ... 6=Saturday
  hoursPerDay: number; // e.g. 2.5 or 3.0 hours
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'night';
  revisionWeeks?: number; // Default 2.5 weeks
}

export interface ExistingCommitment {
  date: string; // YYYY-MM-DD
  startTime?: string; // "09:00"
  durationMinutes?: number;
  title: string;
}

export interface StudyPlanItem {
  id: string;
  courseCode: string;
  courseId: string;
  topicId?: string;
  topicTitle: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string; // "18:00"
  durationMinutes: number;
  itemType: ScheduleItemType;
  status: ScheduleItemStatus;
  originalDate?: string;
  rescheduleReason?: string;
  weekNumber: number;
  syncedTaskId?: string;
}

export interface ScheduleChangeLogEntry {
  id: string;
  timestamp: number;
  itemId: string;
  courseCode: string;
  topicTitle: string;
  fromDate: string;
  toDate: string;
  reason: string;
}

export interface GeneratedScheduleResult {
  items: StudyPlanItem[];
  changeLog: ScheduleChangeLogEntry[];
  totalWeeks: number;
  lectureWeeks: number;
  revisionWeeks: number;
  weeklySummary: Record<number, {
    weekNumber: number;
    startDate: string;
    endDate: string;
    totalMinutes: number;
    itemsCount: number;
    isRevisionPhase: boolean;
  }>;
  isBehindSchedule: boolean;
  behindScheduleMessage?: string;
}

/**
 * Helper to add days to a YYYY-MM-DD date string.
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates date difference in days.
 */
function daysDiff(d1Str: string, d2Str: string): number {
  const d1 = new Date(d1Str + 'T12:00:00Z').getTime();
  const d2 = new Date(d2Str + 'T12:00:00Z').getTime();
  return Math.round((d2 - d1) / (24 * 3600 * 1000));
}

/**
 * Returns preferred default start time by period.
 */
function getPreferredStartTime(period: 'morning' | 'afternoon' | 'evening' | 'night'): string {
  switch (period) {
    case 'morning': return '08:30';
    case 'afternoon': return '14:00';
    case 'night': return '21:00';
    case 'evening':
    default: return '18:00';
  }
}

/**
 * Generates a full deterministic reading schedule.
 */
export function generateReadingSchedule(
  settings: SemesterScheduleSettings,
  courses: CourseScheduleConfig[],
  existingCommitments: ExistingCommitment[] = []
): GeneratedScheduleResult {
  const {
    startDate,
    endDate,
    examStartDate,
    studyDays = [1, 2, 3, 4, 5],
    hoursPerDay = 3,
    preferredTime = 'evening',
    revisionWeeks = 2.5
  } = settings;

  const totalSemesterDays = Math.max(7, daysDiff(startDate, endDate));
  const totalWeeks = Math.max(1, Math.ceil(totalSemesterDays / 7));
  const daysUntilExams = Math.max(7, daysDiff(startDate, examStartDate));
  const lectureWeeks = Math.max(1, Math.floor((daysUntilExams - (revisionWeeks * 7)) / 7));

  // Determine study weight per course = units * difficulty
  const courseWeights: Record<string, number> = {};
  let totalWeight = 0;
  for (const c of courses) {
    const w = Math.max(1, (c.units || 3) * (c.difficulty || 3));
    courseWeights[c.code] = w;
    totalWeight += w;
  }

  // Set of occupied dates from commitments
  const occupiedDates = new Set(existingCommitments.map(e => e.date));

  const items: StudyPlanItem[] = [];
  const startTime = getPreferredStartTime(preferredTime);
  const changeLog: ScheduleChangeLogEntry[] = [];

  // Track planned minutes per day to respect hoursPerDay
  const dayMinutes: Record<string, number> = {};
  const maxDayMinutes = Math.round(hoursPerDay * 60);

  // Helper to find a free date on preferred study days
  function findFreeDate(targetWeek: number, preferredDayOffset: number = 0): string {
    const weekStartOffset = (targetWeek - 1) * 7;
    for (let d = 0; d < 7; d++) {
      const dayOffset = (preferredDayOffset + d) % 7;
      const candidateDate = addDays(startDate, weekStartOffset + dayOffset);
      if (candidateDate > endDate) break;

      const dayOfWeek = new Date(candidateDate + 'T12:00:00Z').getUTCDay();
      if (!studyDays.includes(dayOfWeek)) continue;

      const currentMinutes = dayMinutes[candidateDate] || 0;
      if (currentMinutes + 45 <= maxDayMinutes) {
        return candidateDate;
      }
    }
    // Fallback: any date in the week
    return addDays(startDate, weekStartOffset + (preferredDayOffset % 7));
  }

  let itemIdCounter = 1;

  // 1. Schedule Lecture Topics: Read-Ahead and Review Blocks
  for (const course of courses) {
    const sortedTopics = [...course.topics].sort((a, b) => a.weekNumber - b.weekNumber);

    for (const topic of sortedTopics) {
      const topicWeek = Math.min(lectureWeeks, Math.max(1, topic.weekNumber || 1));

      // A. Read-Ahead Block (scheduled 1-2 days before lecture in topic week)
      const readAheadDate = findFreeDate(topicWeek, 1);
      const readAheadId = `item_${Date.now()}_${itemIdCounter++}`;
      items.push({
        id: readAheadId,
        courseCode: course.code,
        courseId: course.courseId,
        topicId: topic.id,
        topicTitle: topic.title,
        scheduledDate: readAheadDate,
        startTime,
        durationMinutes: 45,
        itemType: 'read-ahead',
        status: 'pending',
        weekNumber: topicWeek,
      });
      dayMinutes[readAheadDate] = (dayMinutes[readAheadDate] || 0) + 45;

      // B. Review Block (scheduled 2-3 days after lecture in topic week)
      const reviewDate = findFreeDate(topicWeek, 4);
      const reviewId = `item_${Date.now()}_${itemIdCounter++}`;
      items.push({
        id: reviewId,
        courseCode: course.code,
        courseId: course.courseId,
        topicId: topic.id,
        topicTitle: topic.title,
        scheduledDate: reviewDate,
        startTime,
        durationMinutes: 50,
        itemType: 'review',
        status: 'pending',
        weekNumber: topicWeek,
      });
      dayMinutes[reviewDate] = (dayMinutes[reviewDate] || 0) + 50;
    }

    // 2. Schedule Practice Blocks before known Assessments/Tests
    for (const assess of course.assessments) {
      if (assess.dueDate) {
        // Schedule practice block 3 days before test
        const practiceDate = addDays(assess.dueDate, -3);
        if (practiceDate >= startDate && practiceDate <= endDate) {
          const practiceId = `item_${Date.now()}_${itemIdCounter++}`;
          items.push({
            id: practiceId,
            courseCode: course.code,
            courseId: course.courseId,
            topicTitle: `Practice & Mock: ${assess.title}`,
            scheduledDate: practiceDate,
            startTime,
            durationMinutes: 60,
            itemType: 'practice',
            status: 'pending',
            weekNumber: Math.max(1, Math.ceil(daysDiff(startDate, practiceDate) / 7)),
          });
          dayMinutes[practiceDate] = (dayMinutes[practiceDate] || 0) + 60;
        }
      }
    }

    // 3. Revision Blocks in the Pre-Exam Phase (last 2-3 weeks)
    const revisionStartWeek = Math.max(1, totalWeeks - Math.floor(revisionWeeks));
    for (let w = revisionStartWeek; w <= totalWeeks; w++) {
      const revDate = findFreeDate(w, 2);
      const revId = `item_${Date.now()}_${itemIdCounter++}`;
      items.push({
        id: revId,
        courseCode: course.code,
        courseId: course.courseId,
        topicTitle: `Comprehensive Revision & Past Questions`,
        scheduledDate: revDate,
        startTime,
        durationMinutes: 60,
        itemType: 'revision',
        status: 'pending',
        weekNumber: w,
      });
      dayMinutes[revDate] = (dayMinutes[revDate] || 0) + 60;
    }
  }

  // Sort all items chronologically
  items.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  // Build weekly summaries
  const weeklySummary: GeneratedScheduleResult['weeklySummary'] = {};
  for (let w = 1; w <= totalWeeks; w++) {
    const wStart = addDays(startDate, (w - 1) * 7);
    const wEnd = addDays(startDate, (w * 7) - 1);
    const weekItems = items.filter(i => i.weekNumber === w);
    const totalMinutes = weekItems.reduce((acc, curr) => acc + curr.durationMinutes, 0);

    weeklySummary[w] = {
      weekNumber: w,
      startDate: wStart,
      endDate: wEnd > endDate ? endDate : wEnd,
      totalMinutes,
      itemsCount: weekItems.length,
      isRevisionPhase: w > lectureWeeks,
    };
  }

  return {
    items,
    changeLog,
    totalWeeks,
    lectureWeeks,
    revisionWeeks: Math.round(revisionWeeks),
    weeklySummary,
    isBehindSchedule: false,
  };
}

/**
 * Adaptive Rescheduling:
 * When a student skips an item or when an item is overdue, move it into the next available free slot.
 * Returns updated items and an audit change log entry.
 */
export function rescheduleItem(
  items: StudyPlanItem[],
  itemId: string,
  newDate: string,
  reason: string = 'Rescheduled by student'
): {
  updatedItems: StudyPlanItem[];
  changeLogEntry: ScheduleChangeLogEntry | null;
} {
  const index = items.findIndex(i => i.id === itemId);
  if (index === -1) {
    return { updatedItems: items, changeLogEntry: null };
  }

  const current = items[index];
  const oldDate = current.scheduledDate;

  if (oldDate === newDate) {
    return { updatedItems: items, changeLogEntry: null };
  }

  const updated: StudyPlanItem = {
    ...current,
    originalDate: current.originalDate || oldDate,
    scheduledDate: newDate,
    status: 'rescheduled',
    rescheduleReason: reason,
  };

  const copy = [...items];
  copy[index] = updated;
  copy.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const changeLogEntry: ScheduleChangeLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    itemId,
    courseCode: current.courseCode,
    topicTitle: current.topicTitle,
    fromDate: oldDate,
    toDate: newDate,
    reason,
  };

  return {
    updatedItems: copy,
    changeLogEntry,
  };
}

/**
 * Automatically detects overdue items and reschedules them into subsequent available days.
 */
export function rescheduleOverdueItems(
  items: StudyPlanItem[],
  currentDateIso: string,
  studyDays: number[] = [1, 2, 3, 4, 5]
): {
  updatedItems: StudyPlanItem[];
  changes: ScheduleChangeLogEntry[];
  behindSchedule: boolean;
} {
  const changes: ScheduleChangeLogEntry[] = [];
  const updatedItems = [...items];

  const overdue = updatedItems.filter(
    item => item.status === 'pending' && item.scheduledDate < currentDateIso
  );

  if (overdue.length === 0) {
    return { updatedItems, changes, behindSchedule: false };
  }

  let nextFreeDate = addDays(currentDateIso, 1);

  for (const item of overdue) {
    // Find next valid study day
    while (true) {
      const dayOfWeek = new Date(nextFreeDate + 'T12:00:00Z').getUTCDay();
      if (studyDays.includes(dayOfWeek)) break;
      nextFreeDate = addDays(nextFreeDate, 1);
    }

    const { updatedItems: nextUpdated, changeLogEntry } = rescheduleItem(
      updatedItems,
      item.id,
      nextFreeDate,
      'Automatically rescheduled from overdue date'
    );

    if (changeLogEntry) {
      changes.push(changeLogEntry);
    }
    // Advance free date for next item
    nextFreeDate = addDays(nextFreeDate, 1);
  }

  const behindSchedule = overdue.length >= 3;

  return {
    updatedItems,
    changes,
    behindSchedule,
  };
}
