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
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
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

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest('wind-down.get.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))

  try {
    const key = getWindDownKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      const eightHoursMs = 8 * 60 * 60 * 1000
      if (Date.now() - reflection.generatedAt < eightHoursMs) {
        logRequest('wind-down.get', userId, startTime, { cached: true })
        return jsonResponse({ success: true, data: reflection }, 200, rateLimitHeaders(rateResult))
      }
    }

    const graph = await getLifeGraph(kv, userId)
    const config = await getProactiveConfig(kv, userId)

    
    const reflection = await generateEveningReflection(graph, config)
    reflection.userId = userId

    await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })

    logRequest('wind-down.get', userId, startTime, {
      cached: false,
      items: reflection.items.length,
    })
    return jsonResponse({ success: true, data: reflection }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('wind-down.error', err, userId)
    return jsonResponse({ success: true, data: null }, 200, rateLimitHeaders(rateResult))
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

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('wind-down.post.rate_limited', userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: true }, 200, rateLimitHeaders(rateResult))

  try {
    const key = getWindDownKey(userId)
    const cached = await kv.get(key)

    if (cached) {
      const reflection = JSON.parse(cached) as EveningReflection
      reflection.deliveredAt = Date.now()
      await kv.put(key, JSON.stringify(reflection), { expirationTtl: 28800 })
    }

    logRequest('wind-down.delivered', userId, startTime)
    return jsonResponse({ success: true }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError('wind-down.delivered.error', err, userId)
    return jsonResponse({ success: true }, 200, rateLimitHeaders(rateResult))
  }
}
