import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import {
  checkInSchema,
  validationErrorResponse,
} from '@/lib/validation/schemas'
import { getGamificationData, checkInHabit } from '@/lib/gamification/streak'
import { logRequest, logError } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// ─── GET — load full GamificationData ────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('streak.auth_error', e)
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('streak.get.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))

  try {
    const data = await getGamificationData(kv, userId)
    logRequest('streak.get', userId, startTime)
    return jsonResponse({ success: true, data }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('streak.get.error', err, userId)
    return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))
  }
}

// ─── POST — check in on a habit ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('streak.auth_error', e)
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('streak.post.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = checkInSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { nodeId, habitTitle } = parsed.data

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Storage unavailable', code: 'INTERNAL_ERROR' },
      503,
    )
  }

  try {
    const result = await checkInHabit(kv, userId, nodeId, habitTitle)
    logRequest('streak.checkin', userId, startTime, {
      nodeId,
      milestone: result.milestone,
    })
    return jsonResponse({ success: true, data: result }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('streak.checkin.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to check in', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
