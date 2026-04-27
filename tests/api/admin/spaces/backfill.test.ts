import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super('Unauthenticated')
      this.name = 'AuthenticationError'
    }
  },
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/server/security/kv-crypto', () => ({
  encryptKVValue: vi.fn(async (plaintext: string) => `ENC:${plaintext}`),
  decryptKVValue: vi.fn(async (stored: string) =>
    stored.startsWith('ENC:') ? stored.slice(4) : null,
  ),
  encryptForKV: vi.fn(async (p: string) => p),
  decryptFromKV: vi.fn(async (s: string) => s),
}))

import { auth } from '@clerk/nextjs/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { AuthenticationError, getVerifiedUserId } from '@/lib/server/security/auth'
import { POST } from '@/app/api/v1/admin/spaces/backfill/route'
import type { KVStore } from '@/types'

type ClerkAuthState = Awaited<ReturnType<typeof auth>>

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  } as KVStore
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/spaces/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeClerkAuthState(userId: string, role: unknown): ClerkAuthState {
  return {
    userId,
    sessionClaims: { metadata: { role } },
  } as unknown as ClerkAuthState
}

describe('POST /api/v1/admin/spaces/backfill', () => {
  const mockGetCtx = vi.mocked(getCloudflareContext)
  const mockGetUser = vi.mocked(getVerifiedUserId)
  const mockAuth = vi.mocked(auth)
  const originalAdminUserId = process.env.ADMIN_USER_ID
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_USER_ID
    kv = makeKV()
    mockGetCtx.mockReturnValue({
      env: { MISSI_MEMORY: kv },
      ctx: {} as unknown,
      cf: {} as unknown,
    } as unknown as ReturnType<typeof getCloudflareContext>)
    mockGetUser.mockResolvedValue('admin_user')
    mockAuth.mockResolvedValue(makeClerkAuthState('admin_user', 'admin'))
  })

  afterEach(() => {
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId
    }
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new AuthenticationError())

    const res = await POST(makeReq({ spaceId: 'legacyspace123' }))
    const body = await res.json() as { success: boolean; code: string }

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    })
  })

  it('returns 403 when the caller is not an admin', async () => {
    mockGetUser.mockResolvedValueOnce('user_regular')
    mockAuth.mockResolvedValueOnce(makeClerkAuthState('user_regular', 'user'))

    const res = await POST(makeReq({ spaceId: 'legacyspace123' }))
    const body = await res.json() as { success: boolean; code: string }

    expect(res.status).toBe(403)
    expect(body).toEqual({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
    })
  })

  it('returns 403 for malformed metadata when ADMIN_USER_ID fallback is absent', async () => {
    mockGetUser.mockResolvedValueOnce('admin_user')
    mockAuth.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await POST(makeReq({ spaceId: 'legacyspace123' }))

    expect(res.status).toBe(403)
  })

  it('allows ADMIN_USER_ID fallback even when metadata is malformed', async () => {
    process.env.ADMIN_USER_ID = 'admin_user'
    mockGetUser.mockResolvedValueOnce('admin_user')
    mockAuth.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await POST(makeReq({ spaceId: 'legacyspace999' }))

    expect(res.status).toBe(410)
  })

  it('returns 410 when an admin calls the retired backfill route', async () => {
    const res = await POST(makeReq({ spaceId: 'legacyspace999' }))
    const body = await res.json() as { success: boolean; code: string }

    expect(res.status).toBe(410)
    expect(body).toEqual({
      success: false,
      error: 'Legacy Spaces backfill is no longer available',
      code: 'GONE',
    })
  })
})
