import { NextRequest } from 'next/server'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { logRequest, logError } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import { getEnv } from '@/lib/server/env'
import { z } from 'zod'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'

export const runtime = 'edge'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

const setupSchema = z.object({
  name: z.string().min(1).max(100),
  occupation: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) {
    logError('setup.kv_unavailable', 'KV binding missing', userId)
    return jsonResponse({ success: false, error: 'Storage unavailable' }, 500)
  }

  try {
    const body = await req.json()
    const parsed = setupSchema.safeParse(body)
    
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid input' }, 400)
    }

    const { name, occupation } = parsed.data

    // 1. Mark setup as completed in KV
    const profile = { name, occupation, setupCompleted: true, timestamp: Date.now() }
    await kv.put(`profile:${userId}`, JSON.stringify(profile))

    // 2. Add memories to LifeGraph
    let apiKey = ''
    try {
      apiKey = getEnv().GEMINI_API_KEY
    } catch {
      apiKey = ''
    }

    const vectorizeEnv = getVectorizeEnv()

    // Add Name Memory
    await addOrUpdateNode(kv, vectorizeEnv, userId, {
      userId,
      title: "User's Name",
      detail: `The user's name is ${name}. Always address the user as ${name}.`,
      category: 'person',
      tags: ['identity', 'name'],
      people: [name],
      emotionalWeight: 1.0,
      confidence: 1.0,
      source: 'explicit'
    }, apiKey)

    // Add Occupation Memory if provided
    if (occupation && occupation.trim().length > 0) {
      await addOrUpdateNode(kv, vectorizeEnv, userId, {
        userId,
        title: "User's Work/Study",
        detail: `The user's occupation or primary activity is: ${occupation}.`,
        category: 'goal',
        tags: ['work', 'study', 'occupation'],
        people: [],
        emotionalWeight: 0.8,
        confidence: 1.0,
        source: 'explicit'
      }, apiKey)
    }

    logRequest('setup.completed', userId, startTime)
    return jsonResponse({ success: true, profile })

  } catch (error) {
    logError('setup.error', error, userId)
    return jsonResponse({ success: false, error: 'Failed to complete setup' }, 500)
  }
}
