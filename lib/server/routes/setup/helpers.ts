import { z } from 'zod'
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export const setupSchema = z.object({
  name: z.string().min(1).max(100),
  dob: z.string().max(20).optional(),
  occupation: z.string().max(200).optional(),
})

export type SetupInput = z.infer<typeof setupSchema>

export function setupJsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type SetupRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedSetupUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<SetupRouteAuthResult> {
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

export function getSetupKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export function getSetupVectorizeEnv(): VectorizeEnv | null {
  return getCloudflareVectorizeEnv()
}

export type SetupRouteRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runSetupRouteRateLimitPreflight(
  userId: string,
): Promise<SetupRouteRateLimitPreflightResult> {
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

  return {
    ok: true,
    rateResult,
  }
}

export function buildSetupProfile(input: SetupInput) {
  return {
    name: input.name,
    dob: input.dob,
    occupation: input.occupation,
    setupCompleted: true,
    timestamp: Date.now(),
  }
}
