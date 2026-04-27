import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { EveningReflection, ProactiveConfig } from '@/types/proactive'
import type { LifeGraph } from '@/types/memory'

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
  getLifeGraphReadSnapshotMock,
  getProactiveConfigMock,
  generateEveningReflectionMock,
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
    getLifeGraphReadSnapshotMock: vi.fn(),
    getProactiveConfigMock: vi.fn(),
    generateEveningReflectionMock: vi.fn(),
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

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraphReadSnapshot: getLifeGraphReadSnapshotMock,
}))

vi.mock('@/lib/proactive/config-store', () => ({
  getProactiveConfig: getProactiveConfigMock,
}))

vi.mock('@/lib/proactive/wind-down-generator', () => ({
  generateEveningReflection: generateEveningReflectionMock,
}))

import { GET, POST } from '@/app/api/v1/wind-down/route'

const kvMock = {
  get: vi.fn(async () => null as string | null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const TEST_USER_ID = 'user_123'

function makeReflection(overrides: Partial<EveningReflection> = {}): EveningReflection {
  return {
    userId: TEST_USER_ID,
    date: '2026-04-26',
    items: [],
    generatedAt: Date.now(),
    tone: 'calm',
    ...overrides,
  }
}

function makeGraph(): LifeGraph {
  return {
    nodes: [],
    totalInteractions: 0,
    lastUpdatedAt: 0,
    version: 1,
  }
}

function makeConfig(): ProactiveConfig {
  return {
    enabled: true,
    timezone: 'Asia/Kolkata',
    briefingTime: '08:00',
    nudgesEnabled: false,
    maxItemsPerBriefing: 5,
    windDownEnabled: true,
    windDownTime: '21:00',
  }
}

function makeRequest(method: 'GET' | 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/v1/wind-down', { method })
}

describe('wind-down parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue(TEST_USER_ID)
    getUserPlanMock.mockResolvedValue('free')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getLifeGraphReadSnapshotMock.mockResolvedValue(makeGraph())
    getProactiveConfigMock.mockResolvedValue(makeConfig())
    generateEveningReflectionMock.mockResolvedValue(makeReflection())
  })

  // ─── GET tests ────────────────────────────────────────────────────────────

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
  })

  it('returns null data when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: null })
  })

  it('returns cached reflection when it is less than 8 hours old on GET', async () => {
    const reflection = makeReflection({ generatedAt: Date.now() - 1000 })
    kvMock.get.mockResolvedValueOnce(JSON.stringify(reflection))

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.generatedAt).toBe(reflection.generatedAt)
    expect(generateEveningReflectionMock).not.toHaveBeenCalled()
  })

  it('generates a new reflection when cache is older than 8 hours on GET', async () => {
    const oldReflection = makeReflection({ generatedAt: Date.now() - 9 * 60 * 60 * 1000 })
    kvMock.get.mockResolvedValueOnce(JSON.stringify(oldReflection))

    const newReflection = makeReflection({ generatedAt: Date.now(), items: [{ type: 'gratitude_prompt', priority: 'medium', message: 'test', actionable: false }] })
    generateEveningReflectionMock.mockResolvedValueOnce(newReflection)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.items).toHaveLength(1)
    expect(getLifeGraphReadSnapshotMock).toHaveBeenCalledWith(
      kvMock,
      TEST_USER_ID,
      expect.objectContaining({ limit: 200, newestFirst: true }),
    )
    expect(generateEveningReflectionMock).toHaveBeenCalledWith(makeGraph(), makeConfig())
    expect(kvMock.put).toHaveBeenCalled()
  })

  it('generates a new reflection when no cache exists on GET', async () => {
    kvMock.get.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    expect(getLifeGraphReadSnapshotMock).toHaveBeenCalledWith(
      kvMock,
      TEST_USER_ID,
      expect.objectContaining({ limit: 200, newestFirst: true }),
    )
    expect(generateEveningReflectionMock).toHaveBeenCalledWith(makeGraph(), makeConfig())
    expect(kvMock.put).toHaveBeenCalled()
  })

  it('returns null data when generation fails on GET', async () => {
    kvMock.get.mockResolvedValueOnce(null)
    generateEveningReflectionMock.mockRejectedValueOnce(new Error('gen failed'))

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: null })
    expect(logErrorMock).toHaveBeenCalledWith('wind-down.error', expect.any(Error), TEST_USER_ID)
  })

  // ─── POST tests ───────────────────────────────────────────────────────────

  it('returns 401 when auth fails on POST', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(401)
  })

  it('returns 429 when POST is rate limited', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 30,
    })

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(429)
  })

  it('returns success when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('marks cached reflection as delivered on POST', async () => {
    const reflection = makeReflection()
    kvMock.get.mockResolvedValueOnce(JSON.stringify(reflection))

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(kvMock.put).toHaveBeenCalledWith(
      expect.stringContaining('proactive:wind-down'),
      expect.stringContaining('deliveredAt'),
      expect.anything(),
    )
    expect(logRequestMock).toHaveBeenCalledWith('wind-down.delivered', TEST_USER_ID, expect.any(Number))
  })

  it('returns success when no cache exists on POST', async () => {
    kvMock.get.mockResolvedValueOnce(null)

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(kvMock.put).not.toHaveBeenCalled()
  })

  it('returns success when cache update fails on POST', async () => {
    const reflection = makeReflection()
    kvMock.get.mockResolvedValueOnce(JSON.stringify(reflection))
    kvMock.put.mockRejectedValueOnce(new Error('kv write failed'))

    const res = await POST(makeRequest('POST'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(logErrorMock).toHaveBeenCalledWith('wind-down.delivered.error', expect.any(Error), TEST_USER_ID)
  })
})
