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
import {
  calculateAvatarTier,
  calculateLevel,
  ensureGamificationRecordBackfill,
  getGamificationData,
} from '@/lib/gamification/streak'
import {
  getGamificationStateRecord,
  saveGamificationStateRecord,
  saveGrantRecord,
  supportsGamificationList,
} from '@/lib/gamification/gamification-record-store'
import { checkAndIncrementAtomicCounter } from '@/lib/server/platform/atomic-quota'
import { getTodayUTC } from '@/lib/server/utils/date-utils'

// ─── Daily Caps per Source ────────────────────────────────────────────────────

const DAILY_CAPS: Record<XPSource, { maxGrants: number; xpPerGrant: number }> = {
  chat:        { maxGrants: 3,  xpPerGrant: 3 },   // 9/day — meaningful convos only
  memory:      { maxGrants: 5,  xpPerGrant: 1 },   // 5/day — passive, auto-saved
  agent:       { maxGrants: 3,  xpPerGrant: 2 },   // 6/day — tool usage
  login:       { maxGrants: 1,  xpPerGrant: 3 },   // 3/day — just showing up
  checkin:     { maxGrants: 5,  xpPerGrant: 5 },   // 25/day — managed by streak.ts
  milestone:   { maxGrants: 3,  xpPerGrant: 250 }, // managed by streak.ts
  achievement: { maxGrants: 10, xpPerGrant: 100 }, // managed by achievements.ts
  budget:      { maxGrants: 10, xpPerGrant: 2 },   // 20/day — expense entries
}

/**
 * Award XP to a user from a specific source.
 * Respects daily caps — silently returns 0 if cap is hit.
 *
 * This is designed to be called fire-and-forget from API routes:
 *   awardXP(kv, userId, 'chat', 3).catch(() => {})
 */
async function saveLegacyGamificationSnapshot(kv: KVStore, userId: string, data: Awaited<ReturnType<typeof getGamificationData>>): Promise<void> {
  const today = getTodayUTC()
  const snapshot = {
    ...data,
    lastUpdatedAt: Date.now(),
    level: calculateLevel(data.totalXP),
    avatarTier: calculateAvatarTier(data.totalXP),
    xpLog: data.xpLogDate === today ? data.xpLog : [],
    xpLogDate: today,
  }
  await kv.put(`gamification:${userId}`, JSON.stringify(snapshot))
}

export async function awardXP(
  kv: KVStore,
  userId: string,
  source: XPSource,
  amount?: number,
): Promise<number> {
  try {
    const data = await getGamificationData(kv, userId)
    const today = getTodayUTC()

    if (data.xpLogDate !== today) {
      data.xpLog = []
      data.xpLogDate = today
    }

    const cap = DAILY_CAPS[source]
    if (!cap) return 0

    const todayGrants = data.xpLog.filter(e => e.source === source).length
    if (todayGrants >= cap.maxGrants) return 0

    const xp = amount ?? cap.xpPerGrant
    await ensureGamificationRecordBackfill(kv, userId)
    const remainingGrants = cap.maxGrants - todayGrants
    const atomicGrant = await checkAndIncrementAtomicCounter(
      `xp-grant:${userId}:${today}:${source}`,
      remainingGrants,
      86_400,
    )
    if (atomicGrant && !atomicGrant.allowed) return 0

    const timestamp = Date.now()
    const sequence = todayGrants + (atomicGrant?.count ?? 1)
    await saveGrantRecord(kv, {
      userId,
      date: today,
      source,
      amount: xp,
      timestamp,
    }, `${source}:${sequence}`)

    data.totalXP += xp
    data.xpLog.push({ source, amount: xp, timestamp })

    if (source === 'login' || source === 'chat') {
      const loginTouch = data.lastLoginDate === today
        ? null
        : await checkAndIncrementAtomicCounter(`login-touch:${userId}:${today}`, 1, 86_400)

      if (!loginTouch || loginTouch.allowed) {
        updateLoginStreak(data, today)
      } else {
        await new Promise((resolve) => setTimeout(resolve, 25))
        const freshData = await getGamificationData(kv, userId)
        data.loginStreak = freshData.loginStreak
        data.lastLoginDate = freshData.lastLoginDate
      }
    }

    const currentState = await getGamificationStateRecord(kv, userId)
    await saveGamificationStateRecord(kv, {
      ...(currentState ?? {
        userId,
        totalXPBaseline: 0,
        loginStreak: 0,
        lastLoginDate: '',
        legacyTodayXPLogDate: '',
        legacyTodayXPLog: [],
        lastUpdatedAt: 0,
      }),
      userId,
      loginStreak: data.loginStreak,
      lastLoginDate: data.lastLoginDate,
      lastUpdatedAt: Date.now(),
    })

    if (!supportsGamificationList(kv)) {
      await saveLegacyGamificationSnapshot(kv, userId, data)
    }
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
