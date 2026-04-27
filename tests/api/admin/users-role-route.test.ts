import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authMock,
  clerkClientMock,
  getVerifiedUserIdMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor() {
      super('Unauthorized')
      this.name = 'AuthenticationError'
    }
  }

  return {
    authMock: vi.fn(),
    clerkClientMock: vi.fn(),
    getVerifiedUserIdMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: AuthenticationErrorMock,
}))

import { auth } from '@clerk/nextjs/server'
import { POST } from '@/app/api/v1/admin/users/[id]/role/route'

type ClerkAuthState = Awaited<ReturnType<typeof auth>>

function makeClerkAuthState(userId: string, role: unknown): ClerkAuthState {
  return {
    userId,
    sessionClaims: { metadata: { role } },
  } as unknown as ClerkAuthState
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/users/target_user/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/admin/users/[id]/role', () => {
  const mockAuth = vi.mocked(auth)
  const originalAdminUserId = process.env.ADMIN_USER_ID

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_USER_ID
    getVerifiedUserIdMock.mockResolvedValue('admin_user')
    mockAuth.mockResolvedValue(makeClerkAuthState('admin_user', 'admin'))
    clerkClientMock.mockResolvedValue({
      users: {
        updateUserMetadata: vi.fn().mockResolvedValue(undefined),
      },
      sessions: {
        getSessionList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
        revokeSession: vi.fn().mockResolvedValue(undefined),
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId
    }
  })

  it('returns 403 for malformed metadata when ADMIN_USER_ID fallback is absent', async () => {
    mockAuth.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await POST(makeReq({ role: 'user' }), {
      params: Promise.resolve({ id: 'target_user' }),
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
    })
  })

  it('allows ADMIN_USER_ID fallback even when metadata is malformed', async () => {
    process.env.ADMIN_USER_ID = 'admin_user'
    mockAuth.mockResolvedValueOnce(makeClerkAuthState('admin_user', ['admin']))

    const res = await POST(makeReq({ role: 'user' }), {
      params: Promise.resolve({ id: 'target_user' }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      message: 'User role updated and active sessions revoked for security.',
    })
  })
})
