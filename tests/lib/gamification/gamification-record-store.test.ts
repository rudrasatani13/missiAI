import { describe, it, expect, beforeEach } from 'vitest'
import type { KVStore } from '@/types'
import {
  saveHabitRecord,
  getHabitRecord,
  deleteHabitRecord,
  listHabitRecords,
  saveGamificationStateRecord,
  getGamificationStateRecord,
  saveAchievementRecord,
  getAchievementRecord,
  listAchievementRecords,
  deleteAchievementRecord,
  saveGrantRecord,
  getGrantRecord,
  listGrantRecords,
  defaultGamificationStateRecord,
  buildHabitRecordKey,
} from '@/lib/gamification/gamification-record-store'
import type { HabitStreak, Achievement, GamificationGrantRecord } from '@/types/gamification'

// In-memory KV mock
function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
    list: async ({ prefix = '', cursor, limit = 1000 } = {}) => {
      const keys = [...store.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
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

  beforeEach(() => {
    kv = createMockKV()
  })

  it('createMockKV works as expected', async () => {
    await kv.put('test-key', 'test-value')
    expect(await kv.get('test-key')).toBe('test-value')
    await kv.delete('test-key')
    expect(await kv.get('test-key')).toBeNull()
  })

  describe('saveHabitRecord', () => {
    const userId = 'user-1'
    const habit: HabitStreak = {
      nodeId: 'habit-1',
      title: 'Exercise',
      currentStreak: 5,
      longestStreak: 10,
      lastCheckedIn: '2023-10-01',
      totalCheckIns: 20,
    }

    it('saves a valid habit record', async () => {
      const saved = await saveHabitRecord(kv, userId, habit)
      expect(saved).toEqual(habit)

      const stored = await kv.get(buildHabitRecordKey(userId, habit.nodeId))
      expect(JSON.parse(stored!)).toEqual(habit)
    })

    it('normalizes habit record fields', async () => {
      const messyHabit: HabitStreak = {
        nodeId: '  habit-1  ',
        title: '  Exercise  ',
        currentStreak: 5.7,
        longestStreak: -2,
        lastCheckedIn: '2023-10-01 extra',
        totalCheckIns: 20,
      }

      const saved = await saveHabitRecord(kv, userId, messyHabit)
      expect(saved.nodeId).toBe('habit-1')
      expect(saved.title).toBe('Exercise')
      expect(saved.currentStreak).toBe(5)
      expect(saved.longestStreak).toBe(0) // normalized to max(0, floor(v))
      expect(saved.lastCheckedIn).toBe('2023-10-01')
    })

    it('throws error for invalid HabitStreak (empty nodeId)', async () => {
      const invalidHabit: HabitStreak = {
        ...habit,
        nodeId: '',
      }
      await expect(saveHabitRecord(kv, userId, invalidHabit)).rejects.toThrow('Invalid HabitStreak payload')
    })
  })

  describe('getHabitRecord, deleteHabitRecord, listHabitRecords', () => {
    const userId = 'user-1'
    const habit: HabitStreak = {
      nodeId: 'habit-1',
      title: 'Exercise',
      currentStreak: 5,
      longestStreak: 10,
      lastCheckedIn: '2023-10-01',
      totalCheckIns: 20,
    }

    it('gets a habit record', async () => {
      await saveHabitRecord(kv, userId, habit)
      const retrieved = await getHabitRecord(kv, userId, habit.nodeId)
      expect(retrieved).toEqual(habit)
    })

    it('returns null for non-existent habit record', async () => {
      const retrieved = await getHabitRecord(kv, userId, 'non-existent')
      expect(retrieved).toBeNull()
    })

    it('deletes a habit record', async () => {
      await saveHabitRecord(kv, userId, habit)
      await deleteHabitRecord(kv, userId, habit.nodeId)
      const retrieved = await getHabitRecord(kv, userId, habit.nodeId)
      expect(retrieved).toBeNull()
    })

    it('lists habit records', async () => {
      const habit2 = { ...habit, nodeId: 'habit-2', title: 'Reading' }
      await saveHabitRecord(kv, userId, habit)
      await saveHabitRecord(kv, userId, habit2)

      const list = await listHabitRecords(kv, userId)
      expect(list).toHaveLength(2)
      expect(list).toContainEqual(habit)
      expect(list).toContainEqual(habit2)
    })
  })

  describe('saveGamificationStateRecord and getGamificationStateRecord', () => {
    const userId = 'user-1'
    const state = defaultGamificationStateRecord(userId)

    it('saves and gets gamification state record', async () => {
      const saved = await saveGamificationStateRecord(kv, state)
      expect(saved).toEqual(state)

      const retrieved = await getGamificationStateRecord(kv, userId)
      expect(retrieved).toEqual(state)
    })

    it('throws error for invalid state record (empty userId)', async () => {
      const invalidState = { ...state, userId: '' }
      await expect(saveGamificationStateRecord(kv, invalidState)).rejects.toThrow('Invalid GamificationStateRecord payload')
    })
  })

  describe('Achievement Records', () => {
    const userId = 'user-1'
    const achievement: Achievement = {
      id: 'ach-1',
      title: 'First Step',
      description: 'Completed first task',
      xpBonus: 100,
      unlockedAt: 1696156800000,
    }

    it('saves, gets, lists and deletes achievement records', async () => {
      // Save
      const saved = await saveAchievementRecord(kv, userId, achievement)
      expect(saved).toEqual(achievement)

      // Get
      const retrieved = await getAchievementRecord(kv, userId, achievement.id)
      expect(retrieved).toEqual(achievement)

      // List
      const list = await listAchievementRecords(kv, userId)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(achievement)

      // Delete
      await deleteAchievementRecord(kv, userId, achievement.id)
      expect(await getAchievementRecord(kv, userId, achievement.id)).toBeNull()
    })
  })

  describe('Grant Records', () => {
    const userId = 'user-1'
    const grant: GamificationGrantRecord = {
      userId,
      date: '2023-10-01',
      source: 'checkin',
      amount: 10,
      timestamp: 1696156800000,
    }

    it('saves, gets and lists grant records', async () => {
      // Save
      const saved = await saveGrantRecord(kv, grant, 'daily')
      expect(saved).toEqual(grant)

      // Get (using the key builder logic internally)
      const list = await listGrantRecords(kv, userId)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(grant)
    })
  })
})
