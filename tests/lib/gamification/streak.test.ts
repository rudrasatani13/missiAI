import { describe, it, expect, beforeEach } from 'vitest'
import {
  getGamificationData,
  checkInHabit,
  calculateLevel,
} from '@/lib/gamification/streak'
import type { KVStore } from '@/types'
import type { GamificationData } from '@/types/gamification'

// In-memory KV mock
function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
  }
}

/** Seed a GamificationData entry directly into the mock KV */
async function seedData(kv: KVStore, userId: string, data: GamificationData) {
  await kv.put(`gamification:${userId}`, JSON.stringify(data))
}

/** Returns a date string offset by `days` from today (negative = past) */
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('gamification streak', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = createMockKV()
  })

  it('getGamificationData returns default for new user', async () => {
    const data = await getGamificationData(kv, 'u1')
    expect(data.totalXP).toBe(0)
    expect(data.level).toBe(1)
    expect(data.habits).toEqual([])
  })

  it('checkInHabit creates new HabitStreak on first check-in', async () => {
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Morning run')
    expect(result.habit.currentStreak).toBe(1)
    expect(result.habit.totalCheckIns).toBe(1)
    expect(result.xpEarned).toBe(10)
    expect(result.alreadyCheckedIn).toBe(false)
  })

  it('checkInHabit does not double-count on same day', async () => {
    await checkInHabit(kv, 'u1', 'node-1', 'Morning run')
    const second = await checkInHabit(kv, 'u1', 'node-1', 'Morning run')
    expect(second.alreadyCheckedIn).toBe(true)
    expect(second.xpEarned).toBe(0)

    const data = await getGamificationData(kv, 'u1')
    expect(data.totalXP).toBe(10)
  })

  it('checkInHabit resets streak if last check-in was 2+ days ago', async () => {
    await seedData(kv, 'u1', {
      userId: 'u1',
      totalXP: 50,
      level: 1,
      habits: [
        {
          nodeId: 'node-1',
          title: 'Morning run',
          currentStreak: 5,
          longestStreak: 5,
          lastCheckedIn: dateOffset(-3),
          totalCheckIns: 5,
        },
      ],
      lastUpdatedAt: Date.now(),
    })
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Morning run')
    expect(result.habit.currentStreak).toBe(1)
  })

  it('checkInHabit increments streak on consecutive day and fires 7-day milestone', async () => {
    await seedData(kv, 'u1', {
      userId: 'u1',
      totalXP: 60,
      level: 1,
      habits: [
        {
          nodeId: 'node-1',
          title: 'Morning run',
          currentStreak: 6,
          longestStreak: 6,
          lastCheckedIn: dateOffset(-1),
          totalCheckIns: 6,
        },
      ],
      lastUpdatedAt: Date.now(),
    })
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Morning run')
    expect(result.habit.currentStreak).toBe(7)
    expect(result.milestone).toBe(7)
    expect(result.xpEarned).toBe(10 + 50) // base + milestone
  })

  it('checkInHabit fires 30-day milestone', async () => {
    await seedData(kv, 'u1', {
      userId: 'u1',
      totalXP: 290,
      level: 2,
      habits: [
        {
          nodeId: 'node-1',
          title: 'Meditation',
          currentStreak: 29,
          longestStreak: 29,
          lastCheckedIn: dateOffset(-1),
          totalCheckIns: 29,
        },
      ],
      lastUpdatedAt: Date.now(),
    })
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Meditation')
    expect(result.milestone).toBe(30)
    expect(result.xpEarned).toBe(10 + 200)
  })

  it('checkInHabit fires 100-day milestone', async () => {
    await seedData(kv, 'u1', {
      userId: 'u1',
      totalXP: 990,
      level: 9,
      habits: [
        {
          nodeId: 'node-1',
          title: 'Cold shower',
          currentStreak: 99,
          longestStreak: 99,
          lastCheckedIn: dateOffset(-1),
          totalCheckIns: 99,
        },
      ],
      lastUpdatedAt: Date.now(),
    })
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Cold shower')
    expect(result.milestone).toBe(100)
    expect(result.xpEarned).toBe(10 + 500)
  })

  it('calculateLevel returns 1 for 0 XP', () => {
    expect(calculateLevel(0)).toBe(1)
  })

  it('calculateLevel returns correct levels', () => {
    expect(calculateLevel(100)).toBe(1)
    expect(calculateLevel(199)).toBe(1)
    expect(calculateLevel(200)).toBe(2)
    expect(calculateLevel(550)).toBe(5)
  })

  it('longestStreak updates correctly', async () => {
    await seedData(kv, 'u1', {
      userId: 'u1',
      totalXP: 90,
      level: 1,
      habits: [
        {
          nodeId: 'node-1',
          title: 'Reading',
          currentStreak: 9,
          longestStreak: 9,
          lastCheckedIn: dateOffset(-1),
          totalCheckIns: 9,
        },
      ],
      lastUpdatedAt: Date.now(),
    })
    const result = await checkInHabit(kv, 'u1', 'node-1', 'Reading')
    expect(result.habit.currentStreak).toBe(10)
    expect(result.habit.longestStreak).toBe(10)
  })
})
