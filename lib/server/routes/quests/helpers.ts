import { z } from 'zod'
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { validationErrorResponse } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'

export const createQuestSchema = z.object({
  userGoal: z.string().min(10).max(500),
  category: z.enum([
    'health', 'learning', 'creativity', 'relationships',
    'career', 'mindfulness', 'other',
  ]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  targetDurationDays: z.number().int().min(3).max(180),
})

export const patchQuestSchema = z.object({
  action: z.enum(['start', 'abandon', 'resume']),
})

export type CreateQuestRequest = z.infer<typeof createQuestSchema>
export type QuestStatusFilter = 'active' | 'completed' | null

export function questsJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type QuestsRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedQuestsUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<QuestsRouteAuthResult> {
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

export function getQuestsKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export function getQuestsVectorizeEnv(): VectorizeEnv | null {
  return getCloudflareVectorizeEnv()
}

export type QuestsRouteKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireQuestsKV(unavailableResponseFactory: () => Response): QuestsRouteKvResult {
  const kv = getQuestsKV()
  if (!kv) {
    return {
      ok: false,
      response: unavailableResponseFactory(),
    }
  }

  return { ok: true, kv }
}

export type QuestsRouteRateLimitPreflightResult =
  | { ok: true; planId: string; rateResult: RateLimitResult }
  | { ok: false; planId: string; rateResult: RateLimitResult; response: Response }

export async function runQuestsRouteRateLimitPreflight(
  userId: string,
): Promise<QuestsRouteRateLimitPreflightResult> {
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

export type QuestsRouteRequestBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseQuestsRouteRequestBody<T>(
  req: Pick<Request, 'json'>,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  invalidJsonError = 'Invalid JSON body',
): Promise<QuestsRouteRequestBodyResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: questsJsonResponse({ success: false, error: invalidJsonError }, 400),
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

export function parseQuestsStatusFilter(req: Pick<Request, 'url'>): QuestStatusFilter {
  const status = new URL(req.url).searchParams.get('status')
  if (status === 'active' || status === 'completed') {
    return status
  }

  return null
}
