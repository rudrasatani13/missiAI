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

// BUG-1 FIX: Removed process.env from shared type file — this file is imported
// by 'use client' components where server env vars are undefined.
// Server-side code resolves Razorpay plan IDs via process.env directly.
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
    razorpayPlanId: '',
  },
  business: {
    id: 'business',
    name: 'Business',
    priceUsd: 49,
    voiceInteractionsPerDay: 999999,
    personalitiesAllowed: 4,
    maxMemoryFacts: 999999,
    apiAccess: true,
    razorpayPlanId: '',
  },
}

/** Server-only helper: resolve the actual Razorpay plan ID from env vars */
export function getServerRazorpayPlanId(planId: PlanId): string {
  if (planId === 'pro') return process.env.RAZORPAY_PRO_PLAN_ID ?? ''
  if (planId === 'business') return process.env.RAZORPAY_BUSINESS_PLAN_ID ?? ''
  return ''
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
