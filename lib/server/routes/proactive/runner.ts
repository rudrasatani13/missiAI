import { dismissSchema, nudgeRequestSchema, proactiveConfigSchema } from '@/lib/validation/schemas'
import { getLifeGraphReadSnapshot } from '@/lib/memory/life-graph'
import { generateDailyBriefing } from '@/lib/proactive/briefing-generator'
import { checkForNudges } from '@/lib/proactive/nudge-engine'
import { getProactiveConfig, saveProactiveConfig } from '@/lib/proactive/config-store'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import type { DailyBriefing, ProactiveConfig } from '@/types/proactive'
import {
  getAuthenticatedProactiveUserId,
  getProactiveBriefingKey,
  parseProactiveRouteRequestBody,
  proactiveJsonResponse,
  requireProactiveKV,
  runProactiveRouteRateLimitPreflight,
} from '@/lib/server/routes/proactive/helpers'

const BRIEFING_CACHE_TTL_SECONDS = 6 * 60 * 60
const BRIEFING_CACHE_FRESH_MS = 6 * 60 * 60 * 1000
const PROACTIVE_GRAPH_READ_OPTIONS = { limit: 200, newestFirst: true } as const

export async function runProactiveGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedProactiveUserId({
    onUnexpectedError: (error) => {
      logError('proactive.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runProactiveRouteRateLimitPreflight(userId, 'ai')
  if (!ratePreflight.ok) {
    logRequest('proactive.get.rate_limited', userId, startTime)
    return ratePreflight.response
  }

  const { rateResult } = ratePreflight
  const kvResult = requireProactiveKV(() => proactiveJsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult)))
  if (!kvResult.ok) return kvResult.response

  try {
    const key = getProactiveBriefingKey(userId)
    const cached = await kvResult.kv.get(key)

    if (cached) {
      const briefing = JSON.parse(cached) as DailyBriefing
      if (Date.now() - briefing.generatedAt < BRIEFING_CACHE_FRESH_MS) {
        logRequest('proactive.briefing.get', userId, startTime, { cached: true })
        return proactiveJsonResponse({ success: true, data: briefing }, 200, rateLimitHeaders(rateResult))
      }
    }

    const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, PROACTIVE_GRAPH_READ_OPTIONS)
    const config = await getProactiveConfig(kvResult.kv, userId)
    const briefing = await generateDailyBriefing(graph, config)
    briefing.userId = userId

    await kvResult.kv.put(key, JSON.stringify(briefing), { expirationTtl: BRIEFING_CACHE_TTL_SECONDS })

    logRequest('proactive.briefing.get', userId, startTime, {
      cached: false,
      items: briefing.items.length,
    })
    return proactiveJsonResponse({ success: true, data: briefing }, 200, rateLimitHeaders(rateResult))
  } catch (error) {
    logError('proactive.briefing.error', error, userId)
    return proactiveJsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))
  }
}

export async function runProactivePostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedProactiveUserId({
    onUnexpectedError: (error) => {
      logError('proactive.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runProactiveRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest('proactive.post.rate_limited', userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parseProactiveRouteRequestBody(req, nudgeRequestSchema)
  if (!requestBody.ok) return requestBody.response

  const { rateResult } = ratePreflight
  const kvResult = requireProactiveKV(() => proactiveJsonResponse({ success: true, data: { nudges: [] } }, 200, rateLimitHeaders(rateResult)))
  if (!kvResult.ok) return kvResult.response

  try {
    const graph = await getLifeGraphReadSnapshot(kvResult.kv, userId, PROACTIVE_GRAPH_READ_OPTIONS)
    const briefingKey = getProactiveBriefingKey(userId)
    const cachedBriefing = await kvResult.kv.get(briefingKey)
    const existingItems = cachedBriefing
      ? (JSON.parse(cachedBriefing) as DailyBriefing).items
      : undefined

    const nudges = checkForNudges(graph, requestBody.data.lastInteractionAt, existingItems)

    logRequest('proactive.nudge.check', userId, startTime, {
      count: nudges.length,
    })
    return proactiveJsonResponse({ success: true, data: { nudges } }, 200, rateLimitHeaders(rateResult))
  } catch (error) {
    logError('proactive.nudge.error', error, userId)
    return proactiveJsonResponse({ success: true, data: { nudges: [] } }, 200, rateLimitHeaders(rateResult))
  }
}

export async function runProactivePatchRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedProactiveUserId({
    onUnexpectedError: (error) => {
      logError('proactive.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runProactiveRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest('proactive.patch.rate_limited', userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parseProactiveRouteRequestBody<ProactiveConfig>(req, proactiveConfigSchema)
  if (!requestBody.ok) return requestBody.response

  const kvResult = requireProactiveKV(() => proactiveJsonResponse(
    { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
    500,
  ))
  if (!kvResult.ok) return kvResult.response

  try {
    await saveProactiveConfig(kvResult.kv, userId, requestBody.data)
    logRequest('proactive.config.update', userId, startTime)
    return proactiveJsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(ratePreflight.rateResult))
  } catch (error) {
    logError('proactive.config.error', error, userId)
    return proactiveJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

export async function runProactiveDeleteRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedProactiveUserId({
    onUnexpectedError: (error) => {
      logError('proactive.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runProactiveRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest('proactive.delete.rate_limited', userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parseProactiveRouteRequestBody(req, dismissSchema)
  if (!requestBody.ok) return requestBody.response

  const { rateResult } = ratePreflight
  const kvResult = requireProactiveKV(() => proactiveJsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult)))
  if (!kvResult.ok) return kvResult.response

  try {
    const key = getProactiveBriefingKey(userId)
    const cached = await kvResult.kv.get(key)

    if (cached) {
      const briefing = JSON.parse(cached) as DailyBriefing
      const now = Date.now()
      briefing.items = briefing.items.map((item) => {
        if (item.type === requestBody.data.type && (!requestBody.data.nodeId || item.nodeId === requestBody.data.nodeId)) {
          return { ...item, dismissedAt: now }
        }
        return item
      })
      await kvResult.kv.put(key, JSON.stringify(briefing), { expirationTtl: BRIEFING_CACHE_TTL_SECONDS })
    }

    logRequest('proactive.briefing.dismiss', userId, startTime)
    return proactiveJsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))
  } catch (error) {
    logError('proactive.dismiss.error', error, userId)
    return proactiveJsonResponse({ success: true, data: { success: true } }, 200, rateLimitHeaders(rateResult))
  }
}
