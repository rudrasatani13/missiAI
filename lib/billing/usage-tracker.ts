// ─── KV-Based Daily Usage Tracker ────────────────────────────────────────────

import type { KVStore } from '@/types'
import type { DailyUsage, PlanId } from '@/types/billing'
import { PLANS } from '@/types/billing'

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
      lastUpdatedAt: Date.now(),
    }
  }

  return JSON.parse(raw) as DailyUsage
}

export async function incrementVoiceUsage(
  kv: KVStore,
  userId: string
): Promise<DailyUsage> {
  const usage = await getDailyUsage(kv, userId)
  usage.voiceInteractions += 1
  usage.lastUpdatedAt = Date.now()

  const date = getTodayDate()
  const key = `usage:${userId}:${date}`
  await kv.put(key, JSON.stringify(usage), { expirationTtl: 90000 })

  return usage
}

export async function checkVoiceLimit(
  kv: KVStore,
  userId: string,
  planId: PlanId
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  const usage = await getDailyUsage(kv, userId)
  const limit = PLANS[planId].voiceInteractionsPerDay

  // Pro: always allowed
  if (planId === 'pro') {
    return { allowed: true, used: usage.voiceInteractions, limit, remaining: 999999 }
  }

  const used = usage.voiceInteractions
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}
