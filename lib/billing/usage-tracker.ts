// ─── KV-Based Daily Usage Tracker (Time-Based) ──────────────────────────────
//
// Security model:
// - Free / Plus users have a hard daily voice MINUTES cap.
// - Actual recording duration (seconds) is tracked per day.
// - Usage is incremented BEFORE serving the response (pessimistic).
// - If KV is unavailable, non-pro users are BLOCKED (fail-closed).
// - STT & TTS endpoints also gate on the same counter (read-only check).
// - Client sends voiceDurationMs; server enforces min 3s, max 120s per call.

import type { KVStore } from '@/types'
import type { DailyUsage, PlanId } from '@/types/billing'
import { PLANS } from '@/types/billing'
import {
  checkAndIncrementVoiceUsageAtomic,
  checkVoiceUsageAtomic,
} from '@/lib/server/atomic-quota'

/** Minimum seconds counted per voice interaction (anti-cheat) */
const MIN_SECONDS_PER_CALL = 3
/** Maximum seconds counted per voice interaction (sanity cap) */
const MAX_SECONDS_PER_CALL = 120

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

export async function getDailyUsage(
  kv: KVStore,
  userId: string
): Promise<DailyUsage> {
  const date = getTodayDate()
  const key = `usage:${userId}:${date}`

  const raw = await kv.get(key)
  if (!raw) {
    return {
      userId,
      date,
      voiceInteractions: 0,
      voiceSecondsUsed: 0,
      lastUpdatedAt: Date.now(),
    }
  }

  const parsed = JSON.parse(raw) as DailyUsage
  // Migrate old records that don't have voiceSecondsUsed
  if (parsed.voiceSecondsUsed === undefined) {
    parsed.voiceSecondsUsed = 0
  }
  return parsed
}

async function saveUsage(kv: KVStore, userId: string, usage: DailyUsage): Promise<void> {
  const key = `usage:${userId}:${usage.date}`
  await kv.put(key, JSON.stringify(usage), { expirationTtl: 90000 })
}

/**
 * Sanitize client-reported duration: clamp to [MIN, MAX] seconds.
 * If durationMs is 0 or undefined, returns MIN_SECONDS_PER_CALL (anti-bypass).
 */
export function sanitizeDuration(durationMs: number | undefined): number {
  if (!durationMs || durationMs <= 0) return MIN_SECONDS_PER_CALL
  const seconds = Math.ceil(durationMs / 1000)
  return Math.max(MIN_SECONDS_PER_CALL, Math.min(seconds, MAX_SECONDS_PER_CALL))
}

/** Get the daily limit in seconds for a plan */
function getLimitSeconds(planId: PlanId): number {
  return PLANS[planId].voiceMinutesPerDay * 60
}

/**
 * Read-only limit check — used by STT/TTS to gate without incrementing.
 * Returns used/limit in SECONDS.
 */
export async function checkVoiceLimit(
  kv: KVStore,
  userId: string,
  planId: PlanId
): Promise<{ allowed: boolean; usedSeconds: number; limitSeconds: number; remainingSeconds: number }> {
  const usage = await getDailyUsage(kv, userId)
  const limitSeconds = getLimitSeconds(planId)
  const atomicUsage = await checkVoiceUsageAtomic(userId, getTodayDate(), planId, limitSeconds)
  if (atomicUsage) {
    return {
      allowed: atomicUsage.allowed,
      usedSeconds: atomicUsage.usedSeconds,
      limitSeconds: atomicUsage.limitSeconds,
      remainingSeconds: atomicUsage.remainingSeconds,
    }
  }

  if (planId === 'pro') {
    return { allowed: true, usedSeconds: usage.voiceSecondsUsed, limitSeconds, remainingSeconds: 999999 }
  }

  return {
    allowed: usage.voiceSecondsUsed < limitSeconds,
    usedSeconds: usage.voiceSecondsUsed,
    limitSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usage.voiceSecondsUsed),
  }
}

/**
 * Atomic check-and-increment for time-based tracking.
 * Checks BEFORE incrementing — if already over limit, rejects.
 * Otherwise adds `durationSeconds` to the counter.
 *
 * @param durationMs - client-reported voice duration in ms (sanitized server-side)
 */
export async function checkAndIncrementVoiceTime(
  kv: KVStore,
  userId: string,
  planId: PlanId,
  durationMs: number | undefined
): Promise<{ allowed: boolean; usedSeconds: number; limitSeconds: number; remainingSeconds: number }> {
  const limitSeconds = getLimitSeconds(planId)
  const addSeconds = sanitizeDuration(durationMs)
  const atomicUsage = await checkAndIncrementVoiceUsageAtomic(
    userId,
    getTodayDate(),
    planId,
    limitSeconds,
    addSeconds,
    90000,
  )
  if (atomicUsage) {
    return {
      allowed: atomicUsage.allowed,
      usedSeconds: atomicUsage.usedSeconds,
      limitSeconds: atomicUsage.limitSeconds,
      remainingSeconds: atomicUsage.remainingSeconds,
    }
  }

  // Pro: always allowed, still track for analytics
  if (planId === 'pro') {
    const usage = await getDailyUsage(kv, userId)
    usage.voiceInteractions += 1
    usage.voiceSecondsUsed += addSeconds
    usage.lastUpdatedAt = Date.now()
    await saveUsage(kv, userId, usage)
    return { allowed: true, usedSeconds: usage.voiceSecondsUsed, limitSeconds, remainingSeconds: 999999 }
  }

  // Read current usage
  const usage = await getDailyUsage(kv, userId)

  // Already at or over the limit — reject
  if (usage.voiceSecondsUsed >= limitSeconds) {
    return {
      allowed: false,
      usedSeconds: usage.voiceSecondsUsed,
      limitSeconds,
      remainingSeconds: 0,
    }
  }

  // Under the limit — increment and serve
  usage.voiceInteractions += 1
  usage.voiceSecondsUsed += addSeconds
  usage.lastUpdatedAt = Date.now()
  await saveUsage(kv, userId, usage)

  return {
    allowed: true,
    usedSeconds: usage.voiceSecondsUsed,
    limitSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usage.voiceSecondsUsed),
  }
}
