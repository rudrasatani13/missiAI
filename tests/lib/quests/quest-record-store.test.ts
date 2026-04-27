import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KVListResult } from '@/types'
import {
  buildQuestRecordKey,
  buildQuestRecordPrefix,
  buildQuestIndexKey,
  getQuestRecord,
  putQuestRecord,
  deleteQuestRecord,
  getQuestIndex,
  saveQuestIndex,
  buildQuestSnapshot,
  addQuestToIndex,
  removeQuestFromIndex,
  normalizeQuestRecord,
  type QuestIndexRecord,
} from '@/lib/quests/quest-record-store'
import type { Quest, QuestMission } from '@/types/quests'

function createMockKV(withList = false) {
  const store = new Map<string, string>()
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    _store: store,
  }

  if (withList) {
    return {
      ...kv,
      list: vi.fn(async (options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KVListResult> => {
        const prefix = options?.prefix ?? ''
        return {
          keys: [...store.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((name) => ({ name })),
          list_complete: true,
        }
      }),
    }
  }

  return kv
}

function makeMission(overrides: Partial<QuestMission> = {}): QuestMission {
  return {
    id: 'mission-1',
    title: 'Mission One',
    description: 'First mission description',
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
  return {
    id: 'quest-1',
    userId: 'user-123',
    title: 'Test Quest',
    description: 'A test quest description',
    goalNodeId: null,
    category: 'learning',
    difficulty: 'easy',
    chapters: [
      {
        chapterNumber: 1,
        title: 'Chapter One',
        description: 'The beginning',
        missions: [makeMission()],
      },
    ],
    status: 'draft',
    createdAt: 1000,
    startedAt: null,
    completedAt: null,
    targetDurationDays: 30,
    totalMissions: 1,
    completedMissions: 0,
    totalXPEarned: 0,
    coverEmoji: '\u{1F3AF}',
    ...overrides,
  }
}

describe('Quest Record Store', () => {
  let kv: ReturnType<typeof createMockKV>

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('key builders', () => {
    it('builds record key with correct prefix', () => {
      const key = buildQuestRecordKey('user-123', 'quest-abc')
      expect(key).toBe('quests:v2:record:user-123:quest-abc')
    })

    it('builds record prefix with trailing colon', () => {
      const prefix = buildQuestRecordPrefix('user-123')
      expect(prefix).toBe('quests:v2:record:user-123:')
    })

    it('builds index key', () => {
      const key = buildQuestIndexKey('user-123')
      expect(key).toBe('quests:v2:index:user-123')
    })
  })

  describe('normalizeQuestRecord', () => {
    it('returns null for non-record values', () => {
      expect(normalizeQuestRecord(null, 'user-123', 'quest-1')).toBeNull()
      expect(normalizeQuestRecord('string', 'user-123', 'quest-1')).toBeNull()
      expect(normalizeQuestRecord(42, 'user-123', 'quest-1')).toBeNull()
    })

    it('returns null when stored userId does not match expected', () => {
      const quest = makeQuest({ userId: 'other-user' })
      expect(normalizeQuestRecord(quest, 'user-123', 'quest-1')).toBeNull()
    })

    it('returns null when stored id does not match expected', () => {
      const quest = makeQuest({ id: 'different-id' })
      expect(normalizeQuestRecord(quest, 'user-123', 'quest-1')).toBeNull()
    })

    it('fills in missing userId from expected parameter', () => {
      const quest = { ...makeQuest(), userId: undefined as unknown as string }
      const result = normalizeQuestRecord(quest, 'user-123', 'quest-1')
      expect(result).not.toBeNull()
      expect(result!.userId).toBe('user-123')
    })

    it('returns null when required fields are missing', () => {
      expect(normalizeQuestRecord({}, 'user-123', 'quest-1')).toBeNull()
      expect(normalizeQuestRecord({ id: 'quest-1' }, 'user-123', 'quest-1')).toBeNull()
    })

    it('normalizes a valid quest record', () => {
      const quest = makeQuest()
      const result = normalizeQuestRecord(quest, 'user-123', 'quest-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('quest-1')
      expect(result!.userId).toBe('user-123')
      expect(result!.title).toBe('Test Quest')
      expect(result!.status).toBe('draft')
      expect(result!.category).toBe('learning')
      expect(result!.chapters).toHaveLength(1)
      expect(result!.chapters[0].missions).toHaveLength(1)
    })

    it('truncates long strings to limits', () => {
      const quest = makeQuest({
        title: 'a'.repeat(500),
        description: 'b'.repeat(1000),
      })
      const result = normalizeQuestRecord(quest, 'user-123', 'quest-1')
      expect(result).not.toBeNull()
      expect(result!.title.length).toBeLessThanOrEqual(80)
      expect(result!.description.length).toBeLessThanOrEqual(400)
    })

    it('defaults missing coverEmoji to crystal ball', () => {
      const quest = { ...makeQuest(), coverEmoji: undefined as unknown as string }
      const result = normalizeQuestRecord(quest, 'user-123', 'quest-1')
      expect(result).not.toBeNull()
      expect(result!.coverEmoji).toBe('🔮')
    })
  })

  describe('getQuestRecord / putQuestRecord', () => {
    it('stores and retrieves a quest record', async () => {
      const quest = makeQuest()
      await putQuestRecord(kv, 'user-123', quest)

      const retrieved = await getQuestRecord(kv, 'user-123', 'quest-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe('quest-1')
      expect(retrieved!.title).toBe('Test Quest')
    })

    it('returns null for missing quest', async () => {
      const result = await getQuestRecord(kv, 'user-123', 'nonexistent')
      expect(result).toBeNull()
    })

    it('throws on invalid quest payload during put', async () => {
      const invalidQuest = { ...makeQuest(), title: '' }
      await expect(putQuestRecord(kv, 'user-123', invalidQuest as Quest)).rejects.toThrow('Invalid Quest payload')
    })
  })

  describe('deleteQuestRecord', () => {
    it('deletes a quest record', async () => {
      const quest = makeQuest()
      await putQuestRecord(kv, 'user-123', quest)
      expect(await getQuestRecord(kv, 'user-123', 'quest-1')).not.toBeNull()

      await deleteQuestRecord(kv, 'user-123', 'quest-1')
      expect(await getQuestRecord(kv, 'user-123', 'quest-1')).toBeNull()
    })
  })

  describe('getQuestIndex / saveQuestIndex', () => {
    it('stores and retrieves an index', async () => {
      const index: QuestIndexRecord = {
        questIds: ['quest-1', 'quest-2'],
        updatedAt: Date.now(),
      }
      await saveQuestIndex(kv, 'user-123', index)

      const retrieved = await getQuestIndex(kv, 'user-123')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.questIds).toEqual(['quest-1', 'quest-2'])
    })

    it('deduplicates questIds in index', async () => {
      const index: QuestIndexRecord = {
        questIds: ['quest-1', 'quest-1', 'quest-2'],
        updatedAt: Date.now(),
      }
      await saveQuestIndex(kv, 'user-123', index)

      const retrieved = await getQuestIndex(kv, 'user-123')
      expect(retrieved!.questIds).toEqual(['quest-1', 'quest-2'])
    })

    it('caps index at max size', async () => {
      const index: QuestIndexRecord = {
        questIds: Array.from({ length: 30 }, (_, i) => `quest-${i}`),
        updatedAt: Date.now(),
      }
      await saveQuestIndex(kv, 'user-123', index)

      const retrieved = await getQuestIndex(kv, 'user-123')
      expect(retrieved!.questIds.length).toBeLessThanOrEqual(20)
    })

    it('returns null for missing index', async () => {
      const result = await getQuestIndex(kv, 'user-123')
      expect(result).toBeNull()
    })
  })

  describe('buildQuestSnapshot', () => {
    it('returns empty array when no index exists', async () => {
      const snapshot = await buildQuestSnapshot(kv, 'user-123')
      expect(snapshot).toEqual([])
    })

    it('falls back to listing v2 quest records when index is missing but kv.list is available', async () => {
      const listedKV = createMockKV(true)
      await putQuestRecord(listedKV, 'user-123', makeQuest({ id: 'quest-1', title: 'First' }))
      await putQuestRecord(listedKV, 'user-123', makeQuest({ id: 'quest-2', title: 'Second' }))

      const snapshot = await buildQuestSnapshot(listedKV, 'user-123')

      expect(snapshot).toHaveLength(2)
      expect(snapshot.map((quest) => quest.id)).toEqual(['quest-1', 'quest-2'])
    })

    it('returns quests in index order', async () => {
      await putQuestRecord(kv, 'user-123', makeQuest({ id: 'quest-1', title: 'First' }))
      await putQuestRecord(kv, 'user-123', makeQuest({ id: 'quest-2', title: 'Second' }))
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-2', 'quest-1'], updatedAt: Date.now() })

      const snapshot = await buildQuestSnapshot(kv, 'user-123')
      expect(snapshot).toHaveLength(2)
      expect(snapshot[0].title).toBe('Second')
      expect(snapshot[1].title).toBe('First')
    })

    it('skips missing quest records in index', async () => {
      await putQuestRecord(kv, 'user-123', makeQuest({ id: 'quest-1' }))
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-1', 'quest-missing'], updatedAt: Date.now() })

      const snapshot = await buildQuestSnapshot(kv, 'user-123')
      expect(snapshot).toHaveLength(1)
      expect(snapshot[0].id).toBe('quest-1')
    })
  })

  describe('addQuestToIndex', () => {
    it('adds a questId to an empty index', async () => {
      await addQuestToIndex(kv, 'user-123', 'quest-1')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index!.questIds).toEqual(['quest-1'])
    })

    it('does not duplicate existing questIds', async () => {
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-1'], updatedAt: 1000 })
      await addQuestToIndex(kv, 'user-123', 'quest-1')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index!.questIds).toEqual(['quest-1'])
    })

    it('appends new questIds', async () => {
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-1'], updatedAt: 1000 })
      await addQuestToIndex(kv, 'user-123', 'quest-2')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index!.questIds).toEqual(['quest-1', 'quest-2'])
    })
  })

  describe('removeQuestFromIndex', () => {
    it('removes a questId from index', async () => {
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-1', 'quest-2'], updatedAt: 1000 })
      await removeQuestFromIndex(kv, 'user-123', 'quest-1')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index!.questIds).toEqual(['quest-2'])
    })

    it('is a no-op when questId not in index', async () => {
      await saveQuestIndex(kv, 'user-123', { questIds: ['quest-1'], updatedAt: 1000 })
      await removeQuestFromIndex(kv, 'user-123', 'quest-2')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index!.questIds).toEqual(['quest-1'])
    })

    it('is a no-op when no index exists', async () => {
      await removeQuestFromIndex(kv, 'user-123', 'quest-1')
      const index = await getQuestIndex(kv, 'user-123')
      expect(index).toBeNull()
    })
  })
})
