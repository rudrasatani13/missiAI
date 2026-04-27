import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Quest, QuestMission } from '@/types/quests'
import type { GamificationData, Achievement } from '@/types/gamification'

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getCloudflareKVBindingMock,
  getCloudflareVectorizeEnvMock,
  logRequestMock,
  logErrorMock,
  getQuestMock,
  getQuestsMock,
  updateQuestMock,
  verifyAndConsumeBossTokenMock,
  checkQuestAchievementsMock,
  getGamificationDataMock,
  saveGamificationDataMock,
  awardXPMock,
  addOrUpdateNodeMock,
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
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    getQuestMock: vi.fn(),
    getQuestsMock: vi.fn(),
    updateQuestMock: vi.fn(),
    verifyAndConsumeBossTokenMock: vi.fn(),
    checkQuestAchievementsMock: vi.fn(),
    getGamificationDataMock: vi.fn(),
    saveGamificationDataMock: vi.fn(),
    awardXPMock: vi.fn(),
    addOrUpdateNodeMock: vi.fn(),
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

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/quests/quest-store', () => ({
  getQuest: getQuestMock,
  getQuests: getQuestsMock,
  updateQuest: updateQuestMock,
  verifyAndConsumeBossToken: verifyAndConsumeBossTokenMock,
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

vi.mock('@/lib/memory/life-graph', () => ({
  addOrUpdateNode: addOrUpdateNodeMock,
}))

import { POST } from '@/app/api/v1/quests/[questId]/missions/[missionId]/complete/route'

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

function makeMission(overrides: Partial<QuestMission> = {}): QuestMission {
  return {
    id: 'mission_1',
    title: 'First Mission',
    description: 'Complete the first step',
    chapterNumber: 1,
    missionNumber: 1,
    xpReward: 10,
    isBoss: false,
    status: 'available',
    completedAt: null,
    unlockedAt: Date.now(),
    ...overrides,
  }
}

