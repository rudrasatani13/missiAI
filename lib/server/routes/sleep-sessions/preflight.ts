import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'

type GlobalWithSleepKV = typeof globalThis & {
  __MISSI_SLEEP_SESSIONS_LOCAL_STORE__?: Map<string, string>
}

function getLocalStore() {
  const globalScope = globalThis as GlobalWithSleepKV
  if (!globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__) {
    globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__ = new Map<string, string>()
  }
  return globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__
}

const localKV = {
  async get<T>(key: string, options?: { type: 'json' }) {
    const value = getLocalStore().get(key) ?? null
    if (value === null) return null
    if (options?.type === 'json') {
      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    }
    return value
  },
  async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
    getLocalStore().set(key, value)
  },
  async delete(key: string) {
    getLocalStore().delete(key)
  },
} as KVStore

export type SleepSessionsAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedSleepSessionsUserId(
  options: { onUnexpectedError?: (error: unknown) => void } = {},
): Promise<SleepSessionsAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }

    options.onUnexpectedError?.(error)
    throw error
  }
}

export function getSleepSessionsKV(): KVStore | null {
  const kv = getCloudflareKVBinding()
  if (kv) return kv
  if (process.env.NODE_ENV !== 'production') return localKV
  return null
}

export type SleepSessionsKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireSleepSessionsKV(errorMessage: string): SleepSessionsKvResult {
  const kv = getSleepSessionsKV()
  if (!kv) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: errorMessage }, { status: 500 }),
    }
  }

  return { ok: true, kv }
}

export type SleepSessionsRequestBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseSleepSessionsRequestBody<T>(
  req: Pick<Request, 'json'>,
  schema: z.ZodType<T>,
  invalidJsonError: string,
): Promise<SleepSessionsRequestBodyResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: NextResponse.json({ success: false, error: invalidJsonError }, { status: 400 }),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      response: validationErrorResponse(parsed.error),
    }
  }

  return { ok: true, data: parsed.data }
}
