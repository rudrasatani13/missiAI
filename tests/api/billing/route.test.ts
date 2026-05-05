import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyUsage, UserBilling } from '@/types/billing'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getUserPlanMock,
  getUserBillingDataMock,
  setUserPlanMock,
  getDailyUsageMock,
  createDodoCheckoutSessionMock,
  cancelDodoSubscriptionMock,
  getCloudflareKVBindingMock,
  logMock,
  logApiErrorMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
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
    unauthorizedResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    getUserPlanMock: vi.fn(),
    getUserBillingDataMock: vi.fn(),
    setUserPlanMock: vi.fn(),
    getDailyUsageMock: vi.fn(),
    createDodoCheckoutSessionMock: vi.fn(),
    cancelDodoSubscriptionMock: vi.fn(),
    getCloudflareKVBindingMock: vi.fn(),
    logMock: vi.fn(),
    logApiErrorMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    clerkClientMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
  getUserBillingData: getUserBillingDataMock,
  setUserPlan: setUserPlanMock,
}))

vi.mock('@/lib/billing/usage-tracker', () => ({
  getDailyUsage: getDailyUsageMock,
}))

vi.mock('@/lib/billing/dodo-client', () => ({
  createDodoCheckoutSession: createDodoCheckoutSessionMock,
  cancelDodoSubscription: cancelDodoSubscriptionMock,
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  log: logMock,
  logApiError: logApiErrorMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}))

import { DELETE, GET, POST } from '@/app/api/v1/billing/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const baseUsage: DailyUsage = {
  userId: 'user_123',
  date: '2026-04-26',
  voiceInteractions: 2,
  voiceSecondsUsed: 180,
  lastUpdatedAt: 1000,
}

const baseBilling: UserBilling = {
  userId: 'user_123',
  planId: 'plus',
  dodoCustomerId: 'cust_123',
  dodoSubscriptionId: 'sub_123',
  currentPeriodEnd: 2000,
  cancelAtPeriodEnd: false,
  updatedAt: 3000,
}

function makeRequest(method: 'POST', body?: string): Request {
  return new Request('http://localhost/api/v1/billing', {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('billing parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DODO_PAYMENTS_API_KEY = 'dodo-key'
    process.env.DODO_PLUS_PRODUCT_ID = 'plus-product'
    process.env.DODO_PRO_PRODUCT_ID = 'pro-product'
    process.env.NEXT_PUBLIC_APP_URL = 'https://missi.space'

    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getUserPlanMock.mockResolvedValue('plus')
    getUserBillingDataMock.mockResolvedValue(baseBilling)
    setUserPlanMock.mockResolvedValue(undefined)
    getDailyUsageMock.mockResolvedValue(baseUsage)
    createDodoCheckoutSessionMock.mockResolvedValue({
      session_id: 'session_123',
      checkout_url: 'https://checkout.example/session_123',
    })
    cancelDodoSubscriptionMock.mockResolvedValue(undefined)
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          firstName: 'Rudra',
          lastName: 'Satani',
          emailAddresses: [{ emailAddress: 'rudra@example.com' }],
        }),
      },
    })
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET()

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns billing status with fallback usage when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    expect(body.success).toBe(true)
    expect(body.plan.id).toBe('plus')
    expect(body.billing).toMatchObject({
      userId: 'user_123',
      planId: 'plus',
    })
    expect(body.billing).not.toHaveProperty('dodoCustomerId')
    expect(body.billing).not.toHaveProperty('dodoSubscriptionId')
    expect(body.usage).toMatchObject({
      userId: 'user_123',
      voiceInteractions: 0,
      voiceSecondsUsed: 0,
    })
    expect(getDailyUsageMock).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('POST', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns 500 when the Dodo API key is missing on POST', async () => {
    delete process.env.DODO_PAYMENTS_API_KEY

    const res = await POST(makeRequest('POST', JSON.stringify({ planId: 'plus' })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
  })

  it('creates a checkout session on POST', async () => {
    const res = await POST(makeRequest('POST', JSON.stringify({ planId: 'plus' })))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      checkout_url: 'https://checkout.example/session_123',
      session_id: 'session_123',
    })
    expect(createDodoCheckoutSessionMock).toHaveBeenCalledWith({
      productId: 'plus-product',
      customerEmail: 'rudra@example.com',
      customerName: 'Rudra Satani',
      returnUrl: 'https://missi.space/pricing?success=true&plan=plus',
      metadata: {
        userId: 'user_123',
        planId: 'plus',
      },
    })
  })

  it('returns 400 when there is no active subscription on DELETE', async () => {
    getUserBillingDataMock.mockResolvedValueOnce({
      ...baseBilling,
      dodoSubscriptionId: undefined,
    })

    const res = await DELETE()

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'No active subscription' })
  })

  it('cancels the subscription and updates plan metadata on DELETE', async () => {
    const res = await DELETE()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: 'Subscription will cancel at period end',
      cancelAtPeriodEnd: true,
    })
    expect(cancelDodoSubscriptionMock).toHaveBeenCalledWith('sub_123')
    expect(setUserPlanMock).toHaveBeenCalledWith('user_123', 'plus', {
      cancelAtPeriodEnd: true,
    })
  })
})
