import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { MoodEntry, WeeklyMoodInsight } from '@/types/mood'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getRecentEntriesMock,
  getCachedWeeklyInsightMock,
  saveWeeklyInsightMock,
  addMoodEntryMock,
  generateWeeklyInsightMock,
  logErrorMock,
  logRequestMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  getUserPlanMock,
  getTodayInTimezoneMock,
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
      () => new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    getCloudflareKVBindingMock: vi.fn(),
    getRecentEntriesMock: vi.fn(),
    getCachedWeeklyInsightMock: vi.fn(),
    saveWeeklyInsightMock: vi.fn(),
    addMoodEntryMock: vi.fn(),
    generateWeeklyInsightMock: vi.fn(),
    logErrorMock: vi.fn(),
    logRequestMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    getUserPlanMock: vi.fn(),
    getTodayInTimezoneMock: vi.fn(),
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

vi.mock('@/lib/mood/mood-store', () => ({
  getRecentEntries: getRecentEntriesMock,
  getCachedWeeklyInsight: getCachedWeeklyInsightMock,
  saveWeeklyInsight: saveWeeklyInsightMock,
  addMoodEntry: addMoodEntryMock,
}))

vi.mock('@/lib/mood/mood-analyzer', () => ({
  generateWeeklyInsight: generateWeeklyInsightMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logError: logErrorMock,
  logRequest: logRequestMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/server/utils/date-utils', () => ({
  getTodayInTimezone: getTodayInTimezoneMock,
}))

import { GET, POST } from '@/app/api/v1/mood/timeline/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeRequest(
  method: 'GET' | 'POST',
  path = '/api/v1/mood/timeline',
  body?: string,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

function makeEntry(overrides: Partial<MoodEntry> = {}): MoodEntry {
  return {
    date: '2026-04-26',
    score: 7,
    label: 'calm',
    trigger: 'manual entry',
    recordedAt: 1000,
    ...overrides,
  }
}

describe('mood timeline parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getUserPlanMock.mockResolvedValue('free')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getTodayInTimezoneMock.mockReturnValue('2026-04-26')
    getRecentEntriesMock.mockResolvedValue([])
    getCachedWeeklyInsightMock.mockResolvedValue(null)
    saveWeeklyInsightMock.mockResolvedValue(undefined)
    addMoodEntryMock.mockResolvedValue(undefined)
    generateWeeklyInsightMock.mockResolvedValue('You felt steadier toward the end of the week.')
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 503 when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('falls back invalid days to 30 and uses cached weekly insight on GET', async () => {
    const cachedInsight: WeeklyMoodInsight = {
      weekLabel: 'April 20–April 26, 2026',
      averageScore: 7.5,
      dominantLabel: 'calm',
      bestDay: '2026-04-26',
      bestDayLabel: 'joyful',
      insight: 'Cached insight',
      generatedAt: Date.now(),
    }
    const entries = [makeEntry({ date: '2026-04-26', score: 8 }), makeEntry({ date: '2026-04-25', score: 7 })]
    const allEntries = [
      makeEntry({ date: '2026-04-25', score: 7 }),
      makeEntry({ date: '2026-04-26', score: 8, label: 'joyful' }),
    ]

    getCachedWeeklyInsightMock.mockResolvedValueOnce(cachedInsight)
    getRecentEntriesMock.mockImplementation(async (_kv, _userId, days: number) => {
      if (days === 30) return entries
      if (days === 365) return allEntries
      return []
    })

    const res = await GET(makeRequest('GET', '/api/v1/mood/timeline?days=bad&tz=Asia/Kolkata'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        entries,
        weeklyInsight: cachedInsight,
        totalDaysTracked: 2,
        averageScore: 7.5,
        currentStreak: 2,
      },
    })
    expect(getRecentEntriesMock).toHaveBeenCalledWith(kvMock, 'user_123', 30)
    expect(getRecentEntriesMock).toHaveBeenCalledWith(kvMock, 'user_123', 365)
    expect(getTodayInTimezoneMock).toHaveBeenCalledWith('Asia/Kolkata')
    expect(generateWeeklyInsightMock).not.toHaveBeenCalled()
  })

  it('generates and saves a weekly insight when cache is missing on GET', async () => {
    const windowEntries = [makeEntry({ date: '2026-04-26' })]
    const last7 = [
      makeEntry({ date: '2026-04-20', score: 5, label: 'neutral' }),
      makeEntry({ date: '2026-04-22', score: 6, label: 'calm' }),
      makeEntry({ date: '2026-04-26', score: 8, label: 'joyful' }),
    ]
    const allEntries = [...last7, makeEntry({ date: '2026-04-10', score: 4, label: 'sad' })]

    getCachedWeeklyInsightMock.mockResolvedValueOnce(null)
    getRecentEntriesMock.mockImplementation(async (_kv, _userId, days: number) => {
      if (days === 30) return windowEntries
      if (days === 7) return last7
      if (days === 365) return allEntries
      return []
    })
    generateWeeklyInsightMock.mockResolvedValueOnce('You seem to be bouncing back after a harder start to the week.')

    const res = await GET(makeRequest('GET'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.weeklyInsight).toMatchObject({
      insight: 'You seem to be bouncing back after a harder start to the week.',
      bestDay: '2026-04-26',
      bestDayLabel: 'joyful',
      dominantLabel: 'neutral',
    })
    expect(saveWeeklyInsightMock).toHaveBeenCalledWith(
      kvMock,
      'user_123',
      expect.objectContaining({ insight: 'You seem to be bouncing back after a harder start to the week.' }),
    )
  })

  it('returns 503 when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest('POST', '/api/v1/mood/timeline', JSON.stringify({ score: 7, label: 'calm' })))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Service unavailable',
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('POST', '/api/v1/mood/timeline', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON body',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns validation error for invalid mood payload on POST', async () => {
    const res = await POST(makeRequest('POST', '/api/v1/mood/timeline', JSON.stringify({ score: 11, label: 'calm' })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    })
  })

  it('creates a timezone-aware manual mood entry on POST', async () => {
    const res = await POST(
      makeRequest(
        'POST',
        '/api/v1/mood/timeline?tz=Asia/Kolkata',
        JSON.stringify({ score: 8, label: 'joyful', note: '  Feeling great  ' }),
      ),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: {
        entry: {
          date: '2026-04-26',
          score: 8,
          label: 'joyful',
          trigger: 'Feeling great',
        },
      },
    })
    expect(getTodayInTimezoneMock).toHaveBeenCalledWith('Asia/Kolkata')
    expect(addMoodEntryMock).toHaveBeenCalledWith(
      kvMock,
      'user_123',
      expect.objectContaining({
        date: '2026-04-26',
        score: 8,
        label: 'joyful',
        trigger: 'Feeling great',
      }),
    )
  })
})