function makeQuest(overrides: Partial<Quest> = {}): Quest {
  const missions: QuestMission[] = [
    makeMission({ id: 'mission_1', missionNumber: 1, chapterNumber: 1 }),
    makeMission({ id: 'mission_2', missionNumber: 2, chapterNumber: 1, status: 'locked', unlockedAt: null }),
  ]

  return {
    id: 'quest_123',
    userId: 'user_123',
    title: 'Test Quest',
    description: 'A test quest',
    goalNodeId: null,
    category: 'learning',
    difficulty: 'easy',
    chapters: [
      {
        chapterNumber: 1,
        title: 'Chapter One',
        description: 'The beginning',
        missions,
      },
    ],
    status: 'active',
    createdAt: Date.now(),
    startedAt: Date.now(),
    completedAt: null,
    targetDurationDays: 30,
    totalMissions: 2,
    completedMissions: 0,
    totalXPEarned: 0,
    coverEmoji: '\u{1F3AF}',
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

function makeRequest(
  questId: string,
  missionId: string,
  body?: { bossToken?: string },
): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/quests/${questId}/missions/${missionId}/complete`,
    {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
}

function makeParams(questId: string, missionId: string) {
  return { params: Promise.resolve({ questId, missionId }) }
}

describe('quest mission complete route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kvMock)
    getQuestMock.mockResolvedValue(makeQuest())
    getQuestsMock.mockResolvedValue([makeQuest()])
    updateQuestMock.mockResolvedValue(makeQuest())
    verifyAndConsumeBossTokenMock.mockResolvedValue(true)
    checkQuestAchievementsMock.mockReturnValue([])
    getGamificationDataMock.mockResolvedValue(makeGamificationData())
    saveGamificationDataMock.mockResolvedValue(undefined)
    awardXPMock.mockImplementation((_kv, _userId, _source, amount) => Promise.resolve(amount))
    addOrUpdateNodeMock.mockResolvedValue({ id: 'goal_node_1' })
    getCloudflareVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
  })

  it('returns 401 when auth fails', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 400 when questId is too long', async () => {
    const res = await POST(
      makeRequest('a'.repeat(21), 'mission_1'),
      makeParams('a'.repeat(21), 'mission_1'),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid quest or mission ID',
    })
  })

  it('returns 400 when missionId is too long', async () => {
    const res = await POST(
      makeRequest('quest_123', 'b'.repeat(21)),
      makeParams('quest_123', 'b'.repeat(21)),
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid quest or mission ID',
    })
  })

  it('returns 503 when KV is unavailable', async () => {
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Storage unavailable',
    })
  })

  it('returns 404 when quest is not found', async () => {
    getQuestMock.mockResolvedValueOnce(null)

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Quest not found',
    })
  })

  it('returns 400 when quest is not active', async () => {
    getQuestMock.mockResolvedValueOnce(makeQuest({ status: 'draft' }))

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Quest is not active',
    })
  })

  it('returns 404 when mission is not found', async () => {
    getQuestMock.mockResolvedValueOnce(makeQuest())

    const res = await POST(makeRequest('quest_123', 'nonexistent'), makeParams('quest_123', 'nonexistent'))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Mission not found',
    })
  })

  it('returns 400 when mission is already completed', async () => {
    const quest = makeQuest()
    quest.chapters[0].missions[0].status = 'completed'

    getQuestMock.mockResolvedValueOnce(quest)

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Mission already completed',
    })
  })

  it('returns 400 when mission is locked', async () => {
    const quest = makeQuest()
    quest.chapters[0].missions[0].status = 'locked'

    getQuestMock.mockResolvedValueOnce(quest)

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Mission is locked',
    })
  })

  it('returns 400 when boss mission is missing token', async () => {
    const quest = makeQuest()
    quest.chapters[0].missions[0].isBoss = true

    getQuestMock.mockResolvedValueOnce(quest)

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Boss token required for boss missions',
    })
  })

  it('returns 403 when boss token is invalid', async () => {
    const quest = makeQuest()
    quest.chapters[0].missions[0].isBoss = true

    getQuestMock.mockResolvedValueOnce(quest)
    verifyAndConsumeBossTokenMock.mockResolvedValueOnce(false)

    const res = await POST(
      makeRequest('quest_123', 'mission_1', { bossToken: 'bad-token' }),
      makeParams('quest_123', 'mission_1'),
    )

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Invalid or expired boss token',
    })
  })

  it('completes a normal mission and unlocks the next', async () => {
    const quest = makeQuest()
    getQuestMock.mockResolvedValueOnce(quest)
    updateQuestMock.mockImplementation((_kv, _userId, _questId, updates) => {
      return Promise.resolve({ ...quest, ...updates })
    })

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.mission.status).toBe('completed')
    expect(body.nextMission).not.toBeNull()
    expect(body.nextMission!.id).toBe('mission_2')
    expect(body.xpEarned).toBe(10)
    expect(body.questCompleted).toBe(false)
    expect(updateQuestMock).toHaveBeenCalled()
    expect(awardXPMock).toHaveBeenCalledWith(kvMock, 'user_123', 'achievement', 10)
  })

  it('completes a boss mission and finishes the quest', async () => {
    const quest = makeQuest({
      chapters: [
        {
          chapterNumber: 1,
          title: 'Chapter One',
          description: 'The beginning',
          missions: [
            makeMission({
              id: 'boss_mission',
              isBoss: true,
              status: 'available',
              xpReward: 25,
            }),
          ],
        },
      ],
      goalNodeId: 'goal_node_1',
      totalMissions: 1,
      completedMissions: 0,
    })

    getQuestMock.mockResolvedValueOnce(quest)
    updateQuestMock.mockImplementation((_kv, _userId, _questId, updates) => {
      return Promise.resolve({ ...quest, ...updates })
    })
    verifyAndConsumeBossTokenMock.mockResolvedValueOnce(true)

    const res = await POST(
      makeRequest('quest_123', 'boss_mission', { bossToken: 'valid-token' }),
      makeParams('quest_123', 'boss_mission'),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.mission.status).toBe('completed')
    expect(body.questCompleted).toBe(true)
    expect(body.xpEarned).toBe(25)
    expect(awardXPMock).toHaveBeenCalledWith(kvMock, 'user_123', 'achievement', 25)
    expect(addOrUpdateNodeMock).toHaveBeenCalled()
    expect(updateQuestMock).toHaveBeenCalled()
  })

  it('triggers achievements when conditions are met', async () => {
    const quest = makeQuest()
    const newAchievements: Achievement[] = [
      {
        id: 'chapter_cleared',
        title: 'Chapter Cleared',
        description: 'Complete a chapter',
        xpBonus: 20,
        unlockedAt: Date.now(),
      },
    ]

    getQuestMock.mockResolvedValueOnce(quest)
    checkQuestAchievementsMock.mockReturnValueOnce(newAchievements)
    updateQuestMock.mockImplementation((_kv, _userId, _questId, updates) => {
      return Promise.resolve({ ...quest, ...updates })
    })

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.newAchievements).toHaveLength(1)
    expect(body.newAchievements[0].id).toBe('chapter_cleared')
    expect(saveGamificationDataMock).toHaveBeenCalled()
  })

  it('handles last mission with no next mission to unlock', async () => {
    const quest = makeQuest({
      chapters: [
        {
          chapterNumber: 1,
          title: 'Chapter One',
          description: 'The beginning',
          missions: [
            makeMission({ id: 'mission_last', missionNumber: 1, chapterNumber: 1 }),
          ],
        },
      ],
      totalMissions: 1,
    })

    getQuestMock.mockResolvedValueOnce(quest)
    updateQuestMock.mockImplementation((_kv, _userId, _questId, updates) => {
      return Promise.resolve({ ...quest, ...updates })
    })

    const res = await POST(makeRequest('quest_123', 'mission_last'), makeParams('quest_123', 'mission_last'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.nextMission).toBeNull()
  })

  it('returns 500 on unexpected error during processing', async () => {
    getQuestMock.mockRejectedValueOnce(new Error('KV read failed'))

    const res = await POST(makeRequest('quest_123', 'mission_1'), makeParams('quest_123', 'mission_1'))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Failed to complete mission',
    })
    expect(logErrorMock).toHaveBeenCalledWith('missions.complete.error', expect.any(Error), 'user_123')
  })

  it('does not call life-graph update when quest completed but no goalNodeId', async () => {
    const quest = makeQuest({
      chapters: [
        {
          chapterNumber: 1,
          title: 'Chapter One',
          description: 'The beginning',
          missions: [
            makeMission({
              id: 'boss_mission',
              isBoss: true,
              status: 'available',
              xpReward: 25,
            }),
          ],
        },
      ],
      goalNodeId: null,
      totalMissions: 1,
      completedMissions: 0,
    })

    getQuestMock.mockResolvedValueOnce(quest)
    updateQuestMock.mockImplementation((_kv, _userId, _questId, updates) => {
      return Promise.resolve({ ...quest, ...updates })
    })
    verifyAndConsumeBossTokenMock.mockResolvedValueOnce(true)

    const res = await POST(
      makeRequest('quest_123', 'boss_mission', { bossToken: 'valid-token' }),
      makeParams('quest_123', 'boss_mission'),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(addOrUpdateNodeMock).not.toHaveBeenCalled()
  })
})
