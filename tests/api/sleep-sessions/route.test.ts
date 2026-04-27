import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockCloudflareContext } = vi.hoisted(() => ({
  mockCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class extends Error {},
  unauthorizedResponse: () => new Response('Unauthorized', { status: 401 })
}))

vi.mock('@/lib/sleep-sessions/session-store', () => ({
  checkGenerationRateLimit: vi.fn(),
  incrementGenerationRateLimit: vi.fn().mockResolvedValue(undefined),
  cacheGeneratedStory: vi.fn().mockResolvedValue(undefined),
  checkTTSRateLimit: vi.fn(),
  incrementTTSRateLimit: vi.fn().mockResolvedValue(undefined),
  getLastGeneratedStory: vi.fn(),
  addToHistory: vi.fn(),
  getHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/sleep-sessions/story-generator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sleep-sessions/story-generator')>('@/lib/sleep-sessions/story-generator')
  return {
    ...actual,
    generatePersonalizedStory: vi.fn().mockResolvedValue({
      id: 'generated-personalized-story',
      mode: 'personalized_story',
      title: 'Tonight Story',
      text: 'A calm and sleepy story for the night.',
      estimatedDurationSec: 900,
      generatedAt: Date.now(),
    }),
    generateCustomStory: vi.fn().mockResolvedValue({
      id: 'generated-custom-story',
      mode: 'custom_story',
      title: 'Custom Story',
      text: 'A custom calm and sleepy story for the night.',
      estimatedDurationSec: 900,
      generatedAt: Date.now(),
    }),
  }
})

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mockCloudflareContext,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
  logApiError: vi.fn(),
  createTimer: () => () => 0,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn().mockResolvedValue('free'),
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraph: vi.fn().mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }),
  getTopLifeNodesByEmotionalWeight: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/mood/mood-store', () => ({
  getRecentEntries: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/ai/services/voice-service', () => ({
  geminiTextToSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}))

vi.mock('@/lib/validation/schemas', () => ({
  validationErrorResponse: vi.fn(() =>
    new Response(JSON.stringify({ success: false, error: 'Validation error' }), { status: 400 })
  ),
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { getUser: vi.fn().mockResolvedValue({ firstName: 'Test' }) }
  }),
}))

vi.mock('@/lib/server/security/rate-limiter', () => ({
  rateLimitExceededResponse: vi.fn(),
  rateLimitHeaders: vi.fn(() => ({})),
}))

import { GET, POST } from '@/app/api/v1/sleep-sessions/[...path]/route'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/security/auth'
import { cacheGeneratedStory, checkGenerationRateLimit, checkTTSRateLimit, getLastGeneratedStory, incrementGenerationRateLimit } from '@/lib/sleep-sessions/session-store'
import { generateCustomStory, generatePersonalizedStory } from '@/lib/sleep-sessions/story-generator'
import { geminiTextToSpeech } from '@/lib/ai/services/voice-service'

const kvMock = {
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}

// Wrappers for sub-route dispatching via catch-all path params
const generatePost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['generate'] }) })
const ttsPost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['tts'] }) })
const historyGet = (req: NextRequest) => GET(req, { params: Promise.resolve({ path: ['history'] }) })
const historyPost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['history'] }) })
const libraryGet = (req: NextRequest) => GET(req, { params: Promise.resolve({ path: ['library'] }) })
const unknownGet = (req: NextRequest) => GET(req, { params: Promise.resolve({ path: ['unknown'] }) })
const unknownPost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['unknown'] }) })

function createRequest(body: any = {}): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function createRawRequest(body: string): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body,
  })
}

