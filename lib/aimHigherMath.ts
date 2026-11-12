// ============================================================================
// KorsIQ Aim Higher Panel — Pure Deterministic Math (No AI, Zero Credits)
// ============================================================================
// Formula:
// Semester GPA needed = (target * (earned units + semester units) - earned points) / semester units
// Exam mark needed = grade_threshold - CA_score (out of exam_weight, default 70)
// ============================================================================

export interface GradeScaleBand {
  min: number;
  points: number;
}

export const DEFAULT_GRADE_SCALE: Record<string, GradeScaleBand> = {
  A: { min: 70, points: 5 },
  B: { min: 60, points: 4 },
  C: { min: 50, points: 3 },
  D: { min: 45, points: 2 },
  E: { min: 40, points: 1 },
  F: { min: 0, points: 0 },
};

export interface SemesterGpaResult {
  neededGpa: number;
  isReachable: boolean;
  alreadyReached: boolean;
  maxReachableGpa: number;
  maxReachableCgpa: number;
  earnedPoints: number;
  totalUnits: number;
}

/**
 * Calculates the exact semester GPA needed to reach a target cumulative CGPA.
 * Formula: (target * (earned units + semester units) - earned points) / semester units
 */
export function calculateSemesterGpaNeeded(
  currentCgpa: number,
  earnedUnits: number,
  targetCgpa: number,
  semesterUnits: number,
  maxGpaScale: number = 5.0
): SemesterGpaResult {
  const safeEarnedUnits = Math.max(0, earnedUnits);
  const safeSemUnits = Math.max(1, semesterUnits);
  const totalUnits = safeEarnedUnits + safeSemUnits;
  const earnedPoints = currentCgpa * safeEarnedUnits;

  // Max possible cumulative CGPA if student earns straight A's (maxGpaScale) this semester
  const maxPossiblePoints = earnedPoints + (maxGpaScale * safeSemUnits);
  const maxReachableCgpa = Math.round((maxPossiblePoints / totalUnits) * 100) / 100;

  if (targetCgpa <= currentCgpa) {
    return {
      neededGpa: currentCgpa,
      isReachable: true,
      alreadyReached: true,
      maxReachableGpa: maxGpaScale,
      maxReachableCgpa,
      earnedPoints,
      totalUnits
    };
  }

  const rawNeeded = (targetCgpa * totalUnits - earnedPoints) / safeSemUnits;
  const neededGpa = Math.round(rawNeeded * 100) / 100;
  const isReachable = neededGpa <= maxGpaScale && neededGpa >= 0;

  return {
    neededGpa,
    isReachable,
    alreadyReached: false,
    maxReachableGpa: maxGpaScale,
    maxReachableCgpa,
    earnedPoints,
    totalUnits
  };
}

export interface ExamMarkNeededResult {
  neededMarksOutOfWeight: number; // e.g. 42 out of 70
  neededPercent: number;          // e.g. 60.0%
  status: 'Secured' | 'Needed' | 'Stretch' | 'Not reachable';
  summaryText: string;
}

/**
 * Calculates exam mark needed to achieve a target grade given CA score so far.
 * Default split: CA 30 / Exam 70.
 */
export function calculateExamMarkNeeded(
  gradeThreshold: number,
  caScore: number = 0,
  examWeight: number = 70
): ExamMarkNeededResult {
  const safeWeight = examWeight > 0 ? examWeight : 70;
  const safeCa = Math.max(0, caScore);
  const neededMarks = gradeThreshold - safeCa;

  if (neededMarks <= 0) {
    return {
      neededMarksOutOfWeight: 0,
      neededPercent: 0,
      status: 'Secured',
      summaryText: 'Already secured by continuous assessment'
    };
  }

  const roundedMarks = Math.round(neededMarks * 10) / 10;
  const neededPercent = Math.round((neededMarks / safeWeight) * 1000) / 10;

  if (neededMarks > safeWeight) {
    return {
      neededMarksOutOfWeight: roundedMarks,
      neededPercent,
      status: 'Not reachable',
      summaryText: `Not reachable (needs ${roundedMarks} out of ${safeWeight})`
    };
  }

  if (neededPercent >= 80) {
    return {
      neededMarksOutOfWeight: roundedMarks,
      neededPercent,
      status: 'Stretch',
      summaryText: `Score at least ${roundedMarks} out of ${safeWeight} (Stretch)`
    };
  }

  return {
    neededMarksOutOfWeight: roundedMarks,
    neededPercent,
    status: 'Needed',
    summaryText: `Score at least ${roundedMarks} out of ${safeWeight}`
  };
}

