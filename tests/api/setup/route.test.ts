import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  clerkClientMock,
  getUserMock,
  updateUserMock,
  getCloudflareKVBindingMock,
  getCloudflareVectorizeEnvMock,
  logRequestMock,
  logErrorMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  addOrUpdateNodeMock,
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
    clerkClientMock: vi.fn(),
    getUserMock: vi.fn(),
    updateUserMock: vi.fn(),
    getCloudflareKVBindingMock: vi.fn(),
    getCloudflareVectorizeEnvMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    addOrUpdateNodeMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
  getCloudflareVectorizeEnv: getCloudflareVectorizeEnvMock,
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

vi.mock('@/lib/memory/life-graph', () => ({
  addOrUpdateNode: addOrUpdateNodeMock,
}))

import { POST } from '@/app/api/v1/setup/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeRequest(body?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/setup', {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('setup parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getUserPlanMock.mockResolvedValue('free')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getCloudflareVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
    getUserMock.mockResolvedValue({ publicMetadata: { theme: 'dark' } })
    updateUserMock.mockResolvedValue(undefined)
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: getUserMock,
        updateUser: updateUserMock,
      },
    })
    addOrUpdateNodeMock.mockResolvedValue({ id: 'node_1' })
  })

  it('returns 401 when auth fails on POST', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await POST(makeRequest(JSON.stringify({ name: 'Rudra' })))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 429 when rate limited on POST', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const res = await POST(makeRequest(JSON.stringify({ name: 'Rudra' })))

    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalled()
  })

  it('returns 400 for invalid setup input on POST', async () => {
    const res = await POST(makeRequest(JSON.stringify({ name: '' })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns 500 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('{'))

    expect(res.status).toBe(500)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
  })

  it('completes setup without KV by updating Clerk metadata only', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(
      makeRequest(JSON.stringify({ name: 'Rudra', dob: '2000-01-01', occupation: 'Engineer' })),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    expect(body.success).toBe(true)
    expect(body.profile).toMatchObject({
      name: 'Rudra',
      dob: '2000-01-01',
      occupation: 'Engineer',
      setupCompleted: true,
    })
    expect(updateUserMock).toHaveBeenCalledWith('user_123', {
      publicMetadata: {
        theme: 'dark',
        setupComplete: true,
      },
    })
    expect(kvMock.put).not.toHaveBeenCalled()
    expect(addOrUpdateNodeMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      'setup.kv_unavailable',
      'KV binding missing, gracefully skipping memory save',
      'user_123',
    )
  })

  it('stores profile and creates name, dob, and occupation memories on POST', async () => {
    const res = await POST(
      makeRequest(JSON.stringify({ name: 'Rudra', dob: '2000-01-01', occupation: 'Engineer' })),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    expect(body.success).toBe(true)
    expect(body.profile).toMatchObject({
      name: 'Rudra',
      dob: '2000-01-01',
      occupation: 'Engineer',
      setupCompleted: true,
    })
    expect(kvMock.put).toHaveBeenCalledWith(
      'profile:user_123',
      expect.stringContaining('"name":"Rudra"'),
    )
    expect(updateUserMock).toHaveBeenCalledWith('user_123', {
      publicMetadata: {
        theme: 'dark',
        setupComplete: true,
      },
    })
    expect(getCloudflareVectorizeEnvMock).toHaveBeenCalled()
    expect(addOrUpdateNodeMock).toHaveBeenCalledTimes(3)
    expect(addOrUpdateNodeMock).toHaveBeenNthCalledWith(
      1,
      kvMock,
      { LIFE_GRAPH: {} },
      'user_123',
      expect.objectContaining({
        userId: 'user_123',
        title: "User's Name",
        category: 'person',
        tags: ['identity', 'name'],
        people: ['Rudra'],
      }),
    )
    expect(addOrUpdateNodeMock).toHaveBeenNthCalledWith(
      2,
      kvMock,
      { LIFE_GRAPH: {} },
      'user_123',
      expect.objectContaining({
        title: "User's Birthday",
        category: 'event',
        tags: ['birthday', 'age', 'astrology'],
      }),
    )
    expect(addOrUpdateNodeMock).toHaveBeenNthCalledWith(
      3,
      kvMock,
      { LIFE_GRAPH: {} },
      'user_123',
      expect.objectContaining({
        title: "User's Work/Study",
        category: 'goal',
        tags: ['work', 'study', 'occupation'],
      }),
    )
    expect(logRequestMock).toHaveBeenCalledWith('setup.completed', 'user_123', expect.any(Number))
  })
})
