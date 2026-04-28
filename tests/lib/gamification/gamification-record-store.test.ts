import { describe, it, expect } from 'vitest'
import { saveGamificationStateRecord, type GamificationStateRecord } from '@/lib/gamification/gamification-record-store'
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
        keys: slice.map(name => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : next.toString(),
      }
    },
  }
}

describe('gamification-record-store', () => {
  describe('saveGamificationStateRecord', () => {
    it('should throw an error for an invalid payload', async () => {
      const kv = createMockKV()

      const invalidPayload = {
        userId: '', // invalid because normalizeString(value.userId, 200) will return empty string and normalizeGamificationStateRecord returns null if !userId
        totalXPBaseline: 0,
        loginStreak: 0,
        lastLoginDate: '2023-01-01',
        legacyTodayXPLogDate: '2023-01-01',
        legacyTodayXPLog: [],
        lastUpdatedAt: 0
      } as unknown as GamificationStateRecord

      await expect(saveGamificationStateRecord(kv, invalidPayload)).rejects.toThrow('Invalid GamificationStateRecord payload')

      const nullPayload = null as unknown as GamificationStateRecord
      await expect(saveGamificationStateRecord(kv, nullPayload)).rejects.toThrow('Invalid GamificationStateRecord payload')
    })

    it('should save a valid payload successfully', async () => {
      const kv = createMockKV()

      const validPayload: GamificationStateRecord = {
        userId: 'user-123',
        totalXPBaseline: 100,
        loginStreak: 5,
        lastLoginDate: '2023-10-01',
        legacyTodayXPLogDate: '2023-10-01',
        legacyTodayXPLog: [],
        lastUpdatedAt: 1234567890
      }

      const result = await saveGamificationStateRecord(kv, validPayload)
      expect(result).toEqual(validPayload)

      const rawStored = await kv.get('gamification:v2:state:user-123')
      expect(rawStored).toBe(JSON.stringify(validPayload))
    })
  })
})
