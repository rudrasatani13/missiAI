// ─── Daily Brief — Consolidated Catch-All Route ───────────────────────────────
//
// Handles:
//   path=[] (base)           → GET (fetch brief), POST (generate brief)
//   path=["tasks", taskId]   → PATCH (mark task complete)

import { type NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logRequest, logError } from '@/lib/server/logger'
import { validationErrorResponse } from '@/lib/validation/schemas'
import {
  getTodaysBrief,
  saveBrief,
  markBriefViewed,
  getRateLimit,
  incrementRateLimit,
  markTaskComplete,
} from '@/lib/daily-brief/brief-store'
import {
  buildGenerationContext,
  generateBriefWithGemini,
} from '@/lib/daily-brief/generator'
import { getGoogleTokens } from '@/lib/plugins/data-fetcher'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { awardXP } from '@/lib/gamification/xp-engine'
import { PLANS } from '@/types/billing'
import type { KVStore } from '@/types'
import type { DailyBrief } from '@/types/daily-brief'

export const dynamic = 'force-dynamic'

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch { return null }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Brief GET ────────────────────────────────────────────────────────────────

async function handleBriefGet(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  try {
    const brief = await getTodaysBrief(kv, userId)
    if (brief) {
      markBriefViewed(kv, userId).catch(() => {})
      logRequest('daily-brief.get', userId, startTime)
      const planId = await getUserPlan(userId)
      const maxGenerations = PLANS[planId].briefGenerationsPerDay
      const usedCount = await getRateLimit(kv, userId)
      const remaining = Math.max(0, maxGenerations - usedCount)
      return jsonResponse({ success: true, data: { brief, generated: true, regenerationsRemaining: remaining, maxGenerations } })
    }
    logRequest('daily-brief.get.no_brief', userId, startTime)
    return jsonResponse({ success: true, data: { brief: null, generated: false } })
  } catch (err) {
    logError('daily-brief.get.error', err, userId)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
}

// ─── Brief POST ───────────────────────────────────────────────────────────────

async function handleBriefPost(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  try {
    const planId = await getUserPlan(userId)
    const maxGenerations = PLANS[planId].briefGenerationsPerDay
    const currentCount = await getRateLimit(kv, userId)
    if (currentCount >= maxGenerations) {
      logRequest('daily-brief.post.rate_limited', userId, startTime)
      return jsonResponse({
        error: planId === 'free'
          ? 'Free plan allows 1 daily brief per day. Upgrade to Plus for more.'
          : 'You\'ve used all your daily regenerations. Come back tomorrow.',
        code: 'RATE_LIMITED', regenerationsRemaining: 0, maxGenerations,
      }, 429)
    }

    const url = new URL(req.url)
    const forceRefresh = url.searchParams.get('refresh') === 'true'

    if (!forceRefresh) {
      const existingBrief = await getTodaysBrief(kv, userId)
      if (existingBrief) {
        const remaining = Math.max(0, maxGenerations - currentCount)
        logRequest('daily-brief.post.existing', userId, startTime)
        return jsonResponse({ success: true, data: { brief: existingBrief, regenerationsRemaining: remaining, maxGenerations } })
      }
    }

    const clientTimezone = url.searchParams.get('tz') || undefined
    const clientHour = parseInt(url.searchParams.get('hour') ?? '', 10)
    const localHour = isNaN(clientHour) ? undefined : Math.max(0, Math.min(23, clientHour))

    const googleTokens = await getGoogleTokens(kv, userId)
    const googleClientId = process.env.GOOGLE_CLIENT_ID
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
    const calendarTokens = googleTokens && googleClientId && googleClientSecret
      ? { accessToken: googleTokens.accessToken, clientId: googleClientId, clientSecret: googleClientSecret }
      : undefined

    const context = await buildGenerationContext(kv, userId, calendarTokens)
    if (localHour !== undefined) context.localHour = localHour
    if (clientTimezone) context.timezone = clientTimezone

    const briefContent = await generateBriefWithGemini(context)

    const today = new Date().toISOString().slice(0, 10)
    const brief: DailyBrief = {
      ...briefContent, date: today, userId,
      viewed: false, viewedAt: null, generatedAt: Date.now(),
    }

    await saveBrief(kv, userId, brief)
    await incrementRateLimit(kv, userId)
    const remaining = Math.max(0, maxGenerations - (currentCount + 1))

    logRequest('daily-brief.post.generated', userId, startTime)
    return jsonResponse({ success: true, data: { brief, regenerationsRemaining: remaining, maxGenerations } }, 201)
  } catch (err) {
    logError('daily-brief.post.error', err, userId)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
}

// ─── Task PATCH ───────────────────────────────────────────────────────────────

const taskIdSchema = z.string().min(1, 'Task ID required').max(20, 'Task ID too long')

async function handleTaskPatch(taskId: string) {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.task.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  const parsed = taskIdSchema.safeParse(taskId)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  try {
    const updatedBrief = await markTaskComplete(kv, userId, parsed.data)
    if (!updatedBrief) {
      logRequest('daily-brief.task.not_found', userId, startTime, { taskId: parsed.data })
      return jsonResponse({ success: false, error: 'Task not found in your brief' }, 403)
    }

    awardXP(kv, userId, 'checkin', 5).catch(() => {})
    logRequest('daily-brief.task.complete', userId, startTime, { taskId: parsed.data })
    return jsonResponse({ success: true, data: { brief: updatedBrief } })
  } catch (err) {
    logError('daily-brief.task.error', err, userId)
    return jsonResponse({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
  }
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  if (!path || path.length === 0) return handleBriefGet(req)
  return jsonResponse({ error: 'Not found' }, 404)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  if (!path || path.length === 0) return handleBriefPost(req)
  return jsonResponse({ error: 'Not found' }, 404)
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  // /api/v1/daily-brief/tasks/[taskId]
  if (path && path.length === 2 && path[0] === 'tasks') {
    return handleTaskPatch(path[1])
  }
  return jsonResponse({ error: 'Not found' }, 404)
}
