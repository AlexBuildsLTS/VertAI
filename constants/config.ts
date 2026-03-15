/**
 * Core Application Configuration
 * Centralizes all business logic limits, API constraints, and tier definitions.
 */
export const APP_CONFIG = {
  NAME: 'Transcriber Pro',
  SUPPORT_EMAIL: 'support@transcriberpro.com',

  // Transcription Limits
  LIMITS: {
    FREE_TIER_MAX_MINUTES_PER_VIDEO: 15,
    PRO_TIER_MAX_MINUTES_PER_VIDEO: 120,
    ENTERPRISE_TIER_MAX_MINUTES_PER_VIDEO: 600,
    MAX_CONCURRENT_JOBS: 3,
  },

  // API Configuration
  POLLING_INTERVAL_MS: 3000, // How often we check Supabase for video processing status

  // External Links
  LINKS: {
    TOS: 'https://transcriberpro.com/terms',
    PRIVACY: 'https://transcriberpro.com/privacy',
  },
} as const;

export const SUBSCRIPTION_TIERS = {
  FREE: {
    id: 'free',
    name: 'On-Demand',
    price: 0,
    features: [
      'Standard processing',
      'Up to 15 min videos',
      'Community support',
    ],
  },
  PRO: {
    id: 'pro',
    name: 'Teams',
    price: 29,
    features: [
      'Priority processing',
      'Up to 2 hr videos',
      'AI Chapters & SEO',
      'SLA support',
    ],
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise Suite',
    price: 99,
    features: [
      'Lightning processing',
      'Unlimited length',
      'Custom Webhooks',
      'Dedicated agent',
    ],
  },
} as const;
