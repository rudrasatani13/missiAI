import type { KVStore } from '@/types'
import type { SleepStory, SleepSessionHistoryEntry } from '@/types/sleep-sessions'
import {
  deleteSleepHistoryEntryRecord,
  getSleepDailyQuotaRecord,
  getSleepLastStoryRecord,
  listSleepHistoryEntries,
  putSleepLastStoryRecord,
  putSleepDailyQuotaRecord,
  putSleepHistoryEntryRecord,
  saveSleepHistoryIndex,
  SLEEP_HISTORY_INDEX_LIMIT,
} from '@/lib/sleep-sessions/session-record-store'

export async function cacheGeneratedStory(kv: KVStore, userId: string, story: SleepStory): Promise<void> {
  await putSleepLastStoryRecord(kv, userId, story)
}

export async function getLastGeneratedStory(kv: KVStore, userId: string): Promise<SleepStory | null> {
  return getSleepLastStoryRecord(kv, userId)
}

function getHistoryEntryIds(history: SleepSessionHistoryEntry[]): string[] {
  return history
    .map((entry) => (typeof entry?.id === 'string' ? entry.id.trim() : ''))
    .filter(Boolean)
}

export async function addToHistory(kv: KVStore, userId: string, entry: SleepSessionHistoryEntry): Promise<void> {
  const currentHistory = await listSleepHistoryEntries(kv, userId, SLEEP_HISTORY_INDEX_LIMIT)
  const nextHistory = [entry, ...currentHistory.filter((existingEntry) => existingEntry?.id !== entry.id)]
    .slice(0, SLEEP_HISTORY_INDEX_LIMIT)

  const storedHistory = await Promise.all(
    nextHistory.map(async (historyEntry) => {
      try {
        return await putSleepHistoryEntryRecord(kv, userId, historyEntry)
      } catch {
        return null
      }
    }),
  )

  const storedEntryIds = storedHistory
    .filter((historyEntry): historyEntry is SleepSessionHistoryEntry => historyEntry !== null)
    .map((historyEntry) => historyEntry.id)

  await saveSleepHistoryIndex(kv, userId, storedEntryIds)

  const removedEntryIds = getHistoryEntryIds(currentHistory)
    .filter((entryId) => !storedEntryIds.includes(entryId))

  await Promise.all(
    removedEntryIds.map(async (entryId) => {
      try {
        await deleteSleepHistoryEntryRecord(kv, userId, entryId)
      } catch {
      }
    }),
  )
}

export async function getHistory(kv: KVStore, userId: string, limit: number = 20): Promise<SleepSessionHistoryEntry[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 20
  if (safeLimit === 0) return []

  return (await listSleepHistoryEntries(kv, userId, SLEEP_HISTORY_INDEX_LIMIT)).slice(0, safeLimit)
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
  const quota = await getSleepDailyQuotaRecord(kv, userId, today)
  const count = quota?.generationCount ?? 0

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
  const quota = await getSleepDailyQuotaRecord(kv, userId, today)
  const count = quota?.ttsCount ?? 0

  const limit = getTTSLimit(planId)
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count)
  }
}

export async function incrementGenerationRateLimit(kv: KVStore, userId: string): Promise<void> {
  const today = getTodayStr()
  const quota = await getSleepDailyQuotaRecord(kv, userId, today)

  await putSleepDailyQuotaRecord(kv, {
    userId,
    date: today,
    generationCount: (quota?.generationCount ?? 0) + 1,
    ttsCount: quota?.ttsCount ?? 0,
    updatedAt: Date.now(),
  })
}

export async function incrementTTSRateLimit(kv: KVStore, userId: string): Promise<void> {
  const today = getTodayStr()
  const quota = await getSleepDailyQuotaRecord(kv, userId, today)

  await putSleepDailyQuotaRecord(kv, {
    userId,
    date: today,
    generationCount: quota?.generationCount ?? 0,
    ttsCount: (quota?.ttsCount ?? 0) + 1,
    updatedAt: Date.now(),
  })
}
