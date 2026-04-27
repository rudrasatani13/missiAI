import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVStore } from '@/types'

const {
  getAuthenticatedSleepSessionsUserIdMock,
  parseSleepSessionsRequestBodyMock,
  requireSleepSessionsKVMock,
  getUserPlanMock,
  checkGenerationRateLimitMock,
  incrementGenerationRateLimitMock,
  cacheGeneratedStoryMock,
  getHistoryMock,
  addToHistoryMock,
  generatePersonalizedStoryMock,
  generateCustomStoryMock,
  generateBreathingScriptMock,
  getRecentEntriesMock,
  getTopLifeNodesByEmotionalWeightMock,
  getAllLibraryStoriesMock,
  getLibraryStoriesByCategoryMock,
  clerkClientMock,
  logRequestMock,
  logErrorMock,
} = vi.hoisted(() => ({
  getAuthenticatedSleepSessionsUserIdMock: vi.fn(),
  parseSleepSessionsRequestBodyMock: vi.fn(),
  requireSleepSessionsKVMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  checkGenerationRateLimitMock: vi.fn(),
  incrementGenerationRateLimitMock: vi.fn(),
  cacheGeneratedStoryMock: vi.fn(),
  getHistoryMock: vi.fn(),
  addToHistoryMock: vi.fn(),
  generatePersonalizedStoryMock: vi.fn(),
  generateCustomStoryMock: vi.fn(),
  generateBreathingScriptMock: vi.fn(),
  getRecentEntriesMock: vi.fn(),
  getTopLifeNodesByEmotionalWeightMock: vi.fn(),
  getAllLibraryStoriesMock: vi.fn(),
  getLibraryStoriesByCategoryMock: vi.fn(),
  clerkClientMock: vi.fn(),
  logRequestMock: vi.fn(),
  logErrorMock: vi.fn(),
}))

vi.mock('@/lib/server/routes/sleep-sessions/preflight', () => ({
  getAuthenticatedSleepSessionsUserId: getAuthenticatedSleepSessionsUserIdMock,
  parseSleepSessionsRequestBody: parseSleepSessionsRequestBodyMock,
  requireSleepSessionsKV: requireSleepSessionsKVMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/sleep-sessions/session-store', () => ({
  checkGenerationRateLimit: checkGenerationRateLimitMock,
  incrementGenerationRateLimit: incrementGenerationRateLimitMock,
  cacheGeneratedStory: cacheGeneratedStoryMock,
  getHistory: getHistoryMock,
  addToHistory: addToHistoryMock,
}))

vi.mock('@/lib/sleep-sessions/story-generator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sleep-sessions/story-generator')>('@/lib/sleep-sessions/story-generator')
  return {
    ...actual,
    generatePersonalizedStory: generatePersonalizedStoryMock,
    generateCustomStory: generateCustomStoryMock,
    MAX_SLEEP_STORY_CHARS: 16000,
  }
})

vi.mock('@/lib/sleep-sessions/breathing-generator', () => ({
  generateBreathingScript: generateBreathingScriptMock,
}))

vi.mock('@/lib/mood/mood-store', () => ({
  getRecentEntries: getRecentEntriesMock,
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getTopLifeNodesByEmotionalWeight: getTopLifeNodesByEmotionalWeightMock,
}))

