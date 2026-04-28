import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveAchievementRecord,
  getAchievementRecord,
  buildAchievementRecordKey,
} from '@/lib/gamification/gamification-record-store'
import type { KVStore } from '@/types'
import type { Achievement } from '@/types/gamification'

// In-memory KV mock
function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    list: async ({ prefix = '', cursor, limit = 1000 } = {}) => {
      const keys = Array.from(store.keys()).filter((key) => key.startsWith(prefix)).sort()
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
  let kv: KVStore
  const userId = 'user-1'

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('saveAchievementRecord', () => {
    it('successfully saves and returns a valid achievement', async () => {
      const validAchievement: Achievement = {
        id: 'ach-1',
        title: 'First Blood',
        description: 'Complete the first task.',
        xpBonus: 50,
        unlockedAt: 1234567890,
      }

      const result = await saveAchievementRecord(kv, userId, validAchievement)

      expect(result).toEqual(validAchievement)

      // Verify it was actually saved in KV correctly
      const savedRaw = await kv.get(buildAchievementRecordKey(userId, validAchievement.id))
      expect(savedRaw).not.toBeNull()
      expect(JSON.parse(savedRaw!)).toEqual(validAchievement)
    })

    it('throws an error if achievement payload is missing id', async () => {
      const invalidAchievement = {
        title: 'First Blood',
        description: 'Complete the first task.',
        xpBonus: 50,
        unlockedAt: 1234567890,
      } as any // cast to any to bypass TS for runtime check testing

      await expect(saveAchievementRecord(kv, userId, invalidAchievement)).rejects.toThrow('Invalid Achievement payload')
    })

    it('throws an error if achievement payload is missing title', async () => {
      const invalidAchievement = {
        id: 'ach-1',
        description: 'Complete the first task.',
        xpBonus: 50,
        unlockedAt: 1234567890,
      } as any

      await expect(saveAchievementRecord(kv, userId, invalidAchievement)).rejects.toThrow('Invalid Achievement payload')
    })

    it('throws an error if achievement payload is missing description', async () => {
      const invalidAchievement = {
        id: 'ach-1',
        title: 'First Blood',
        xpBonus: 50,
        unlockedAt: 1234567890,
      } as any

      await expect(saveAchievementRecord(kv, userId, invalidAchievement)).rejects.toThrow('Invalid Achievement payload')
    })
  })
})
