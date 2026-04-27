import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { KVStore } from '@/types'

const {
  getCloudflareContextMock,
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getLifeGraphReadSnapshotMock,
  getGamificationDataMock,
  awardXPMock,
  geminiGenerateMock,
  clerkClientMock,
  logRequestMock,
  logErrorMock,
  waitUntilMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor() {
      super('Unauthorized')
      this.name = 'AuthenticationError'
    }
  }

  return {
    getCloudflareContextMock: vi.fn(),
    getVerifiedUserIdMock: vi.fn(),
    unauthorizedResponseMock: vi.fn(
      () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    ),
    getLifeGraphReadSnapshotMock: vi.fn(),
    getGamificationDataMock: vi.fn(),
    awardXPMock: vi.fn(),
    geminiGenerateMock: vi.fn(),
    clerkClientMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    waitUntilMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: getCloudflareContextMock,
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraphReadSnapshot: getLifeGraphReadSnapshotMock,
}))

vi.mock('@/lib/gamification/streak', () => ({
  getGamificationData: getGamificationDataMock,
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: awardXPMock,
}))

vi.mock('@/lib/ai/providers/vertex-client', () => ({
  geminiGenerate: geminiGenerateMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
}))

vi.mock('@/lib/server/platform/wait-until', () => ({
  waitUntil: waitUntilMock,
}))

import { GET } from '@/app/api/v1/profile/card/route'

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function makeRequest(path = '/api/v1/profile/card'): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

describe('GET /api/v1/profile/card', () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getCloudflareContextMock.mockReturnValue({
      env: { MISSI_MEMORY: kv },
      ctx: {} as any,
      cf: {} as any,
    })

    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getLifeGraphReadSnapshotMock.mockResolvedValue({
      nodes: [
        {
          id: 'pref-1',
          userId: 'user_123',
          category: 'preference',
          title: 'Coffee',
          detail: 'Loves coffee',
          tags: ['coffee', 'morning'],
          people: [],
          emotionalWeight: 0.9,
          confidence: 0.9,
          createdAt: Date.now() - 86400000 * 20,
          updatedAt: Date.now(),
          accessCount: 10,
          lastAccessedAt: Date.now(),
          source: 'conversation',
        },
        {
          id: 'person-1',
          userId: 'user_123',
          category: 'person',
          title: 'Alice',
          detail: 'Close friend',
          tags: ['friend'],
          people: ['Alice'],
          emotionalWeight: 0.8,
          confidence: 0.8,
          createdAt: Date.now() - 86400000 * 10,
          updatedAt: Date.now(),
          accessCount: 4,
          lastAccessedAt: Date.now(),
          source: 'conversation',
        },
        {
          id: 'goal-1',
          userId: 'user_123',
          category: 'goal',
          title: 'Run a marathon',
          detail: 'Training goal',
          tags: ['fitness'],
          people: [],
          emotionalWeight: 0.7,
          confidence: 0.9,
          createdAt: Date.now() - 86400000 * 30,
          updatedAt: Date.now(),
          accessCount: 3,
          lastAccessedAt: Date.now(),
          source: 'conversation',
        },
      ],
      totalInteractions: 42,
      lastUpdatedAt: Date.now(),
    })
    getGamificationDataMock.mockResolvedValue({
      avatarTier: 2,
      level: 3,
      totalXP: 250,
      loginStreak: 5,
      habits: [
        {
          title: 'Morning run',
          currentStreak: 4,
          longestStreak: 12,
        },
      ],
      achievements: [
        { unlockedAt: Date.now() },
        { unlockedAt: null },
      ],
    })
    awardXPMock.mockResolvedValue(0)
    geminiGenerateMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Warm and thoughtful builder.' }] } }],
      }),
    })
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({ firstName: 'Rudra', username: 'rudra' }),
      },
    })
    waitUntilMock.mockImplementation(() => {})
  })

  it('returns 401 when no Clerk session exists', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await GET(makeRequest())

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalled()
  })

  it('returns 500 when KV binding is unavailable', async () => {
    getCloudflareContextMock.mockReturnValueOnce({ env: {}, ctx: {} as any, cf: {} as any })

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to load profile data' })
  })

  it('returns cached profile data when refresh is not requested', async () => {
    await kv.put('profile:card:user_123', JSON.stringify({ userName: 'Cached User', cached: true }))

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ userName: 'Cached User', cached: true })
    expect(getLifeGraphReadSnapshotMock).not.toHaveBeenCalled()
  })

  it('refresh=true bypasses cache and generates fresh profile data', async () => {
    await kv.put('profile:card:user_123', JSON.stringify({ userName: 'Stale User', stale: true }))

    const res = await GET(makeRequest('/api/v1/profile/card?refresh=true'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(getLifeGraphReadSnapshotMock).toHaveBeenCalledWith(
      kv,
      'user_123',
      expect.objectContaining({ limit: 250, newestFirst: true }),
    )
    expect(body.success).toBe(true)
    expect(body.data.userName).toBe('Rudra')
    expect(body.data.topInterests).toContain('Coffee')
    expect(body.data.peopleInMyWorld).toContain('Alice')
    expect(body.data.activeGoals).toContain('Run a marathon')
    expect(body.data.personalitySnapshot).toBe('Warm and thoughtful builder.')
    expect(kv.put).toHaveBeenCalledWith('profile:card:user_123', expect.any(String), { expirationTtl: 3600 })
    expect(waitUntilMock).toHaveBeenCalled()
  })
})
