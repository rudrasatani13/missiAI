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
  stripePriceId: string
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    voiceInteractionsPerDay: 10,
    personalitiesAllowed: 1,
    maxMemoryFacts: 20,
    apiAccess: false,
    stripePriceId: '',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 9,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: false,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceUsd: 49,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: true,
    stripePriceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? '',
  },
}

export interface UserBilling {
  userId: string
  planId: PlanId
  stripeCustomerId?: string
  stripeSubscriptionId?: string
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
