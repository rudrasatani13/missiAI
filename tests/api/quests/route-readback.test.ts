import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVListResult, KVStore } from '@/types'
import type { Quest } from '@/types/quests'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getCloudflareAtomicCounterBindingMock,
  getCloudflareVectorizeEnvMock,
  stripHtmlMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  getUserPlanMock,
  logRequestMock,
  logErrorMock,
  generateQuestMock,
  addOrUpdateNodeMock,
  searchLifeGraphMock,
  getGamificationDataMock,
  saveGamificationDataMock,
  awardXPMock,
  checkQuestAchievementsMock,
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
    getCloudflareAtomicCounterBindingMock: vi.fn(),
    getCloudflareVectorizeEnvMock: vi.fn(),
    stripHtmlMock: vi.fn((value: string) => value.replace(/<[^>]+>/g, '').trim()),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ 'x-ratelimit-remaining': '59' })),
    getUserPlanMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    generateQuestMock: vi.fn(),
    addOrUpdateNodeMock: vi.fn(),
    searchLifeGraphMock: vi.fn(),
    getGamificationDataMock: vi.fn(),
    saveGamificationDataMock: vi.fn(),
    awardXPMock: vi.fn(),
    checkQuestAchievementsMock: vi.fn(),
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
  getCloudflareAtomicCounterBinding: getCloudflareAtomicCounterBindingMock,
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

vi.mock('@/lib/memory/life-graph', () => ({
  addOrUpdateNode: addOrUpdateNodeMock,
  searchLifeGraph: searchLifeGraphMock,
}))

vi.mock('@/lib/gamification/streak', () => ({
  getGamificationData: getGamificationDataMock,
  saveGamificationData: saveGamificationDataMock,
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: awardXPMock,
}))

vi.mock('@/lib/quests/quest-achievements', () => ({
  checkQuestAchievements: checkQuestAchievementsMock,
}))

import { GET as GET_QUESTS, POST as POST_QUESTS } from '@/app/api/v1/quests/route'
import { GET as GET_QUEST, PATCH as PATCH_QUEST } from '@/app/api/v1/quests/[questId]/route'
import { buildQuestIndexKey, buildQuestRecordKey } from '@/lib/quests/quest-record-store'

type TestKV = KVStore & { _store: Map<string, string> }

function makeKV(): TestKV {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    list: async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    },
    _store: store,
  }
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

function makeRequest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

function makeParams(questId = 'quest_123') {
  return { params: Promise.resolve({ questId }) }
}

describe('quest route read-back proof', () => {
  let kv: TestKV

  beforeEach(() => {
    vi.clearAllMocks()
    kv = makeKV()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getCloudflareAtomicCounterBindingMock.mockReturnValue(null)
    getCloudflareVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
    getUserPlanMock.mockResolvedValue('pro')
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 0,
    })
    generateQuestMock.mockResolvedValue(makeQuest())
    searchLifeGraphMock.mockResolvedValue([])
    addOrUpdateNodeMock.mockResolvedValue(null)
    getGamificationDataMock.mockResolvedValue({
      userId: 'user_123',
      totalXP: 0,
      level: 1,
      avatarTier: 1,
      habits: [],
      achievements: [],
      xpLog: [],
      xpLogDate: '2026-04-26',
      loginStreak: 0,
      lastLoginDate: '2026-04-26',
      lastUpdatedAt: 0,
    })
    saveGamificationDataMock.mockResolvedValue(undefined)
    awardXPMock.mockResolvedValue(10)
    checkQuestAchievementsMock.mockReturnValue([])
  })

  it('persists quest creation and serves the committed record through list and detail reads', async () => {
    const createRes = await POST_QUESTS(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: '<b>Learn Spanish quickly</b>',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )
    const createBody = await createRes.json() as { success: boolean; quest: Quest }

    expect(createRes.status).toBe(201)
    expect(createBody.quest).toMatchObject({
      id: 'quest_123',
      userId: 'user_123',
      status: 'draft',
    })
    expect(kv._store.has(buildQuestRecordKey('user_123', 'quest_123'))).toBe(true)
    expect(kv._store.has(buildQuestIndexKey('user_123'))).toBe(true)

    const listRes = await GET_QUESTS(makeRequest('GET', '/api/v1/quests'))
    const listBody = await listRes.json() as {
      success: boolean
      quests: Quest[]
      activeCount: number
    }

    expect(listRes.status).toBe(200)
    expect(listBody.quests).toHaveLength(1)
    expect(listBody.quests[0]).toMatchObject({
      id: 'quest_123',
      userId: 'user_123',
      status: 'draft',
    })
    expect(listBody.activeCount).toBe(0)

    const detailRes = await GET_QUEST(makeRequest('GET', '/api/v1/quests/quest_123'), makeParams())
    const detailBody = await detailRes.json() as { success: boolean; quest: Quest }

    expect(detailRes.status).toBe(200)
    expect(detailBody.quest).toMatchObject({
      id: 'quest_123',
      userId: 'user_123',
      status: 'draft',
    })
  })

  it('updates quest status through PATCH and serves the started quest on subsequent reads', async () => {
    await POST_QUESTS(
      makeRequest('POST', '/api/v1/quests', JSON.stringify({
        userGoal: 'Learn Spanish quickly with daily practice',
        category: 'learning',
        difficulty: 'easy',
        targetDurationDays: 30,
      })),
    )

    const patchRes = await PATCH_QUEST(
      makeRequest('PATCH', '/api/v1/quests/quest_123', JSON.stringify({ action: 'start' })),
      makeParams(),
    )
    const patchBody = await patchRes.json() as { success: boolean; quest: Quest }

    expect(patchRes.status).toBe(200)
    expect(patchBody.quest).toMatchObject({
      id: 'quest_123',
      status: 'active',
      startedAt: expect.any(Number),
    })

    const detailRes = await GET_QUEST(makeRequest('GET', '/api/v1/quests/quest_123'), makeParams())
    const detailBody = await detailRes.json() as { success: boolean; quest: Quest }

    expect(detailRes.status).toBe(200)
    expect(detailBody.quest).toMatchObject({
      id: 'quest_123',
      status: 'active',
      startedAt: expect.any(Number),
    })

    const listRes = await GET_QUESTS(makeRequest('GET', '/api/v1/quests?status=active'))
    const listBody = await listRes.json() as { success: boolean; quests: Quest[]; activeCount: number }

    expect(listRes.status).toBe(200)
    expect(listBody.activeCount).toBe(1)
    expect(listBody.quests).toHaveLength(1)
    expect(listBody.quests[0]).toMatchObject({
      id: 'quest_123',
      status: 'active',
    })
  })
})
