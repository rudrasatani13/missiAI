import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Quest, QuestAchievementContext } from '@/types/quests'
import type { GamificationData, Achievement } from '@/types/gamification'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  logRequestMock,
  logErrorMock,
  getQuestMock,
  updateQuestMock,
  deleteQuestMock,
  getQuestsMock,
  checkQuestAchievementsMock,
  getGamificationDataMock,
  saveGamificationDataMock,
  awardXPMock,
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
    getQuestMock: vi.fn(),
    updateQuestMock: vi.fn(),
    deleteQuestMock: vi.fn(),
    getQuestsMock: vi.fn(),
    checkQuestAchievementsMock: vi.fn(),
    getGamificationDataMock: vi.fn(),
    saveGamificationDataMock: vi.fn(),
    awardXPMock: vi.fn(),
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
  getQuest: getQuestMock,
  updateQuest: updateQuestMock,
  deleteQuest: deleteQuestMock,
  getQuests: getQuestsMock,
}))

vi.mock('@/lib/quests/quest-achievements', () => ({
  checkQuestAchievements: checkQuestAchievementsMock,
}))

vi.mock('@/lib/gamification/streak', () => ({
  getGamificationData: getGamificationDataMock,
  saveGamificationData: saveGamificationDataMock,
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: awardXPMock,
}))

import { DELETE, GET, PATCH } from '@/app/api/v1/quests/[questId]/route'

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

function makeGamificationData(): GamificationData {
  return {
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
  }
}

function makeRequest(method: 'GET' | 'PATCH' | 'DELETE', body?: string): NextRequest {
  return new NextRequest('http://localhost/api/v1/quests/quest_123', {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

function makeParams(questId = 'quest_123') {
  return { params: Promise.resolve({ questId }) }
}

describe('quest detail parent route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getQuestMock.mockResolvedValue(makeQuest())
    updateQuestMock.mockResolvedValue(makeQuest({ status: 'active', startedAt: 2000 }))
    deleteQuestMock.mockResolvedValue(true)
    getQuestsMock.mockResolvedValue([makeQuest({ status: 'active', startedAt: 2000 })])
    checkQuestAchievementsMock.mockReturnValue([])
    getGamificationDataMock.mockResolvedValue(makeGamificationData())
    saveGamificationDataMock.mockResolvedValue(undefined)
    awardXPMock.mockResolvedValue(10)
  })

  it('returns 401 when auth fails on GET', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest('GET'), makeParams())

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 503 when KV is unavailable on GET', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await GET(makeRequest('GET'), makeParams())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Storage unavailable' })
  })

  it('returns 404 when quest is missing on GET', async () => {
    getQuestMock.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('GET'), makeParams())

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Quest not found' })
  })

  it('returns 400 for invalid JSON on PATCH', async () => {
    const res = await PATCH(makeRequest('PATCH', '{'), makeParams())

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns validation error for invalid patch action', async () => {
    const res = await PATCH(
      makeRequest('PATCH', JSON.stringify({ action: 'finish' })),
      makeParams(),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toContain('Validation error: action')
  })

  it('starts a draft quest, checks achievements, and awards XP on PATCH', async () => {
    const draftQuest = makeQuest({ status: 'draft', startedAt: null })
    const startedQuest = makeQuest({ status: 'active', startedAt: 5000 })
    const gamData = makeGamificationData()
    const newAchievements: Achievement[] = [
      {
        id: 'first_quest_started',
        title: 'Adventurer',
        description: 'Start your first quest',
        xpBonus: 10,
        unlockedAt: 6000,
      },
    ]

    getQuestMock.mockResolvedValueOnce(draftQuest)
    updateQuestMock.mockResolvedValueOnce(startedQuest)
    getQuestsMock.mockResolvedValueOnce([startedQuest])
    getGamificationDataMock.mockResolvedValueOnce(gamData)
    checkQuestAchievementsMock.mockReturnValueOnce(newAchievements)

    const res = await PATCH(
      makeRequest('PATCH', JSON.stringify({ action: 'start' })),
      makeParams(),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      quest: startedQuest,
      newAchievements,
    })
    expect(updateQuestMock).toHaveBeenCalledWith(kvMock, 'user_123', 'quest_123', {
      status: 'active',
      startedAt: expect.any(Number),
    })
    expect(checkQuestAchievementsMock).toHaveBeenCalledWith(
      [startedQuest],
      gamData,
      { questJustStarted: startedQuest } satisfies QuestAchievementContext,
    )
    expect(saveGamificationDataMock).toHaveBeenCalledWith(kvMock, 'user_123', gamData)
    expect(awardXPMock).toHaveBeenCalledWith(kvMock, 'user_123', 'achievement', 10)
  })

  it('returns 400 when resuming a non-abandoned quest', async () => {
    getQuestMock.mockResolvedValueOnce(makeQuest({ status: 'active' }))

    const res = await PATCH(
      makeRequest('PATCH', JSON.stringify({ action: 'resume' })),
      makeParams(),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Only abandoned quests can be resumed',
    })
  })

  it('deletes a quest on DELETE', async () => {
    const res = await DELETE(makeRequest('DELETE'), makeParams())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(deleteQuestMock).toHaveBeenCalledWith(kvMock, 'user_123', 'quest_123')
  })
})
