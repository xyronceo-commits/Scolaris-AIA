// ============================================================================
// KorsIQ CGPA Target Engine (Deterministic Mathematical Model)
// ============================================================================
// Formulas:
// required_semester_GPA = (target * (prev_units + sem_units) - prev_CGPA * prev_units) / sem_units
// exam_needed = (grade_threshold - CA_score) / (exam_weight / 100)
//
// NOTE: All outputs represent mathematical targets, NEVER predictions or guarantees.
// ============================================================================

export interface GradeScaleBand {
  min: number;
  max: number;
  points: number;
}

export type GradingScale = Record<string, GradeScaleBand>;

export const DEFAULT_GRADING_SCALE: GradingScale = {
  A: { min: 70, max: 100, points: 5 },
  B: { min: 60, max: 69, points: 4 },
  C: { min: 50, max: 59, points: 3 },
  D: { min: 45, max: 49, points: 2 },
  E: { min: 40, max: 44, points: 1 },
  F: { min: 0, max: 39, points: 0 },
};

export interface CourseInput {
  id: string;
  code: string;
  title?: string;
  units: number;
  difficulty?: number; // 1 (easy) to 5 (very hard), default 3
  caScore?: number;    // Continuous Assessment score obtained so far (e.g. 24 out of 30)
  caMax?: number;      // Maximum CA score (default 30 or 40)
  examWeight?: number; // Weight of exam in final score percent (default 70 or 60)
  isPassFail?: boolean; // 0-unit or pass/fail course, not counted in GPA
  isRetake?: boolean;   // Carryover / retake
  previousPoints?: number; // If retake replaces old grade
}

export interface CourseGradeTarget {
  courseId: string;
  code: string;
  title: string;
  units: number;
  difficulty: number;
  targetGrade: string;
  targetPoints: number;
  gradeThreshold: number;
  caScore: number;
  caMax: number;
  examWeight: number;
  examScoreNeededPercent: number; // e.g. 64.3%
  status: 'secured' | 'achievable' | 'stretch' | 'impossible' | 'no-ca';
  statusMessage: string;
}

export interface ScenarioPlan {
  name: 'Safe minimum' | 'Balanced' | 'Stretch';
  description: string;
  projectedSemesterGpa: number;
  projectedCgpa: number;
  targets: CourseGradeTarget[];
}

export interface CgpaAnalysisResult {
  currentCgpa: number;
  creditsEarned: number;
  targetCgpa: number;
  semesterUnits: number;
  totalCumulativeUnits: number;
  requiredSemesterGpa: number;
  isReachable: boolean;
  maxReachableSemesterGpa: number;
  maxReachableCgpa: number;
  minReachableCgpa: number; // with all F's
  guidanceMessage: string;
  scenarios: {
    safe: ScenarioPlan;
    balanced: ScenarioPlan;
    stretch: ScenarioPlan;
  };
  gradingScale: GradingScale;
}

/**
 * Calculates required semester GPA and reachable boundaries.
 * Exact formula:
 * required_semester_GPA = (target * (prev_units + sem_units) - prev_CGPA * prev_units) / sem_units
 */
export function calculateRequiredSemesterGpa(
  prevCgpa: number,
  prevUnits: number,
  targetCgpa: number,
  semesterUnits: number
): {
  requiredSemesterGpa: number;
  isReachable: boolean;
  maxReachableCgpa: number;
  maxPoints: number;
} {
  const safePrevUnits = Math.max(0, prevUnits);
  const safeSemUnits = Math.max(1, semesterUnits);
  const totalUnits = safePrevUnits + safeSemUnits;
  const maxGradePoints = 5.0; // on standard 5.0 scale

  if (safeSemUnits <= 0) {
    return {
      requiredSemesterGpa: prevCgpa,
      isReachable: targetCgpa <= prevCgpa,
      maxReachableCgpa: prevCgpa,
      maxPoints: maxGradePoints,
    };
  }

  // Exact float math
  const numerator = (targetCgpa * totalUnits) - (prevCgpa * safePrevUnits);
  const requiredGpa = Math.round((numerator / safeSemUnits) * 100) / 100;

  // Maximum reachable cumulative CGPA assuming 5.00 this semester (all A's)
  const maxPossibleNumerator = (prevCgpa * safePrevUnits) + (maxGradePoints * safeSemUnits);
  const maxReachableCgpa = Math.round((maxPossibleNumerator / totalUnits) * 100) / 100;

  const isReachable = requiredGpa <= maxGradePoints && requiredGpa >= 0.0;

  return {
    requiredSemesterGpa: requiredGpa,
    isReachable,
    maxReachableCgpa,
    maxPoints: maxGradePoints,
  };
}

