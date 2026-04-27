import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import type { KVStore } from '@/types'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export type WindDownAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedWindDownUserId(): Promise<WindDownAuthResult> {
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

export function getWindDownKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type WindDownRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runWindDownRateLimitPreflight(
  userId: string,
  routeType?: 'api' | 'ai',
): Promise<WindDownRateLimitPreflightResult> {
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

export function windDownJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getWindDownKey(userId: string): string {
  return `proactive:wind-down:${userId}:${getTodayDate()}`
}
