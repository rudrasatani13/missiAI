import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Quest } from '@/types/quests'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  logRequestMock,
  logErrorMock,
  getQuestsMock,
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
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    getQuestsMock: vi.fn(),
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

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/quests/quest-store', () => ({
  getQuests: getQuestsMock,
}))

import { GET } from '@/app/api/v1/quests/stats/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'quest_123',
    userId: 'user_123',
    title: 'Spanish Sprint',
    description: 'Build a consistent Spanish habit',
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

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/quests/stats', {
    method: 'GET',
  })
}

describe('quest stats parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getQuestsMock.mockResolvedValue([])
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest())

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns empty stats when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      stats: {
        totalQuests: 0,
        activeQuests: 0,
        completedQuests: 0,
        abandonedQuests: 0,
        totalMissionsCompleted: 0,
        totalQuestXP: 0,
        bossesDefeated: 0,
      },
    })
  })

  it('aggregates quest counts, mission totals, xp, and boss completions on GET', async () => {
    getQuestsMock.mockResolvedValueOnce([
      makeQuest({
        id: 'active_1',
        status: 'active',
        completedMissions: 3,
        totalXPEarned: 50,
        chapters: [
          {
            chapterNumber: 1,
            title: 'Week 1',
            description: 'desc',
            missions: [
              {
                id: 'm1',
                title: 'Boss 1',
                description: 'desc',
                chapterNumber: 1,
                missionNumber: 1,
                xpReward: 25,
                isBoss: true,
                status: 'completed',
                completedAt: 100,
                unlockedAt: 50,
              },
              {
                id: 'm2',
                title: 'Normal',
                description: 'desc',
                chapterNumber: 1,
                missionNumber: 2,
                xpReward: 10,
                isBoss: false,
                status: 'completed',
                completedAt: 110,
                unlockedAt: 60,
              },
            ],
          },
        ],
      }),
      makeQuest({
        id: 'completed_1',
        status: 'completed',
        completedMissions: 5,
        totalXPEarned: 80,
        chapters: [
          {
            chapterNumber: 1,
            title: 'Week 2',
            description: 'desc',
            missions: [
              {
                id: 'm3',
                title: 'Boss 2',
                description: 'desc',
                chapterNumber: 1,
                missionNumber: 1,
                xpReward: 50,
                isBoss: true,
                status: 'completed',
                completedAt: 200,
                unlockedAt: 150,
              },
              {
                id: 'm4',
                title: 'Locked boss',
                description: 'desc',
                chapterNumber: 1,
                missionNumber: 2,
                xpReward: 50,
                isBoss: true,
                status: 'available',
                completedAt: null,
                unlockedAt: 160,
              },
            ],
          },
        ],
      }),
      makeQuest({
        id: 'abandoned_1',
        status: 'abandoned',
        completedMissions: 2,
        totalXPEarned: 20,
        chapters: [],
      }),
    ])

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      stats: {
        totalQuests: 3,
        activeQuests: 1,
        completedQuests: 1,
        abandonedQuests: 1,
        totalMissionsCompleted: 10,
        totalQuestXP: 150,
        bossesDefeated: 2,
      },
    })
    expect(logRequestMock).toHaveBeenCalledWith('quests.stats', 'user_123', expect.any(Number))
  })

  it('returns 500 when quest loading fails on GET', async () => {
    const error = new Error('kv read failed')
    getQuestsMock.mockRejectedValueOnce(error)

    const res = await GET(makeRequest())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Failed to load stats' })
    expect(logErrorMock).toHaveBeenCalledWith('quests.stats.error', error, 'user_123')
  })
})
