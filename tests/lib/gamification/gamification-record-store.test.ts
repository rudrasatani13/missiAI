import { describe, it, expect, beforeEach } from 'vitest'
import {
  getHabitRecord,
  saveHabitRecord,
  buildHabitRecordKey
} from '@/lib/gamification/gamification-record-store'
import type { KVStore } from '@/types'
import type { HabitStreak } from '@/types/gamification'

// In-memory KV mock
function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    list: async ({ prefix = '', cursor, limit = 1000 } = {}) => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    },
  }
}

describe('gamification-record-store - getHabitRecord', () => {
  let kv: KVStore
  const userId = 'user-123'
  const nodeId = 'node-456'

  beforeEach(() => {
    kv = createMockKV()
  })

  it('should return null when the habit record does not exist', async () => {
    const result = await getHabitRecord(kv, userId, nodeId)
    expect(result).toBeNull()
  })

  it('should return the habit streak when a valid record exists', async () => {
    const validHabit: HabitStreak = {
      nodeId,
      title: 'Read a book',
      currentStreak: 5,
      longestStreak: 10,
      lastCheckedIn: '2023-10-01',
      totalCheckIns: 15,
    }

    // Direct insertion into the KV mock
    await kv.put(buildHabitRecordKey(userId, nodeId), JSON.stringify(validHabit))

    const result = await getHabitRecord(kv, userId, nodeId)
    expect(result).toEqual(validHabit)
  })

  it('should normalize partial valid data into a habit streak', async () => {
    const partialHabit = {
      nodeId,
      title: 'Read a book',
      // currentStreak is missing -> should normalize to 0
      // lastCheckedIn is missing -> should normalize to ''
    }

    await kv.put(buildHabitRecordKey(userId, nodeId), JSON.stringify(partialHabit))

    const result = await getHabitRecord(kv, userId, nodeId)

    expect(result).not.toBeNull()
    expect(result?.nodeId).toBe(nodeId)
    expect(result?.title).toBe('Read a book')
    expect(result?.currentStreak).toBe(0)
    expect(result?.longestStreak).toBe(0)
    expect(result?.totalCheckIns).toBe(0)
    expect(result?.lastCheckedIn).toBe('')
  })

  it('should return null when stored data is invalid (e.g., missing nodeId)', async () => {
    const invalidHabit = {
      title: 'No nodeId provided',
    }

    await kv.put(buildHabitRecordKey(userId, nodeId), JSON.stringify(invalidHabit))

    const result = await getHabitRecord(kv, userId, nodeId)
    expect(result).toBeNull()
  })

  it('should return null when stored data is not an object', async () => {
    await kv.put(buildHabitRecordKey(userId, nodeId), JSON.stringify("just a string"))

    const result = await getHabitRecord(kv, userId, nodeId)
    expect(result).toBeNull()
  })
})
