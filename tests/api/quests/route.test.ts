import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Quest } from '@/types/quests'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getCloudflareVectorizeEnvMock,
  stripHtmlMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  logRequestMock,
  logErrorMock,
  generateQuestMock,
  getQuestsMock,
  addQuestMock,
  getActiveQuestCountMock,
  checkAndIncrementQuestGenRateLimitMock,
  updateQuestMock,
  addOrUpdateNodeMock,
  searchLifeGraphMock,
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
    getCloudflareVectorizeEnvMock: vi.fn(),
    stripHtmlMock: vi.fn((value: string) => value.replace(/<[^>]+>/g, '').trim()),
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
    generateQuestMock: vi.fn(),
    getQuestsMock: vi.fn(),
    addQuestMock: vi.fn(),
    getActiveQuestCountMock: vi.fn(),
    checkAndIncrementQuestGenRateLimitMock: vi.fn(),
    updateQuestMock: vi.fn(),
    addOrUpdateNodeMock: vi.fn(),
    searchLifeGraphMock: vi.fn(),
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
  getCloudflareVectorizeEnv: getCloudflareVectorizeEnvMock,
}))

vi.mock('@/lib/validation/sanitizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/sanitizer')>()
  return {
    ...actual,
    stripHtml: stripHtmlMock,
  }
})

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

vi.mock('@/lib/quests/quest-generator', () => ({
  generateQuest: generateQuestMock,
}))

vi.mock('@/lib/quests/quest-store', () => ({
  getQuests: getQuestsMock,
  addQuest: addQuestMock,
  getActiveQuestCount: getActiveQuestCountMock,
  checkAndIncrementQuestGenRateLimit: checkAndIncrementQuestGenRateLimitMock,
  updateQuest: updateQuestMock,
}))

vi.mock('@/lib/memory/life-graph', () => ({
  addOrUpdateNode: addOrUpdateNodeMock,
  searchLifeGraph: searchLifeGraphMock,
}))

import { GET, POST } from '@/app/api/v1/quests/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'quest_123',
    userId: '',
    title: 'Spanish Sprint',
    description: 'Build a consistent Spanish learning habit',
    goalNodeId: null,
    category: 'learning',
    difficulty: 'easy',
    chapters: [],
    status: 'draft',
    createdAt: 1000,
    startedAt: null,
    completedAt: null,
    targetDurationDays: 30,
    totalMissions: 4,
    completedMissions: 0,
    totalXPEarned: 0,
    coverEmoji: '🎯',
    ...overrides,
  }
}

function makeRequest(
  method: 'GET' | 'POST',
  path = '/api/v1/quests',
  body?: string,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

describe('quests parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getUserPlanMock.mockResolvedValue('free')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getCloudflareVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    getQuestsMock.mockResolvedValue([])
    getActiveQuestCountMock.mockResolvedValue(0)
    checkAndIncrementQuestGenRateLimitMock.mockResolvedValue({ allowed: true, remaining: 3 })
    generateQuestMock.mockResolvedValue(makeQuest())
    addQuestMock.mockResolvedValue(undefined)
    searchLifeGraphMock.mockResolvedValue([])
    addOrUpdateNodeMock.mockResolvedValue(null)
    updateQuestMock.mockResolvedValue(null)
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns empty quests when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({ success: true, quests: [], activeCount: 0 })
  })

  it('filters quests by active status on GET', async () => {
    getQuestsMock.mockResolvedValueOnce([
      makeQuest({ id: 'q1', status: 'active', userId: 'user_123' }),
      makeQuest({ id: 'q2', status: 'completed', userId: 'user_123' }),
      makeQuest({ id: 'q3', status: 'active', userId: 'user_123' }),
    ])

    const res = await GET(makeRequest('GET', '/api/v1/quests?status=active'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      quests: [
        expect.objectContaining({ id: 'q1', status: 'active' }),
        expect.objectContaining({ id: 'q3', status: 'active' }),
      ],
      activeCount: 2,
    })
  })

  it('returns 503 when KV is unavailable on POST', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: 'Learn Spanish quickly',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Storage unavailable' })
  })

  it('returns 400 for invalid JSON on POST', async () => {
    const res = await POST(makeRequest('POST', '/api/v1/quests', '{'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns 429 when quest generation limit is reached', async () => {
    checkAndIncrementQuestGenRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0 })

    const res = await POST(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: 'Learn Spanish quickly',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Quest generation limit reached. You have 0 generations remaining this week.',
    })
  })

  it('returns 400 when the user already has too many active quests', async () => {
    getActiveQuestCountMock.mockResolvedValueOnce(3)

    const res = await POST(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: 'Learn Spanish quickly',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'You can have up to 3 active quests. Complete or abandon one first.',
    })
  })

  it('creates a quest, applies memory context, and links a goal node on POST', async () => {
    const vectorizeEnv = { LIFE_GRAPH: {} }
    const quest = makeQuest()
    getCloudflareVectorizeEnvMock.mockReturnValueOnce(vectorizeEnv)
    generateQuestMock.mockResolvedValueOnce(quest)
    searchLifeGraphMock.mockResolvedValueOnce([
      { node: { title: 'Language practice' } },
      { node: { title: 'Daily consistency' } },
    ])
    addOrUpdateNodeMock.mockResolvedValueOnce({ id: 'goal_node_1' })
    updateQuestMock.mockResolvedValueOnce({ ...quest, goalNodeId: 'goal_node_1' })

    const res = await POST(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: '<b>Learn Spanish quickly</b>',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )

    expect(res.status).toBe(201)
    expect(res.headers.get('x-ratelimit-remaining')).toBe('59')
    await expect(res.json()).resolves.toEqual({
      success: true,
      quest: expect.objectContaining({
        id: 'quest_123',
        userId: 'user_123',
        goalNodeId: 'goal_node_1',
      }),
    })
    expect(stripHtmlMock).toHaveBeenCalledWith('<b>Learn Spanish quickly</b>')
    expect(searchLifeGraphMock).toHaveBeenCalledWith(
      kvMock,
      vectorizeEnv,
      'user_123',
      'Learn Spanish quickly',
      { topK: 3, category: 'goal' },
    )
    expect(generateQuestMock).toHaveBeenCalledWith({
      userGoal: 'Learn Spanish quickly',
      category: 'learning',
      difficulty: 'easy',
      targetDurationDays: 30,
      existingMemoryContext: 'Language practice, Daily consistency',
    })
    expect(addQuestMock).toHaveBeenCalledWith(kvMock, 'user_123', expect.objectContaining({ id: 'quest_123' }))
    expect(checkAndIncrementQuestGenRateLimitMock).toHaveBeenCalledWith(kvMock, 'user_123', expect.anything())
    expect(addOrUpdateNodeMock).toHaveBeenCalledWith(
      kvMock,
      vectorizeEnv,
      'user_123',
      expect.objectContaining({
        userId: 'user_123',
        category: 'goal',
        title: 'Spanish Sprint',
        tags: ['learning', 'quest'],
        source: 'explicit',
      }),
    )
    expect(updateQuestMock).toHaveBeenCalledWith(kvMock, 'user_123', 'quest_123', { goalNodeId: 'goal_node_1' })
  })
})
