import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { DailyBrief, DailyTask } from '@/types/daily-brief'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super('Unauthenticated')
      this.name = 'AuthenticationError'
    }
  },
  unauthorizedResponse: vi.fn(
    () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ),
}))

vi.mock('@/lib/server/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/server/env', () => ({
  getEnv: vi.fn(() => ({
    GEMINI_API_KEY: 'test-key',
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  })),
}))

vi.mock('@/lib/daily-brief/brief-store', () => ({
  getTodaysBrief: vi.fn(),
  saveBrief: vi.fn(),
  markBriefViewed: vi.fn(),
  getRateLimit: vi.fn(),
  incrementRateLimit: vi.fn(),
  markTaskComplete: vi.fn(),
}))

vi.mock('@/lib/daily-brief/generator', () => ({
  buildGenerationContext: vi.fn(),
  generateBriefWithGemini: vi.fn(),
}))

vi.mock('@/lib/plugins/data-fetcher', () => ({
  getGoogleTokens: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: vi.fn(() => Promise.resolve(0)),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/v1/daily-brief/route'
import { PATCH } from '@/app/api/v1/daily-brief/tasks/[taskId]/route'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import {
  getTodaysBrief,
  saveBrief,
  markBriefViewed,
  getRateLimit,
  incrementRateLimit,
  markTaskComplete,
} from '@/lib/daily-brief/brief-store'
import {
  buildGenerationContext,
  generateBriefWithGemini,
} from '@/lib/daily-brief/generator'
import { awardXP } from '@/lib/gamification/xp-engine'

const mockGetRequestContext = vi.mocked(getRequestContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetTodaysBrief = vi.mocked(getTodaysBrief)
const mockSaveBrief = vi.mocked(saveBrief)
const mockMarkBriefViewed = vi.mocked(markBriefViewed)
const mockGetRateLimit = vi.mocked(getRateLimit)
const mockIncrementRateLimit = vi.mocked(incrementRateLimit)
const mockMarkTaskComplete = vi.mocked(markTaskComplete)
const mockBuildContext = vi.mocked(buildGenerationContext)
const mockGenerateBrief = vi.mocked(generateBriefWithGemini)

const TEST_USER_ID = 'user_test_brief_123'
const TODAY = new Date().toISOString().slice(0, 10)

function makeBrief(overrides: Partial<DailyBrief> = {}): DailyBrief {
  return {
    date: TODAY,
    userId: TEST_USER_ID,
    greeting: 'Good morning! Ready to make today count? 🌅',
    tasks: [
      {
        id: 'task-001',
        title: 'Check in with Missi',
        context: 'Start your day with a quick chat',
        source: 'missi',
        completed: false,
        completedAt: null,
      },
    ],
    streakNudge: null,
    moodPrompt: null,
    challenge: 'Try one new thing today.',
    viewed: false,
    generatedAt: Date.now(),
    viewedAt: null,
    ...overrides,
  }
}

function makeRequest(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method })
}

beforeEach(() => {
  vi.clearAllMocks()

  mockGetRequestContext.mockReturnValue({
    env: {
      MISSI_MEMORY: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
    },
    ctx: {} as any,
    cf: {} as any,
  } as any)

  mockGetVerifiedUserId.mockResolvedValue(TEST_USER_ID)
  mockSaveBrief.mockResolvedValue(undefined)
  mockMarkBriefViewed.mockResolvedValue(undefined)
  mockIncrementRateLimit.mockResolvedValue(undefined)
  mockGetRateLimit.mockResolvedValue(0)
})

// ─── GET Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/daily-brief', () => {
  it('returns 401 when no Clerk session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('GET', '/api/v1/daily-brief')
    await GET(req)

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('returns { brief: null } when no brief exists for today', async () => {
    mockGetTodaysBrief.mockResolvedValueOnce(null)

    const req = makeRequest('GET', '/api/v1/daily-brief')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.brief).toBeNull()
    expect(body.data.generated).toBe(false)
  })

  it('returns existing brief when one exists', async () => {
    const brief = makeBrief()
    mockGetTodaysBrief.mockResolvedValueOnce(brief)

    const req = makeRequest('GET', '/api/v1/daily-brief')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.brief).toBeDefined()
    expect(body.data.brief.greeting).toBe(brief.greeting)
    expect(body.data.generated).toBe(true)
    // Should fire-and-forget markBriefViewed
    expect(mockMarkBriefViewed).toHaveBeenCalledWith(expect.anything(), TEST_USER_ID)
  })
})

