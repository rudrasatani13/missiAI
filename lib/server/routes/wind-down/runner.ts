import { getLifeGraphReadSnapshot } from '@/lib/memory/life-graph'
import { getProactiveConfig } from '@/lib/proactive/config-store'
import { generateEveningReflection } from '@/lib/proactive/wind-down-generator'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  getAuthenticatedWindDownUserId,
  getWindDownKV,
  getWindDownKey,
  runWindDownRateLimitPreflight,
  windDownJsonResponse,
} from '@/lib/server/routes/wind-down/helpers'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import type { EveningReflection } from '@/types/proactive'

const WIND_DOWN_GRAPH_READ_OPTIONS = { limit: 200, newestFirst: true } as const

export async function runWindDownGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedWindDownUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runWindDownRateLimitPreflight(auth.userId, 'ai')
  if (!ratePreflight.ok) {
    logRequest('wind-down.get.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  const kv = getWindDownKV()
  if (!kv) {
    return windDownJsonResponse(
      { success: true, data: null },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }

  try {
    const key = getWindDownKey(auth.userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      const eightHoursMs = 8 * 60 * 60 * 1000
      if (Date.now() - reflection.generatedAt < eightHoursMs) {
        logRequest('wind-down.get', auth.userId, startTime, { cached: true })
        return windDownJsonResponse(
          { success: true, data: reflection },
          200,
          rateLimitHeaders(ratePreflight.rateResult),
        )
      }
    }

    const graph = await getLifeGraphReadSnapshot(kv, auth.userId, WIND_DOWN_GRAPH_READ_OPTIONS)
    const config = await getProactiveConfig(kv, auth.userId)

    const reflection = await generateEveningReflection(graph, config)
    reflection.userId = auth.userId

    await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })

    logRequest('wind-down.get', auth.userId, startTime, {
      cached: false,
      items: reflection.items.length,
    })
    return windDownJsonResponse(
      { success: true, data: reflection },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('wind-down.error', error, auth.userId)
    return windDownJsonResponse(
      { success: true, data: null },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }
}

export async function runWindDownPostRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedWindDownUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runWindDownRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('wind-down.post.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  const kv = getWindDownKV()
  if (!kv) {
    return windDownJsonResponse(
      { success: true },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }

  try {
    const key = getWindDownKey(auth.userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      reflection.deliveredAt = Date.now()
      await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })
    }

    logRequest('wind-down.delivered', auth.userId, startTime)
    return windDownJsonResponse(
      { success: true },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('wind-down.delivered.error', error, auth.userId)
    return windDownJsonResponse(
      { success: true },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }
}
