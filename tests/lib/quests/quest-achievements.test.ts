import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkQuestAchievements } from '@/lib/quests/quest-achievements'
import type { GamificationData } from '@/types/gamification'
import type { Quest, QuestAchievementContext } from '@/types/quests'

function createBaseGamificationData(): GamificationData {
  return {
    userId: 'user-123',
    totalXP: 100,
    level: 1,
    avatarTier: 1,
    loginStreak: 1,
    habits: [],
    achievements: [],
    xpLog: [],
    xpLogDate: '',
    lastLoginDate: '',
    lastUpdatedAt: Date.now(),
  }
}

function createTestQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'quest-1',
    userId: 'user-123',
    title: 'Test Quest',
    description: 'A test quest',
    goalNodeId: null,
    category: 'learning',
    difficulty: 'medium',
    chapters: [{
      chapterNumber: 1,
      title: 'Chapter 1',
      description: 'First chapter',
      missions: [{
        id: 'mission-1',
        title: 'Mission 1',
        description: 'desc',
        chapterNumber: 1,
        missionNumber: 1,
        xpReward: 10,
        isBoss: false,
        status: 'completed',
        completedAt: Date.now(),
        unlockedAt: Date.now() - 1000,
      }],
    }],
    status: 'completed',
    createdAt: Date.now() - 86400000,
    startedAt: Date.now() - 86400000,
    completedAt: Date.now(),
    targetDurationDays: 30,
    totalMissions: 1,
    completedMissions: 1,
    totalXPEarned: 10,
    coverEmoji: '🎯',
    ...overrides,
  }
}

describe('Quest Achievements', () => {
  let gamData: GamificationData

  beforeEach(() => {
    gamData = createBaseGamificationData()
  })

  it('should unlock first_quest_started when quest is started', () => {
    const quest = createTestQuest({ status: 'active' })
    const ctx: QuestAchievementContext = { questJustStarted: quest }
    const result = checkQuestAchievements([quest], gamData, ctx)
    expect(result.some(a => a.id === 'first_quest_started')).toBe(true)
    expect(gamData.totalXP).toBeGreaterThan(100)
  })

  it('should unlock first_quest_completed when quest is completed', () => {
    const quest = createTestQuest()
    const ctx: QuestAchievementContext = { questJustCompleted: quest }
    const result = checkQuestAchievements([quest], gamData, ctx)
    expect(result.some(a => a.id === 'first_quest_completed')).toBe(true)
  })

  it('should unlock boss_slayer when boss mission is completed', () => {
    const bossMission = {
      id: 'boss-1', title: 'Boss', description: '', chapterNumber: 1,
      missionNumber: 1, xpReward: 50, isBoss: true,
      status: 'completed' as const, completedAt: Date.now(), unlockedAt: Date.now() - 1000,
    }
    const ctx: QuestAchievementContext = { missionJustCompleted: bossMission }
    const result = checkQuestAchievements([], gamData, ctx)
    expect(result.some(a => a.id === 'boss_slayer')).toBe(true)
  })

  it('should not unlock already unlocked achievements', () => {
    gamData.achievements = [{
      id: 'first_quest_started',
      title: 'Adventurer',
      description: 'Start your first quest',
      xpBonus: 10,
      unlockedAt: Date.now() - 86400000,
    }]
    const quest = createTestQuest({ status: 'active' })
    const ctx: QuestAchievementContext = { questJustStarted: quest }
    const result = checkQuestAchievements([quest], gamData, ctx)
    expect(result.some(a => a.id === 'first_quest_started')).toBe(false)
  })

  it('should unlock quest_master when 5 quests are completed', () => {
    const quests = Array.from({ length: 5 }, (_, i) =>
      createTestQuest({ id: `q-${i}`, status: 'completed' }),
    )
    const ctx: QuestAchievementContext = { questJustCompleted: quests[4] }
    const result = checkQuestAchievements(quests, gamData, ctx)
    expect(result.some(a => a.id === 'quest_master')).toBe(true)
  })
})
