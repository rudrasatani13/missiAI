import type { KVStore } from '@/types'
import {
  deleteMoodEntryRecord,
  getMoodTimelineStateRecord,
  listMoodEntryRecords,
  saveMoodEntryRecord,
  saveMoodTimelineStateRecord,
  supportsMoodList,
} from '@/lib/mood/mood-record-store'
import type { MoodEntry, MoodTimeline, WeeklyMoodInsight } from '@/types/mood'

const KV_PREFIX_TIMELINE = 'mood:timeline:'
const KV_PREFIX_INSIGHT = 'mood:insight:'
const MAX_ENTRIES = 365
const INSIGHT_TTL_SECONDS = 86400

// ─── Empty timeline factory ───────────────────────────────────────────────────

function emptyTimeline(userId: string): MoodTimeline {
  return { userId, entries: [], lastUpdatedAt: 0, version: 1 }
}

function normalizeEntries(entries: MoodEntry[]): MoodEntry[] {
  const byDate = new Map<string, MoodEntry>()
  for (const entry of entries) {
    byDate.set(entry.date, entry)
  }
  const normalized = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  if (normalized.length > MAX_ENTRIES) {
    return normalized.slice(normalized.length - MAX_ENTRIES)
  }
  return normalized
}

async function getLegacyMoodTimeline(kv: KVStore, userId: string): Promise<MoodTimeline | null> {
  const raw = await kv.get(`${KV_PREFIX_TIMELINE}${userId}`)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as MoodTimeline
    if (!Array.isArray(parsed.entries)) return null
    return parsed
  } catch {
    return null
  }
}

async function saveLegacyMoodTimeline(kv: KVStore, userId: string, timeline: MoodTimeline): Promise<void> {
  await kv.put(`${KV_PREFIX_TIMELINE}${userId}`, JSON.stringify(timeline))
}

async function ensureMoodRecordBackfill(kv: KVStore, userId: string): Promise<void> {
  if (!supportsMoodList(kv)) return
  const state = await getMoodTimelineStateRecord(kv, userId)
  if (state) return

  const legacyTimeline = await getLegacyMoodTimeline(kv, userId)
  if (!legacyTimeline) return

  const entries = normalizeEntries(legacyTimeline.entries)
  await Promise.all(entries.map((entry) => saveMoodEntryRecord(kv, userId, entry)))
  await saveMoodTimelineStateRecord(kv, {
    userId,
    version: Math.max(1, legacyTimeline.version || 1),
    lastUpdatedAt: legacyTimeline.lastUpdatedAt || 0,
  })
}

async function readMoodTimelineFromRecords(kv: KVStore, userId: string): Promise<MoodTimeline | null> {
  if (!supportsMoodList(kv)) return null

  const state = await getMoodTimelineStateRecord(kv, userId)
  const entries = normalizeEntries(await listMoodEntryRecords(kv, userId))
  if (!state && entries.length === 0) return null

  return {
    userId,
    entries,
    lastUpdatedAt: state?.lastUpdatedAt ?? 0,
    version: state?.version ?? 1,
  }
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

export async function getMoodTimeline(
  kv: KVStore,
  userId: string,
): Promise<MoodTimeline> {
  await ensureMoodRecordBackfill(kv, userId)

  const recordTimeline = await readMoodTimelineFromRecords(kv, userId)
  if (recordTimeline) return recordTimeline

  const legacyTimeline = await getLegacyMoodTimeline(kv, userId)
  if (legacyTimeline) return legacyTimeline

  return emptyTimeline(userId)
}

export async function saveMoodTimeline(
  kv: KVStore,
  userId: string,
  timeline: MoodTimeline,
): Promise<void> {
  const nextTimeline: MoodTimeline = {
    userId,
    entries: normalizeEntries(timeline.entries),
    version: (timeline.version || 0) + 1,
    lastUpdatedAt: Date.now(),
  }

  if (supportsMoodList(kv)) {
    await ensureMoodRecordBackfill(kv, userId)
    const existingEntries = await listMoodEntryRecords(kv, userId)
    const nextDates = new Set(nextTimeline.entries.map((entry) => entry.date))
    await Promise.all(nextTimeline.entries.map((entry) => saveMoodEntryRecord(kv, userId, entry)))
    await Promise.all(
      existingEntries
        .filter((entry) => !nextDates.has(entry.date))
        .map((entry) => deleteMoodEntryRecord(kv, userId, entry.date)),
    )
    await saveMoodTimelineStateRecord(kv, {
      userId,
      version: nextTimeline.version,
      lastUpdatedAt: nextTimeline.lastUpdatedAt,
    })
  }

  timeline.entries = nextTimeline.entries
  timeline.version = nextTimeline.version
  timeline.lastUpdatedAt = nextTimeline.lastUpdatedAt
  await saveLegacyMoodTimeline(kv, userId, nextTimeline)
}

// ─── Add or Replace Entry ─────────────────────────────────────────────────────

export async function addMoodEntry(
  kv: KVStore,
  userId: string,
  entry: MoodEntry,
): Promise<MoodTimeline> {
  const timeline = await getMoodTimeline(kv, userId)

  let nextEntries = normalizeEntries([...timeline.entries.filter((existing) => existing.date !== entry.date), entry])

  if (supportsMoodList(kv)) {
    await ensureMoodRecordBackfill(kv, userId)
    await saveMoodEntryRecord(kv, userId, entry)
    nextEntries = normalizeEntries(await listMoodEntryRecords(kv, userId))
    if (nextEntries.length > MAX_ENTRIES) {
      const overflow = nextEntries.length - MAX_ENTRIES
      const removedEntries = nextEntries.slice(0, overflow)
      await Promise.all(removedEntries.map((removed) => deleteMoodEntryRecord(kv, userId, removed.date)))
      nextEntries = nextEntries.slice(overflow)
    }
    await saveMoodTimelineStateRecord(kv, {
      userId,
      version: timeline.version + 1,
      lastUpdatedAt: Date.now(),
    })
  }

  const nextTimeline: MoodTimeline = {
    userId,
    entries: nextEntries,
    version: timeline.version + 1,
    lastUpdatedAt: Date.now(),
  }

  await saveLegacyMoodTimeline(kv, userId, nextTimeline)
  return nextTimeline
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getRecentEntries(
  kv: KVStore,
  userId: string,
  days: number,
): Promise<MoodEntry[]> {
  const timeline = await getMoodTimeline(kv, userId)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffDate = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD

  return timeline.entries
    .filter((e) => e.date >= cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Weekly Insight Cache ─────────────────────────────────────────────────────

export async function getCachedWeeklyInsight(
  kv: KVStore,
  userId: string,
): Promise<WeeklyMoodInsight | null> {
  const raw = await kv.get(`${KV_PREFIX_INSIGHT}${userId}`)
  if (!raw) return null

  try {
    const insight = JSON.parse(raw) as WeeklyMoodInsight
    // Expire after 24 hours
    if (Date.now() - insight.generatedAt > INSIGHT_TTL_SECONDS * 1000) return null
    return insight
  } catch {
    return null
  }
}

export async function saveWeeklyInsight(
  kv: KVStore,
  userId: string,
  insight: WeeklyMoodInsight,
): Promise<void> {
  await kv.put(
    `${KV_PREFIX_INSIGHT}${userId}`,
    JSON.stringify(insight),
    { expirationTtl: INSIGHT_TTL_SECONDS },
  )
}
