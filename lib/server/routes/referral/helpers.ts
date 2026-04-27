import { z } from 'zod'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { sanitizeInput } from '@/lib/validation/sanitizer'
import type { KVStore } from '@/types'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export const trackReferralSchema = z.object({
  referralCode: z.string().min(1).max(20).transform(sanitizeInput),
})

export type TrackReferralInput = z.infer<typeof trackReferralSchema>

export function referralJsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type ReferralAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedReferralUserId(): Promise<ReferralAuthResult> {
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

export function getReferralKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type ReferralRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runReferralRateLimitPreflight(
  userId: string,
): Promise<ReferralRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return { ok: true, rateResult }
}

export type ReferralBodyResult =
  | { ok: true; data: TrackReferralInput }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseReferralTrackBody(
  req: Pick<Request, 'json'>,
): Promise<ReferralBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: referralJsonResponse({ success: false, error: 'Invalid JSON body' }, 400),
    }
  }

  const parsed = trackReferralSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      response: referralJsonResponse({ success: false, error: 'Invalid referral code' }, 400),
    }
  }

  return { ok: true, data: parsed.data }
}
