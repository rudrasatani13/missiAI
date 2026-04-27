import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVStore } from '@/types'

const {
  getAuthenticatedSleepSessionsUserIdMock,
  getSleepSessionsKVMock,
  parseSleepSessionsRequestBodyMock,
  getUserPlanMock,
  checkTTSRateLimitMock,
  incrementTTSRateLimitMock,
  getLastGeneratedStoryMock,
  sanitizeStoryTextMock,
  getLibraryStoryMock,
  geminiTextToSpeechMock,
  awardXPMock,
  logRequestMock,
  logErrorMock,
  logApiErrorMock,
} = vi.hoisted(() => ({
  getAuthenticatedSleepSessionsUserIdMock: vi.fn(),
  getSleepSessionsKVMock: vi.fn(),
  parseSleepSessionsRequestBodyMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  checkTTSRateLimitMock: vi.fn(),
  incrementTTSRateLimitMock: vi.fn(),
  getLastGeneratedStoryMock: vi.fn(),
  sanitizeStoryTextMock: vi.fn(),
  getLibraryStoryMock: vi.fn(),
  geminiTextToSpeechMock: vi.fn(),
  awardXPMock: vi.fn(),
  logRequestMock: vi.fn(),
  logErrorMock: vi.fn(),
  logApiErrorMock: vi.fn(),
}))

