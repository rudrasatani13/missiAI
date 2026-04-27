import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { actionSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { standardErrors } from '@/types/api'
import type { ActionInput } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export type ActionsRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedActionsUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<ActionsRouteAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: standardErrors.unauthorized() }
    }

    options.onUnexpectedError?.(error)
    return { ok: false, response: standardErrors.internalError() }
  }
}

export function getActionsKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type ActionsRouteRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runActionsRouteRateLimitPreflight(
  userId: string,
  scope?: 'ai',
): Promise<ActionsRouteRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, scope)

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

export type ActionsRouteRequestBodyResult =
  | { ok: true; data: ActionInput }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseActionsRequestBody(
  req: Pick<Request, 'json'>,
): Promise<ActionsRouteRequestBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: standardErrors.validationError('Invalid JSON body'),
    }
  }

  const parsed = actionSchema.safeParse(body)
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
