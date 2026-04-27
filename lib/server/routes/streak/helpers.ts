import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { checkInSchema, validationErrorResponse } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export type StreakAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedStreakUserId(): Promise<StreakAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }
    throw error
  }
}

export function getStreakKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type StreakRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runStreakRateLimitPreflight(
  userId: string,
  routeType?: 'api' | 'ai',
): Promise<StreakRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, routeType)
  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return { ok: true, rateResult }
}

export function streakJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type StreakBodyResult =
  | { ok: true; data: { nodeId: string; habitTitle: string } }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseStreakCheckInBody(
  req: Pick<Request, 'json'>,
): Promise<StreakBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: streakJsonResponse({ success: false, error: 'Invalid JSON body' }, 400),
    }
  }

  const parsed = checkInSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      response: validationErrorResponse(parsed.error),
    }
  }

  return { ok: true, data: parsed.data }
}
