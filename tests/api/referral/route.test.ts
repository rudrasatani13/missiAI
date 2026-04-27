import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getOrCreateReferralMock,
  trackReferralMock,
  getReferralByCodeMock,
  getReferrerMock,
  logMock,
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
      () =>
        new Response(
          JSON.stringify({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
    getCloudflareKVBindingMock: vi.fn(),
    getOrCreateReferralMock: vi.fn(),
    trackReferralMock: vi.fn(),
    getReferralByCodeMock: vi.fn(),
    getReferrerMock: vi.fn(),
    logMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () =>
        new Response(
          JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: AuthenticationErrorMock,
  unauthorizedResponse: unauthorizedResponseMock,
}))

vi.mock('@/lib/billing/referral', () => ({
  getOrCreateReferral: getOrCreateReferralMock,
  trackReferral: trackReferralMock,
  getReferralByCode: getReferralByCodeMock,
  getReferrer: getReferrerMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  log: logMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

import { GET, POST } from '@/app/api/v1/referral/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const referralData = {
  code: 'ABCD1234',
  userId: 'user_123',
  totalReferred: 2,
  successfulReferred: 1,
  rewardDaysEarned: 7,
  referrals: [],
}

function makeRequest(body?: string): Request {
  return new Request('http://localhost/api/v1/referral', {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('referral parent route', () => {
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
    getOrCreateReferralMock.mockResolvedValue(referralData)
    getReferrerMock.mockResolvedValue('referrer_1')
    getReferralByCodeMock.mockResolvedValue('referrer_1')
    trackReferralMock.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET()

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 429 when GET is rate limited', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const res = await GET()

    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalled()
  })

  it('returns 500 when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
  })

  it('returns referral summary and referred status on GET', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      referral: {
        code: 'ABCD1234',
        totalReferred: 2,
        successfulReferred: 1,
        rewardDaysEarned: 7,
        maxReferrals: 5,
        remainingSlots: 3,
      },
      isReferred: true,
    })
    expect(getOrCreateReferralMock).toHaveBeenCalledWith(kvMock, 'user_123')
    expect(getReferrerMock).toHaveBeenCalledWith(kvMock, 'user_123')
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns 400 for invalid referral code payload on POST', async () => {
    const res = await POST(makeRequest(JSON.stringify({ referralCode: '' })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid referral code' })
  })

  it('returns 500 when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest(JSON.stringify({ referralCode: 'ABCD1234' })))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Internal server error' })
  })

  it('returns 400 when the referral code does not resolve on POST', async () => {
    getReferralByCodeMock.mockResolvedValueOnce(null)

    const res = await POST(makeRequest(JSON.stringify({ referralCode: 'ABCD1234' })))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid referral code' })
  })

  it('returns the tracked referral result on POST', async () => {
    trackReferralMock.mockResolvedValueOnce({ success: false, error: 'Cannot refer yourself' })

    const res = await POST(makeRequest(JSON.stringify({ referralCode: 'ABCD1234' })))

    expect(res.status).toBe(400)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Cannot refer yourself' })
    expect(logMock).toHaveBeenCalledWith({
      level: 'info',
      event: 'referral.tracked',
      userId: 'user_123',
      metadata: { referrerUserId: 'referrer_1', code: 'ABCD1234', success: false },
      timestamp: expect.any(Number),
    })
  })

  it('returns success when a referral is tracked on POST', async () => {
    const res = await POST(makeRequest(JSON.stringify({ referralCode: 'ABCD1234' })))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(checkRateLimitMock).toHaveBeenCalledWith('user_123', 'free')
    expect(getReferralByCodeMock).toHaveBeenCalledWith(kvMock, 'ABCD1234')
    expect(trackReferralMock).toHaveBeenCalledWith(kvMock, 'referrer_1', 'user_123')
  })
})
