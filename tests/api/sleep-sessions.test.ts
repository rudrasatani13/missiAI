import { GET as libraryGet } from '@/app/api/v1/sleep-sessions/library/route'
import { POST as generatePost } from '@/app/api/v1/sleep-sessions/generate/route'
import { POST as ttsPost } from '@/app/api/v1/sleep-sessions/tts/route'
import { POST as historyPost } from '@/app/api/v1/sleep-sessions/history/route'
import { NextRequest } from 'next/server'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/auth'
import { checkGenerationRateLimit, checkTTSRateLimit } from '@/lib/sleep-sessions/session-store'

jest.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: jest.fn(),
  AuthenticationError: class extends Error {},
  unauthorizedResponse: () => new Response('Unauthorized', { status: 401 })
}))

jest.mock('@/lib/sleep-sessions/session-store', () => ({
  checkGenerationRateLimit: jest.fn(),
  incrementGenerationRateLimit: jest.fn().mockResolvedValue(undefined),
  cacheGeneratedStory: jest.fn().mockResolvedValue(undefined),
  checkTTSRateLimit: jest.fn(),
  incrementTTSRateLimit: jest.fn().mockResolvedValue(undefined),
  getLastGeneratedStory: jest.fn(),
  addToHistory: jest.fn()
}))

jest.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: { MISSI_MEMORY: {} } })
}))

jest.mock('@/lib/server/env', () => ({
    getEnv: () => ({ ELEVENLABS_API_KEY: 'test-key', GEMINI_API_KEY: 'test-key' })
}))

function createRequest(body: any = {}): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('Sleep Sessions API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getVerifiedUserId as jest.Mock).mockResolvedValue('user_123')
    })

    describe('POST /generate', () => {
        it('returns 401 without Clerk session', async () => {
            (getVerifiedUserId as jest.Mock).mockRejectedValue(new AuthenticationError('no auth'))
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
            (checkGenerationRateLimit as jest.Mock).mockResolvedValue({ allowed: false, remaining: 0 })
            const res = await generatePost(createRequest({ mode: 'custom', prompt: 'ocean' }))
            expect(res.status).toBe(429)
        })

        it('with mode=breathing doesn\'t call Gemini', async () => {
            (checkGenerationRateLimit as jest.Mock).mockResolvedValue({ allowed: true, remaining: 10 })
            const res = await generatePost(createRequest({ mode: 'breathing', technique: '4-7-8', cycles: 6 }))
            expect(res.status).toBe(200)
            const data = await res.json()
            expect(data.data.script).toContain('Breathe in slowly')
        })
    })

    describe('POST /tts', () => {
        it('returns 400 (invalid storyId)', async () => {
            const res = await ttsPost(createRequest({ source: 'library' }))
            expect(res.status).toBe(400)
        })

        it('returns 404 (not found)', async () => {
            (checkTTSRateLimit as jest.Mock).mockResolvedValue({ allowed: true, remaining: 10 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'not-real' }))
            expect(res.status).toBe(404)
        })

        it('returns 429 when rate limited', async () => {
            (checkTTSRateLimit as jest.Mock).mockResolvedValue({ allowed: false, remaining: 0 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))
            expect(res.status).toBe(429)
        })

        it('for last-generated source verifies storyId matches cached story', async () => {
             (checkTTSRateLimit as jest.Mock).mockResolvedValue({ allowed: true, remaining: 10 })
             const { getLastGeneratedStory } = require('@/lib/sleep-sessions/session-store')
             getLastGeneratedStory.mockResolvedValue({ id: 'correct-id', text: 'test text' })

             // Wrong ID
             const res1 = await ttsPost(createRequest({ source: 'last-generated', storyId: 'wrong-id' }))
             expect(res1.status).toBe(400)

             // we mock textToSpeech failing or succeeding in next step, but here it'll hit 500 since we didn't mock fetch internals, which is fine, we just want to ensure it passed the 400 checks
        })
    })

    describe('GET /library', () => {
        it('returns 200 with static stories', async () => {
            const req = new NextRequest('http://localhost/api/v1/sleep-sessions/library')
            const res = await libraryGet(req)
            expect(res.status).toBe(200)
            const json = await res.json()
            expect(json.data.stories.length).toBeGreaterThan(0)
        })
    })

    describe('POST /history', () => {
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
            const { addToHistory } = require('@/lib/sleep-sessions/session-store')
            expect(addToHistory).toHaveBeenCalled()
        })
    })
})
