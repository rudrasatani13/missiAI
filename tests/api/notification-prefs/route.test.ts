import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_NOTIFICATION_PREFS } from '@/lib/notifications/prefs'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  getUserPlanMock,
  logErrorMock,
  logRequestMock,
  getNotificationPrefsMock,
  setNotificationPrefsMock,
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
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () =>
        new Response(
          JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
    getUserPlanMock: vi.fn(),
    logErrorMock: vi.fn(),
    logRequestMock: vi.fn(),
    getNotificationPrefsMock: vi.fn(),
    setNotificationPrefsMock: vi.fn(),
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

vi.mock('@/lib/notifications/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/prefs')>()
  return {
    ...actual,
    getNotificationPrefs: getNotificationPrefsMock,
    setNotificationPrefs: setNotificationPrefsMock,
  }
})

import { GET, POST } from '@/app/api/v1/notification-prefs/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const prefsPayload = {
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  notifyCheckIn: false,
  timezone: 'Asia/Kolkata',
}

function makeRequest(body?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/notification-prefs', {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('notification prefs parent route', () => {
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
    getNotificationPrefsMock.mockResolvedValue(prefsPayload)
    setNotificationPrefsMock.mockResolvedValue(undefined)
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET()

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns default prefs when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
  })

  it('returns default prefs when store read fails on GET', async () => {
    getNotificationPrefsMock.mockRejectedValueOnce(new Error('read failed'))

    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
    expect(logErrorMock).toHaveBeenCalledWith('notif_prefs.read_error', expect.any(Error), 'user_123')
  })

  it('returns 429 when POST is rate limited', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const res = await POST(makeRequest(JSON.stringify(prefsPayload)))

    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON body',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns the first validation issue message on POST', async () => {
    const res = await POST(
      makeRequest(
        JSON.stringify({
          ...prefsPayload,
          quietHoursStart: 'bad',
        }),
      ),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Expected HH:MM',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns 503 when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest(JSON.stringify(prefsPayload)))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Storage unavailable',
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('persists notification prefs on POST', async () => {
    const res = await POST(makeRequest(JSON.stringify(prefsPayload)))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: prefsPayload })
    expect(checkRateLimitMock).toHaveBeenCalledWith('user_123', 'free')
    expect(setNotificationPrefsMock).toHaveBeenCalledWith(kvMock, 'user_123', prefsPayload)
    expect(logRequestMock).toHaveBeenCalledWith('notif_prefs.write', 'user_123', expect.any(Number))
  })
})
