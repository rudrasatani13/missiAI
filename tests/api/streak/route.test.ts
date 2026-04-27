import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { GamificationData } from '@/types/gamification'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  logRequestMock,
  logErrorMock,
  getGamificationDataMock,
  checkInHabitMock,
  awardXPMock,
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
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    getGamificationDataMock: vi.fn(),
    checkInHabitMock: vi.fn(),
    awardXPMock: vi.fn(),
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
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/gamification/streak', () => ({
  getGamificationData: getGamificationDataMock,
  checkInHabit: checkInHabitMock,
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: awardXPMock,
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: vi.fn(async () => null),
}))

import { GET, POST } from '@/app/api/v1/streak/route'

const kvMock = {
  get: vi.fn(async () => null as string | null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeGamificationData(): GamificationData {
  return {
    userId: 'user_123',
    totalXP: 100,
    level: 2,
    avatarTier: 1,
    habits: [],
    achievements: [],
    xpLog: [],
    xpLogDate: '2026-04-26',
    loginStreak: 3,
    lastLoginDate: '2026-04-26',
    lastUpdatedAt: 0,
  }
}

function makeRequest(method: 'GET' | 'POST', body?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/streak', {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('streak parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getUserPlanMock.mockResolvedValue('free')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getGamificationDataMock.mockResolvedValue(makeGamificationData())
    checkInHabitMock.mockResolvedValue({
      streak: 5,
      milestone: 'week',
      xpAwarded: 10,
    })
    awardXPMock.mockResolvedValue(5)
  })

  // ─── GET tests ─────────────────────────────────────────────────────────────

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 429 when GET is rate limited', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 30,
    })

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalled()
  })

  it('returns null data when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: null })
  })

  it('awards login XP when no cooldown exists and returns gamification data on GET', async () => {
    kvMock.get.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: makeGamificationData() })
    expect(awardXPMock).toHaveBeenCalledWith(kvMock, 'user_123', 'login')
    expect(kvMock.put).toHaveBeenCalledWith('xp-cooldown:login:user_123', '1', { expirationTtl: 86400 })
  })

  it('skips login XP when cooldown exists on GET', async () => {
    kvMock.get.mockResolvedValueOnce('1')

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    expect(awardXPMock).not.toHaveBeenCalled()
    expect(kvMock.put).not.toHaveBeenCalledWith('xp-cooldown:login:user_123', expect.anything(), expect.anything())
  })

  it('returns 200 with null data when gamification data fetch fails on GET', async () => {
    getGamificationDataMock.mockRejectedValueOnce(new Error('kv read failed'))

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: null })
    expect(logErrorMock).toHaveBeenCalledWith('streak.get.error', expect.any(Error), 'user_123')
  })

  // ─── POST tests ────────────────────────────────────────────────────────────

  it('returns 401 when auth fails on POST', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await POST(makeRequest('POST', JSON.stringify({ nodeId: 'n1', habitTitle: 'Run' })))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 429 when POST is rate limited', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 30,
    })

    const res = await POST(makeRequest('POST', JSON.stringify({ nodeId: 'n1', habitTitle: 'Run' })))

    expect(res.status).toBe(429)
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('POST', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns 400 for missing nodeId on POST', async () => {
    const res = await POST(makeRequest('POST', JSON.stringify({ habitTitle: 'Run' })))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 503 when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest('POST', JSON.stringify({ nodeId: 'n1', habitTitle: 'Run' })))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  it('checks in habit and returns result on POST', async () => {
    const res = await POST(makeRequest('POST', JSON.stringify({ nodeId: 'n1', habitTitle: 'Run' })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { streak: 5, milestone: 'week', xpAwarded: 10 },
    })
    expect(checkInHabitMock).toHaveBeenCalledWith(kvMock, 'user_123', 'n1', 'Run')
    expect(logRequestMock).toHaveBeenCalledWith(
      'streak.checkin',
      'user_123',
      expect.any(Number),
      { nodeId: 'n1', milestone: 'week' },
    )
  })

  it('returns 500 when checkInHabit fails on POST', async () => {
    const error = new Error('checkin failed')
    checkInHabitMock.mockRejectedValueOnce(error)

    const res = await POST(makeRequest('POST', JSON.stringify({ nodeId: 'n1', habitTitle: 'Run' })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
    expect(logErrorMock).toHaveBeenCalledWith('streak.checkin.error', error, 'user_123')
  })
})