export interface CourseAimInput {
  id: string;
  code: string;
  title: string;
  units: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard' | string;
  caScore?: number;
  examWeight?: number;
}

export interface CourseAimResult {
  courseId: string;
  code: string;
  title: string;
  units: number;
  difficulty: string;
  targetGrade: string;
  gradePoints: number;
  gradeThreshold: number;
  caScore: number;
  examWeight: number;
  examMarkNeeded: number;
  status: 'Secured' | 'Needed' | 'Stretch' | 'Not reachable';
  label: string;
}

/**
 * Suggests a realistic spread: starts every course at the lowest grade that still meets
 * the needed semester GPA and raises easier courses first.
 */
export function suggestRealisticGradeSpread(
  courses: CourseAimInput[],
  neededSemesterGpa: number,
  scale: Record<string, GradeScaleBand> = DEFAULT_GRADE_SCALE
): CourseAimResult[] {
  const validCourses = courses.filter(c => c.units > 0);
  const totalUnits = validCourses.reduce((sum, c) => sum + c.units, 0);

  if (validCourses.length === 0 || totalUnits === 0) {
    return [];
  }

  const effectiveTargetGpa = Math.max(0, Math.min(5.0, neededSemesterGpa));
  const targetQualityPoints = effectiveTargetGpa * totalUnits;

  // Grade bands ordered from A to F
  const bands = Object.entries(scale)
    .map(([grade, info]) => ({ grade, ...info }))
    .sort((a, b) => b.points - a.points);

  // Difficulty numeric value: Easy (1) -> Medium (2) -> Hard (3)
  function getDiffScore(d?: string): number {
    const raw = String(d || '').toLowerCase();
    if (raw === 'easy') return 1;
    if (raw === 'hard') return 3;
    return 2;
  }

  // Sort courses: easiest courses first to raise their grades first
  const sorted = [...validCourses].sort((a, b) => {
    const diffDiff = getDiffScore(a.difficulty) - getDiffScore(b.difficulty);
    if (diffDiff !== 0) return diffDiff;
    return b.units - a.units; // Higher units secondary
  });

  // Start all courses at a baseline grade based on effectiveTargetGpa floor
  const baselinePoints = Math.max(1, Math.min(4, Math.floor(effectiveTargetGpa)));
  const assigned: Record<string, number> = {};
  for (const c of sorted) {
    assigned[c.id] = baselinePoints;
  }

  // Iteratively raise easier courses first until total quality points meet or exceed target
  let currentPoints = sorted.reduce((sum, c) => sum + assigned[c.id] * c.units, 0);

  for (const c of sorted) {
    while (assigned[c.id] < 5 && currentPoints < targetQualityPoints) {
      assigned[c.id] += 1;
      currentPoints += c.units;
    }
  }

  return validCourses.map(c => {
    const pts = assigned[c.id] ?? Math.round(effectiveTargetGpa);
    const band = bands.find(b => b.points === pts) || bands[0];
    const caScore = typeof c.caScore === 'number' ? c.caScore : 0;
    const examWeight = typeof c.examWeight === 'number' ? c.examWeight : 70;

    const examCalc = calculateExamMarkNeeded(band.min, caScore, examWeight);

    let status = examCalc.status;
    let label = `Score at least ${examCalc.neededMarksOutOfWeight} out of ${examWeight} for ${band.grade}`;

    if (examCalc.status === 'Secured') {
      label = `${band.grade} already secured by continuous assessment`;
    } else if (examCalc.status === 'Not reachable') {
      label = `Not reachable, aim for the best grade you can`;
    } else if (examCalc.status === 'Stretch') {
      label = `Score at least ${examCalc.neededMarksOutOfWeight} out of ${examWeight} for ${band.grade} (Stretch)`;
    }

    return {
      courseId: c.id,
      code: c.code,
      title: c.title,
      units: c.units,
      difficulty: c.difficulty || 'Medium',
      targetGrade: band.grade,
      gradePoints: band.points,
      gradeThreshold: band.min,
      caScore,
      examWeight,
      examMarkNeeded: examCalc.neededMarksOutOfWeight,
      status,
      label
    };
  });
}
