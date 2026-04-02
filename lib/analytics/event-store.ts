// ─── Analytics Event Store (KV-backed) ───────────────────────────────────────

import type { KVStore } from '@/types'
import type { DailyStats, LifetimeTotals } from '@/types/analytics'
import { emptyDailyStats, emptyLifetimeTotals } from '@/types/analytics'
import { getTodayDate } from '@/lib/billing/usage-tracker'

// ─── KV Key Patterns ──────────────────────────────────────────────────────────
// Daily stats:   analytics:daily:{YYYY-MM-DD}
// Lifetime:      analytics:totals
// Seen users:    analytics:users:{YYYY-MM-DD}

const DAILY_KEY = (date: string) => `analytics:daily:${date}`
const TOTALS_KEY = 'analytics:totals'
const USERS_KEY = (date: string) => `analytics:users:${date}`

const DAILY_TTL = 7776000   // 90 days in seconds
const USERS_TTL = 691200    // 8 days in seconds
const MAX_USERS_PER_DAY = 10000

// ─── Record Event ─────────────────────────────────────────────────────────────

export type EventType = 'chat' | 'tts' | 'memory_read' | 'memory_write' | 'action' | 'error' | 'signup'

export async function recordEvent(
  kv: KVStore,
  event: {
    type: EventType
    userId: string
    costUsd?: number
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const date = getTodayDate()
    const stats = await getDailyStats(kv, date)

    stats.totalRequests += 1

    switch (event.type) {
      case 'chat':
        stats.chatRequests += 1
        stats.voiceInteractions += 1
        break
      case 'tts':
        stats.ttsRequests += 1
        break
      case 'memory_read':
        stats.memoryReads += 1
        break
      case 'memory_write':
        stats.memoryWrites += 1
        break
      case 'action':
        stats.actionsExecuted += 1
        break
      case 'error':
        stats.errorCount += 1
        break
      case 'signup':
        stats.newSignups += 1
        break
    }

    if (event.costUsd) {
      stats.totalCostUsd += event.costUsd
    }

    stats.updatedAt = Date.now()

    await kv.put(DAILY_KEY(date), JSON.stringify(stats), { expirationTtl: DAILY_TTL })

    // Update lifetime totals
    await updateLifetimeTotals(kv, {
      totalInteractions: 1,
      totalCostUsd: event.costUsd ?? 0,
    })
  } catch {
    // Analytics must not block main request flow — silently swallow errors
  }
}

// ─── Get Daily Stats ──────────────────────────────────────────────────────────

export async function getDailyStats(
  kv: KVStore,
  date: string
): Promise<DailyStats> {
  try {
    const raw = await kv.get(DAILY_KEY(date))
    if (!raw) return emptyDailyStats(date)

    const parsed = JSON.parse(raw) as DailyStats
    // uniqueUsers stored as number (count) in daily stats
    return parsed
  } catch {
    return emptyDailyStats(date)
  }
}

// ─── Lifetime Totals ──────────────────────────────────────────────────────────

export async function getLifetimeTotals(
  kv: KVStore
): Promise<LifetimeTotals> {
  try {
    const raw = await kv.get(TOTALS_KEY)
    if (!raw) return emptyLifetimeTotals()
    return JSON.parse(raw) as LifetimeTotals
  } catch {
    return emptyLifetimeTotals()
  }
}

export async function updateLifetimeTotals(
  kv: KVStore,
  updates: Partial<LifetimeTotals> & { totalInteractions?: number; totalCostUsd?: number }
): Promise<void> {
  try {
    const existing = await getLifetimeTotals(kv)

    // Incrementally merge numeric fields
    if (updates.totalInteractions) {
      existing.totalInteractions += updates.totalInteractions
    }
    if (updates.totalCostUsd) {
      existing.totalCostUsd += updates.totalCostUsd
    }
    if (updates.totalUsers !== undefined) {
      existing.totalUsers = updates.totalUsers
    }
    if (updates.totalRevenue !== undefined) {
      existing.totalRevenue = updates.totalRevenue
    }
    if (updates.planBreakdown) {
      existing.planBreakdown = updates.planBreakdown
    }

    existing.lastUpdatedAt = Date.now()

    // No TTL — permanent
    await kv.put(TOTALS_KEY, JSON.stringify(existing))
  } catch {
    // Non-critical
  }
}

// ─── Unique User Tracking ─────────────────────────────────────────────────────

export async function getUniqueUserCount(
  kv: KVStore,
  date: string
): Promise<number> {
  try {
    const raw = await kv.get(USERS_KEY(date))
    if (!raw) return 0
    const users = JSON.parse(raw) as string[]
    return users.length
  } catch {
    return 0
  }
}

export async function recordUserSeen(
  kv: KVStore,
  userId: string,
  date: string
): Promise<void> {
  try {
    const raw = await kv.get(USERS_KEY(date))
    let users: string[] = raw ? JSON.parse(raw) : []

    if (users.includes(userId)) return // Already seen today

    // Cap array size
    if (users.length >= MAX_USERS_PER_DAY) return

    users.push(userId)
    await kv.put(USERS_KEY(date), JSON.stringify(users), { expirationTtl: USERS_TTL })

    // Update daily stats uniqueUsers count
    const stats = await getDailyStats(kv, date)
    stats.uniqueUsers = users.length
    stats.updatedAt = Date.now()
    await kv.put(DAILY_KEY(date), JSON.stringify(stats), { expirationTtl: DAILY_TTL })

    // Check if this is a new user ever (update lifetime totals)
    const totals = await getLifetimeTotals(kv)
    // Simple heuristic: if today's unique count grew, bump lifetime
    // (not perfectly accurate but good enough for analytics)
    await updateLifetimeTotals(kv, { totalUsers: totals.totalUsers + 1 })
  } catch {
    // Non-critical
  }
}
