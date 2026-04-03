import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { generateEveningReflection } from '@/lib/proactive/wind-down-generator'
import { getProactiveConfig } from '@/lib/proactive/config-store'
import { logRequest, logError } from '@/lib/server/logger'
import { getEnv } from '@/lib/server/env'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import type { KVStore } from '@/types'
import type { EveningReflection } from '@/types/proactive'

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

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getWindDownKey(userId: string): string {
  return `proactive:wind-down:${userId}:${getTodayDate()}`
}

// ─── GET — get today's evening reflection ────────────────────────────────────

export async function GET(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('wind-down.auth_error', e)
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    logRequest('wind-down.get.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: null })

  try {
    const key = getWindDownKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      const eightHoursMs = 8 * 60 * 60 * 1000
      if (Date.now() - reflection.generatedAt < eightHoursMs) {
        logRequest('wind-down.get', userId, startTime, { cached: true })
        return jsonResponse({ success: true, data: reflection })
      }
    }

    const graph = await getLifeGraph(kv, userId)
    const config = await getProactiveConfig(kv, userId)

    let apiKey = ''
    try {
      apiKey = getEnv().GEMINI_API_KEY
    } catch {
      apiKey = ''
    }

    const reflection = await generateEveningReflection(graph, config, apiKey)
    reflection.userId = userId

    await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })

    logRequest('wind-down.get', userId, startTime, {
      cached: false,
      items: reflection.items.length,
    })
    return jsonResponse({ success: true, data: reflection })
  } catch (err) {
    logError('wind-down.error', err, userId)
    return jsonResponse({ success: true, data: null })
  }
}

// ─── POST — mark reflection as delivered ─────────────────────────────────────

export async function POST(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('wind-down.auth_error', e)
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    logRequest('wind-down.post.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true })

  try {
    const key = getWindDownKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      reflection.deliveredAt = Date.now()
      await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })
    }

    logRequest('wind-down.delivered', userId, startTime)
    return jsonResponse({ success: true })
  } catch (err) {
    logError('wind-down.delivered.error', err, userId)
    return jsonResponse({ success: true })
  }
}
