import { z } from 'zod'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { validationErrorResponse } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'
import type { RateLimitResult, RouteType, UserTier } from '@/lib/server/security/rate-limiter'

export function proactiveJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getProactiveBriefingKey(userId: string): string {
  return `proactive:briefing:${userId}:${getTodayDate()}`
}

export type ProactiveRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedProactiveUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<ProactiveRouteAuthResult> {
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

export function getProactiveKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type ProactiveRouteKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireProactiveKV(unavailableResponseFactory: () => Response): ProactiveRouteKvResult {
  const kv = getProactiveKV()
  if (!kv) {
    return {
      ok: false,
      response: unavailableResponseFactory(),
    }
  }

  return { ok: true, kv }
}

export type ProactiveRouteRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runProactiveRouteRateLimitPreflight(
  userId: string,
  route: RouteType = 'api',
): Promise<ProactiveRouteRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, route)

  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return {
    ok: true,
    rateResult,
  }
}

export type ProactiveRouteRequestBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseProactiveRouteRequestBody<T>(
  req: Pick<Request, 'json'>,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  invalidJsonError = 'Invalid JSON body',
): Promise<ProactiveRouteRequestBodyResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: proactiveJsonResponse({ success: false, error: invalidJsonError }, 400),
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

  return {
    ok: true,
    data: parsed.data,
  }
}