/**
 * Calculates exam percentage score needed to achieve a target grade given current CA.
 * exam_needed = (grade_threshold - CA_score) / (exam_weight / 100)
 */
export function calculateExamScoreNeeded(
  gradeThreshold: number,
  caScore: number,
  caMax: number,
  examWeightPercent: number
): {
  neededPercent: number;
  status: 'secured' | 'achievable' | 'stretch' | 'impossible' | 'no-ca';
  message: string;
} {
  const safeWeight = examWeightPercent > 0 ? examWeightPercent : 70;
  const safeCaMax = caMax > 0 ? caMax : (100 - safeWeight);
  const hasCa = typeof caScore === 'number' && !isNaN(caScore);

  if (!hasCa) {
    // No CA entered yet: assumes student needs standard percentage of the whole course
    const rawExamNeeded = (gradeThreshold / 100) * 100;
    return {
      neededPercent: Math.round(rawExamNeeded * 10) / 10,
      status: 'no-ca',
      message: 'No CA score entered yet',
    };
  }

  const pointsNeeded = gradeThreshold - caScore;

  if (pointsNeeded <= 0) {
    return {
      neededPercent: 0,
      status: 'secured',
      message: 'Target grade already secured by CA score!',
    };
  }

  // Points available from exam
  const examMaxPoints = safeWeight;
  const neededFraction = pointsNeeded / examMaxPoints;
  const neededPercent = Math.round(neededFraction * 1000) / 10;

  if (neededPercent > 100.0) {
    return {
      neededPercent,
      status: 'impossible',
      message: `Mathematically unreachable (requires ${neededPercent}% in exam)`,
    };
  }

  if (neededPercent >= 80.0) {
    return {
      neededPercent,
      status: 'stretch',
      message: `Challenging target (needs ${neededPercent}% in exam)`,
    };
  }

  return {
    neededPercent,
    status: 'achievable',
    message: `Needs ${neededPercent}% in exam`,
  };
}

/**
 * Generates per-course grade target scenarios:
 * 1. Safe Minimum: Meets the target GPA with lowest overall difficulty risk.
 * 2. Balanced: Weights high-unit courses more and uses difficulty ratings to assign higher grades where most attainable.
 * 3. Stretch: Aspirational targets giving buffer above target GPA.
 */
