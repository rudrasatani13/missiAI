import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Quest, QuestMission } from '@/types/quests'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getQuestMock,
  generateBossTokenMock,
  storeBossTokenMock,
  logRequestMock,
  logErrorMock,
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
    getQuestMock: vi.fn(),
    generateBossTokenMock: vi.fn(),
    storeBossTokenMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
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

vi.mock('@/lib/quests/quest-store', () => ({
  getQuest: getQuestMock,
  generateBossToken: generateBossTokenMock,
  storeBossToken: storeBossTokenMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

import { GET } from '@/app/api/v1/quests/[questId]/boss-token/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const TEST_QUEST_ID = 'quest_test_123'

function makeMission(overrides: Partial<QuestMission> = {}): QuestMission {
  return {
    id: 'mission_1',
    title: 'Mission',
    description: 'desc',
    chapterNumber: 1,
    missionNumber: 1,
    xpReward: 10,
    isBoss: false,
    status: 'completed',
    completedAt: 100,
    unlockedAt: 50,
    ...overrides,
  }
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: TEST_QUEST_ID,
    userId: 'user_123',
    title: 'Boss Quest',
    description: 'Defeat the boss',
    goalNodeId: null,
    category: 'learning',
    difficulty: 'hard',
    chapters: [
      {
        chapterNumber: 1,
        title: 'Chapter 1',
        description: 'First chapter',
        missions: [
          makeMission({ id: 'm1', title: 'Normal 1', isBoss: false, status: 'completed', completedAt: 100 }),
          makeMission({ id: 'm2', title: 'Boss', isBoss: true, status: 'available', completedAt: null }),
        ],
      },
    ],
    status: 'active',
    createdAt: 1000,
    startedAt: 2000,
    completedAt: null,
    targetDurationDays: 30,
    totalMissions: 2,
    completedMissions: 1,
    totalXPEarned: 0,
    coverEmoji: '👹',
    ...overrides,
  }
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/quests/quest_test_123/boss-token', {
    method: 'GET',
  })
}

describe('boss token parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getQuestMock.mockResolvedValue(makeQuest())
    generateBossTokenMock.mockResolvedValue('abc123signature')
    storeBossTokenMock.mockResolvedValue(undefined)
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 503 when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Storage unavailable' })
  })

  it('returns 503 when encryption secret is missing on GET', async () => {
    const originalEnv = process.env.MISSI_KV_ENCRYPTION_SECRET
    delete process.env.MISSI_KV_ENCRYPTION_SECRET

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    if (originalEnv) process.env.MISSI_KV_ENCRYPTION_SECRET = originalEnv

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Boss battle unavailable' })
  })

  it('returns 404 when quest is not found on GET', async () => {
    getQuestMock.mockResolvedValueOnce(null)

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Quest not found' })
  })

  it('returns 400 when quest is not active on GET', async () => {
    getQuestMock.mockResolvedValueOnce(makeQuest({ status: 'completed' }))

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Quest is not active' })
  })

  it('returns 400 when quest has no boss mission on GET', async () => {
    getQuestMock.mockResolvedValueOnce(
      makeQuest({
        chapters: [
          {
            chapterNumber: 1,
            title: 'Chapter 1',
            description: 'desc',
            missions: [makeMission({ id: 'm1', isBoss: false, status: 'completed' })],
          },
        ],
      }),
    )

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Quest has no boss mission' })
  })

  it('returns 400 when non-boss missions are not complete on GET', async () => {
    getQuestMock.mockResolvedValueOnce(
      makeQuest({
        chapters: [
          {
            chapterNumber: 1,
            title: 'Chapter 1',
            description: 'desc',
            missions: [
              makeMission({ id: 'm1', isBoss: false, status: 'available', completedAt: null }),
              makeMission({ id: 'm2', isBoss: true, status: 'available', completedAt: null }),
            ],
          },
        ],
      }),
    )

    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Complete all missions before the boss battle',
    })
  })

  it('generates and stores a boss token on GET', async () => {
    const res = await GET(makeRequest(), { params: Promise.resolve({ questId: TEST_QUEST_ID }) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, bossToken: 'abc123signature' })
    expect(generateBossTokenMock).toHaveBeenCalledWith(TEST_QUEST_ID, 'user_123', expect.any(String))
    expect(storeBossTokenMock).toHaveBeenCalledWith(kvMock, 'abc123signature', TEST_QUEST_ID, 'user_123')
    expect(logRequestMock).toHaveBeenCalledWith('boss-token.issued', 'user_123', expect.any(Number), {
      questId: TEST_QUEST_ID,
    })
  })
})
