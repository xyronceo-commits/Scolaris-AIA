import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSemesterGpaNeeded,
  calculateExamMarkNeeded,
  suggestRealisticGradeSpread
} from './aimHigherMath';

describe('Aim Higher Panel - Deterministic Formula Tests', () => {
  it('hand-worked example 1: target requires 4.67 semester GPA', () => {
    // Current CGPA = 3.80, earned units = 60, target CGPA = 4.00, semester units = 18.
    // Earned points = 3.80 * 60 = 228
    // Total units = 60 + 18 = 78
    // Target points = 4.00 * 78 = 312
    // Semester GPA needed = (312 - 228) / 18 = 84 / 18 = 4.6666... -> 4.67
    const result = calculateSemesterGpaNeeded(3.80, 60, 4.00, 18);
    assert.strictEqual(result.neededGpa, 4.67);
    assert.strictEqual(result.isReachable, true);
    assert.strictEqual(result.alreadyReached, false);
  });

  it('handles target already reached', () => {
    // Current CGPA = 4.20, earned units = 60, target CGPA = 4.00, semester units = 18.
    // Target is lower than or equal to current CGPA
    const result = calculateSemesterGpaNeeded(4.20, 60, 4.00, 18);
    assert.strictEqual(result.alreadyReached, true);
    assert.strictEqual(result.isReachable, true);
  });

  it('handles impossible target (requires > 5.00) and displays maximum reachable CGPA', () => {
    // Current CGPA = 3.80, earned units = 60, target CGPA = 4.20, semester units = 18.
    // Target points = 4.20 * 78 = 327.6
    // Semester GPA needed = (327.6 - 228) / 18 = 99.6 / 18 = 5.5333... -> 5.53 (Impossible!)
    // Max reachable CGPA with straight A's (5.00 GPA):
    // (228 + 5.00 * 18) / 78 = (228 + 90) / 78 = 318 / 78 = 4.0769... -> 4.08
    const result = calculateSemesterGpaNeeded(3.80, 60, 4.20, 18);
    assert.strictEqual(result.neededGpa, 5.53);
    assert.strictEqual(result.isReachable, false);
    assert.strictEqual(result.maxReachableCgpa, 4.08);
  });

  it('handles mixed credit units accurately', () => {
    // Mixed units: 1-unit lab, 2-unit seminar, 3-unit core, 4-unit math = 10 units total.
    // Current CGPA = 3.50 over 30 units (105 points). Target = 3.75 over 40 units (150 points).
    // Semester GPA needed = (150 - 105) / 10 = 45 / 10 = 4.50
    const result = calculateSemesterGpaNeeded(3.50, 30, 3.75, 10);
    assert.strictEqual(result.neededGpa, 4.50);
    assert.strictEqual(result.isReachable, true);
  });

  it('calculates exam mark needed given CA score and exam weight', () => {
    // Grade B threshold = 60. CA score = 22 out of 30. Exam weight = 70.
    // Marks needed from exam = 60 - 22 = 38 out of 70
    const res = calculateExamMarkNeeded(60, 22, 70);
    assert.strictEqual(res.neededMarksOutOfWeight, 38);
    assert.strictEqual(res.status, 'Needed');
    assert.strictEqual(res.summaryText, 'Score at least 38 out of 70');
  });

  it('marks unreachable when exam mark needed exceeds exam weight', () => {
    // Grade A threshold = 70. CA score = 5 out of 30. Exam weight = 60.
    // Needed from exam = 70 - 5 = 65 out of 60 -> Not reachable!
    const res = calculateExamMarkNeeded(70, 5, 60);
    assert.strictEqual(res.status, 'Not reachable');
  });

  it('marks secured when CA score already meets or exceeds grade threshold', () => {
    // Grade C threshold = 50. CA score = 52 out of 60. Exam weight = 40.
    const res = calculateExamMarkNeeded(50, 52, 40);
    assert.strictEqual(res.status, 'Secured');
    assert.strictEqual(res.neededMarksOutOfWeight, 0);
  });

  it('suggests realistic spread raising easier courses first', () => {
    const courses = [
      { id: 'c1', code: 'CSC 301', title: 'Data Structures', units: 3, difficulty: 'Hard', caScore: 20 },
      { id: 'c2', code: 'GST 301', title: 'Philosophy & Logic', units: 2, difficulty: 'Easy', caScore: 25 },
    ];
    // Semester GPA needed = 4.2
    const spread = suggestRealisticGradeSpread(courses, 4.2);
    assert.strictEqual(spread.length, 2);

    const easyCourse = spread.find(c => c.code === 'GST 301');
    const hardCourse = spread.find(c => c.code === 'CSC 301');

    // Easier course should be raised to A (5 points) first
    assert.strictEqual(easyCourse?.targetGrade, 'A');
    assert.ok(hardCourse?.targetGrade === 'A' || hardCourse?.targetGrade === 'B');
  });
});
