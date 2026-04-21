/**
 * XP Engine — Central XP granting with daily caps.
 *
 * Call `awardXP()` from any API route to give the user XP for
 * normal app usage (chatting, memory saves, agent tools, etc.)
 *
 * ── Production XP Budget ──────────────────────────────────────
 * Target: ~20-30 XP per active day (excluding milestones)
 *
 * Chat:    3 XP × 3/day  =  9 XP/day max
 * Memory:  1 XP × 5/day  =  5 XP/day max
 * Agent:   2 XP × 3/day  =  6 XP/day max
 * Checkin: 5 XP × 5/day  = 25 XP/day max
 * Login:   3 XP × 1/day  =  3 XP/day max
 *                  Total  ≈ 48 XP/day theoretical max
 *
 * Tier timeline (realistic active user ~25 XP/day):
 *   Ember   (100 XP)   ≈ 4-5 days
 *   Flame   (500 XP)   ≈ 3-4 weeks
 *   Nova    (1500 XP)  ≈ 2-3 months
 *   Stellar (5000 XP)  ≈ 6-8 months
 *   Cosmic  (15000 XP) ≈ 1.5-2 years
 */

import type { KVStore } from '@/types'
import type { XPSource } from '@/types/gamification'
import { getGamificationData, saveGamificationData } from '@/lib/gamification/streak'
import { getTodayUTC } from '@/lib/server/date-utils'

// ─── Daily Caps per Source ────────────────────────────────────────────────────

const DAILY_CAPS: Record<XPSource, { maxGrants: number; xpPerGrant: number }> = {
  chat:        { maxGrants: 3,  xpPerGrant: 3 },   // 9/day — meaningful convos only
  memory:      { maxGrants: 5,  xpPerGrant: 1 },   // 5/day — passive, auto-saved
  agent:       { maxGrants: 3,  xpPerGrant: 2 },   // 6/day — tool usage
  login:       { maxGrants: 1,  xpPerGrant: 3 },   // 3/day — just showing up
  checkin:     { maxGrants: 5,  xpPerGrant: 5 },   // 25/day — managed by streak.ts
  milestone:   { maxGrants: 3,  xpPerGrant: 250 }, // managed by streak.ts
  achievement: { maxGrants: 10, xpPerGrant: 100 }, // managed by achievements.ts
}

/**
 * Award XP to a user from a specific source.
 * Respects daily caps — silently returns 0 if cap is hit.
 *
 * This is designed to be called fire-and-forget from API routes:
 *   awardXP(kv, userId, 'chat', 3).catch(() => {})
 */
export async function awardXP(
  kv: KVStore,
  userId: string,
  source: XPSource,
  amount?: number,
): Promise<number> {
  try {
    // SECURITY (A6): KV-based mutex to prevent double-award race conditions.
    // If two concurrent requests try to award XP simultaneously, only one wins.
    // The lock auto-expires via TTL — no manual cleanup needed.
    const lockKey = `xp-lock:${userId}`
    const hasLock = await kv.get(lockKey)
    if (hasLock) return 0 // Another request is processing — skip
    await kv.put(lockKey, '1', { expirationTtl: 60 }) // 60-second lock (KV minimum TTL)

    const data = await getGamificationData(kv, userId)
    // BUGFIX (B4): Use centralized date utility instead of raw UTC slicing
    const today = getTodayUTC()

    // Ensure xpLog is for today
    if (data.xpLogDate !== today) {
      data.xpLog = []
      data.xpLogDate = today
    }

    // Check daily cap for this source
    const cap = DAILY_CAPS[source]
    if (!cap) return 0

    const todayGrants = data.xpLog.filter(e => e.source === source).length
    if (todayGrants >= cap.maxGrants) return 0

    const xp = amount ?? cap.xpPerGrant

    data.totalXP += xp
    data.xpLog.push({ source, amount: xp, timestamp: Date.now() })

    // Track login streak
    if (source === 'login' || source === 'chat') {
      updateLoginStreak(data, today)
    }

    await saveGamificationData(kv, userId, data)
    console.log(`[XP] Awarded ${xp} XP to ${userId} (source: ${source}, total: ${data.totalXP})`)
    return xp
  } catch (err) {
    console.error(`[XP] Error awarding XP:`, err)
    return 0
  }
}

/**
 * Update the user's consecutive login streak.
 */
function updateLoginStreak(data: import('@/types/gamification').GamificationData, today: string): void {
  if (data.lastLoginDate === today) return // Already counted today

  const todayDate = new Date(today)
  const yesterdayDate = new Date(todayDate)
  yesterdayDate.setDate(todayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)

  if (data.lastLoginDate === yesterday) {
    data.loginStreak += 1
  } else if (data.lastLoginDate !== today) {
    data.loginStreak = 1
  }

  data.lastLoginDate = today
}
