import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionIntent, ActionResult } from '@/types/actions'

const {
  getVerifiedUserIdMock,
  createTimerMock,
  logRequestMock,
  logErrorMock,
  getCloudflareKVBindingMock,
  waitUntilMock,
  detectIntentMock,
  isActionableMock,
  executeActionMock,
  addNoteMock,
  addReminderMock,
  getActionCollectionsMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  recordAnalyticsUsageMock,
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
    createTimerMock: vi.fn(() => vi.fn(() => 42)),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    getCloudflareKVBindingMock: vi.fn(),
    waitUntilMock: vi.fn(),
    detectIntentMock: vi.fn(),
    isActionableMock: vi.fn(),
    executeActionMock: vi.fn(),
    addNoteMock: vi.fn(),
    addReminderMock: vi.fn(),
    getActionCollectionsMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    recordAnalyticsUsageMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  createTimer: createTimerMock,
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/server/platform/wait-until', () => ({
  waitUntil: waitUntilMock,
}))

vi.mock('@/lib/actions/intent-detector', () => ({
  detectIntent: detectIntentMock,
  isActionable: isActionableMock,
}))

vi.mock('@/lib/actions/action-executor', () => ({
  executeAction: executeActionMock,
}))

vi.mock('@/lib/actions/store', () => ({
  addNote: addNoteMock,
  addReminder: addReminderMock,
  getActionCollections: getActionCollectionsMock,
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/analytics/event-store', () => ({
  recordAnalyticsUsage: recordAnalyticsUsageMock,
}))

import { GET, POST } from '@/app/api/v1/actions/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeIntent(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    type: 'none',
    confidence: 0,
    parameters: {},
    rawUserMessage: 'hello',
    ...overrides,
  }
}

function makeResult(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    success: true,
    type: 'set_reminder',
    output: 'Reminder set',
    data: { task: 'Pay rent', time: 'tomorrow 9am' },
    actionTaken: 'Set reminder',
    canUndo: false,
    executedAt: 1234,
    ...overrides,
  }
}

function makePostRequest(body?: string): Request {
  return new Request('http://localhost/api/v1/actions', {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('actions parent route', () => {
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
    getActionCollectionsMock.mockResolvedValue({
      reminders: [{ id: 'rem_1', task: 'Pay rent', time: 'tomorrow', createdAt: 1000 }],
      notes: [{ id: 'note_1', title: 'Quick Note', content: 'hello', createdAt: 1001 }],
    })
    detectIntentMock.mockResolvedValue(makeIntent())
    isActionableMock.mockReturnValue(false)
    executeActionMock.mockResolvedValue(makeResult())
    addNoteMock.mockResolvedValue(undefined)
    addReminderMock.mockResolvedValue(undefined)
    recordAnalyticsUsageMock.mockResolvedValue(undefined)
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    })
  })

  it('returns empty collections when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { reminders: [], notes: [] },
    })
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makePostRequest('{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON body',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns validation error for invalid action payload on POST', async () => {
    const res = await POST(makePostRequest(JSON.stringify({ userMessage: '' })))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toContain('Validation error: userMessage')
  })

  it('returns actionable false when the detected intent is not actionable on POST', async () => {
    const intent = makeIntent({ type: 'none', confidence: 0.2, rawUserMessage: 'hi there' })
    detectIntentMock.mockResolvedValueOnce(intent)
    isActionableMock.mockReturnValueOnce(false)

    const res = await POST(makePostRequest(JSON.stringify({ userMessage: 'hi there' })))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        actionable: false,
        intent,
      },
    })
    expect(executeActionMock).not.toHaveBeenCalled()
    expect(waitUntilMock).not.toHaveBeenCalled()
  })

  it('executes a reminder action, persists it, and schedules analytics on POST', async () => {
    const intent = makeIntent({
      type: 'set_reminder',
      confidence: 0.93,
      parameters: { task: 'Pay rent', time: 'tomorrow 9am' },
      rawUserMessage: 'Remind me to pay rent tomorrow at 9am',
    })
    const result = makeResult()
    detectIntentMock.mockResolvedValueOnce(intent)
    isActionableMock.mockReturnValueOnce(true)
    executeActionMock.mockResolvedValueOnce(result)

    const res = await POST(
      makePostRequest(
        JSON.stringify({
          userMessage: 'Remind me to pay rent tomorrow at 9am',
          conversationContext: 'You are helping me stay on top of bills.',
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        actionable: true,
        intent,
        result,
      },
    })
    expect(checkRateLimitMock).toHaveBeenCalledWith('user_123', 'free', 'ai')
    expect(detectIntentMock).toHaveBeenCalledWith(
      'Remind me to pay rent tomorrow at 9am',
      'You are helping me stay on top of bills.',
    )
    expect(addReminderMock).toHaveBeenCalledWith(kvMock, 'user_123', {
      task: 'Pay rent',
      time: 'tomorrow 9am',
    })
    expect(recordAnalyticsUsageMock).toHaveBeenCalledWith(kvMock, {
      type: 'action',
      userId: 'user_123',
      metadata: { actionType: 'set_reminder' },
    })
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
  })

  it('returns stored reminders and notes on GET', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        reminders: [{ id: 'rem_1', task: 'Pay rent', time: 'tomorrow', createdAt: 1000 }],
        notes: [{ id: 'note_1', title: 'Quick Note', content: 'hello', createdAt: 1001 }],
      },
    })
    expect(getActionCollectionsMock).toHaveBeenCalledWith(kvMock, 'user_123')
  })
})
