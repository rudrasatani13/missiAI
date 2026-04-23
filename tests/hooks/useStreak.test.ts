/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStreak } from '@/hooks/useStreak'
import type { GamificationData, CheckInResult } from '@/types/gamification'

const mockGamificationData: GamificationData = {
  userId: 'user1',
  totalXP: 150,
  level: 1,
  avatarTier: 2,
  habits: [
    {
      nodeId: 'habit1',
      title: 'Reading',
      currentStreak: 2,
      longestStreak: 5,
      lastCheckedIn: '2023-10-01',
      totalCheckIns: 10,
    }
  ],
  achievements: [],
  xpLog: [],
  xpLogDate: '2023-10-01',
  loginStreak: 1,
  lastLoginDate: '2023-10-01',
  lastUpdatedAt: Date.now(),
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn() as any
})

describe('useStreak', () => {
  it('should initialize with default state and fetch data on mount', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockGamificationData })
    } as any)

    const { result } = renderHook(() => useStreak())

    // Initial state before fetch resolves
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.lastResult).toBeNull()

    // Wait for the fetch to resolve and state to update
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(mockGamificationData)
    expect(fetch).toHaveBeenCalledWith('/api/v1/streak')
  })

  it('should handle fetch failure gracefully on mount', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useStreak())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('checkIn should call API and update state on success', async () => {
    // Setup initial fetch
    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockGamificationData })
    } as any)

    const { result } = renderHook(() => useStreak())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const checkInResult: CheckInResult = {
      habit: {
        nodeId: 'habit2',
        title: 'Exercise',
        currentStreak: 1,
        longestStreak: 1,
        lastCheckedIn: '2023-10-02',
        totalCheckIns: 1,
      },
      xpEarned: 10,
      milestone: null,
      celebrationText: null,
      totalXP: 160,
      level: 1,
      avatarTier: 2,
      alreadyCheckedIn: false,
      newAchievements: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: checkInResult })
    } as any)

    let response: CheckInResult | null = null
    await act(async () => {
      response = await result.current.checkIn('habit2', 'Exercise')
    })

    expect(response).toEqual(checkInResult)
    expect(fetch).toHaveBeenCalledWith('/api/v1/streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: 'habit2', habitTitle: 'Exercise' }),
    })

    expect(result.current.lastResult).toEqual(checkInResult)
    expect(result.current.data?.totalXP).toBe(160)
    expect(result.current.data?.level).toBe(1)
  })

  it('checkIn should update existing habit correctly in data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockGamificationData })
    } as any)

    const { result } = renderHook(() => useStreak())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const checkInResult: CheckInResult = {
      habit: {
        nodeId: 'habit1',
        title: 'Reading',
        currentStreak: 3, // updated
        longestStreak: 5,
        lastCheckedIn: '2023-10-02',
        totalCheckIns: 11, // updated
      },
      xpEarned: 10,
      milestone: null,
      celebrationText: null,
      totalXP: 160,
      level: 1,
      avatarTier: 2,
      alreadyCheckedIn: false,
      newAchievements: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: checkInResult })
    } as any)

    await act(async () => {
      await result.current.checkIn('habit1', 'Reading')
    })

    expect(result.current.data?.totalXP).toBe(160)
    const updatedHabit = result.current.data?.habits.find(h => h.nodeId === 'habit1')
    expect(updatedHabit?.currentStreak).toBe(3)
    expect(updatedHabit?.totalCheckIns).toBe(11)
  })

  it('checkIn should handle API failure returning null', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockGamificationData })
    } as any)

    const { result } = renderHook(() => useStreak())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    vi.mocked(fetch).mockRejectedValueOnce(new Error('API Error'))

    let response: CheckInResult | null = null
    await act(async () => {
      response = await result.current.checkIn('habit1', 'Reading')
    })

    expect(response).toBeNull()
    expect(result.current.data).toEqual(mockGamificationData)
    expect(result.current.lastResult).toBeNull()
  })

  it('checkIn should handle unsuccessful API response returning null', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: mockGamificationData })
    } as any)

    const { result } = renderHook(() => useStreak())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    vi.mocked(fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Failed' })
    } as any)

    let response: CheckInResult | null = null
    await act(async () => {
      response = await result.current.checkIn('habit1', 'Reading')
    })

    expect(response).toBeNull()
    expect(result.current.data).toEqual(mockGamificationData)
  })
})
