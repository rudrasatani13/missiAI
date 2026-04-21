import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/server/auth', () => ({
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

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { MISSI_MEMORY: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } } })
}))

vi.mock('@/lib/server/env', () => ({
  getEnv: () => ({ ELEVENLABS_API_KEY: 'test-key' })
}))

vi.mock('@/lib/server/logger', () => ({
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
}))

vi.mock('@/lib/mood/mood-store', () => ({
  getRecentEntries: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/validation/schemas', () => ({
  validationErrorResponse: vi.fn((error: any) =>
    new Response(JSON.stringify({ success: false, error: 'Validation error' }), { status: 400 })
  ),
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { getUser: vi.fn().mockResolvedValue({ firstName: 'Test' }) }
  }),
}))

vi.mock('@/lib/rateLimiter', () => ({
  rateLimitExceededResponse: vi.fn(),
  rateLimitHeaders: vi.fn(() => ({})),
}))

import { GET, POST } from '@/app/api/v1/sleep-sessions/[...path]/route'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/auth'
import { checkGenerationRateLimit, checkTTSRateLimit, getLastGeneratedStory } from '@/lib/sleep-sessions/session-store'

// Wrappers for sub-route dispatching via catch-all path params
const generatePost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['generate'] }) })
const ttsPost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['tts'] }) })
const historyPost = (req: NextRequest) => POST(req, { params: Promise.resolve({ path: ['history'] }) })
const libraryGet = (req: NextRequest) => GET(req, { params: Promise.resolve({ path: ['library'] }) })

function createRequest(body: any = {}): NextRequest {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('Sleep Sessions API', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getVerifiedUserId).mockResolvedValue('user_123')
        vi.mocked(checkGenerationRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
        vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
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

        it('with mode=breathing doesn\'t call Gemini', async () => {
            vi.mocked(checkGenerationRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
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
            vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'not-real' }))
            expect(res.status).toBe(404)
        })

        it('returns 429 when rate limited', async () => {
            vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
            const res = await ttsPost(createRequest({ source: 'library', storyId: 'library-ocean-tide' }))
            expect(res.status).toBe(429)
        })

        it('for last-generated source verifies storyId matches cached story', async () => {
             vi.mocked(checkTTSRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
             vi.mocked(getLastGeneratedStory).mockResolvedValue({ id: 'correct-id', text: 'test text' } as any)

             // Wrong ID
             const res1 = await ttsPost(createRequest({ source: 'last-generated', storyId: 'wrong-id' }))
             expect(res1.status).toBe(400)
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
            const { addToHistory } = await import('@/lib/sleep-sessions/session-store')
            expect(addToHistory).toHaveBeenCalled()
        })
    })
})
