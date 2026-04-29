import { describe, it, expect, vi } from 'vitest'
import {
  listHabitRecords,
  saveHabitRecord,
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

describe('listHabitRecords', () => {
  it('should list and normalize valid habit records correctly', async () => {
    const kv = createMockKV()
    const userId = 'user-123'

    await saveHabitRecord(kv, userId, {
      nodeId: 'habit-b',
      title: 'Habit B',
      currentStreak: 2,
      longestStreak: 5,
      lastCheckedIn: '2023-01-02',
      totalCheckIns: 10,
    })

    await saveHabitRecord(kv, userId, {
      nodeId: 'habit-a',
      title: 'Habit A',
      currentStreak: 1,
      longestStreak: 3,
      lastCheckedIn: '2023-01-01',
      totalCheckIns: 5,
    })

    const records = await listHabitRecords(kv, userId)

    expect(records).toHaveLength(2)
    // Should be sorted by nodeId
    expect(records[0].nodeId).toBe('habit-a')
    expect(records[1].nodeId).toBe('habit-b')
  })

  it('should return an empty array if kv.list is not supported', async () => {
    const kv = createMockKV()
    // Remove the list method
    const kvWithoutList = { ...kv, list: undefined } as unknown as KVStore

    const records = await listHabitRecords(kvWithoutList, 'user-123')
    expect(records).toEqual([])
  })

  it('should filter out invalid records and continue', async () => {
    const kv = createMockKV()
    const userId = 'user-123'

    await saveHabitRecord(kv, userId, {
      nodeId: 'habit-a',
      title: 'Habit A',
      currentStreak: 1,
      longestStreak: 3,
      lastCheckedIn: '2023-01-01',
      totalCheckIns: 5,
    })

    // Insert an invalid record manually
    await kv.put(`v2:gamification:habit:${userId}:invalid-habit`, JSON.stringify({
      nodeId: null, // Invalid nodeId
      title: 'Invalid Habit',
    }))

    const records = await listHabitRecords(kv, userId)

    expect(records).toHaveLength(1)
    expect(records[0].nodeId).toBe('habit-a')
  })

  it('should return an empty array if kv.list throws an error', async () => {
    const kv = createMockKV()

    // Override list to throw an error
    const errorKV: KVStore = {
      ...kv,
      list: vi.fn().mockRejectedValue(new Error('KV List Error')),
    }

    const records = await listHabitRecords(errorKV, 'user-123')
    expect(records).toEqual([])
  })
})
