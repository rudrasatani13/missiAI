import type { KVStore } from '@/types'
import type { MoodEntry, MoodTimeline, WeeklyMoodInsight } from '@/types/mood'

const KV_PREFIX_TIMELINE = 'mood:timeline:'
const KV_PREFIX_INSIGHT = 'mood:insight:'
const MAX_ENTRIES = 365
const INSIGHT_TTL_SECONDS = 86400

// ─── Empty timeline factory ───────────────────────────────────────────────────

function emptyTimeline(userId: string): MoodTimeline {
  return { userId, entries: [], lastUpdatedAt: 0, version: 1 }
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

export async function getMoodTimeline(
  kv: KVStore,
  userId: string,
): Promise<MoodTimeline> {
  const raw = await kv.get(`${KV_PREFIX_TIMELINE}${userId}`)
  if (!raw) return emptyTimeline(userId)

  try {
    const parsed = JSON.parse(raw) as MoodTimeline
    if (!Array.isArray(parsed.entries)) return emptyTimeline(userId)
    return parsed
  } catch {
    return emptyTimeline(userId)
  }
}

export async function saveMoodTimeline(
  kv: KVStore,
  userId: string,
  timeline: MoodTimeline,
): Promise<void> {
  timeline.version = (timeline.version || 0) + 1
  timeline.lastUpdatedAt = Date.now()
  await kv.put(`${KV_PREFIX_TIMELINE}${userId}`, JSON.stringify(timeline))
}

// ─── Add or Replace Entry ─────────────────────────────────────────────────────

export async function addMoodEntry(
  kv: KVStore,
  userId: string,
  entry: MoodEntry,
): Promise<MoodTimeline> {
  const timeline = await getMoodTimeline(kv, userId)

  // Deduplicate by date — one entry per day max, most recent wins
  const filtered = timeline.entries.filter((e) => e.date !== entry.date)
  filtered.push(entry)

  // Sort ascending by date
  filtered.sort((a, b) => a.date.localeCompare(b.date))

  // Keep only the last MAX_ENTRIES
  if (filtered.length > MAX_ENTRIES) {
    filtered.splice(0, filtered.length - MAX_ENTRIES)
  }

  timeline.entries = filtered
  await saveMoodTimeline(kv, userId, timeline)
  return timeline
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
