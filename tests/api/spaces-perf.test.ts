import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as GET_SPACES } from '@/app/api/v1/spaces/route'
import { getVerifiedUserId } from '@/lib/server/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createSpace, addMemberToSpace } from '@/lib/spaces/space-store'
import type { KVStore } from '@/types'

const mockGetCtx = vi.mocked(getCloudflareContext)
const mockGetUser = vi.mocked(getVerifiedUserId)
const mockGetPlan = vi.mocked(getUserPlan)

function makeKV(): KVStore {
  const store = new Map<string, string>()
  const delays = true // set to true to simulate network latency

  const simulateDelay = async () => {
    if (delays) {
      await new Promise(r => setTimeout(r, 10))
    }
  }

  return {
    get: async (k: string) => {
      await simulateDelay()
      return store.get(k) ?? null
    },
    put: async (k: string, v: string) => {
      await simulateDelay()
      store.set(k, v)
    },
    delete: async (k: string) => {
      await simulateDelay()
      store.delete(k)
    },
  } as KVStore
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {},
  unauthorizedResponse: () => new Response('Unauthorized', { status: 401 }),
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn(),
}))

let kv: KVStore

beforeEach(() => {
  vi.clearAllMocks()
  kv = makeKV()
  mockGetCtx.mockReturnValue({
    env: { MISSI_MEMORY: kv },
    ctx: {} as unknown,
    cf: {} as unknown,
  } as unknown as ReturnType<typeof getCloudflareContext>)
  mockGetPlan.mockResolvedValue('pro')
})

describe('Performance benchmark GET /api/v1/spaces', () => {
  it('benchmarks spaces listing', { timeout: 30000 }, async () => {
    const NUM_SPACES = 50
    const userId = 'user_perf_test'
    mockGetUser.mockResolvedValue(userId)

    // Setup spaces
    for (let i = 0; i < NUM_SPACES; i++) {
      const meta = await createSpace(kv, userId, 'Perf User', {
        name: `Space ${i}`,
        description: `Description ${i}`,
        category: 'other',
        emoji: '🚀',
      })
      // createSpace already adds the owner as a member
    }

    // Now run GET multiple times and measure
    const ITERATIONS = 5
    let totalTime = 0

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now()
      const res = await GET_SPACES()
      const end = performance.now()
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.data.length).toBe(NUM_SPACES)

      totalTime += (end - start)
    }

    console.log(`Average time for ${NUM_SPACES} spaces: ${totalTime / ITERATIONS}ms`)
  })
})