export function generateCourseTargets(
  courses: CourseInput[],
  targetGpa: number,
  scale: GradingScale = DEFAULT_GRADING_SCALE
): {
  safe: ScenarioPlan;
  balanced: ScenarioPlan;
  stretch: ScenarioPlan;
} {
  const gradableCourses = courses.filter((c) => !c.isPassFail && c.units > 0);
  const totalGradableUnits = gradableCourses.reduce((sum, c) => sum + c.units, 0);

  if (gradableCourses.length === 0 || totalGradableUnits === 0) {
    const emptyScenario: ScenarioPlan = {
      name: 'Balanced',
      description: 'No credit-bearing courses entered.',
      projectedSemesterGpa: 0,
      projectedCgpa: 0,
      targets: [],
    };
    return {
      safe: { ...emptyScenario, name: 'Safe minimum' },
      balanced: { ...emptyScenario, name: 'Balanced' },
      stretch: { ...emptyScenario, name: 'Stretch' },
    };
  }

  // Sorted list of grade bands by points descending: [A(5), B(4), C(3), D(2), E(1), F(0)]
  const bands = Object.entries(scale)
    .map(([grade, band]) => ({ grade, ...band }))
    .sort((a, b) => b.points - a.points);

  // Helper to resolve grade band by points
  function getBandByPoints(pts: number) {
    const clamped = Math.max(0, Math.min(5, Math.round(pts)));
    return bands.find((b) => b.points === clamped) || bands[0];
  }

  // Function to build scenario course targets
  function buildScenario(
    name: 'Safe minimum' | 'Balanced' | 'Stretch',
    description: string,
    targetEffectiveGpa: number,
    strategy: 'safe' | 'balanced' | 'stretch'
  ): ScenarioPlan {
    const effectiveTargetGpa = Math.max(0, Math.min(5.0, targetEffectiveGpa));

    // Sort courses:
    // Balanced & Stretch: Higher units first, then lower difficulty first (easier high-unit courses get prioritized for A's)
    const sorted = [...gradableCourses].sort((a, b) => {
      if (strategy === 'safe') {
        // Safe: prioritize easier courses first to lock in points
        return (a.difficulty || 3) - (b.difficulty || 3);
      }
      const weightA = a.units / (a.difficulty || 3);
      const weightB = b.units / (b.difficulty || 3);
      return weightB - weightA;
    });

    const assignedPoints: Record<string, number> = {};

    // Initial assignment: base on rounded effectiveTargetGpa
    let targetTotalQualityPoints = effectiveTargetGpa * totalGradableUnits;

    // Iterative distribution to match target quality points
    for (const c of sorted) {
      assignedPoints[c.id] = Math.min(5, Math.max(1, Math.round(effectiveTargetGpa)));
    }

    // Fine-tune assignment to closely hit targetTotalQualityPoints
    let currentTotalPoints = sorted.reduce((sum, c) => sum + assignedPoints[c.id] * c.units, 0);

    if (currentTotalPoints < targetTotalQualityPoints) {
      // Need higher grades: upgrade highest weight courses first
      for (const c of sorted) {
        while (assignedPoints[c.id] < 5 && currentTotalPoints < targetTotalQualityPoints) {
          assignedPoints[c.id] += 1;
          currentTotalPoints += c.units;
        }
      }
    } else if (currentTotalPoints > targetTotalQualityPoints && strategy === 'safe') {
      // For safe minimum, lower grades on harder courses if we exceeded target
      const reversed = [...sorted].reverse();
      for (const c of reversed) {
        while (assignedPoints[c.id] > 2 && (currentTotalPoints - c.units) >= targetTotalQualityPoints - 0.5) {
          assignedPoints[c.id] -= 1;
          currentTotalPoints -= c.units;
        }
      }
    }

    const calculatedGpa = Math.round((currentTotalPoints / totalGradableUnits) * 100) / 100;

    const targets: CourseGradeTarget[] = courses.map((course) => {
      if (course.isPassFail || course.units === 0) {
        return {
          courseId: course.id,
          code: course.code,
          title: course.title || course.code,
          units: 0,
          difficulty: course.difficulty || 3,
          targetGrade: 'PASS',
          targetPoints: 0,
          gradeThreshold: 50,
          caScore: course.caScore ?? 0,
          caMax: course.caMax ?? 30,
          examWeight: course.examWeight ?? 70,
          examScoreNeededPercent: 0,
          status: 'secured',
          statusMessage: 'Pass/Fail course (excluded from GPA calculation)',
        };
      }

      const assignedPts = assignedPoints[course.id] ?? Math.round(effectiveTargetGpa);
      const band = getBandByPoints(assignedPts);
      const caMax = course.caMax ?? 30;
      const examWeight = course.examWeight ?? 70;
      const caScore = course.caScore ?? 0;

      const examEval = calculateExamScoreNeeded(band.min, caScore, caMax, examWeight);

      return {
        courseId: course.id,
        code: course.code,
        title: course.title || course.code,
        units: course.units,
        difficulty: course.difficulty || 3,
        targetGrade: band.grade,
        targetPoints: band.points,
        gradeThreshold: band.min,
        caScore,
        caMax,
        examWeight,
        examScoreNeededPercent: examEval.neededPercent,
        status: examEval.status,
        statusMessage: examEval.message,
      };
    });

    return {
      name,
      description,
      projectedSemesterGpa: calculatedGpa,
      projectedCgpa: 0, // Filled in main engine
      targets,
    };
  }

  return {
    safe: buildScenario(
      'Safe minimum',
      'Calculates the minimum grade distribution necessary to achieve your semester GPA target.',
      targetGpa,
      'safe'
    ),
    balanced: buildScenario(
      'Balanced',
      'Distributes grades by factoring course credit units and difficulty rating for realistic workload balance.',
      targetGpa,
      'balanced'
    ),
    stretch: buildScenario(
      'Stretch',
      'Ambitious target distribution providing a safety margin above your minimum requirement.',
      Math.min(5.0, targetGpa + 0.35),
      'stretch'
    ),
  };
}

