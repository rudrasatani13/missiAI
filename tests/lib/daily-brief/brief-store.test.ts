import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DailyBrief } from '@/types/daily-brief'
import {
  getTodaysBrief,
  saveBrief,
  markTaskComplete,
  getRateLimit,
  incrementRateLimit,
} from '@/lib/daily-brief/brief-store'

// ─── Mock KV Store ────────────────────────────────────────────────────────────

const store = new Map<string, string>()

const mockKV = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  put: vi.fn(async (key: string, value: string, _opts?: { expirationTtl?: number }) => {
    store.set(key, value)
  }),
  delete: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}

const TEST_USER_ID = 'user_test_store_123'

function makeBrief(overrides: Partial<DailyBrief> = {}): DailyBrief {
  const today = new Date().toISOString().slice(0, 10)
  return {
    date: today,
    userId: TEST_USER_ID,
    greeting: 'Good morning!',
    tasks: [
      {
        id: 'task-aaa',
        title: 'Test task',
        context: 'Just testing',
        source: 'missi',
        completed: false,
        completedAt: null,
      },
      {
        id: 'task-bbb',
        title: 'Second task',
        context: 'Also testing',
        source: 'goal',
        completed: false,
        completedAt: null,
      },
    ],
    challenge: 'Do something cool.',
    viewed: false,
    generatedAt: Date.now(),
    viewedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.clear()
})

// ─── getTodaysBrief Tests ─────────────────────────────────────────────────────

describe('getTodaysBrief', () => {
  it('returns null when KV is empty', async () => {
    const result = await getTodaysBrief(mockKV, TEST_USER_ID)
    expect(result).toBeNull()
  })

  it('returns the stored brief when it exists', async () => {
    const brief = makeBrief()
    const today = new Date().toISOString().slice(0, 10)
    store.set(`daily-brief:${TEST_USER_ID}:${today}`, JSON.stringify(brief))

    const result = await getTodaysBrief(mockKV, TEST_USER_ID)
    expect(result).toBeDefined()
    expect(result?.greeting).toBe('Good morning!')
    expect(result?.tasks).toHaveLength(2)
  })

  it('returns null on malformed JSON', async () => {
    const today = new Date().toISOString().slice(0, 10)
    store.set(`daily-brief:${TEST_USER_ID}:${today}`, '{invalid json!!!}')

    const result = await getTodaysBrief(mockKV, TEST_USER_ID)
    expect(result).toBeNull()
  })
})

// ─── saveBrief Tests ──────────────────────────────────────────────────────────

describe('saveBrief', () => {
  it('saves correctly with TTL', async () => {
    const brief = makeBrief()
    await saveBrief(mockKV, TEST_USER_ID, brief)

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining(`daily-brief:${TEST_USER_ID}:`),
      expect.any(String),
      { expirationTtl: 172800 }, // 48 hours
    )

    // Verify the saved data has the correct userId
    const savedJson = mockKV.put.mock.calls[0][1]
    const saved = JSON.parse(savedJson) as DailyBrief
    expect(saved.userId).toBe(TEST_USER_ID)
  })

  it('always overwrites userId from function parameter', async () => {
    const brief = makeBrief({ userId: 'different_user' })
    await saveBrief(mockKV, TEST_USER_ID, brief)

    const savedJson = mockKV.put.mock.calls[0][1]
    const saved = JSON.parse(savedJson) as DailyBrief
    // SECURITY: userId must be from parameter, not the brief object
    expect(saved.userId).toBe(TEST_USER_ID)
  })
})

// ─── markTaskComplete Tests ───────────────────────────────────────────────────

describe('markTaskComplete', () => {
  it('returns null for non-existent taskId (ownership check)', async () => {
    const brief = makeBrief()
    const today = new Date().toISOString().slice(0, 10)
    store.set(`daily-brief:${TEST_USER_ID}:${today}`, JSON.stringify(brief))

    const result = await markTaskComplete(mockKV, TEST_USER_ID, 'nonexistent-id')
    expect(result).toBeNull()
  })

  it('correctly marks task and returns updated brief', async () => {
    const brief = makeBrief()
    const today = new Date().toISOString().slice(0, 10)
    store.set(`daily-brief:${TEST_USER_ID}:${today}`, JSON.stringify(brief))

    const before = Date.now()
    const result = await markTaskComplete(mockKV, TEST_USER_ID, 'task-aaa')
    const after = Date.now()

    expect(result).toBeDefined()
    const completedTask = result!.tasks.find((t) => t.id === 'task-aaa')
    expect(completedTask?.completed).toBe(true)
    expect(completedTask?.completedAt).toBeGreaterThanOrEqual(before)
    expect(completedTask?.completedAt).toBeLessThanOrEqual(after)

    // Other tasks should remain unchanged
    const otherTask = result!.tasks.find((t) => t.id === 'task-bbb')
    expect(otherTask?.completed).toBe(false)
    expect(otherTask?.completedAt).toBeNull()
  })

  it('returns null when no brief exists today', async () => {
    const result = await markTaskComplete(mockKV, TEST_USER_ID, 'task-aaa')
    expect(result).toBeNull()
  })
})

// ─── Rate Limit Tests ─────────────────────────────────────────────────────────

describe('getRateLimit', () => {
  it('returns 0 when no key exists', async () => {
    const count = await getRateLimit(mockKV, TEST_USER_ID)
    expect(count).toBe(0)
  })

  it('returns the stored count', async () => {
    const today = new Date().toISOString().slice(0, 10)
    store.set(`ratelimit:daily-brief:${TEST_USER_ID}:${today}`, '2')

    const count = await getRateLimit(mockKV, TEST_USER_ID)
    expect(count).toBe(2)
  })
})

describe('incrementRateLimit', () => {
  it('increments correctly from 0', async () => {
    await incrementRateLimit(mockKV, TEST_USER_ID)

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining(`ratelimit:daily-brief:${TEST_USER_ID}:`),
      '1',
      { expirationTtl: 86400 }, // 24 hours
    )
  })

  it('increments correctly from existing count', async () => {
    const today = new Date().toISOString().slice(0, 10)
    store.set(`ratelimit:daily-brief:${TEST_USER_ID}:${today}`, '2')

    await incrementRateLimit(mockKV, TEST_USER_ID)

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining(`ratelimit:daily-brief:${TEST_USER_ID}:`),
      '3',
      { expirationTtl: 86400 },
    )
  })
})
