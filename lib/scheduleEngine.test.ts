import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReadingSchedule,
  rescheduleItem,
  rescheduleOverdueItems,
  SemesterScheduleSettings,
  CourseScheduleConfig
} from './scheduleEngine';

describe('Reading Schedule Engine (Deterministic)', () => {
  const mockSettings: SemesterScheduleSettings = {
    startDate: '2026-09-01',
    endDate: '2026-12-15',
    examStartDate: '2026-11-25',
    studyDays: [1, 2, 3, 4, 5], // Monday - Friday
    hoursPerDay: 3,
    preferredTime: 'evening',
    revisionWeeks: 2.5
  };

  const mockCourses: CourseScheduleConfig[] = [
    {
      courseId: 'c1',
      code: 'CSC 301',
      title: 'Database Systems',
      units: 3,
      difficulty: 4,
      topics: [
        { id: 't1', outlineId: 'o1', courseCode: 'CSC 301', weekNumber: 1, title: 'Relational Algebra' },
        { id: 't2', outlineId: 'o1', courseCode: 'CSC 301', weekNumber: 2, title: 'SQL & Normalization' },
      ],
      assessments: [
        { id: 'a1', courseCode: 'CSC 301', title: 'Midterm Test', type: 'test', dueDate: '2026-10-15', weightPercent: 20 }
      ]
    },
    {
      courseId: 'c2',
      code: 'MTH 311',
      title: 'Linear Algebra',
      units: 4,
      difficulty: 5,
      topics: [
        { id: 't3', outlineId: 'o2', courseCode: 'MTH 311', weekNumber: 1, title: 'Vector Spaces' },
        { id: 't4', outlineId: 'o2', courseCode: 'MTH 311', weekNumber: 2, title: 'Eigenvalues' },
      ],
      assessments: []
    }
  ];

  it('generates read-ahead and review blocks mapped to topic weeks', () => {
    const result = generateReadingSchedule(mockSettings, mockCourses);
    assert.ok(result.items.length > 0);

    const readAheadItems = result.items.filter(i => i.itemType === 'read-ahead');
    const reviewItems = result.items.filter(i => i.itemType === 'review');

    assert.ok(readAheadItems.length >= 4); // 4 topics
    assert.ok(reviewItems.length >= 4);

    // Each topic has a read-ahead block
    const t1ReadAhead = readAheadItems.find(i => i.topicTitle === 'Relational Algebra');
    assert.ok(t1ReadAhead);
    assert.strictEqual(t1ReadAhead?.weekNumber, 1);
  });

  it('schedules practice blocks prior to assessment due dates', () => {
    const result = generateReadingSchedule(mockSettings, mockCourses);
    const practice = result.items.find(i => i.itemType === 'practice');
    assert.ok(practice);
    assert.ok(practice?.topicTitle.includes('Midterm Test'));
    // Scheduled 3 days before test: 2026-10-15 - 3 = 2026-10-12
    assert.strictEqual(practice?.scheduledDate, '2026-10-12');
  });

  it('reschedules skipped item to a new date and records a change log entry', () => {
    const result = generateReadingSchedule(mockSettings, mockCourses);
    const firstItem = result.items[0];

    const { updatedItems, changeLogEntry } = rescheduleItem(
      result.items,
      firstItem.id,
      '2026-09-08',
      'Student skipped block'
    );

    assert.ok(changeLogEntry);
    assert.strictEqual(changeLogEntry?.itemId, firstItem.id);
    assert.strictEqual(changeLogEntry?.toDate, '2026-09-08');
    assert.strictEqual(changeLogEntry?.reason, 'Student skipped block');

    const updated = updatedItems.find(i => i.id === firstItem.id);
    assert.strictEqual(updated?.status, 'rescheduled');
    assert.strictEqual(updated?.scheduledDate, '2026-09-08');
  });

  it('detects overdue items and adaptively reschedules them into subsequent free study days', () => {
    const result = generateReadingSchedule(mockSettings, mockCourses);
    // Mark first 3 items as scheduled in August (overdue relative to 2026-09-05)
    result.items[0].scheduledDate = '2026-09-01';
    result.items[1].scheduledDate = '2026-09-02';
    result.items[2].scheduledDate = '2026-09-03';

    const { updatedItems, changes, behindSchedule } = rescheduleOverdueItems(
      result.items,
      '2026-09-04',
      mockSettings.studyDays
    );

    assert.strictEqual(changes.length, 3);
    assert.strictEqual(behindSchedule, true); // 3 overdue items flagged as behind schedule
    for (const change of changes) {
      assert.ok(change.toDate > '2026-09-04');
    }
  });
});
