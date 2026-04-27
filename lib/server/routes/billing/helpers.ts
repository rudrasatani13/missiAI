import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { billingCheckoutSchema } from '@/lib/validation/billing-schemas'
import type { BillingCheckoutInput } from '@/lib/validation/billing-schemas'
import type { DailyUsage, UserBilling } from '@/types/billing'
import type { KVStore } from '@/types'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export function billingJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function buildFallbackDailyUsage(userId: string): DailyUsage {
  return {
    userId,
    date: new Date().toISOString().split('T')[0],
    voiceInteractions: 0,
    voiceSecondsUsed: 0,
    lastUpdatedAt: Date.now(),
  }
}

export function stripInternalBillingIds(billingData: UserBilling): Omit<UserBilling, 'dodoCustomerId' | 'dodoSubscriptionId'> {
  return {
    userId: billingData.userId,
    planId: billingData.planId,
    currentPeriodEnd: billingData.currentPeriodEnd,
    cancelAtPeriodEnd: billingData.cancelAtPeriodEnd,
    updatedAt: billingData.updatedAt,
  }
}

export type BillingRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedBillingUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<BillingRouteAuthResult> {
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

export function getBillingKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type BillingRouteRateLimitPreflightResult =
  | { ok: true; planId: string; rateResult: RateLimitResult }
  | { ok: false; planId: string; rateResult: RateLimitResult; response: Response }

export async function runBillingRouteRateLimitPreflight(
  userId: string,
): Promise<BillingRouteRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)

  if (!rateResult.allowed) {
    return {
      ok: false,
      planId,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return {
    ok: true,
    planId,
    rateResult,
  }
}

export type BillingCheckoutRequestBodyResult =
  | { ok: true; data: BillingCheckoutInput }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseBillingCheckoutRequestBody(
  req: Pick<Request, 'json'>,
): Promise<BillingCheckoutRequestBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: billingJsonResponse({ success: false, error: 'Invalid JSON body' }, 400),
    }
  }

  const parsed = billingCheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      response: billingJsonResponse(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
        400,
      ),
    }
  }

  return {
    ok: true,
    data: parsed.data,
  }
}
