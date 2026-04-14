// ─── Daily Brief KV Store ─────────────────────────────────────────────────────
//
// Manages reading, writing, and updating daily briefs in Cloudflare KV.
// Follows the same KV access pattern as lib/memory/life-graph.ts.

import type { KVStore } from '@/types'
import type { DailyBrief } from '@/types/daily-brief'
import { getTodayUTC } from '@/lib/server/date-utils'

// ─── KV Key Helpers ───────────────────────────────────────────────────────────

function briefKey(userId: string, date: string): string {
  return `daily-brief:${userId}:${date}`
}

function rateLimitKey(userId: string, date: string): string {
  return `ratelimit:daily-brief:${userId}:${date}`
}

// BUGFIX (B1): Use centralized date utility instead of raw UTC slicing.
// Brief-store uses UTC intentionally — timezone context is applied at the route layer.
function getToday(): string {
  return getTodayUTC()
}

// ─── Brief TTL (48 hours) ─────────────────────────────────────────────────────

const BRIEF_TTL_SECONDS = 172800 // 48 hours

// ─── Rate Limit TTL (24 hours) ────────────────────────────────────────────────

const RATE_LIMIT_TTL_SECONDS = 86400 // 24 hours

// ─── Read Today's Brief ───────────────────────────────────────────────────────

export async function getTodaysBrief(
  kv: KVStore,
  userId: string,
): Promise<DailyBrief | null> {
  const today = getToday()
  const raw = await kv.get(briefKey(userId, today))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as DailyBrief
    // Basic shape validation — must have tasks array and userId
    if (!Array.isArray(parsed.tasks) || !parsed.userId) return null
    return parsed
  } catch {
    return null
  }
}

// ─── Save Brief ───────────────────────────────────────────────────────────────

export async function saveBrief(
  kv: KVStore,
  userId: string,
  brief: DailyBrief,
): Promise<void> {
  // SECURITY: Always overwrite userId from the server-side parameter,
  // never trust whatever might be in the brief object.
  brief.userId = userId
  await kv.put(
    briefKey(userId, brief.date),
    JSON.stringify(brief),
    { expirationTtl: BRIEF_TTL_SECONDS },
  )
}

// ─── Mark Brief Viewed ────────────────────────────────────────────────────────

export async function markBriefViewed(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const brief = await getTodaysBrief(kv, userId)
  if (!brief) return // No brief exists — silently do nothing

  brief.viewed = true
  brief.viewedAt = Date.now()
  await saveBrief(kv, userId, brief)
}

// ─── Mark Task Complete ───────────────────────────────────────────────────────

export async function markTaskComplete(
  kv: KVStore,
  userId: string,
  taskId: string,
): Promise<DailyBrief | null> {
  const brief = await getTodaysBrief(kv, userId)
  if (!brief) return null

  // SECURITY: Verify the task exists in this user's brief before modifying.
  // This is the ownership check — prevents marking arbitrary task IDs.
  const task = brief.tasks.find((t) => t.id === taskId)
  if (!task) return null

  task.completed = true
  task.completedAt = Date.now()

  await saveBrief(kv, userId, brief)
  return brief
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
//
// Per-user daily rate limit for brief generation (max 3 per day).
// Uses a simple counter in KV that auto-expires after 24 hours.

export async function getRateLimit(
  kv: KVStore,
  userId: string,
): Promise<number> {
  const today = getToday()
  const raw = await kv.get(rateLimitKey(userId, today))
  if (!raw) return 0

  const count = parseInt(raw, 10)
  return isNaN(count) ? 0 : count
}

export async function incrementRateLimit(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const today = getToday()
  const key = rateLimitKey(userId, today)

  // Read current count, increment, write back.
  // Not truly atomic, but acceptable for a daily counter —
  // worst case is one extra generation if two requests race.
  const current = await getRateLimit(kv, userId)
  await kv.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_TTL_SECONDS,
  })
}
