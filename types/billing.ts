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
  razorpayPlanId: string
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
    razorpayPlanId: '',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 9,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: false,
    razorpayPlanId: process.env.RAZORPAY_PRO_PLAN_ID ?? '',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceUsd: 49,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: true,
    razorpayPlanId: process.env.RAZORPAY_BUSINESS_PLAN_ID ?? '',
  },
}

export interface UserBilling {
  userId: string
  planId: PlanId
  razorpayCustomerId?: string
  razorpaySubscriptionId?: string
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
