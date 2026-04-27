import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVStore } from '@/types'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getLifeGraphReadSnapshotMock,
  generateDailyBriefingMock,
  checkForNudgesMock,
  getProactiveConfigMock,
  saveProactiveConfigMock,
  logRequestMock,
  logErrorMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
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
    getLifeGraphReadSnapshotMock: vi.fn(),
    generateDailyBriefingMock: vi.fn(),
    checkForNudgesMock: vi.fn(),
    getProactiveConfigMock: vi.fn(),
    saveProactiveConfigMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
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

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraphReadSnapshot: getLifeGraphReadSnapshotMock,
}))

vi.mock('@/lib/proactive/briefing-generator', () => ({
  generateDailyBriefing: generateDailyBriefingMock,
}))

vi.mock('@/lib/proactive/nudge-engine', () => ({
  checkForNudges: checkForNudgesMock,
}))

vi.mock('@/lib/proactive/config-store', () => ({
  getProactiveConfig: getProactiveConfigMock,
  saveProactiveConfig: saveProactiveConfigMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

import { DELETE, GET, PATCH, POST } from '@/app/api/v1/proactive/route'

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function makeRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path = '/api/v1/proactive',
  body?: string,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('proactive parent route', () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getUserPlanMock.mockResolvedValue('free')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getLifeGraphReadSnapshotMock.mockResolvedValue({
      nodes: [],
      totalInteractions: 0,
      lastUpdatedAt: Date.now(),
      version: 1,
    })
    getProactiveConfigMock.mockResolvedValue({
      enabled: true,
      briefingTime: '08:00',
      timezone: 'UTC',
      nudgesEnabled: true,
      maxItemsPerBriefing: 5,
      windDownEnabled: false,
      windDownTime: '22:00',
    })
    generateDailyBriefingMock.mockResolvedValue({
      userId: '',
      date: '2026-04-26',
      items: [
        {
          type: 'goal_nudge',
          priority: 'high',
          message: 'Check in on your goal.',
          actionable: true,
        },
      ],
      generatedAt: Date.now(),
      tone: 'calm',
    })
    checkForNudgesMock.mockReturnValue([
      {
        type: 'habit_check',
        priority: 'low',
        message: 'How is your habit going?',
        actionable: true,
      },
    ])
    saveProactiveConfigMock.mockResolvedValue(undefined)
  })

  it('returns 401 when auth fails', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns null briefing when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: true, data: null })
  })

  it('serves a fresh cached briefing on GET without regenerating', async () => {
    const now = Date.now()
    await kv.put(`proactive:briefing:user_123:${new Date().toISOString().slice(0, 10)}`, JSON.stringify({
      userId: 'user_123',
      date: '2026-04-26',
      items: [{ type: 'goal_nudge', priority: 'high', message: 'Cached', actionable: true }],
      generatedAt: now,
      tone: 'calm',
    }))

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: [{ message: 'Cached' }],
      },
    })
    expect(getLifeGraphReadSnapshotMock).not.toHaveBeenCalled()
    expect(generateDailyBriefingMock).not.toHaveBeenCalled()
  })

  it('uses a bounded graph snapshot when generating a fresh briefing on GET', async () => {
    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    expect(getLifeGraphReadSnapshotMock).toHaveBeenCalledWith(
      kv,
      'user_123',
      expect.objectContaining({ limit: 200, newestFirst: true }),
    )
    expect(generateDailyBriefingMock).toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('POST', '/api/v1/proactive', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns empty nudges when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest('POST', '/api/v1/proactive', JSON.stringify({ lastInteractionAt: 123 })))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: true, data: { nudges: [] } })
  })

  it('returns 400 for invalid JSON on PATCH', async () => {
    const res = await PATCH(makeRequest('PATCH', '/api/v1/proactive', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns 500 when KV is unavailable on PATCH', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await PATCH(makeRequest('PATCH', '/api/v1/proactive', JSON.stringify({
      enabled: true,
      briefingTime: '08:00',
      timezone: 'UTC',
      nudgesEnabled: true,
      maxItemsPerBriefing: 5,
      windDownEnabled: false,
      windDownTime: '22:00',
    })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  it('returns 400 for invalid JSON on DELETE', async () => {
    const res = await DELETE(makeRequest('DELETE', '/api/v1/proactive', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('dismisses matching briefing items on DELETE', async () => {
    const key = `proactive:briefing:user_123:${new Date().toISOString().slice(0, 10)}`
    await kv.put(key, JSON.stringify({
      userId: 'user_123',
      date: '2026-04-26',
      items: [
        { type: 'goal_nudge', priority: 'high', message: 'Goal', actionable: true, nodeId: 'goal-1' },
        { type: 'habit_check', priority: 'low', message: 'Habit', actionable: true, nodeId: 'habit-1' },
      ],
      generatedAt: Date.now(),
      tone: 'calm',
    }))

    const res = await DELETE(makeRequest('DELETE', '/api/v1/proactive', JSON.stringify({
      type: 'goal_nudge',
      nodeId: 'goal-1',
    })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: { success: true } })

    const stored = await kv.get(key)
    const briefing = JSON.parse(stored!)
    expect(briefing.items[0]).toMatchObject({ type: 'goal_nudge', nodeId: 'goal-1' })
    expect(typeof briefing.items[0].dismissedAt).toBe('number')
    expect(briefing.items[1].dismissedAt).toBeUndefined()
  })
})
