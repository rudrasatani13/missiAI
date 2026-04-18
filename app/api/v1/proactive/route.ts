import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import {
  proactiveConfigSchema,
  nudgeRequestSchema,
  dismissSchema,
  validationErrorResponse,
} from '@/lib/validation/schemas'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { generateDailyBriefing } from '@/lib/proactive/briefing-generator'
import { checkForNudges } from '@/lib/proactive/nudge-engine'
import { getProactiveConfig, saveProactiveConfig } from '@/lib/proactive/config-store'
import { logRequest, logError } from '@/lib/server/logger'
import { getEnv } from '@/lib/server/env'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'
import type { DailyBriefing } from '@/types/proactive'


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getBriefingKey(userId: string): string {
  return `proactive:briefing:${userId}:${getTodayDate()}`
}

// ─── GET — get today's briefing ───────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('proactive.auth_error', e)
    throw e
  }

  // OWASP API4: rate-limit briefing fetches — may trigger Gemini calls
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest('proactive.get.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))

  try {
    const key = getBriefingKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const briefing = JSON.parse(cached) as DailyBriefing
      const sixHoursMs = 6 * 60 * 60 * 1000
      if (Date.now() - briefing.generatedAt < sixHoursMs) {
        logRequest('proactive.briefing.get', userId, startTime, { cached: true })
        return jsonResponse({ success: true, data: briefing }, 200, rateLimitHeaders(rateResult))
      }
    }

    // Generate a fresh briefing
    const graph = await getLifeGraph(kv, userId)
    const config = await getProactiveConfig(kv, userId)

    
    const briefing = await generateDailyBriefing(graph, config)
    briefing.userId = userId

    await kv.put(key, JSON.stringify(briefing), { expirationTtl: 6 * 60 * 60 })

    logRequest('proactive.briefing.get', userId, startTime, {
      cached: false,
      items: briefing.items.length,
    })
    return jsonResponse({ success: true, data: briefing }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('proactive.briefing.error', err, userId)
    return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))
  }
}

// ─── POST — trigger nudge check ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('proactive.auth_error', e)
    throw e
  }

  // OWASP API4: rate-limit nudge checks to prevent constant polling abuse
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('proactive.post.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = nudgeRequestSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { lastInteractionAt } = parsed.data

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: { nudges: [] } }, 200, rateLimitHeaders(rateResult))

  try {
    const graph = await getLifeGraph(kv, userId)

    // Load existing dismissed items from today's briefing so nudge engine can
    // filter out items already dismissed within the last 24 hours
    const briefingKey = getBriefingKey(userId)
    const cachedBriefing = await kv.get(briefingKey)
    const existingItems = cachedBriefing
      ? (JSON.parse(cachedBriefing) as DailyBriefing).items
      : undefined

    const nudges = checkForNudges(graph, lastInteractionAt, existingItems)

    logRequest('proactive.nudge.check', userId, startTime, {
      count: nudges.length,
    })
    return jsonResponse({ success: true, data: { nudges } }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('proactive.nudge.error', err, userId)
    return jsonResponse({ success: true, data: { nudges: [] } }, 200, rateLimitHeaders(rateResult))
  }
}

// ─── PATCH — update proactive config ─────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('proactive.auth_error', e)
    throw e
  }

  // OWASP API4: rate-limit config updates — writes to KV on every call
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('proactive.patch.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = proactiveConfigSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  try {
    await saveProactiveConfig(kv, userId, parsed.data)
    logRequest('proactive.config.update', userId, startTime)
    return jsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('proactive.config.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

// ─── DELETE — dismiss a briefing item ────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('proactive.auth_error', e)
    throw e
  }

  // OWASP API4: rate-limit dismissals to prevent KV write flooding
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('proactive.delete.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = dismissSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { nodeId, type } = parsed.data

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))

  try {
    const key = getBriefingKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const briefing = JSON.parse(cached) as DailyBriefing
      const now = Date.now()
      briefing.items = briefing.items.map((item) => {
        if (
          item.type === type &&
          (!nodeId || item.nodeId === nodeId)
        ) {
          return { ...item, dismissedAt: now }
        }
        return item
      })
      await kv.put(key, JSON.stringify(briefing), { expirationTtl: 6 * 60 * 60 })
    }

    logRequest('proactive.briefing.dismiss', userId, startTime)
    return jsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('proactive.dismiss.error', err, userId)
    return jsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))
  }
}
