import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { awardXP } from '@/lib/gamification/xp-engine'
import type { KVStore } from '@/types'
import type { GamificationData } from '@/types/gamification'
import { getGamificationData } from '@/lib/gamification/streak'
import * as dateUtils from '@/lib/server/utils/date-utils'

const { checkAndIncrementAtomicCounterMock } = vi.hoisted(() => ({
  checkAndIncrementAtomicCounterMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: checkAndIncrementAtomicCounterMock,
}))

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

/** Seed a GamificationData entry directly into the mock KV */
async function seedData(kv: KVStore, userId: string, data: Partial<GamificationData> & { userId: string }) {
  const full: GamificationData = {
    totalXP: 0,
    level: 1,
    avatarTier: 1,
    habits: [],
    achievements: [],
    xpLog: [],
    xpLogDate: '',
    loginStreak: 0,
    lastLoginDate: '',
    lastUpdatedAt: Date.now(),
    ...data,
  }
  await kv.put(`gamification:${userId}`, JSON.stringify(full))
}

/** Returns a date string offset by `days` from today (negative = past) */
function dateOffset(baseDate: string, days: number): string {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('xp-engine', () => {
  let kv: KVStore
  const TODAY = '2023-10-15'

  beforeEach(() => {
    kv = createMockKV()
    vi.spyOn(dateUtils, 'getTodayUTC').mockReturnValue(TODAY)
    // getGamificationData also uses today's date from new Date(). Mock global Date to prevent mismatch.
    vi.setSystemTime(new Date(`${TODAY}T00:00:00.000Z`))
    checkAndIncrementAtomicCounterMock.mockReset()
    checkAndIncrementAtomicCounterMock.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('awardXP grants correct default XP and updates totalXP', async () => {
    const xp = await awardXP(kv, 'user1', 'chat')
    expect(xp).toBe(3) // DAILY_CAPS.chat.xpPerGrant is 3

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(3)
    expect(data.xpLog).toHaveLength(1)
    expect(data.xpLog[0].source).toBe('chat')
    expect(data.xpLog[0].amount).toBe(3)
  })

  it('awardXP does not recreate the legacy snapshot when list-backed v2 records are available', async () => {
    const xp = await awardXP(kv, 'user1', 'chat')

    expect(xp).toBe(3)
    await expect(kv.get('gamification:user1')).resolves.toBeNull()

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(3)
    expect(data.xpLog).toHaveLength(1)
  })

  it('awardXP uses custom amount if provided', async () => {
    const xp = await awardXP(kv, 'user1', 'chat', 10)
    expect(xp).toBe(10)

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(10)
    expect(data.xpLog[0].amount).toBe(10)
  })

  it('awardXP respects daily caps for a source', async () => {
    // 'chat' maxGrants is 3
    let totalAwarded = 0
    totalAwarded += await awardXP(kv, 'user1', 'chat')
    totalAwarded += await awardXP(kv, 'user1', 'chat')
    totalAwarded += await awardXP(kv, 'user1', 'chat')

    const capReached = await awardXP(kv, 'user1', 'chat')
    expect(totalAwarded).toBe(9) // 3 * 3
    expect(capReached).toBe(0)

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(9)
    expect(data.xpLog).toHaveLength(3)
  })

  it('awardXP keeps only capped grants when multiple chat awards race in parallel', async () => {
    let chatGrantCount = 0
    checkAndIncrementAtomicCounterMock.mockImplementation(async (name: string) => {
      if (!name.startsWith('xp-grant:user1:')) {
        return null
      }
      chatGrantCount += 1
      if (chatGrantCount <= 3) {
        return { allowed: true, count: chatGrantCount, remaining: 3 - chatGrantCount }
      }
      return { allowed: false, count: 3, remaining: 0 }
    })

    const grants = await Promise.all([
      awardXP(kv, 'user1', 'chat'),
      awardXP(kv, 'user1', 'chat'),
      awardXP(kv, 'user1', 'chat'),
      awardXP(kv, 'user1', 'chat'),
      awardXP(kv, 'user1', 'chat'),
    ])

    expect(grants.filter((amount) => amount === 3)).toHaveLength(3)
    expect(grants.filter((amount) => amount === 0)).toHaveLength(2)

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(9)
    expect(data.xpLog.filter((entry) => entry.source === 'chat')).toHaveLength(3)
  })

  it('awardXP resets xpLog if xpLogDate is not today', async () => {
    await seedData(kv, 'user1', {
      userId: 'user1',
      totalXP: 50,
      xpLogDate: dateOffset(TODAY, -1), // yesterday
      xpLog: [
        { source: 'chat', amount: 3, timestamp: Date.now() - 86400000 },
        { source: 'chat', amount: 3, timestamp: Date.now() - 86400000 },
        { source: 'chat', amount: 3, timestamp: Date.now() - 86400000 },
      ],
    })

    // Despite having 3 chats yesterday, we should be able to award more today
    const xp = await awardXP(kv, 'user1', 'chat')
    expect(xp).toBe(3)

    const data = await getGamificationData(kv, 'user1')
    expect(data.xpLogDate).toBe(TODAY)
    expect(data.xpLog).toHaveLength(1)
    expect(data.totalXP).toBe(53)
  })

  it('awardXP ignores legacy xp-lock keys and still records the grant', async () => {
    await kv.put('xp-lock:user1', '1')

    const xp = await awardXP(kv, 'user1', 'chat')
    expect(xp).toBe(3)

    const data = await getGamificationData(kv, 'user1')
    expect(data.totalXP).toBe(3)
    expect(data.xpLog).toHaveLength(1)
  })

  it('awardXP returns 0 for unknown source without crashing', async () => {
    // Bypass TS type checking to test runtime safety
    const xp = await awardXP(kv, 'user1', 'unknown_source' as any)
    expect(xp).toBe(0)
  })

  it('awardXP updates loginStreak for login source on consecutive days', async () => {
    await seedData(kv, 'user1', {
      userId: 'user1',
      lastLoginDate: dateOffset(TODAY, -1),
      loginStreak: 5,
    })

    await awardXP(kv, 'user1', 'login')

    const data = await getGamificationData(kv, 'user1')
    expect(data.loginStreak).toBe(6)
    expect(data.lastLoginDate).toBe(TODAY)
  })

  it('awardXP updates loginStreak for chat source on consecutive days', async () => {
    await seedData(kv, 'user1', {
      userId: 'user1',
      lastLoginDate: dateOffset(TODAY, -1),
      loginStreak: 5,
    })

    await awardXP(kv, 'user1', 'chat')

    const data = await getGamificationData(kv, 'user1')
    expect(data.loginStreak).toBe(6)
    expect(data.lastLoginDate).toBe(TODAY)
  })

  it('awardXP resets loginStreak if missed a day', async () => {
    await seedData(kv, 'user1', {
      userId: 'user1',
      lastLoginDate: dateOffset(TODAY, -2), // 2 days ago
      loginStreak: 5,
    })

    await awardXP(kv, 'user1', 'login')

    const data = await getGamificationData(kv, 'user1')
    expect(data.loginStreak).toBe(1)
    expect(data.lastLoginDate).toBe(TODAY)
  })

  it('awardXP ignores loginStreak update if already updated today', async () => {
    await seedData(kv, 'user1', {
      userId: 'user1',
      lastLoginDate: TODAY,
      loginStreak: 5,
    })

    await awardXP(kv, 'user1', 'login')

    const data = await getGamificationData(kv, 'user1')
    expect(data.loginStreak).toBe(5) // unchanged
    expect(data.lastLoginDate).toBe(TODAY)
  })

  it('awardXP gracefully handles KV errors', async () => {
    // Create a broken KV
    const brokenKV: KVStore = {
      get: async () => { throw new Error('KV error') },
      put: async () => {},
      delete: async () => {},
    }

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const xp = await awardXP(brokenKV, 'user1', 'chat')
    expect(xp).toBe(0)

    consoleSpy.mockRestore()
  })
})