// ─── POST Tests ───────────────────────────────────────────────────────────────

describe('POST /api/v1/daily-brief', () => {
  it('returns 401 when no Clerk session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('POST', '/api/v1/daily-brief')
    await POST(req)

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('generates and stores a brief for a new day', async () => {
    mockGetTodaysBrief.mockResolvedValueOnce(null)
    mockBuildContext.mockResolvedValueOnce({
      userName: 'Test',
      topGoals: ['Learn TypeScript'],
      activeHabits: ['Meditation'],
      bestStreak: { title: 'Meditation', days: 7 },
      yesterdayMood: 'calm',
      calendarEvents: [],
      loginStreak: 5,
    })
    mockGenerateBrief.mockResolvedValueOnce({
      greeting: 'Hey Test! Ready to crush it?',
      tasks: [
        { id: 'x', title: 'Practice TS', context: 'Keep learning', source: 'goal', completed: false, completedAt: null },
      ],
      streakNudge: '7 days strong!',
      moodPrompt: null,
      challenge: 'Write 10 lines of code.',
    })

    const req = makeRequest('POST', '/api/v1/daily-brief')
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.brief).toBeDefined()
    expect(body.data.brief.userId).toBe(TEST_USER_ID)
    expect(mockSaveBrief).toHaveBeenCalled()
    expect(mockIncrementRateLimit).toHaveBeenCalled()
  })

  it('returns existing brief when called twice on same day (idempotent)', async () => {
    const existingBrief = makeBrief()
    mockGetTodaysBrief.mockResolvedValueOnce(existingBrief)

    const req = makeRequest('POST', '/api/v1/daily-brief')
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.brief).toBeDefined()
    // Should NOT call generateBriefWithGemini
    expect(mockGenerateBrief).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit (3) is exceeded', async () => {
    mockGetRateLimit.mockResolvedValueOnce(3)

    const req = makeRequest('POST', '/api/v1/daily-brief')
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toContain('Daily brief already generated')
    expect(mockGenerateBrief).not.toHaveBeenCalled()
  })

  it('POST with ?refresh=true regenerates even when brief exists', async () => {
    // Should skip the idempotent check when refresh=true
    mockBuildContext.mockResolvedValueOnce({
      userName: 'Test',
      topGoals: [],
      activeHabits: [],
      bestStreak: null,
      yesterdayMood: null,
      calendarEvents: [],
      loginStreak: 1,
    })
    mockGenerateBrief.mockResolvedValueOnce({
      greeting: 'Fresh morning brief!',
      tasks: [
        { id: 'y', title: 'New task', context: 'Refreshed', source: 'missi', completed: false, completedAt: null },
      ],
      streakNudge: null,
      moodPrompt: null,
      challenge: null,
    })

    const req = makeRequest('POST', '/api/v1/daily-brief?refresh=true')
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.brief.greeting).toBe('Fresh morning brief!')
    expect(mockGenerateBrief).toHaveBeenCalled()
  })
})

// ─── PATCH Tests ──────────────────────────────────────────────────────────────

describe('PATCH /api/v1/daily-brief/tasks/[taskId]', () => {
  it('returns 401 with no session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = new NextRequest('http://localhost/api/v1/daily-brief/tasks/task-001', {
      method: 'PATCH',
    })
    await PATCH(req, { params: Promise.resolve({ taskId: 'task-001' }) })

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('returns 403 when taskId not found in user brief', async () => {
    mockMarkTaskComplete.mockResolvedValueOnce(null)

    const req = new NextRequest('http://localhost/api/v1/daily-brief/tasks/fake-id', {
      method: 'PATCH',
    })
    const res = await PATCH(req, { params: Promise.resolve({ taskId: 'fake-id' }) })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain('Task not found')
  })

  it('marks task complete and returns updated brief', async () => {
    const updatedBrief = makeBrief({
      tasks: [
        {
          id: 'task-001',
          title: 'Check in with Missi',
          context: 'Start your day',
          source: 'missi',
          completed: true,
          completedAt: Date.now(),
        },
      ],
    })
    mockMarkTaskComplete.mockResolvedValueOnce(updatedBrief)

    const req = new NextRequest('http://localhost/api/v1/daily-brief/tasks/task-001', {
      method: 'PATCH',
    })
    const res = await PATCH(req, { params: Promise.resolve({ taskId: 'task-001' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.brief.tasks[0].completed).toBe(true)
    // XP should be awarded fire-and-forget
    expect(awardXP).toHaveBeenCalled()
  })
})
