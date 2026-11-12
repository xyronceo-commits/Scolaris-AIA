// ============================================================================
// KorsIQ AI Credits — Single Source of Truth for Allowances & Per-Action Costs
// ============================================================================
// Rule: Chatbot, Academic Adviser, Study Planner, and Timetable are NOT metered
// (they only have fair-use rate limits).
// Credits apply ONLY to Study Hub generation tools and Academic Studio tools.

export const AI_CREDIT_ALLOWANCES = {
  free: 20,
  plus: 150,
  studio: 200,
} as const;

export const AI_CREDIT_COSTS = {
  // Study Hub tools
  summary: 1,
  flashcards: 2,
  quiz: 2,
  test: 2,
  podcast: 6,
  // Academic Studio tools
  studio_plan: 2,
  studio_section: 3,
  studio_full_doc: 10,
  studio_assist: 1,
  studio_review: 1,
} as const;

export type MeteredAiFeature = keyof typeof AI_CREDIT_COSTS;

export function getMonthlyCreditAllowance(tier?: string | null): number {
  const raw = String(tier || 'free').toLowerCase().trim();
  if (raw === 'studio' || raw === 'sage' || raw === 'premium') {
    return AI_CREDIT_ALLOWANCES.studio;
  }
  if (raw === 'plus' || raw === 'scholar') {
    return AI_CREDIT_ALLOWANCES.plus;
  }
  return AI_CREDIT_ALLOWANCES.free;
}

export function getNormalizedCreditTier(tier?: string | null): 'free' | 'plus' | 'studio' {
  const raw = String(tier || 'free').toLowerCase().trim();
  if (raw === 'studio' || raw === 'sage' || raw === 'premium') return 'studio';
  if (raw === 'plus' || raw === 'scholar') return 'plus';
  return 'free';
}
