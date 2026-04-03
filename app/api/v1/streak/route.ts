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
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    logRequest('streak.get.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: null })

  try {
    const data = await getGamificationData(kv, userId)
    logRequest('streak.get', userId, startTime)
    return jsonResponse({ success: true, data })
  } catch (err) {
    logError('streak.get.error', err, userId)
    return jsonResponse({ success: true, data: null })
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

  const rateResult = await checkRateLimit(userId, 'free')
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
    return jsonResponse({ success: true, data: result })
  } catch (err) {
    logError('streak.checkin.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to check in', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
