// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useQuests } from '@/hooks/useQuests'
import type { Quest, QuestStats } from '@/types/quests'

// Setup global fetch mock
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const makeQuest = (overrides: Partial<Quest> = {}): Quest => ({
  id: 'quest-123',
  userId: 'user-1',
  title: 'Test Quest',
  description: 'A test quest',
  goalNodeId: null,
  category: 'learning',
  difficulty: 'easy',
  chapters: [],
  status: 'active',
  createdAt: Date.now(),
  startedAt: Date.now(),
  completedAt: null,
  targetDurationDays: 7,
  totalMissions: 5,
  completedMissions: 0,
  totalXPEarned: 0,
  coverEmoji: '🎯',
  ...overrides,
})

describe('useQuests hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default states', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))

    const { result } = renderHook(() => useQuests())

    // Wait for the mount effects to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.quests).toEqual([])
    expect(result.current.activeCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('fetchQuests', () => {
    it('fetches all quests and updates state', async () => {
      const mockQuests = [makeQuest({ id: 'q1' }), makeQuest({ id: 'q2' })]
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))

      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        quests: mockQuests,
        activeCount: 2
      })))

      await act(async () => {
        await result.current.fetchQuests()
      })

      expect(result.current.quests).toEqual(mockQuests)
      expect(result.current.activeCount).toBe(2)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('handles status filter', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      await act(async () => {
        await result.current.fetchQuests('active')
      })

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/quests?status=active')
    })

    it('handles fetch error', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      await act(async () => {
        await result.current.fetchQuests()
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Failed to load quests')
    })
  })

  describe('fetchStats', () => {
    it('fetches stats and updates state', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      const mockStats: QuestStats = {
        totalQuests: 10,
        activeQuests: 2,
        completedQuests: 5,
        abandonedQuests: 3,
        totalMissionsCompleted: 20,
        totalQuestXP: 500,
        bossesDefeated: 1
      }
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        stats: mockStats
      })))

      await act(async () => {
        await result.current.fetchStats()
      })

      expect(result.current.stats).toEqual(mockStats)
    })
  })

  describe('createQuest', () => {
    it('creates a quest and prepends to list', async () => {
      const initialQuest = makeQuest({ id: 'old-q' })
      const newQuest = makeQuest({ id: 'new-q' })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [initialQuest], activeCount: 1 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quest: newQuest })))

      let resQuest: Quest | null = null
      await act(async () => {
        resQuest = await result.current.createQuest({
          userGoal: 'Learn React',
          category: 'learning',
          difficulty: 'medium',
          targetDurationDays: 14
        })
      })

      expect(resQuest).toEqual(newQuest)
      expect(result.current.quests[0].id).toBe('new-q')
      expect(result.current.quests).toHaveLength(2)
    })

    it('handles create error', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: 'Validation failed'
      })))

      let resQuest: Quest | null = null
      await act(async () => {
        resQuest = await result.current.createQuest({
          userGoal: 'bad',
          category: 'learning',
          difficulty: 'easy',
          targetDurationDays: 7
        })
      })

      expect(resQuest).toBeNull()
      expect(result.current.error).toBe('Validation failed')
    })
  })

  describe('updateQuestStatus', () => {
    it('updates a quest status successfully', async () => {
      const initialQuest = makeQuest({ id: 'q1', status: 'active' })
      const updatedQuest = makeQuest({ id: 'q1', status: 'completed' })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [initialQuest], activeCount: 1 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quest: updatedQuest })))

      let resQuest: Quest | null = null
      await act(async () => {
        resQuest = await result.current.updateQuestStatus('q1', 'abandon')
      })

      expect(resQuest).toEqual(updatedQuest)
      expect(result.current.quests[0].status).toBe('completed')
    })
  })

  describe('completeMission', () => {
    it('completes a mission and updates local quest', async () => {
      const initialQuest = makeQuest({ id: 'q1', completedMissions: 0 })
      const updatedQuest = makeQuest({ id: 'q1', completedMissions: 1 })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [initialQuest], activeCount: 1 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quest: updatedQuest })))

      let res: any = null
      await act(async () => {
        res = await result.current.completeMission('q1', 'm1', 'boss-token-123')
      })

      expect(res).toEqual({ success: true, quest: updatedQuest })
      expect(result.current.quests[0].completedMissions).toBe(1)
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/quests/q1/missions/m1/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ bossToken: 'boss-token-123' })
        })
      )
    })
  })

  describe('getBossToken', () => {
    it('returns token on success', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        bossToken: 'token-abc'
      })))

      let token: string | null = null
      await act(async () => {
        token = await result.current.getBossToken('q1')
      })

      expect(token).toBe('token-abc')
    })

    it('returns null on failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: [], activeCount: 0 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))
      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        success: false
      })))

      let token: string | null = null
      await act(async () => {
        token = await result.current.getBossToken('q1')
      })

      expect(token).toBeNull()
    })
  })

  describe('deleteQuest', () => {
    it('deletes quest and removes from list', async () => {
      const initialQuests = [makeQuest({ id: 'q1' }), makeQuest({ id: 'q2' })]
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, quests: initialQuests, activeCount: 2 })))
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, stats: null })))

      const { result } = renderHook(() => useQuests())

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))

      let success = false
      await act(async () => {
        success = await result.current.deleteQuest('q1')
      })

      expect(success).toBe(true)
      expect(result.current.quests).toHaveLength(1)
      expect(result.current.quests[0].id).toBe('q2')
    })
  })
})
