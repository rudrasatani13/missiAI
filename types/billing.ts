// ─── Billing Types & Plan Configuration ──────────────────────────────────────

export type PlanId = 'free' | 'plus' | 'pro'

export interface PlanConfig {
  id: PlanId
  name: string
  priceUsd: number
  /** Daily voice cap in minutes (real time tracking) */
  voiceMinutesPerDay: number
  /** @deprecated Use voiceMinutesPerDay instead */
  voiceInteractionsPerDay: number
  personalitiesAllowed: number
  maxMemoryFacts: number
  apiAccess: boolean
  dodoProductId: string
  /** Max daily brief generations per day (includes initial + regenerations) */
  briefGenerationsPerDay: number
}

// Server-side code resolves Dodo product IDs via process.env directly.
export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    voiceMinutesPerDay: 10,
    voiceInteractionsPerDay: 10, // kept for backward compat
    personalitiesAllowed: 1,
    maxMemoryFacts: 20,
    apiAccess: false,
    dodoProductId: '',
    briefGenerationsPerDay: 1, // 1 generation, no regeneration
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    priceUsd: 9,
    voiceMinutesPerDay: 120,
    voiceInteractionsPerDay: 120, // kept for backward compat
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: false,
    dodoProductId: '',
    briefGenerationsPerDay: 3, // 1 initial + 2 regenerations
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 19,
    voiceMinutesPerDay: 999999,
    voiceInteractionsPerDay: 999999, // kept for backward compat
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: true,
    dodoProductId: '',
    briefGenerationsPerDay: 10, // generous limit for pro users
  },
}

/** Server-only helper: resolve the actual Dodo product ID from env vars */
export function getServerDodoProductId(planId: PlanId): string {
  if (planId === 'plus') return process.env.DODO_PLUS_PRODUCT_ID ?? ''
  if (planId === 'pro') return process.env.DODO_PRO_PRODUCT_ID ?? ''
  return ''
}

export interface UserBilling {
  userId: string
  planId: PlanId
  dodoCustomerId?: string
  dodoSubscriptionId?: string
  currentPeriodEnd?: number
  cancelAtPeriodEnd?: boolean
  updatedAt: number
}

export interface DailyUsage {
  userId: string
  date: string
  voiceInteractions: number
  /** Actual voice seconds used today (real time tracking) */
  voiceSecondsUsed: number
  lastUpdatedAt: number
}
