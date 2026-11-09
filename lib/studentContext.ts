/**
 * KorsIQ Student Academic Context Engine
 * Builds discipline-tailored, level-appropriate, anti-hallucination guidance
 * injected into all KorsIQ AI system instructions.
 */

export interface StudentProfileContext {
  department?: string;
  major?: string;
  level?: string;
  university?: string;
  name?: string;
}

export interface StudentCourseContext {
  id?: string;
  code: string;
  title: string;
  units?: number;
}

/**
 * Generates tailored discipline-specific guidance based on student major
 */
function getDisciplineGuidance(department: string): string {
  const deptLower = department.toLowerCase();

  if (deptLower.includes('building') || deptLower.includes('architecture') || deptLower.includes('civil') || deptLower.includes('construction') || deptLower.includes('survey')) {
    return `DISCIPLINE FOCUS (Built Environment & Engineering):
- Ground all analogies, examples, and discussions in structural mechanics, building materials science, construction site methodology, architectural drawing, quantity surveying, and structural safety codes (e.g., Eurocodes, BS standards, National Building Codes).
- Emphasize empirical load calculations, material tolerances, geotechnical considerations, and project management.`;
  }

  if (deptLower.includes('law') || deptLower.includes('jurisprudence') || deptLower.includes('legal')) {
    return `DISCIPLINE FOCUS (Law & Jurisprudence):
- Ground all analogies, examples, and analyses in statutory provisions, judicial precedents, legal doctrine, ratio decidendi, and constitutional frameworks.
- Use precise legal terminology (e.g., prima facie, locus standi, burden of proof, obiter dictum, statutory interpretation).`;
  }

  if (deptLower.includes('computer') || deptLower.includes('software') || deptLower.includes('information tech') || deptLower.includes('data science') || deptLower.includes('cyber')) {
    return `DISCIPLINE FOCUS (Computing & Software Engineering):
- Ground all analogies, examples, and problem-solving in computational complexity (Big-O), data structures, algorithms, distributed systems, software design patterns, and clean architecture.
- Provide clean pseudocode or code examples when relevant, focusing on correctness, efficiency, and real-world system reliability.`;
  }

  if (deptLower.includes('medicine') || deptLower.includes('nurs') || deptLower.includes('pharm') || deptLower.includes('health') || deptLower.includes('biomed') || deptLower.includes('physiology')) {
    return `DISCIPLINE FOCUS (Medical & Health Sciences):
- Ground all explanations in pathophysiology, human anatomy, cellular mechanisms, clinical pharmacology, evidence-based clinical guidelines, and patient safety ethics.
- Maintain clinical precision and diagnostic rigour in terminology.`;
  }

  if (deptLower.includes('econ') || deptLower.includes('account') || deptLower.includes('finance') || deptLower.includes('business') || deptLower.includes('bank') || deptLower.includes('market')) {
    return `DISCIPLINE FOCUS (Economics, Finance & Business):
- Ground discussions in macroeconomic/microeconomic theory, financial modeling, balance sheet mechanics, capital markets, corporate strategy, and fiscal/monetary policies.
- Use concrete financial metrics, risk/return tradeoffs, and empirical economic case studies.`;
  }

  // Default collegiate academic guidance
  return `DISCIPLINE FOCUS (${department}):
- Use standard peer-reviewed scholarly terminology, methodological frameworks, and foundational theories of ${department}.
- Illustrate abstract concepts with practical, field-specific case studies.`;
}

/**
 * Builds the comprehensive student context prompt block for injection into system instructions
 */
export function buildStudentContext(
  profile?: StudentProfileContext | null,
  courses?: StudentCourseContext[] | null
): string {
  const department = (profile?.department || profile?.major || '').trim();
  const level = (profile?.level || 'Undergraduate').trim();
  const university = (profile?.university || '').trim();
  const enrolledCourses = Array.isArray(courses) ? courses : [];

  let courseListStr = 'No specific courses currently registered.';
  if (enrolledCourses.length > 0) {
    courseListStr = enrolledCourses
      .map(c => `- ${c.code}: ${c.title}${c.units ? ` (${c.units} Units)` : ''}`)
      .join('\n');
  }

  const disciplineBlock = department 
    ? getDisciplineGuidance(department)
    : `DISCIPLINE FOCUS:
- General University Academic Standard. Maintain rigorous collegiate reasoning, step-by-step logic, and scholarly precision.`;

  return `================================================================================
KORSIQ STUDENT ACADEMIC PROFILE & TAILORING CONTEXT
================================================================================
- Target Discipline / Department: ${department || 'General University Academic Studies'}
- Academic Level / Year: ${level}
- University / Institution: ${university || 'Collegiate / University Level'}
- Current Registered Semester Courses:
${courseListStr}

${disciplineBlock}

STRICT ACADEMIC INTEGRITY & ANTI-HALLUCINATION RULES:
1. DISCIPLINARY GROUNDING: Always default your examples, analogies, case studies, and terminology to the student's field (${department || 'their academic curriculum'}).
2. ACADEMIC DEPTH & LEVEL: Calibrate explanations, problem difficulty, and vocabulary to the student's level (${level}).
3. SOURCE OF TRUTH: Ground explanations primarily in the student's uploaded course documents and curriculum outline whenever available.
4. ABSOLUTE TRUTHFULNESS (ZERO FABRICATION):
   - NEVER invent or fabricate citations, authors, book titles, page numbers, case names, or statistical data.
   - If a specific citation, institutional guideline, or past exam question is not in the source text or well-established public record, explicitly state what is verifiable rather than guessing.
5. ACADEMIC BREADTH WITHOUT REFUSAL: If the student asks about a subject outside their primary discipline, explain it thoroughly and accurately while relating insights back to their field where beneficial.
================================================================================`;
}
