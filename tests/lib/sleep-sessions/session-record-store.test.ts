import { beforeEach, describe, expect, it } from 'vitest'
import type { KVListResult, KVStore } from '@/types'
import type { SleepSessionHistoryEntry, SleepStory } from '@/types/sleep-sessions'
import {
  SLEEP_DAILY_QUOTA_TTL_SECONDS,
  SLEEP_HISTORY_INDEX_LIMIT,
  SLEEP_LAST_STORY_TTL_SECONDS,
  addSleepHistoryIndexEntryId,
  buildSleepDailyQuotaKey,
  buildSleepHistoryEntryKey,
  buildSleepHistoryIndexKey,
  buildSleepLastStoryKey,
  getSleepDailyQuotaRecord,
  getSleepHistoryIndex,
  getSleepLastStoryRecord,
  listSleepHistoryEntries,
  putSleepDailyQuotaRecord,
  putSleepHistoryEntryRecord,
  putSleepLastStoryRecord,
  removeSleepHistoryIndexEntryId,
  saveSleepHistoryIndex,
} from '@/lib/sleep-sessions/session-record-store'

interface KVWithStore extends KVStore {
  _store: Map<string, string>
  _ttls: Map<string, number | undefined>
}

function makeKV(withList = false): KVWithStore {
  const store = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  const kv: KVWithStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value)
      ttls.set(key, options?.expirationTtl)
    },
    delete: async (key: string) => {
      store.delete(key)
      ttls.delete(key)
    },
    _store: store,
    _ttls: ttls,
  }
  if (withList) {
    kv.list = async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? parseInt(cursor, 10) || 0 : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    }
  }
  return kv
}

function makeStory(overrides: Partial<SleepStory> = {}): SleepStory {
  return {
    id: 'story_1',
    mode: 'custom_story',
    title: 'Quiet Ocean Cave',
    text: 'A calm original bedtime story.',
    estimatedDurationSec: 900,
    generatedAt: 100,
    ...overrides,
  }
}

function makeHistoryEntry(overrides: Partial<SleepSessionHistoryEntry> = {}): SleepSessionHistoryEntry {
  return {
    id: 'entry_1',
    date: '2026-04-24T10:00:00.000Z',
    mode: 'library',
    title: 'Ocean Tide',
    completed: true,
    durationSec: 600,
    ...overrides,
  }
}

describe('session-record-store', () => {
  let kv: KVWithStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('round-trips last stories and daily quota records with expected ttl behavior', async () => {
    const story = makeStory({ id: 'story_cache' })
    const quota = {
      userId: 'user_1',
      date: '2026-04-24',
      generationCount: 2,
      ttsCount: 5,
      updatedAt: 200,
    }

    await putSleepLastStoryRecord(kv, 'user_1', story)
    await putSleepDailyQuotaRecord(kv, quota)

    expect(await getSleepLastStoryRecord(kv, 'user_1')).toEqual(story)
    expect(await getSleepDailyQuotaRecord(kv, 'user_1', '2026-04-24')).toEqual(quota)
    expect(kv._ttls.get(buildSleepLastStoryKey('user_1'))).toBe(SLEEP_LAST_STORY_TTL_SECONDS)
    expect(kv._ttls.get(buildSleepDailyQuotaKey('user_1', '2026-04-24'))).toBe(SLEEP_DAILY_QUOTA_TTL_SECONDS)
  })

  it('maintains a bounded newest-first history index', async () => {
    for (let index = 1; index <= SLEEP_HISTORY_INDEX_LIMIT + 2; index++) {
      await addSleepHistoryIndexEntryId(kv, 'user_1', `entry_${index}`)
    }

    const indexRecord = await getSleepHistoryIndex(kv, 'user_1')
    expect(indexRecord.entryIds).toHaveLength(SLEEP_HISTORY_INDEX_LIMIT)
    expect(indexRecord.entryIds[0]).toBe('entry_32')
    expect(indexRecord.entryIds.at(-1)).toBe('entry_3')

    await addSleepHistoryIndexEntryId(kv, 'user_1', 'entry_10')
    expect((await getSleepHistoryIndex(kv, 'user_1')).entryIds[0]).toBe('entry_10')

    await removeSleepHistoryIndexEntryId(kv, 'user_1', 'entry_10')
    expect((await getSleepHistoryIndex(kv, 'user_1')).entryIds).not.toContain('entry_10')
    expect(kv._store.has(buildSleepHistoryIndexKey('user_1'))).toBe(true)
  })

  it('lists history entries in index order when the fallback index exists', async () => {
    const older = makeHistoryEntry({ id: 'entry_old', date: '2026-04-23T09:00:00.000Z', title: 'Older' })
    const newer = makeHistoryEntry({ id: 'entry_new', date: '2026-04-24T09:00:00.000Z', title: 'Newer' })

    await putSleepHistoryEntryRecord(kv, 'user_1', older)
    await putSleepHistoryEntryRecord(kv, 'user_1', newer)
    await saveSleepHistoryIndex(kv, 'user_1', ['entry_old', 'entry_new'])

    expect(await listSleepHistoryEntries(kv, 'user_1')).toEqual([older, newer])
    expect(kv._store.has(buildSleepHistoryEntryKey('user_1', 'entry_old'))).toBe(true)
    expect(kv._store.has(buildSleepHistoryEntryKey('user_1', 'entry_new'))).toBe(true)
  })

  it('falls back to prefix listing and sorts history entries newest-first when kv.list is available', async () => {
    const listedKV = makeKV(true)
    const first = makeHistoryEntry({ id: 'entry_a', date: '2026-04-22T09:00:00.000Z', title: 'First' })
    const second = makeHistoryEntry({ id: 'entry_b', date: '2026-04-24T09:00:00.000Z', title: 'Second' })
    const third = makeHistoryEntry({ id: 'entry_c', date: '2026-04-23T09:00:00.000Z', title: 'Third' })

    await putSleepHistoryEntryRecord(listedKV, 'user_1', first)
    await putSleepHistoryEntryRecord(listedKV, 'user_1', second)
    await putSleepHistoryEntryRecord(listedKV, 'user_1', third)

    expect((await listSleepHistoryEntries(listedKV, 'user_1')).map((entry) => entry.id)).toEqual([
      'entry_b',
      'entry_c',
      'entry_a',
    ])
  })

  it('returns null or empty values for invalid stored payloads', async () => {
    await kv.put(buildSleepLastStoryKey('user_1'), '{bad json')
    await kv.put(buildSleepDailyQuotaKey('user_1', '2026-04-24'), JSON.stringify({ userId: 'user_1' }))

    expect(await getSleepLastStoryRecord(kv, 'user_1')).toBeNull()
    expect(await getSleepDailyQuotaRecord(kv, 'user_1', '2026-04-24')).toEqual({
      userId: 'user_1',
      date: '2026-04-24',
      generationCount: 0,
      ttsCount: 0,
      updatedAt: 0,
    })
    expect(await getSleepHistoryIndex(kv, 'user_1')).toEqual({ entryIds: [], updatedAt: 0 })
  })
})