vi.mock('@/lib/sleep-sessions/library-stories', () => ({
  getAllLibraryStories: getAllLibraryStoriesMock,
  getLibraryStoriesByCategory: getLibraryStoriesByCategoryMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

import {
  runSleepSessionsGenerateRoute,
  runSleepSessionsHistoryGetRoute,
  runSleepSessionsHistoryPostRoute,
  runSleepSessionsLibraryRoute,
} from '@/lib/server/routes/sleep-sessions/runner'

function createMockKV(): KVStore {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}

describe('sleep-sessions-route-runner', () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getAuthenticatedSleepSessionsUserIdMock.mockResolvedValue({ ok: true, userId: 'user_123' })
    requireSleepSessionsKVMock.mockReturnValue({ ok: true, kv })
    getUserPlanMock.mockResolvedValue('free')
    checkGenerationRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10 })
    incrementGenerationRateLimitMock.mockResolvedValue(undefined)
    cacheGeneratedStoryMock.mockResolvedValue(undefined)
    parseSleepSessionsRequestBodyMock.mockResolvedValue({ ok: true, data: { mode: 'custom', prompt: 'quiet ocean cave' } })
    getRecentEntriesMock.mockResolvedValue([])
    getTopLifeNodesByEmotionalWeightMock.mockResolvedValue([])
    generatePersonalizedStoryMock.mockResolvedValue({
      id: 'generated-personalized-story',
      mode: 'personalized_story',
      title: 'Tonight Story',
      text: 'A calm and sleepy story for the night.',
      estimatedDurationSec: 900,
      generatedAt: 1,
    })
    generateCustomStoryMock.mockResolvedValue({
      id: 'generated-custom-story',
      mode: 'custom_story',
      title: 'Custom Story',
      text: 'A custom calm and sleepy story for the night.',
      estimatedDurationSec: 900,
      generatedAt: 1,
    })
    generateBreathingScriptMock.mockReturnValue({
      id: 'breathing-session',
      mode: 'breathing',
      title: 'Box Breathing',
      script: 'Breathe in slowly',
      estimatedDurationSec: 120,
    })
    getHistoryMock.mockResolvedValue([])
    addToHistoryMock.mockResolvedValue(undefined)
    getAllLibraryStoriesMock.mockReturnValue([{ id: 'library-ocean-tide', category: 'ocean' }])
    getLibraryStoriesByCategoryMock.mockReturnValue([{ id: 'library-ocean-tide', category: 'ocean' }])
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({ firstName: 'Test' }),
      },
    })
  })

  it('generates and caches a personalized story', async () => {
    parseSleepSessionsRequestBodyMock.mockResolvedValueOnce({ ok: true, data: { mode: 'personalized' } })
    getRecentEntriesMock.mockResolvedValueOnce([{ label: 'Calm', score: 7 }])
    getTopLifeNodesByEmotionalWeightMock.mockResolvedValueOnce([{ title: '<b>Rest</b>' }])

    const res = await runSleepSessionsGenerateRoute(new NextRequest('http://localhost/api/v1/sleep-sessions/generate', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(generatePersonalizedStoryMock).toHaveBeenCalledWith({
      moodLabel: 'Calm',
      moodScore: 7,
      recentFocus: ['Rest'],
      firstName: 'Test',
      stressfulDay: false,
    })
    expect(cacheGeneratedStoryMock).toHaveBeenCalledTimes(1)
    expect(incrementGenerationRateLimitMock).toHaveBeenCalledTimes(1)
    expect(logRequestMock).toHaveBeenCalledWith('sleep-gen.success', 'user_123', expect.any(Number), { mode: 'personalized' })
  })

  it('returns the rate-limit response before parsing the request body', async () => {
    checkGenerationRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0 })

    const res = await runSleepSessionsGenerateRoute(new NextRequest('http://localhost/api/v1/sleep-sessions/generate', { method: 'POST' }))

    expect(res.status).toBe(429)
    expect(parseSleepSessionsRequestBodyMock).not.toHaveBeenCalled()
    expect(generateCustomStoryMock).not.toHaveBeenCalled()
  })

  it('returns breathing sessions without story generation', async () => {
    parseSleepSessionsRequestBodyMock.mockResolvedValueOnce({ ok: true, data: { mode: 'breathing', technique: 'box', cycles: 5 } })

    const res = await runSleepSessionsGenerateRoute(new NextRequest('http://localhost/api/v1/sleep-sessions/generate', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(generateBreathingScriptMock).toHaveBeenCalledWith('box', 5)
    expect(generatePersonalizedStoryMock).not.toHaveBeenCalled()
    expect(generateCustomStoryMock).not.toHaveBeenCalled()
  })

  it('returns history entries from the store', async () => {
    const entries = [{ id: 'entry-1', title: 'Test Session' }]
    getHistoryMock.mockResolvedValueOnce(entries)

    const res = await runSleepSessionsHistoryGetRoute()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: { entries } })
    expect(getHistoryMock).toHaveBeenCalledWith(kv, 'user_123', 20)
  })

  it('adds history entries from the parsed request body', async () => {
    parseSleepSessionsRequestBodyMock.mockResolvedValueOnce({
      ok: true,
      data: {
        sessionId: 'session_123',
        mode: 'breathing',
        title: 'Test Session',
        completed: true,
        durationSec: 120,
      },
    })

    const res = await runSleepSessionsHistoryPostRoute(new NextRequest('http://localhost/api/v1/sleep-sessions/history', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(addToHistoryMock).toHaveBeenCalledWith(kv, 'user_123', expect.objectContaining({
      id: 'session_123',
      mode: 'breathing',
      title: 'Test Session',
      completed: true,
      durationSec: 120,
      date: expect.any(String),
    }))
  })

  it('returns library stories filtered by category', async () => {
    const res = await runSleepSessionsLibraryRoute(new Request('http://localhost/api/v1/sleep-sessions/library?category=ocean'))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: { stories: [{ id: 'library-ocean-tide', category: 'ocean' }] } })
    expect(getLibraryStoriesByCategoryMock).toHaveBeenCalledWith('ocean')
    expect(getAllLibraryStoriesMock).not.toHaveBeenCalled()
  })
})
