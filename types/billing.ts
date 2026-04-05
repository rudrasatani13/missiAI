// ─── Billing Types & Plan Configuration ──────────────────────────────────────

export type PlanId = 'free' | 'pro' | 'business'

export interface PlanConfig {
  id: PlanId
  name: string
  priceUsd: number
  voiceInteractionsPerDay: number
  personalitiesAllowed: number
  maxMemoryFacts: number
  apiAccess: boolean
  dodoProductId: string
}

// Server-side code resolves Dodo product IDs via process.env directly.
export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    voiceInteractionsPerDay: 10,
    personalitiesAllowed: 1,
    maxMemoryFacts: 20,
    apiAccess: false,
    dodoProductId: '',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 9,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: false,
    dodoProductId: '',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceUsd: 49,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: true,
    dodoProductId: '',
  },
}

/** Server-only helper: resolve the actual Dodo product ID from env vars */
export function getServerDodoProductId(planId: PlanId): string {
  if (planId === 'pro') return process.env.DODO_PRO_PRODUCT_ID ?? ''
  if (planId === 'business') return process.env.DODO_BUSINESS_PRODUCT_ID ?? ''
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
  lastUpdatedAt: number
}
