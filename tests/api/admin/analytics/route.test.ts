import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getVerifiedUserIdMock,
  getCloudflareKVBindingMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  buildAnalyticsSnapshotMock,
  getDailyStatsMock,
  getAnalyticsAggregationStatusMock,
  logMock,
  authMock,
  clerkClientMock,
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
    getCloudflareKVBindingMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    buildAnalyticsSnapshotMock: vi.fn(),
    getDailyStatsMock: vi.fn(),
    getAnalyticsAggregationStatusMock: vi.fn(),
    logMock: vi.fn(),
    authMock: vi.fn(),
    clerkClientMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
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

vi.mock('@/lib/analytics/aggregator', () => ({
  buildAnalyticsSnapshot: buildAnalyticsSnapshotMock,
}))

vi.mock('@/lib/analytics/event-store', () => ({
  getDailyStats: getDailyStatsMock,
  getAnalyticsAggregationStatus: getAnalyticsAggregationStatusMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  log: logMock,
}))

import { auth } from '@clerk/nextjs/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}))

import { GET } from '@/app/api/v1/admin/analytics/route'

function makeRequest(url = 'http://localhost/api/v1/admin/analytics'): Request {
  return new Request(url, { method: 'GET' })
}

type ClerkAuthState = Awaited<ReturnType<typeof auth>>

function makeClerkAuthState(userId: string, role: unknown): ClerkAuthState {
  return {
    userId,
    sessionClaims: { metadata: { role } },
  } as unknown as ClerkAuthState
}

describe('GET /api/v1/admin/analytics', () => {
  const originalAdminUserId = process.env.ADMIN_USER_ID

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_USER_ID
    getVerifiedUserIdMock.mockResolvedValue('admin_user')
    authMock.mockResolvedValue(makeClerkAuthState('admin_user', 'admin'))
    getUserPlanMock.mockResolvedValue('pro')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      reset: 0,
    })
    clerkClientMock.mockRejectedValue(new Error('Clerk unavailable'))
    buildAnalyticsSnapshotMock.mockResolvedValue({
      today: {
        date: '2026-04-26',
        totalRequests: 2,
        uniqueUsers: 1,
        voiceInteractions: 1,
        chatRequests: 1,
        ttsRequests: 1,
        memoryReads: 0,
        memoryWrites: 0,
        actionsExecuted: 0,
        totalCostUsd: 0.02,
        errorCount: 0,
        newSignups: 0,
        updatedAt: 200,
      },
      yesterday: {
        date: '2026-04-25',
        totalRequests: 1,
        uniqueUsers: 1,
        voiceInteractions: 0,
        chatRequests: 0,
        ttsRequests: 1,
        memoryReads: 0,
        memoryWrites: 0,
        actionsExecuted: 0,
        totalCostUsd: 0.01,
        errorCount: 0,
        newSignups: 0,
        updatedAt: 150,
      },
      last7Days: [],
      lifetime: {
        totalUsers: 3,
        totalInteractions: 5,
        totalCostUsd: 0.03,
        totalRevenue: 0,
        planBreakdown: { free: 1, plus: 1, pro: 1 },
        lastUpdatedAt: 200,
      },
      generatedAt: 300,
    })
    getAnalyticsAggregationStatusMock.mockResolvedValue({
      pendingEventCount: 0,
      pendingDates: [],
      lastAppendedAt: 250,
      lastProcessedAt: 260,
      lagMs: 0,
      isCaughtUp: true,
    })
    getDailyStatsMock.mockResolvedValue({
      date: '2026-04-26',
      totalRequests: 2,
      uniqueUsers: 1,
      voiceInteractions: 1,
      chatRequests: 1,
      ttsRequests: 1,
      memoryReads: 0,
      memoryWrites: 0,
      actionsExecuted: 0,
      totalCostUsd: 0.02,
      errorCount: 0,
      newSignups: 0,
      updatedAt: 200,
    })
    getCloudflareKVBindingMock.mockReturnValue({ get: vi.fn(), put: vi.fn(), delete: vi.fn() })
  })

  afterEach(() => {
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId
    }
  })

  it('includes aggregation status on snapshot responses', async () => {
    const res = await GET(makeRequest())
    const body = await res.json() as {
      success: boolean
      data: {
        aggregation: {
          pendingEventCount: number
          pendingDates: string[]
          isCaughtUp: boolean
        }
        planBreakdown: Record<string, number>
      }
    }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.aggregation).toEqual({
      pendingEventCount: 0,
      pendingDates: [],
      lastAppendedAt: 250,
      lastProcessedAt: 260,
      lagMs: 0,
      isCaughtUp: true,
    })
    expect(body.data.planBreakdown).toEqual({ free: 1, plus: 1, pro: 1 })
  })

  it('returns zeroed aggregation status in the no-kv fallback response', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest())
    const body = await res.json() as {
      success: boolean
      data: {
        aggregation: {
          pendingEventCount: number
          pendingDates: string[]
          isCaughtUp: boolean
        }
      }
    }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.aggregation).toEqual({
      pendingEventCount: 0,
      pendingDates: [],
      lastAppendedAt: 0,
      lastProcessedAt: 0,
      lagMs: 0,
      isCaughtUp: true,
    })
  })

  it('returns 403 for malformed metadata when ADMIN_USER_ID fallback is absent', async () => {
    authMock.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await GET(makeRequest())

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('allows ADMIN_USER_ID fallback even when metadata is malformed', async () => {
    process.env.ADMIN_USER_ID = 'admin_user'
    authMock.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
  })
})