vi.mock('@/lib/server/routes/sleep-sessions/preflight', () => ({
  getAuthenticatedSleepSessionsUserId: getAuthenticatedSleepSessionsUserIdMock,
  getSleepSessionsKV: getSleepSessionsKVMock,
  parseSleepSessionsRequestBody: parseSleepSessionsRequestBodyMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock('@/lib/sleep-sessions/session-store', () => ({
  getLastGeneratedStory: getLastGeneratedStoryMock,
  checkTTSRateLimit: checkTTSRateLimitMock,
  incrementTTSRateLimit: incrementTTSRateLimitMock,
}))

vi.mock('@/lib/sleep-sessions/story-generator', () => ({
  MAX_SLEEP_STORY_CHARS: 16000,
  sanitizeStoryText: sanitizeStoryTextMock,
}))

vi.mock('@/lib/sleep-sessions/library-stories', () => ({
  getLibraryStory: getLibraryStoryMock,
}))

vi.mock('@/lib/ai/services/voice-service', () => ({
  geminiTextToSpeech: geminiTextToSpeechMock,
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: awardXPMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
  logApiError: logApiErrorMock,
}))

import {
  buildSleepTtsPrompt,
  splitSleepTtsText,
  runSleepSessionsTtsRoute,
} from '@/lib/server/routes/sleep-sessions/tts'

function createMockKV(): KVStore {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}

function createRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/sleep-sessions/tts', { method: 'POST' })
}

function createAudioBuffer(byteLength: number = 64): ArrayBuffer {
  const bytes = new Uint8Array(byteLength)
  bytes.fill(1)
  return bytes.buffer
}

describe('sleep-sessions-route-tts', () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getAuthenticatedSleepSessionsUserIdMock.mockResolvedValue({ ok: true, userId: 'user_123' })
    getSleepSessionsKVMock.mockReturnValue(kv)
    parseSleepSessionsRequestBodyMock.mockResolvedValue({
      ok: true,
      data: {
        source: 'library',
        storyId: 'library-ocean-tide',
      },
    })
    getUserPlanMock.mockResolvedValue('free')
    checkTTSRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10 })
    incrementTTSRateLimitMock.mockResolvedValue(undefined)
    getLastGeneratedStoryMock.mockResolvedValue(null)
    sanitizeStoryTextMock.mockImplementation((text: string) => text.trim())
    getLibraryStoryMock.mockReturnValue({
      id: 'library-ocean-tide',
      mode: 'library',
      title: 'Ocean Tide',
      category: 'ocean',
      text: 'You are resting on a quiet, secluded beach while the tide rocks in and out.',
      estimatedDurationSec: 600,
      generatedAt: 1,
    })
    geminiTextToSpeechMock.mockResolvedValue(createAudioBuffer())
    awardXPMock.mockResolvedValue(0)
  })

  it('builds a bedtime prompt with mood-specific delivery guidance', () => {
    const prompt = buildSleepTtsPrompt('library', 'A funny sleepy tide rolls past with a smile.', {
      mode: 'library',
      title: 'Ocean Tide',
      category: 'ocean',
    })

    expect(prompt).toContain('Base tone: wave-like, flowing, hushed, and gently hypnotic')
    expect(prompt).toContain('Shift your delivery moment by moment with the story itself')
    expect(prompt).toContain('Let a soft smile come through playful moments')
    expect(prompt).toContain('Only speak the words from the SCRIPT section')
  })

  it('splits long TTS text into bounded chunks', () => {
    const text = [
      'The moon drifts above the sea.',
      'A sleepy breeze moves over the shore.',
      'Tiny waves glow and fade in the distance.',
      'Everything feels slow and peaceful tonight.',
    ].join(' ')

    const chunks = splitSleepTtsText(text, 60)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true)
    expect(chunks.join(' ')).toContain('The moon drifts above the sea.')
  })

  it('returns the TTS rate-limit response before synthesis', async () => {
    checkTTSRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0 })

    const res = await runSleepSessionsTtsRoute(createRequest())

    expect(res.status).toBe(429)
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
    expect(logRequestMock).toHaveBeenCalledWith('sleep-tts.rate_limited', 'user_123', expect.any(Number))
  })

  it('falls back to plain narration when expressive synthesis fails', async () => {
    geminiTextToSpeechMock
      .mockRejectedValueOnce(Object.assign(new Error('Gemini TTS error 400'), { status: 400 }))
      .mockResolvedValueOnce(createAudioBuffer())

    const res = await runSleepSessionsTtsRoute(createRequest())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(geminiTextToSpeechMock).toHaveBeenCalledTimes(2)
    expect(geminiTextToSpeechMock.mock.calls[0][0]).toMatchObject({
      text: expect.stringContaining('quiet, secluded beach'),
      voiceName: 'Kore',
      prompt: expect.stringContaining('Base tone:'),
    })
    expect(geminiTextToSpeechMock.mock.calls[1][0]).toMatchObject({
      text: expect.stringContaining('quiet, secluded beach'),
      voiceName: 'Kore',
    })
    expect(geminiTextToSpeechMock.mock.calls[1][0]).not.toHaveProperty('prompt')
    expect(incrementTTSRateLimitMock).toHaveBeenCalledWith(kv, 'user_123')
    expect(awardXPMock).toHaveBeenCalledWith(kv, 'user_123', 'memory', 1)
  })

  it('uses an inline last-generated story without requiring KV lookup', async () => {
    getSleepSessionsKVMock.mockReturnValueOnce(null)
    parseSleepSessionsRequestBodyMock.mockResolvedValueOnce({
      ok: true,
      data: {
        source: 'last-generated',
        storyId: 'inline-story-id',
        story: {
          id: 'inline-story-id',
          mode: 'custom_story',
          title: 'Inline Story',
          text: 'A very calm inline story that is long enough for speech generation.',
        },
      },
    })

    const res = await runSleepSessionsTtsRoute(createRequest())

    expect(res.status).toBe(200)
    expect(getLastGeneratedStoryMock).not.toHaveBeenCalled()
    expect(geminiTextToSpeechMock).toHaveBeenCalledTimes(1)
  })

  it('returns 503 for cached last-generated TTS when KV is unavailable', async () => {
    getSleepSessionsKVMock.mockReturnValueOnce(null)
    parseSleepSessionsRequestBodyMock.mockResolvedValueOnce({
      ok: true,
      data: {
        source: 'last-generated',
        storyId: 'cached-story-id',
      },
    })

    const res = await runSleepSessionsTtsRoute(createRequest())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: 'Service temporarily unavailable' })
    expect(getLastGeneratedStoryMock).not.toHaveBeenCalled()
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
  })
})
