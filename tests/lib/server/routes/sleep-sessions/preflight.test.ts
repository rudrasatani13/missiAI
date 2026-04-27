import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KVStore } from '@/types'

const {
  getCloudflareKVBindingMock,
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  validationErrorResponseMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => ({
  getCloudflareKVBindingMock: vi.fn(),
  getVerifiedUserIdMock: vi.fn(),
  unauthorizedResponseMock: vi.fn(() => new Response('Unauthorized', { status: 401 })),
  validationErrorResponseMock: vi.fn(() => new Response(JSON.stringify({ success: false, error: 'Validation error' }), { status: 400 })),
  AuthenticationErrorMock: class extends Error {},
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: AuthenticationErrorMock,
  unauthorizedResponse: unauthorizedResponseMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  validationErrorResponse: validationErrorResponseMock,
}))

import {
  getAuthenticatedSleepSessionsUserId,
  getSleepSessionsKV,
  parseSleepSessionsRequestBody,
  requireSleepSessionsKV,
} from '@/lib/server/routes/sleep-sessions/preflight'

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string, options?: { type: 'json' }) => {
      const value = store.get(key) ?? null
      if (value === null) return null
      if (options?.type === 'json') return JSON.parse(value)
      return value
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

describe('sleep-sessions-route-preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the authenticated user id on success', async () => {
    getVerifiedUserIdMock.mockResolvedValueOnce('user_123')

    const result = await getAuthenticatedSleepSessionsUserId()

    expect(result).toEqual({ ok: true, userId: 'user_123' })
  })

  it('maps authentication failures to the shared unauthorized response', async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const result = await getAuthenticatedSleepSessionsUserId()

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected auth failure')
    expect(result.response.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalledTimes(1)
  })

  it('calls the unexpected auth error hook and rethrows', async () => {
    const error = new Error('boom')
    const onUnexpectedError = vi.fn()
    getVerifiedUserIdMock.mockRejectedValueOnce(error)

    await expect(getAuthenticatedSleepSessionsUserId({ onUnexpectedError })).rejects.toThrow('boom')
    expect(onUnexpectedError).toHaveBeenCalledWith(error)
  })

  it('returns the Cloudflare KV binding when available', () => {
    const kv = createMockKV()
    getCloudflareKVBindingMock.mockReturnValueOnce(kv)

    expect(getSleepSessionsKV()).toBe(kv)
  })

  it('falls back to a local KV shim outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const kv = getSleepSessionsKV()

    expect(kv).not.toBeNull()
    await kv?.put('sleep-test-key', JSON.stringify({ ok: true }))
    await expect(kv?.get('sleep-test-key', { type: 'json' })).resolves.toEqual({ ok: true })
    await kv?.delete('sleep-test-key')
    await expect(kv?.get('sleep-test-key')).resolves.toBeNull()
  })

  it('returns null without KV in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    expect(getSleepSessionsKV()).toBeNull()
  })

  it('returns the configured KV unavailable response when KV is required', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getCloudflareKVBindingMock.mockReturnValueOnce(null)

    const result = requireSleepSessionsKV('DB unavailable')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected kv failure')
    expect(result.response.status).toBe(500)
    await expect(result.response.json()).resolves.toEqual({ success: false, error: 'DB unavailable' })
  })

  it('returns invalid_json when request body parsing fails', async () => {
    const schema = z.object({ mode: z.literal('custom') })
    const req = new Request('http://localhost/api/v1/sleep-sessions/generate', {
      method: 'POST',
      body: '{',
    })

    const result = await parseSleepSessionsRequestBody(req, schema, 'Invalid JSON body')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected parse failure')
    expect(result.kind).toBe('invalid_json')
    expect(result.response.status).toBe(400)
    await expect(result.response.json()).resolves.toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('returns validation when the request payload does not satisfy the schema', async () => {
    const schema = z.object({ mode: z.literal('custom'), prompt: z.string().min(3) })
    const req = new Request('http://localhost/api/v1/sleep-sessions/generate', {
      method: 'POST',
      body: JSON.stringify({ mode: 'custom', prompt: 'no' }),
    })

    const result = await parseSleepSessionsRequestBody(req, schema, 'Invalid JSON body')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected validation failure')
    expect(result.kind).toBe('validation')
    expect(result.response.status).toBe(400)
    expect(validationErrorResponseMock).toHaveBeenCalledTimes(1)
  })

  it('returns typed request data on success', async () => {
    const schema = z.object({ mode: z.literal('custom'), prompt: z.string().min(3) })
    const req = new Request('http://localhost/api/v1/sleep-sessions/generate', {
      method: 'POST',
      body: JSON.stringify({ mode: 'custom', prompt: 'quiet ocean cave' }),
    })

    const result = await parseSleepSessionsRequestBody(req, schema, 'Invalid JSON body')

    expect(result).toEqual({
      ok: true,
      data: {
        mode: 'custom',
        prompt: 'quiet ocean cave',
      },
    })
  })
})
