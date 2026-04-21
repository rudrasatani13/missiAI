import type { KVStore } from '@/types'
import type { SleepStory, SleepSessionHistoryEntry, SleepSession } from '@/types/sleep-sessions'

export async function getActiveSleepSession(kv: KVStore, userId: string): Promise<SleepSession | null> {
  try {
    const session = await kv.get<SleepSession>(`sleep-session:${userId}`, { type: 'json' })
    return session || null
  } catch {
    return null
  }
}

export async function cacheGeneratedStory(kv: KVStore, userId: string, story: SleepStory): Promise<void> {
  const key = `sleep-story:last:${userId}`
  const ttl = 86400 // 24 hours
  await kv.put(key, JSON.stringify(story), { expirationTtl: ttl })
}

export async function getLastGeneratedStory(kv: KVStore, userId: string): Promise<SleepStory | null> {
  const key = `sleep-story:last:${userId}`
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SleepStory
  } catch {
    return null
  }
}

export async function addToHistory(kv: KVStore, userId: string, entry: SleepSessionHistoryEntry): Promise<void> {
  const key = `sleep-sessions:history:${userId}`
  const raw = await kv.get(key)
  let history: SleepSessionHistoryEntry[] = []
  if (raw) {
    try {
      history = JSON.parse(raw)
    } catch {
      history = []
    }
  }

  history.unshift(entry)
  if (history.length > 30) {
    history = history.slice(0, 30)
  }

  await kv.put(key, JSON.stringify(history))
}

export async function getHistory(kv: KVStore, userId: string, limit: number = 20): Promise<SleepSessionHistoryEntry[]> {
  const key = `sleep-sessions:history:${userId}`
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const history = JSON.parse(raw) as SleepSessionHistoryEntry[]
    return history.slice(0, limit)
  } catch {
    return []
  }
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getGenerationLimit(planId: string): number {
  return planId === 'free' ? 3 : 20
}

function getTTSLimit(planId: string): number {
  return planId === 'free' ? 10 : 100
}

export async function checkGenerationRateLimit(
  kv: KVStore,
  userId: string,
  planId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const today = getTodayStr()
  const key = `ratelimit:sleep-story-gen:${userId}:${today}`
  const raw = await kv.get(key)
  let count = 0
  if (raw) count = parseInt(raw, 10)

  const limit = getGenerationLimit(planId)
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count)
  }
}

export async function checkTTSRateLimit(
  kv: KVStore,
  userId: string,
  planId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const today = getTodayStr()
  const key = `ratelimit:sleep-story-tts:${userId}:${today}`
  const raw = await kv.get(key)
  let count = 0
  if (raw) count = parseInt(raw, 10)

  const limit = getTTSLimit(planId)
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count)
  }
}

export async function incrementGenerationRateLimit(kv: KVStore, userId: string): Promise<void> {
  const today = getTodayStr()
  const key = `ratelimit:sleep-story-gen:${userId}:${today}`
  const raw = await kv.get(key)
  let count = 0
  if (raw) count = parseInt(raw, 10)
  
  await kv.put(key, String(count + 1), { expirationTtl: 86400 })
}

export async function incrementTTSRateLimit(kv: KVStore, userId: string): Promise<void> {
  const today = getTodayStr()
  const key = `ratelimit:sleep-story-tts:${userId}:${today}`
  const raw = await kv.get(key)
  let count = 0
  if (raw) count = parseInt(raw, 10)

  await kv.put(key, String(count + 1), { expirationTtl: 86400 })
}
