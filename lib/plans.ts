// ============================================================================
// KorsIQ Plans & Limits — Single Source of Truth for Plan Tiers & Allowances
// ============================================================================

import { AI_CREDIT_ALLOWANCES } from './aiCredits';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanConfig {
  key: 'free' | 'plus' | 'studio';
  name: string;
  priceNgn: number;
  priceDisplay: string;
  monthlyCredits: number;
  storageMb: number;
  storageDisplay: string;
  description: string;
  features: string[];
}

export const KORSIQ_PLANS: Record<'free' | 'plus' | 'studio', PlanConfig> = {
  free: {
    key: 'free',
    name: 'Free',
    priceNgn: 0,
    priceDisplay: '₦0',
    monthlyCredits: AI_CREDIT_ALLOWANCES.free, // 20
    storageMb: 500,
    storageDisplay: '500 MB',
    description: 'Core tools for university coursework.',
    features: [
      'Up to 6 active courses',
      'CGPA tracking & calculator',
      'Weekly study timetable',
      '500 MB file storage',
      'Join study circles',
      '20 monthly AI credits',
    ],
  },
  plus: {
    key: 'plus',
    name: 'Plus',
    priceNgn: 7500,
    priceDisplay: '₦7,500',
    monthlyCredits: AI_CREDIT_ALLOWANCES.plus, // 150
    storageMb: 2048,
    storageDisplay: '2 GB',
    description: 'For students who want higher allowances and scenario planning.',
    features: [
      'All courses & timetable',
      'Scenario CGPA projection',
      '2 GB file storage',
      'Private circles with invite codes',
      '150 monthly AI credits',
    ],
  },
  studio: {
    key: 'studio',
    name: 'KorsIQ Premium',
    priceNgn: 15000,
    priceDisplay: '₦15,000',
    monthlyCredits: AI_CREDIT_ALLOWANCES.studio, // 200
    storageMb: 10240,
    storageDisplay: '10 GB',
    description: 'Full Academic Studio workspace.',
    features: [
      'Everything in Plus',
      'Academic Studio editor',
      'Real-source citation chips',
      'Word (.docx) & PDF export',
      '200 monthly AI credits, 10 GB storage',
    ],
  },
};

export function getPlanConfig(tier?: string | null): PlanConfig {
  const raw = String(tier || 'free').toLowerCase().trim();
  if (raw === 'studio' || raw === 'sage' || raw === 'premium') return KORSIQ_PLANS.studio;
  if (raw === 'plus' || raw === 'scholar') return KORSIQ_PLANS.plus;
  return KORSIQ_PLANS.free;
}
