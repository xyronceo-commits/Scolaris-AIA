export const BRAND_NAME = 'KorsIQ';
export const TAGLINE = 'Outsmart Your Syllabus.';

/** Names the AI assistant was stored under before the rebrand: old chat history still counts as AI messages. */
const LEGACY_AI_SENDERS = ['Scolaris AI', 'Scolaris'];

export const isAiSender = (sender?: string | null): boolean =>
  !!sender && (sender === BRAND_NAME || LEGACY_AI_SENDERS.includes(sender));
