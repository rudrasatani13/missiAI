import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getQuests,
  saveQuests,
  getQuest,
  addQuest,
  updateQuest,
  deleteQuest,
  getActiveQuestCount,
  checkQuestGenRateLimit,
  incrementQuestGenRateLimit,
  verifyAndConsumeBossToken,
  storeBossToken,
} from '@/lib/quests/quest-store'
import type { Quest } from '@/types/quests'

// ─── Mock KV Store ────────────────────────────────────────────────────────────

function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }
}

function createTestQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'test-quest-1',
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
        description: 'First mission',
        chapterNumber: 1,
        missionNumber: 1,
        xpReward: 10,
        isBoss: false,
        status: 'available',
        completedAt: null,
        unlockedAt: Date.now(),
      }],
    }],
    status: 'draft',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    targetDurationDays: 30,
    totalMissions: 1,
    completedMissions: 0,
    totalXPEarned: 0,
    coverEmoji: '🎯',
    ...overrides,
  }
}

describe('Quest Store', () => {
  let kv: ReturnType<typeof createMockKV>

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('getQuests / saveQuests', () => {
    it('should return empty array when no quests exist', async () => {
      const result = await getQuests(kv, 'user-123')
      expect(result).toEqual([])
    })

    it('should save and retrieve quests', async () => {
      const quest = createTestQuest()
      await saveQuests(kv, 'user-123', [quest])
      const result = await getQuests(kv, 'user-123')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Test Quest')
    })

    it('should throw if quest userId does not match', async () => {
      const quest = createTestQuest({ userId: 'other-user' })
      await expect(saveQuests(kv, 'user-123', [quest])).rejects.toThrow()
    })
  })

  describe('getQuest', () => {
    it('should return null for non-existent quest', async () => {
      const result = await getQuest(kv, 'user-123', 'nonexistent')
      expect(result).toBeNull()
    })

    it('should return quest by ID', async () => {
      const quest = createTestQuest()
      await saveQuests(kv, 'user-123', [quest])
      const result = await getQuest(kv, 'user-123', 'test-quest-1')
      expect(result).not.toBeNull()
      expect(result?.title).toBe('Test Quest')
    })
  })

  describe('addQuest', () => {
    it('should add quest and set userId', async () => {
      const quest = createTestQuest({ userId: '' })
      await addQuest(kv, 'user-123', quest)
      const result = await getQuests(kv, 'user-123')
      expect(result).toHaveLength(1)
      expect(result[0].userId).toBe('user-123')
    })
  })

  describe('updateQuest', () => {
    it('should update quest fields', async () => {
      const quest = createTestQuest()
      await saveQuests(kv, 'user-123', [quest])
      const updated = await updateQuest(kv, 'user-123', 'test-quest-1', {
        status: 'active',
        startedAt: Date.now(),
      })
      expect(updated).not.toBeNull()
      expect(updated?.status).toBe('active')
    })

    it('should not allow userId override', async () => {
      const quest = createTestQuest()
      await saveQuests(kv, 'user-123', [quest])
      const updated = await updateQuest(kv, 'user-123', 'test-quest-1', {
        userId: 'attacker' as any,
        status: 'active',
      })
      expect(updated?.userId).toBe('user-123')
    })
  })

  describe('deleteQuest', () => {
    it('should delete existing quest', async () => {
      const quest = createTestQuest()
      await saveQuests(kv, 'user-123', [quest])
      const result = await deleteQuest(kv, 'user-123', 'test-quest-1')
      expect(result).toBe(true)
      const remaining = await getQuests(kv, 'user-123')
      expect(remaining).toHaveLength(0)
    })

    it('should return false for non-existent quest', async () => {
      const result = await deleteQuest(kv, 'user-123', 'nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('getActiveQuestCount', () => {
    it('should count only active quests', async () => {
      const quests = [
        createTestQuest({ id: 'q1', status: 'active' }),
        createTestQuest({ id: 'q2', status: 'completed' }),
        createTestQuest({ id: 'q3', status: 'active' }),
      ]
      await saveQuests(kv, 'user-123', quests)
      const count = await getActiveQuestCount(kv, 'user-123')
      expect(count).toBe(2)
    })
  })

  describe('checkQuestGenRateLimit', () => {
    it('should allow first generation', async () => {
      const result = await checkQuestGenRateLimit(kv, 'user-123', 'free')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(3)
    })

    it('should block after limit exceeded (free)', async () => {
      // Simulate 3 previous generations
      const isoWeek = (() => {
        const now = new Date()
        const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86400000) + 1
        const weekNumber = Math.ceil((dayOfYear + yearStart.getUTCDay()) / 7)
        return `${now.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`
      })()
      await kv.put(`ratelimit:quest-gen:user-123:${isoWeek}`, '3')

      const result = await checkQuestGenRateLimit(kv, 'user-123', 'free')
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })
  })

  describe('Boss Token', () => {
    it('should store and verify boss token', async () => {
      const token = 'test-token-abc123'
      await storeBossToken(kv, token, 'quest-1', 'user-123')
      const isValid = await verifyAndConsumeBossToken(kv, token, 'quest-1', 'user-123')
      expect(isValid).toBe(true)
    })

    it('should reject token with wrong questId', async () => {
      const token = 'test-token-def456'
      await storeBossToken(kv, token, 'quest-1', 'user-123')
      const isValid = await verifyAndConsumeBossToken(kv, token, 'quest-OTHER', 'user-123')
      expect(isValid).toBe(false)
    })

    it('should reject token with wrong userId', async () => {
      const token = 'test-token-ghi789'
      await storeBossToken(kv, token, 'quest-1', 'user-123')
      const isValid = await verifyAndConsumeBossToken(kv, token, 'quest-1', 'attacker-456')
      expect(isValid).toBe(false)
    })

    it('should consume token (single-use)', async () => {
      const token = 'test-token-single'
      await storeBossToken(kv, token, 'quest-1', 'user-123')
      await verifyAndConsumeBossToken(kv, token, 'quest-1', 'user-123')
      // Second use should fail
      const isValid = await verifyAndConsumeBossToken(kv, token, 'quest-1', 'user-123')
      expect(isValid).toBe(false)
    })
  })
})
