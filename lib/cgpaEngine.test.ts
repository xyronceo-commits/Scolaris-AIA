import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRequiredSemesterGpa,
  calculateExamScoreNeeded,
  runCgpaTargetAnalysis,
  CourseInput
} from './cgpaEngine';

describe('CGPA Target Engine - Mathematical Proof & Worked Examples', () => {
  it('accurately calculates worked example 1: prev 3.80 over 60 units + 18 units, target 4.00 needs exactly 4.67', () => {
    // Formula: (4.00 * (60 + 18) - 3.80 * 60) / 18
    // = (312 - 228) / 18 = 84 / 18 = 4.6666... -> 4.67
    const result = calculateRequiredSemesterGpa(3.80, 60, 4.00, 18);
    assert.strictEqual(result.requiredSemesterGpa, 4.67);
    assert.strictEqual(result.isReachable, true);
  });

  it('accurately calculates worked example 2: prev 3.80 over 60 units + 18 units, target 4.20 needs 5.53 (unreachable) with 4.08 max', () => {
    // Formula: (4.20 * 78 - 228) / 18 = 99.6 / 18 = 5.5333... -> 5.53
    // Max reachable: (3.80 * 60 + 5.00 * 18) / 78 = (228 + 90) / 78 = 318 / 78 = 4.0769... -> 4.08
    const result = calculateRequiredSemesterGpa(3.80, 60, 4.20, 18);
    assert.strictEqual(result.requiredSemesterGpa, 5.53);
    assert.strictEqual(result.isReachable, false);
    assert.strictEqual(result.maxReachableCgpa, 4.08);
  });

  it('calculates exam score needed given continuous assessment score so far', () => {
    // Grade A threshold = 70. CA score = 25 / 30. Exam weight = 70.
    // Points needed = 70 - 25 = 45 out of 70 = 64.285... -> 64.3%
    const res = calculateExamScoreNeeded(70, 25, 30, 70);
    assert.strictEqual(res.neededPercent, 64.3);
    assert.strictEqual(res.status, 'achievable');
  });

  it('flags impossible when CA is too low to reach target grade', () => {
    // Grade A threshold = 70. CA score = 5 / 40. Exam weight = 60.
    // Points needed = 70 - 5 = 65 out of 60 = 108.3% -> Impossible!
    const res = calculateExamScoreNeeded(70, 5, 40, 60);
    assert.ok(res.neededPercent > 100);
    assert.strictEqual(res.status, 'impossible');
  });

  it('flags secured when CA score already exceeds the grade threshold', () => {
    // Grade C threshold = 50. CA score = 52 / 60. Exam weight = 40.
    const res = calculateExamScoreNeeded(50, 52, 60, 40);
    assert.strictEqual(res.neededPercent, 0);
    assert.strictEqual(res.status, 'secured');
  });

  it('handles edge cases: pass/fail courses, 0 units, and carryovers', () => {
    const courses: CourseInput[] = [
      { id: 'c1', code: 'CSC 301', units: 3, difficulty: 4, caScore: 24, caMax: 30, examWeight: 70 },
      { id: 'c2', code: 'CSC 303', units: 3, difficulty: 2, caScore: 28, caMax: 30, examWeight: 70 },
      { id: 'c3', code: 'GST 311', units: 0, isPassFail: true, caScore: 80, caMax: 100 },
    ];

    const analysis = runCgpaTargetAnalysis(3.5, 50, 3.8, courses);
    assert.strictEqual(analysis.semesterUnits, 6); // GST 311 (0 units) excluded
    assert.strictEqual(analysis.scenarios.balanced.targets.length, 3);

    const passFailCourse = analysis.scenarios.balanced.targets.find(t => t.code === 'GST 311');
    assert.strictEqual(passFailCourse?.targetGrade, 'PASS');
    assert.strictEqual(passFailCourse?.status, 'secured');
  });
});
