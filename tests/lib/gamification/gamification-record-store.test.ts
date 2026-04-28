import { describe, it, expect } from 'vitest'
import { getGamificationStateRecord, buildGamificationStateRecordKey } from '@/lib/gamification/gamification-record-store'
import type { KVStore } from '@/types'

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

describe('gamification-record-store', () => {
  describe('getGamificationStateRecord', () => {
    it('returns null if record is not found', async () => {
      const kv = createMockKV()
      const record = await getGamificationStateRecord(kv, 'user-1')
      expect(record).toBeNull()
    })

    it('returns normalized record if found in KV', async () => {
      const kv = createMockKV()
      const userId = 'user-2'
      const key = buildGamificationStateRecordKey(userId)
      const rawData = {
        userId,
        totalXPBaseline: 100,
        loginStreak: 5,
        lastLoginDate: '2023-01-01',
        legacyTodayXPLogDate: '',
        legacyTodayXPLog: [],
        lastUpdatedAt: 1234567890
      }
      await kv.put(key, JSON.stringify(rawData))

      const record = await getGamificationStateRecord(kv, userId)
      expect(record).toEqual(rawData)
    })

    it('returns null if KV returns invalid JSON', async () => {
      const kv = createMockKV()
      const userId = 'user-3'
      const key = buildGamificationStateRecordKey(userId)
      await kv.put(key, '{ invalid json }')

      const record = await getGamificationStateRecord(kv, userId)
      expect(record).toBeNull()
    })

    it('normalizes missing fields with default values', async () => {
      const kv = createMockKV()
      const userId = 'user-4'
      const key = buildGamificationStateRecordKey(userId)
      const rawData = {
        userId, // only providing userId
      }
      await kv.put(key, JSON.stringify(rawData))

      const record = await getGamificationStateRecord(kv, userId)
      expect(record).toEqual({
        userId,
        totalXPBaseline: 0,
        loginStreak: 0,
        lastLoginDate: '',
        legacyTodayXPLogDate: '',
        legacyTodayXPLog: [],
        lastUpdatedAt: 0
      })
    })
  })
})
