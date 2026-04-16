import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { getRecentEntries } from '@/lib/mood/mood-store'
import { logRequest, logError } from '@/lib/server/logger'
import { getEnv } from '@/lib/server/env'
import { rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { 
  checkGenerationRateLimit, 
  incrementGenerationRateLimit, 
  cacheGeneratedStory 
} from '@/lib/sleep-sessions/session-store'
import { 
  generatePersonalizedStory, 
  generateCustomStory,
  type UserContext
} from '@/lib/sleep-sessions/story-generator'
import { generateBreathingScript } from '@/lib/sleep-sessions/breathing-generator'
import type { KVStore } from '@/types'
import { clerkClient } from '@clerk/nextjs/server'
import { validationErrorResponse } from '@/lib/validation/schemas'

export const runtime = 'edge'

const generateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('personalized') }),
  z.object({ mode: z.literal('custom'), prompt: z.string().min(3).max(200) }),
  z.object({ 
    mode: z.literal('breathing'), 
    technique: z.enum(['4-7-8', 'box', 'belly']), 
    cycles: z.number().int().min(3).max(10).default(6) 
  }),
])

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('sleep-gen.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return NextResponse.json(
      { success: false, error: 'Database unavailable' },
      { status: 500 }
    )
  }

  const planId = await getUserPlan(userId)

  const rateResult = await checkGenerationRateLimit(kv, userId, planId)
  if (!rateResult.allowed) {
    logRequest('sleep-gen.rate_limited', userId, startTime)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Daily generation limit exceeded. Upgrade to unlock more.',
        upgradeUrl: '/pricing',
      },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const reqData = parsed.data

  try {
    // 1. Handle Breathing Mode
    if (reqData.mode === 'breathing') {
      const session = generateBreathingScript(reqData.technique, reqData.cycles)
      return NextResponse.json({ success: true, data: session })
    }

    // 2. Setup AI variables
    let apiKey = ''
    try {
      apiKey = getEnv().GEMINI_API_KEY
    } catch {
      apiKey = ''
    }

    let story

    // 3. Handle Personalized Mode
    if (reqData.mode === 'personalized') {
      const recentMoods = await getRecentEntries(kv, userId, 1)
      const lastMood = recentMoods.length > 0 ? recentMoods[recentMoods.length - 1] : undefined

      const graph = await getLifeGraph(kv, userId)
      const topFocus = [...graph.nodes]
        .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
        .slice(0, 3)
        .map(n => n.title.replace(/<[^>]+>/g, '').slice(0, 50)) // Sanitize slightly

      const client = await clerkClient()
      const cUser = await client.users.getUser(userId)
      const firstName = cUser.firstName || 'friend'

      const stressfulDay = lastMood ? lastMood.score < 5 : false

      const context: UserContext = {
        moodLabel: lastMood?.label,
        moodScore: lastMood?.score,
        recentFocus: topFocus,
        firstName,
        stressfulDay
      }

      story = await generatePersonalizedStory(context, apiKey)
    } 
    // 4. Handle Custom Mode
    else if (reqData.mode === 'custom') {
      story = await generateCustomStory(reqData.prompt, apiKey)
    }

    if (!story) {
        throw new Error('Failed to generate story')
    }

    // 5. Cache and Increment
    // fire and forget cache update
    cacheGeneratedStory(kv, userId, story).catch(() => {})
    incrementGenerationRateLimit(kv, userId).catch(() => {})

    logRequest('sleep-gen.success', userId, startTime, { mode: reqData.mode })
    
    // Safety size check
    const returnStory = { ...story }
    if (returnStory.text.length > 6000) {
        returnStory.text = returnStory.text.slice(0, 6000)
    }

    return NextResponse.json({ success: true, data: returnStory })

  } catch (err) {
    logError('sleep-gen.error', err, userId)
    return NextResponse.json(
      { success: false, error: 'Internal error generating sleep session' },
      { status: 500 }
    )
  }
}
