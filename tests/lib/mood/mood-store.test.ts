import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMoodTimeline,
  saveMoodTimeline,
  addMoodEntry,
  getRecentEntries,
  getCachedWeeklyInsight,
  saveWeeklyInsight,
} from '@/lib/mood/mood-store'
import type { KVStore } from '@/types'
import type { MoodEntry, MoodTimeline, WeeklyMoodInsight } from '@/types/mood'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockKV(): KVStore {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}

function makeEntry(date: string, score = 7): MoodEntry {
  return {
    date,
    score: score as MoodEntry['score'],
    label: 'calm',
    trigger: 'test trigger',
    recordedAt: Date.now(),
  }
}

// ─── getMoodTimeline ──────────────────────────────────────────────────────────

describe('getMoodTimeline', () => {
  it('returns empty timeline when KV has no data', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    const result = await getMoodTimeline(kv, 'user-1')

    expect(result.userId).toBe('user-1')
    expect(result.entries).toEqual([])
    expect(result.version).toBe(1)
    expect(kv.get).toHaveBeenCalledWith('mood:timeline:user-1')
  })

  it('returns parsed timeline when data exists', async () => {
    const kv = makeMockKV()
    const timeline: MoodTimeline = {
      userId: 'user-1',
      entries: [makeEntry('2025-04-10')],
      lastUpdatedAt: 1000,
      version: 3,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(timeline))

    const result = await getMoodTimeline(kv, 'user-1')
    expect(result.entries).toHaveLength(1)
    expect(result.version).toBe(3)
  })

  it('returns empty timeline on invalid JSON', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue('not-json{{')

    const result = await getMoodTimeline(kv, 'user-1')
    expect(result.entries).toEqual([])
  })

  it('returns empty timeline when entries is not an array', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(
      JSON.stringify({ userId: 'user-1', entries: 'bad', version: 1, lastUpdatedAt: 0 }),
    )

    const result = await getMoodTimeline(kv, 'user-1')
    expect(result.entries).toEqual([])
  })
})

// ─── saveMoodTimeline ─────────────────────────────────────────────────────────

describe('saveMoodTimeline', () => {
  it('increments version and updates lastUpdatedAt', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.put).mockResolvedValue()
    const timeline: MoodTimeline = {
      userId: 'user-1',
      entries: [],
      lastUpdatedAt: 0,
      version: 4,
    }
    const before = Date.now()

    await saveMoodTimeline(kv, 'user-1', timeline)

    expect(timeline.version).toBe(5)
    expect(timeline.lastUpdatedAt).toBeGreaterThanOrEqual(before)
    expect(kv.put).toHaveBeenCalledWith(
      'mood:timeline:user-1',
      JSON.stringify(timeline),
    )
  })
})

// ─── addMoodEntry ─────────────────────────────────────────────────────────────

describe('addMoodEntry', () => {
  it('adds a new entry', async () => {
    const kv = makeMockKV()
    const existing: MoodTimeline = {
      userId: 'user-1',
      entries: [],
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))
    vi.mocked(kv.put).mockResolvedValue()

    const entry = makeEntry('2025-04-12')
    const result = await addMoodEntry(kv, 'user-1', entry)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].date).toBe('2025-04-12')
  })

  it('replaces an existing entry for the same date (deduplication)', async () => {
    const kv = makeMockKV()
    const oldEntry = makeEntry('2025-04-12', 3)
    const existing: MoodTimeline = {
      userId: 'user-1',
      entries: [oldEntry],
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))
    vi.mocked(kv.put).mockResolvedValue()

    const newEntry = makeEntry('2025-04-12', 8)
    const result = await addMoodEntry(kv, 'user-1', newEntry)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].score).toBe(8)
  })

  it('trims to max 365 entries', async () => {
    const kv = makeMockKV()
    // Seed 365 entries
    const entries: MoodEntry[] = Array.from({ length: 365 }, (_, i) => {
      const d = new Date('2020-01-01')
      d.setDate(d.getDate() + i)
      return makeEntry(d.toISOString().slice(0, 10))
    })
    const existing: MoodTimeline = {
      userId: 'user-1',
      entries,
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))
    vi.mocked(kv.put).mockResolvedValue()

    // Add one more (different date)
    const newEntry = makeEntry('2025-04-13')
    const result = await addMoodEntry(kv, 'user-1', newEntry)

    expect(result.entries).toHaveLength(365)
    // The newest should be present, oldest should be dropped
    expect(result.entries[result.entries.length - 1].date).toBe('2025-04-13')
  })

  it('keeps entries sorted by date ascending', async () => {
    const kv = makeMockKV()
    const existing: MoodTimeline = {
      userId: 'user-1',
      entries: [makeEntry('2025-04-10'), makeEntry('2025-04-12')],
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))
    vi.mocked(kv.put).mockResolvedValue()

    const result = await addMoodEntry(kv, 'user-1', makeEntry('2025-04-11'))

    expect(result.entries.map((e) => e.date)).toEqual([
      '2025-04-10',
      '2025-04-11',
      '2025-04-12',
    ])
  })
})

