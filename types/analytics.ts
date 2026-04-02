// ─── Analytics Types ──────────────────────────────────────────────────────────

import type { PlanId } from '@/types/billing'

export interface DailyStats {
  date: string                           // YYYY-MM-DD
  totalRequests: number
  uniqueUsers: number                    // count only — never expose user IDs
  voiceInteractions: number
  chatRequests: number
  ttsRequests: number
  memoryReads: number
  memoryWrites: number
  actionsExecuted: number
  totalCostUsd: number
  errorCount: number
  newSignups: number                     // approximated from first-seen users
  updatedAt: number
}

export interface LifetimeTotals {
  totalUsers: number                     // unique user IDs ever seen
  totalInteractions: number
  totalCostUsd: number
  totalRevenue: number                   // from Stripe subscription data
  planBreakdown: Record<PlanId, number>  // count per plan
  lastUpdatedAt: number
}

export interface AnalyticsSnapshot {
  today: DailyStats
  yesterday: DailyStats
  last7Days: DailyStats[]
  lifetime: LifetimeTotals
  generatedAt: number
}

export interface FeatureUsage {
  proactiveBriefings: number
  nudgesDelivered: number
  actionsExecuted: number
  pluginsConnected: number
  memoryNodesTotal: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyDailyStats(date: string): DailyStats {
  return {
    date,
    totalRequests: 0,
    uniqueUsers: 0,
    voiceInteractions: 0,
    chatRequests: 0,
    ttsRequests: 0,
    memoryReads: 0,
    memoryWrites: 0,
    actionsExecuted: 0,
    totalCostUsd: 0,
    errorCount: 0,
    newSignups: 0,
    updatedAt: Date.now(),
  }
}

export function emptyLifetimeTotals(): LifetimeTotals {
  return {
    totalUsers: 0,
    totalInteractions: 0,
    totalCostUsd: 0,
    totalRevenue: 0,
    planBreakdown: { free: 0, pro: 0, business: 0 },
    lastUpdatedAt: Date.now(),
  }
}