describe('Sleep Sessions API', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCloudflareContext.mockReturnValue({ env: { MISSI_MEMORY: kvMock } })
        vi.mocked(getVerifiedUserId).mockResolvedValue('user_123')
        vi.mocked(checkGenerationRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
        vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
        vi.mocked(geminiTextToSpeech).mockResolvedValue(new ArrayBuffer(8))
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    describe('POST /generate', () => {
        it('returns 401 without Clerk session', async () => {
            vi.mocked(getVerifiedUserId).mockRejectedValue(new AuthenticationError())
            const res = await generatePost(createRequest())
            expect(res.status).toBe(401)
        })

        it('returns 400 for invalid mode / missing required fields', async () => {
            const res = await generatePost(createRequest({ mode: 'invalid' }))
            expect(res.status).toBe(400)
        })

        it('returns 400 for custom prompt under 3 chars or over 200', async () => {
            const res1 = await generatePost(createRequest({ mode: 'custom', prompt: 'a' }))
            expect(res1.status).toBe(400)

            const res2 = await generatePost(createRequest({ mode: 'custom', prompt: 'a'.repeat(201) }))
            expect(res2.status).toBe(400)
        })

        it('returns 429 when generation rate limit exceeded', async () => {
            vi.mocked(checkGenerationRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
            const res = await generatePost(createRequest({ mode: 'custom', prompt: 'ocean' }))
            expect(res.status).toBe(429)
        })

        it('returns 400 for invalid JSON body', async () => {
            const res = await generatePost(createRawRequest('{'))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ success: false, error: 'Invalid JSON body' })
        })

        it('returns 500 when KV is unavailable in production', async () => {
            vi.stubEnv('NODE_ENV', 'production')
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await generatePost(createRequest({ mode: 'custom', prompt: 'ocean' }))
            expect(res.status).toBe(500)
            expect(await res.json()).toMatchObject({ success: false, error: 'Database unavailable' })
        })

        it('with mode=breathing doesn\'t call Gemini', async () => {
            vi.mocked(checkGenerationRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
            const res = await generatePost(createRequest({ mode: 'breathing', technique: '4-7-8', cycles: 6 }))
            expect(res.status).toBe(200)
            const data = await res.json()
            expect(data.data.script).toContain('Breathe in slowly')
        })

        it('with mode=breathing still works when Cloudflare context is unavailable locally', async () => {
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await generatePost(createRequest({ mode: 'breathing', technique: 'box', cycles: 5 }))

            expect(res.status).toBe(200)
            const data = await res.json()
            expect(data.data.script).toContain('Hold')
        })

        it('returns a personalized generated story', async () => {
            const res = await generatePost(createRequest({ mode: 'personalized' }))

            expect(res.status).toBe(200)
            expect(vi.mocked(generatePersonalizedStory)).toHaveBeenCalledTimes(1)
            expect(cacheGeneratedStory).toHaveBeenCalled()
            expect(incrementGenerationRateLimit).toHaveBeenCalled()

            const json = await res.json()
            expect(json).toMatchObject({
                success: true,
                data: {
                    id: 'generated-personalized-story',
                    mode: 'personalized_story',
                    title: 'Tonight Story',
                },
            })
        })

        it('returns a custom generated story', async () => {
            const res = await generatePost(createRequest({ mode: 'custom', prompt: 'quiet ocean cave' }))

            expect(res.status).toBe(200)
            expect(vi.mocked(generateCustomStory)).toHaveBeenCalledWith('quiet ocean cave')

            const json = await res.json()
            expect(json).toMatchObject({
                success: true,
                data: {
                    id: 'generated-custom-story',
                    mode: 'custom_story',
                    title: 'Custom Story',
                },
            })
        })

        it('waits for generated story caching before responding', async () => {
            let resolveCache!: () => void
            const cachePromise = new Promise<void>((resolve) => {
                resolveCache = resolve
            })

            vi.mocked(cacheGeneratedStory).mockImplementationOnce(() => cachePromise)
            vi.mocked(incrementGenerationRateLimit).mockResolvedValueOnce(undefined)

            let settled = false
            const pending = generatePost(createRequest({ mode: 'custom', prompt: 'quiet ocean cave' }))
            pending.then(() => {
                settled = true
            })

            await Promise.resolve()
            await Promise.resolve()
            expect(settled).toBe(false)

            resolveCache()

            const res = await pending
            expect(res.status).toBe(200)
            expect(cacheGeneratedStory).toHaveBeenCalled()
        })
    })

    describe('POST /tts', () => {
        it('returns 401 without Clerk session', async () => {
            vi.mocked(getVerifiedUserId).mockRejectedValueOnce(new AuthenticationError())
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))
            expect(res.status).toBe(401)
        })

        it('returns 400 (invalid storyId)', async () => {
            const res = await ttsPost(createRequest({ source: 'library' }))
            expect(res.status).toBe(400)
        })

        it('returns 400 for invalid JSON body', async () => {
            const res = await ttsPost(createRawRequest('{'))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ success: false, error: 'Invalid JSON body' })
        })

        it('returns 404 (not found)', async () => {
            vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'not-real' }))
            expect(res.status).toBe(404)
        })

        it('returns 429 when rate limited', async () => {
            vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))
            expect(res.status).toBe(429)
        })

        it('returns 400 when breathing TTS is missing script text', async () => {
            const res = await ttsPost(createRequest({ source: 'breathing', storyId: 'breathing-story' }))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ success: false, error: 'Missing breathing script' })
        })

        it('for last-generated source verifies storyId matches cached story', async () => {
             vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
             vi.mocked(getLastGeneratedStory).mockResolvedValue({ id: 'correct-id', text: 'test text' } as any)

             // Wrong ID
             const res1 = await ttsPost(createRequest({ source: 'last-generated', storyId: 'wrong-id' }))
             expect(res1.status).toBe(400)
        })

        it('allows library TTS when KV is unavailable', async () => {
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))

            expect(res.status).toBe(200)
            expect(res.headers.get('Content-Type')).toBe('audio/wav')
            expect(geminiTextToSpeech).toHaveBeenCalled()
        })

        it('passes expressive performance directions to Gemini TTS for library stories', async () => {
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))

            expect(res.status).toBe(200)
            expect(geminiTextToSpeech).toHaveBeenCalledTimes(1)
            expect(vi.mocked(geminiTextToSpeech).mock.calls[0][0]).toMatchObject({
                text: expect.stringContaining('You are resting on a quiet, secluded beach'),
                voiceName: 'Kore',
            })
            expect((vi.mocked(geminiTextToSpeech).mock.calls[0][0] as any).prompt).toContain('Base tone: wave-like, flowing, hushed, and gently hypnotic')
            expect((vi.mocked(geminiTextToSpeech).mock.calls[0][0] as any).prompt).toContain('Shift your delivery moment by moment with the story itself')
            expect((vi.mocked(geminiTextToSpeech).mock.calls[0][0] as any).prompt).toContain('Only speak the words from the SCRIPT section')
        })

        it('falls back to plain narration when expressive TTS synthesis fails', async () => {
            vi.mocked(geminiTextToSpeech)
                .mockRejectedValueOnce(Object.assign(new Error('Gemini TTS error 400'), { status: 400 }))
                .mockResolvedValueOnce(new ArrayBuffer(8))

            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))

            expect(res.status).toBe(200)
            expect(geminiTextToSpeech).toHaveBeenCalledTimes(2)
            expect((vi.mocked(geminiTextToSpeech).mock.calls[0][0] as any).prompt).toContain('Base tone:')
            expect((vi.mocked(geminiTextToSpeech).mock.calls[1][0] as any).prompt).toBeUndefined()
        })

        it('splits long last-generated stories into multiple TTS chunks', async () => {
            vi.mocked(getLastGeneratedStory).mockResolvedValue({
                id: 'long-story',
                mode: 'custom_story',
                title: 'Long Story',
                text: `Start. ${'Very sleepy sentence. '.repeat(260)}`,
                estimatedDurationSec: 900,
                generatedAt: Date.now(),
            } as any)

            const res = await ttsPost(createRequest({ source: 'last-generated', storyId: 'long-story' }))

            expect(res.status).toBe(200)
            expect(vi.mocked(geminiTextToSpeech).mock.calls.length).toBeGreaterThan(1)
        })

        it('returns 504 when sleep TTS times out after retries are exhausted', async () => {
            vi.mocked(geminiTextToSpeech).mockRejectedValue(new Error('TTS request timed out'))

            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))

            expect(res.status).toBe(504)
            const data = await res.json()
            expect(data.error).toBe('Audio generation timed out. Please try again.')
        })

        it('returns 400 for last-generated TTS without a cached story when Cloudflare context is unavailable locally', async () => {
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await ttsPost(createRequest({ source: 'last-generated', storyId: 'correct-id' }))

            expect(res.status).toBe(400)
        })

        it('returns 503 for last-generated TTS without KV in production', async () => {
            vi.stubEnv('NODE_ENV', 'production')
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await ttsPost(createRequest({ source: 'last-generated', storyId: 'correct-id' }))
            expect(res.status).toBe(503)
            expect(await res.json()).toMatchObject({ success: false, error: 'Service temporarily unavailable' })
        })

        it('allows last-generated TTS with an inline story when KV is unavailable', async () => {
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await ttsPost(createRequest({
                source: 'last-generated',
                storyId: 'inline-story-id',
                story: {
                    id: 'inline-story-id',
                    mode: 'custom_story',
                    title: 'Inline Story',
                    text: 'A very calm inline story that is long enough for speech generation.',
                    generatedAt: Date.now(),
                },
            }))

            expect(res.status).toBe(200)
            expect(res.headers.get('Content-Type')).toBe('audio/wav')
            expect(geminiTextToSpeech).toHaveBeenCalled()
        })
    })

    describe('GET /library', () => {
        it('returns 401 without Clerk session', async () => {
            vi.mocked(getVerifiedUserId).mockRejectedValueOnce(new AuthenticationError())
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/library')
            const res = await libraryGet(req)
            expect(res.status).toBe(401)
        })

        it('returns 200 with static stories', async () => {
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/library')
            const res = await libraryGet(req)
            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json.data.stories.length).toBeGreaterThan(0)
        })

        it('filters static stories by category', async () => {
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/library?category=ocean')
            const res = await libraryGet(req)
            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json.data.stories.length).toBeGreaterThan(0)
            expect(json.data.stories.every((story: any) => story.category === 'ocean')).toBe(true)
        })
    })

    describe('GET /history', () => {
        it('returns 401 without Clerk session', async () => {
            vi.mocked(getVerifiedUserId).mockRejectedValueOnce(new AuthenticationError())
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/history')
            const res = await historyGet(req)
            expect(res.status).toBe(401)
        })

        it('returns 500 when KV is unavailable in production', async () => {
            vi.stubEnv('NODE_ENV', 'production')
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/history')
            const res = await historyGet(req)
            expect(res.status).toBe(500)
            expect(await res.json()).toMatchObject({ success: false, error: 'DB unavailable' })
        })

        it('returns recent entries', async () => {
            const entries = [{ id: 'entry-1', title: 'Test Session', mode: 'breathing', completed: true, durationSec: 120, date: new Date().toISOString() }] as any
            const { getHistory } = await import('@/lib/sleep-sessions/session-store')
            vi.mocked(getHistory).mockResolvedValueOnce(entries)

            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/history')
            const res = await historyGet(req)

            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({ success: true, data: { entries } })
        })
    })

    describe('POST /history', () => {
        it('returns 401 without Clerk session', async () => {
            vi.mocked(getVerifiedUserId).mockRejectedValueOnce(new AuthenticationError())
            const res = await historyPost(createRequest({
                sessionId: 'session_123',
                mode: 'breathing',
                title: 'Test Session',
                completed: true,
                durationSec: 120
            }))
            expect(res.status).toBe(401)
        })

        it('returns 500 when KV is unavailable in production', async () => {
            vi.stubEnv('NODE_ENV', 'production')
            mockCloudflareContext.mockImplementation(() => { throw new Error('No context') })

            const res = await historyPost(createRequest({
                sessionId: 'session_123',
                mode: 'breathing',
                title: 'Test Session',
                completed: true,
                durationSec: 120
            }))
            expect(res.status).toBe(500)
            expect(await res.json()).toMatchObject({ success: false, error: 'DB unavailable' })
        })

        it('returns 400 for invalid JSON', async () => {
            const res = await historyPost(createRawRequest('{'))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ success: false, error: 'Invalid JSON' })
        })

        it('returns 400 for validation errors', async () => {
            const res = await historyPost(createRequest({
                sessionId: '',
                mode: 'breathing',
                title: 'Test Session',
                completed: true,
                durationSec: 120
            }))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ success: false, error: 'Validation error' })
        })

        it('logs entry correctly', async () => {
            const req = createRequest({
                sessionId: 'session_123',
                mode: 'breathing',
                title: 'Test Session',
                completed: true,
                durationSec: 120
            })
            const res = await historyPost(req)
            expect(res.status).toBe(200)
            const { addToHistory } = await import('@/lib/sleep-sessions/session-store')
            expect(addToHistory).toHaveBeenCalled()
        })
    })

    describe('route dispatch', () => {
        it('returns 404 for unknown GET paths', async () => {
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/unknown')
            const res = await unknownGet(req)
            expect(res.status).toBe(404)
            expect(await res.json()).toMatchObject({ error: 'Not found' })
        })

        it('returns 404 for unknown POST paths', async () => {
            const res = await unknownPost(createRequest({}))
            expect(res.status).toBe(404)
            expect(await res.json()).toMatchObject({ error: 'Not found' })
        })
    })
})
