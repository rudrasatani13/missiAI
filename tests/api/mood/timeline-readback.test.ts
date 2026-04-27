import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVListResult, KVStore } from '@/types'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  getUserPlanMock,
  logErrorMock,
  logRequestMock,
  getTodayInTimezoneMock,
  generateWeeklyInsightMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor() {
      super('Unauthorized')
      this.name = 'AuthenticationError'
    }
  }

  return {
    getVerifiedUserIdMock: vi.fn(),
    unauthorizedResponseMock: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    getCloudflareKVBindingMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    getUserPlanMock: vi.fn(),
    logErrorMock: vi.fn(),
    logRequestMock: vi.fn(),
    getTodayInTimezoneMock: vi.fn(),
    generateWeeklyInsightMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logError: logErrorMock,
  logRequest: logRequestMock,
}))

vi.mock('@/lib/server/utils/date-utils', () => ({
  getTodayInTimezone: getTodayInTimezoneMock,
}))

vi.mock('@/lib/mood/mood-analyzer', () => ({
  generateWeeklyInsight: generateWeeklyInsightMock,
}))

import { GET, POST } from '@/app/api/v1/mood/timeline/route'
import { buildMoodEntryRecordKey, buildMoodTimelineStateKey } from '@/lib/mood/mood-record-store'

type TestKV = KVStore & { _store: Map<string, string> }

function makeKV(): TestKV {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    list: async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
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
    _store: store,
  }
}

function makeRequest(method: 'GET' | 'POST', path: string, body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('mood timeline route read-back proof', () => {
  let kv: TestKV

  beforeEach(() => {
    vi.clearAllMocks()
    kv = makeKV()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getUserPlanMock.mockResolvedValue('pro')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getTodayInTimezoneMock.mockReturnValue('2026-04-26')
    generateWeeklyInsightMock.mockResolvedValue('unused')
  })

  it('persists a mood entry through POST and serves it back on GET', async () => {
    const postRes = await POST(
      makeRequest(
        'POST',
        '/api/v1/mood/timeline?tz=Asia/Kolkata',
        JSON.stringify({ score: 8, label: 'joyful', note: '  Feeling great  ' }),
      ),
    )
    const postBody = await postRes.json() as {
      success: boolean
      data: {
        entry: {
          date: string
          score: number
          label: string
          trigger: string
        }
      }
    }

    expect(postRes.status).toBe(200)
    expect(postBody.data.entry).toMatchObject({
      date: '2026-04-26',
      score: 8,
      label: 'joyful',
      trigger: 'Feeling great',
    })
    expect(kv._store.has(buildMoodEntryRecordKey('user_123', '2026-04-26'))).toBe(true)
    expect(kv._store.has(buildMoodTimelineStateKey('user_123'))).toBe(true)

    const getRes = await GET(makeRequest('GET', '/api/v1/mood/timeline?days=30&tz=Asia/Kolkata'))
    const getBody = await getRes.json() as {
      success: boolean
      data: {
        entries: Array<{
          date: string
          score: number
          label: string
          trigger: string
        }>
        weeklyInsight: null
        totalDaysTracked: number
        averageScore: number
        currentStreak: number
      }
    }

    expect(getRes.status).toBe(200)
    expect(getBody).toEqual({
      success: true,
      data: {
        entries: [
          {
            date: '2026-04-26',
            score: 8,
            label: 'joyful',
            trigger: 'Feeling great',
            recordedAt: expect.any(Number),
          },
        ],
        weeklyInsight: null,
        totalDaysTracked: 1,
        averageScore: 8,
        currentStreak: 1,
      },
    })
    expect(generateWeeklyInsightMock).not.toHaveBeenCalled()
  })
})