/**
 * Main Deterministic CGPA Engine Entry Point.
 */
export function runCgpaTargetAnalysis(
  currentCgpa: number,
  creditsEarned: number,
  targetCgpa: number,
  courses: CourseInput[],
  scale: GradingScale = DEFAULT_GRADING_SCALE
): CgpaAnalysisResult {
  const gradableCourses = courses.filter((c) => !c.isPassFail && c.units > 0);
  const semesterUnits = gradableCourses.reduce((sum, c) => sum + c.units, 0);
  const totalUnits = creditsEarned + semesterUnits;

  const {
    requiredSemesterGpa,
    isReachable,
    maxReachableCgpa,
  } = calculateRequiredSemesterGpa(currentCgpa, creditsEarned, targetCgpa, semesterUnits);

  const minReachableCgpa = totalUnits > 0
    ? Math.round(((currentCgpa * creditsEarned) / totalUnits) * 100) / 100
    : currentCgpa;

  // If unreachable, base target scenarios on the maximum reachable semester GPA (5.00)
  const scenarioBaseGpa = isReachable ? requiredSemesterGpa : 5.0;

  const rawScenarios = generateCourseTargets(courses, scenarioBaseGpa, scale);

  // Compute projected cumulative CGPA for each scenario
  function projectCgpa(semGpa: number): number {
    if (totalUnits <= 0) return currentCgpa;
    const numerator = (currentCgpa * creditsEarned) + (semGpa * semesterUnits);
    return Math.round((numerator / totalUnits) * 100) / 100;
  }

  const scenarios = {
    safe: {
      ...rawScenarios.safe,
      projectedCgpa: projectCgpa(rawScenarios.safe.projectedSemesterGpa),
    },
    balanced: {
      ...rawScenarios.balanced,
      projectedCgpa: projectCgpa(rawScenarios.balanced.projectedSemesterGpa),
    },
    stretch: {
      ...rawScenarios.stretch,
      projectedCgpa: projectCgpa(rawScenarios.stretch.projectedSemesterGpa),
    },
  };

  let guidanceMessage = '';
  if (!isReachable) {
    guidanceMessage = `Target CGPA of ${targetCgpa.toFixed(2)} requires a semester GPA of ${requiredSemesterGpa.toFixed(2)}, which exceeds the maximum possible 5.00. The highest reachable CGPA this semester with straight A's is ${maxReachableCgpa.toFixed(2)}. Targets below reflect the best plan toward this maximum.`;
  } else if (requiredSemesterGpa >= 4.5) {
    guidanceMessage = `Target CGPA requires an ambitious semester GPA of ${requiredSemesterGpa.toFixed(2)}. Focus study hours heavily on high-unit courses to secure A grades.`;
  } else if (requiredSemesterGpa >= 3.5) {
    guidanceMessage = `Target CGPA requires a solid semester GPA of ${requiredSemesterGpa.toFixed(2)}. A balanced mix of A and B grades across your courses will achieve this target.`;
  } else {
    guidanceMessage = `Target CGPA requires a semester GPA of ${requiredSemesterGpa.toFixed(2)}. Maintaining consistent performance across all courses will secure your goal.`;
  }

  return {
    currentCgpa,
    creditsEarned,
    targetCgpa,
    semesterUnits,
    totalCumulativeUnits: totalUnits,
    requiredSemesterGpa,
    isReachable,
    maxReachableSemesterGpa: 5.0,
    maxReachableCgpa,
    minReachableCgpa,
    guidanceMessage,
    scenarios,
    gradingScale: scale,
  };
}
