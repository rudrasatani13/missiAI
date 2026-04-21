// ─── Analytics Aggregator ─────────────────────────────────────────────────────

import type { KVStore } from '@/types'
import type { AnalyticsSnapshot } from '@/types/analytics'
import { getDailyStats, getLifetimeTotals } from '@/lib/analytics/event-store'
import { getTodayDate } from '@/lib/billing/usage-tracker'

const SNAPSHOT_KEY = 'analytics:snapshot'
const SNAPSHOT_TTL = 300 // 5 minutes

// ─── Build Analytics Snapshot ─────────────────────────────────────────────────

export async function buildAnalyticsSnapshot(
  kv: KVStore
): Promise<AnalyticsSnapshot> {
  // Check cache first
  try {
    const cached = await kv.get(SNAPSHOT_KEY)
    if (cached) {
      const snapshot = JSON.parse(cached) as AnalyticsSnapshot
      const age = Date.now() - snapshot.generatedAt
      if (age < SNAPSHOT_TTL * 1000) {
        return snapshot
      }
    }
  } catch {
    // Cache miss or parse error, rebuild
  }

  const today = getTodayDate()
  const yesterday = getDateOffset(today, -1)

  // Fetch all data in parallel
  const dates = Array.from({ length: 7 }, (_, i) => getDateOffset(today, -i))

  const [todayStats, yesterdayStats, lifetimeTotals, ...last7DaysStats] = await Promise.all([
    getDailyStats(kv, today),
    getDailyStats(kv, yesterday),
    getLifetimeTotals(kv),
    ...dates.map(d => getDailyStats(kv, d)),
  ])

  const snapshot: AnalyticsSnapshot = {
    today: todayStats,
    yesterday: yesterdayStats,
    last7Days: last7DaysStats,
    lifetime: lifetimeTotals,
    generatedAt: Date.now(),
  }

  // Cache the snapshot
  try {
    await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: SNAPSHOT_TTL })
  } catch {
    // Non-critical
  }

  return snapshot
}

// ─── Growth Rate ──────────────────────────────────────────────────────────────

export function calculateGrowthRate(
  current: number,
  previous: number
): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

// ─── Format Cost ──────────────────────────────────────────────────────────────

export function formatCostUsd(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`
  }
  return `$${amount.toFixed(2)}`
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function getDateOffset(dateStr: string, offsetDays: number): string {
  const date = new Date(dateStr + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().split('T')[0]
}
