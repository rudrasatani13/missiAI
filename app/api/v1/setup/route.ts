import { NextRequest } from 'next/server'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { clerkClient } from '@clerk/nextjs/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { logRequest, logError } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import { z } from 'zod'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

const setupSchema = z.object({
  name: z.string().min(1).max(100),
  dob: z.string().max(20).optional(),
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

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) {
    logError('setup.kv_unavailable', 'KV binding missing, gracefully skipping memory save', userId)
  }

  try {
    const body = await req.json()
    const parsed = setupSchema.safeParse(body)
    
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid input' }, 400)
    }

    const { name, dob, occupation } = parsed.data
    const profile = { name, dob, occupation, setupCompleted: true, timestamp: Date.now() }

    // 1. Mark setup as completed in KV (if available) and Clerk
    if (kv) {
      await kv.put(`profile:${userId}`, JSON.stringify(profile))
    }
    
    // Also save to Clerk public metadata for reliable routing checks
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const existingMeta = (user.publicMetadata ?? {}) as Record<string, unknown>
    await client.users.updateUser(userId, {
      publicMetadata: {
        ...existingMeta,
        setupComplete: true
      }
    })

    // 2. Add memories to LifeGraph (if KV is available)
    if (kv) {
      
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
      })

      // Add DOB Memory if provided
      if (dob && dob.trim().length > 0) {
        await addOrUpdateNode(kv, vectorizeEnv, userId, {
          userId,
          title: "User's Birthday",
          detail: `The user was born on ${dob}.`,
          category: 'event',
          tags: ['birthday', 'age', 'astrology'],
          people: [name],
          emotionalWeight: 0.8,
          confidence: 1.0,
          source: 'explicit'
        })
      }

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
        })
      }
    }

    logRequest('setup.completed', userId, startTime)
    return jsonResponse({ success: true, profile }, 200, rateLimitHeaders(rateResult))

  } catch (error) {
    logError('setup.error', error, userId)
    return jsonResponse({ success: false, error: 'Internal server error' }, 500, rateLimitHeaders(rateResult))
  }
}