// ─── getRecentEntries ─────────────────────────────────────────────────────────

describe('getRecentEntries', () => {
  it('returns only entries within the requested date range', async () => {
    const kv = makeMockKV()
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const oldDate = new Date(today)
    oldDate.setDate(today.getDate() - 31)
    const oldStr = oldDate.toISOString().slice(0, 10)

    const existing: MoodTimeline = {
      userId: 'user-1',
      entries: [makeEntry(todayStr), makeEntry(oldStr)],
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))

    const result = await getRecentEntries(kv, 'user-1', 30)

    expect(result).toHaveLength(1)
    expect(result[0].date).toBe(todayStr)
  })

  it('returns entries sorted ascending by date', async () => {
    const kv = makeMockKV()
    // Use dates relative to today so they always fall within a 30-day window
    const today = new Date()
    const d = (offset: number) => {
      const dt = new Date(today)
      dt.setDate(today.getDate() - offset)
      return dt.toISOString().slice(0, 10)
    }
    const dates = [d(1), d(3), d(2)] // unsorted: yesterday, 3 days ago, 2 days ago
    const existing: MoodTimeline = {
      userId: 'user-1',
      entries: dates.map((date) => makeEntry(date)),
      lastUpdatedAt: 0,
      version: 1,
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(existing))

    const result = await getRecentEntries(kv, 'user-1', 30)

    expect(result.map((e) => e.date)).toEqual([d(3), d(2), d(1)])
  })
})

// ─── getCachedWeeklyInsight ───────────────────────────────────────────────────

describe('getCachedWeeklyInsight', () => {
  it('returns null when KV has no data', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue(null)

    const result = await getCachedWeeklyInsight(kv, 'user-1')
    expect(result).toBeNull()
  })

  it('returns the insight when valid and fresh', async () => {
    const kv = makeMockKV()
    const insight: WeeklyMoodInsight = {
      weekLabel: 'April 7–13, 2025',
      averageScore: 6.5,
      dominantLabel: 'calm',
      bestDay: '2025-04-10',
      bestDayLabel: 'joyful',
      insight: 'Great week!',
      generatedAt: Date.now(),
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(insight))

    const result = await getCachedWeeklyInsight(kv, 'user-1')
    expect(result).not.toBeNull()
    expect(result?.insight).toBe('Great week!')
  })

  it('returns null for expired cache (generatedAt > 24h ago)', async () => {
    const kv = makeMockKV()
    const insight: WeeklyMoodInsight = {
      weekLabel: 'April 1–7, 2025',
      averageScore: 5,
      dominantLabel: 'neutral',
      bestDay: '2025-04-05',
      bestDayLabel: 'calm',
      insight: 'Old insight',
      generatedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    }
    vi.mocked(kv.get).mockResolvedValue(JSON.stringify(insight))

    const result = await getCachedWeeklyInsight(kv, 'user-1')
    expect(result).toBeNull()
  })

  it('returns null on invalid JSON', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.get).mockResolvedValue('corrupted{{')

    const result = await getCachedWeeklyInsight(kv, 'user-1')
    expect(result).toBeNull()
  })
})

// ─── saveWeeklyInsight ────────────────────────────────────────────────────────

describe('saveWeeklyInsight', () => {
  it('saves with correct KV key and TTL', async () => {
    const kv = makeMockKV()
    vi.mocked(kv.put).mockResolvedValue()
    const insight: WeeklyMoodInsight = {
      weekLabel: 'April 7–13, 2025',
      averageScore: 7,
      dominantLabel: 'calm',
      bestDay: '2025-04-09',
      bestDayLabel: 'excited',
      insight: 'You did well this week.',
      generatedAt: Date.now(),
    }

    await saveWeeklyInsight(kv, 'user-1', insight)

    expect(kv.put).toHaveBeenCalledWith(
      'mood:insight:user-1',
      JSON.stringify(insight),
      { expirationTtl: 86400 },
    )
  })
})
