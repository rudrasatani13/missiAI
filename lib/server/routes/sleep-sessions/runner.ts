import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getTopLifeNodesByEmotionalWeight } from '@/lib/memory/life-graph'
import { getRecentEntries } from '@/lib/mood/mood-store'
import { logRequest, logError } from '@/lib/server/observability/logger'
import { getUserPlan } from '@/lib/billing/tier-checker'
import {
  checkGenerationRateLimit,
  incrementGenerationRateLimit,
  cacheGeneratedStory,
  getHistory,
  addToHistory,
} from '@/lib/sleep-sessions/session-store'
import {
  generatePersonalizedStory,
  generateCustomStory,
  MAX_SLEEP_STORY_CHARS,
  type UserContext,
} from '@/lib/sleep-sessions/story-generator'
import { generateBreathingScript } from '@/lib/sleep-sessions/breathing-generator'
import { getAllLibraryStories, getLibraryStoriesByCategory } from '@/lib/sleep-sessions/library-stories'
import {
  getAuthenticatedSleepSessionsUserId,
  parseSleepSessionsRequestBody,
  requireSleepSessionsKV,
} from '@/lib/server/routes/sleep-sessions/preflight'
import { clerkClient } from '@clerk/nextjs/server'
import type { LibraryStoryCategory, SleepStory } from '@/types/sleep-sessions'

const generateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('personalized') }),
  z.object({ mode: z.literal('custom'), prompt: z.string().min(3).max(200) }),
  z.object({
    mode: z.literal('breathing'),
    technique: z.enum(['4-7-8', 'box', 'belly']),
    cycles: z.number().int().min(3).max(10).default(6),
  }),
])

const historySchema = z.object({
  sessionId: z.string().min(1).max(40),
  mode: z.enum(['personalized_story', 'custom_story', 'breathing', 'library']),
  title: z.string().max(80),
  completed: z.boolean(),
  durationSec: z.number().int().min(0).max(7200),
})

export async function runSleepSessionsGenerateRoute(req: NextRequest): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedSleepSessionsUserId({
    onUnexpectedError: (error) => {
      logError('sleep-gen.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth

  const kvResult = requireSleepSessionsKV('Database unavailable')
  if (!kvResult.ok) {
    return kvResult.response
  }
  const { kv } = kvResult

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
      { status: 429 },
    )
  }

  const requestBody = await parseSleepSessionsRequestBody(req, generateSchema, 'Invalid JSON body')
  if (!requestBody.ok) {
    return requestBody.response
  }

  const reqData = requestBody.data

  try {
    if (reqData.mode === 'breathing') {
      const session = generateBreathingScript(reqData.technique, reqData.cycles)
      return NextResponse.json({ success: true, data: session })
    }

    let story: SleepStory | undefined

    if (reqData.mode === 'personalized') {
      const recentMoods = await getRecentEntries(kv, userId, 1)
      const lastMood = recentMoods.length > 0 ? recentMoods[recentMoods.length - 1] : undefined

      const topFocusNodes = await getTopLifeNodesByEmotionalWeight(kv, userId, { limit: 3, readLimit: 200 })
      const topFocus = topFocusNodes
        .map((node) => node.title.replace(/<[^>]+>/g, '').slice(0, 50))

      const client = await clerkClient()
      const cUser = await client.users.getUser(userId)
      const firstName = cUser.firstName || 'friend'

      const stressfulDay = lastMood ? lastMood.score < 5 : false

      const context: UserContext = {
        moodLabel: lastMood?.label,
        moodScore: lastMood?.score,
        recentFocus: topFocus,
        firstName,
        stressfulDay,
      }

      story = await generatePersonalizedStory(context)
    } else if (reqData.mode === 'custom') {
      story = await generateCustomStory(reqData.prompt)
    }

    if (!story) {
      throw new Error('Failed to generate story')
    }

    await Promise.all([
      cacheGeneratedStory(kv, userId, story),
      incrementGenerationRateLimit(kv, userId),
    ])

    logRequest('sleep-gen.success', userId, startTime, { mode: reqData.mode })

    const returnStory = { ...story }
    if (returnStory.text.length > MAX_SLEEP_STORY_CHARS) {
      returnStory.text = returnStory.text.slice(0, MAX_SLEEP_STORY_CHARS)
    }

    return NextResponse.json({ success: true, data: returnStory })
  } catch (err) {
    logError('sleep-gen.error', err, userId)
    return NextResponse.json(
      { success: false, error: 'Internal error generating sleep session' },
      { status: 500 },
    )
  }
}

export async function runSleepSessionsHistoryGetRoute(): Promise<Response> {
  const auth = await getAuthenticatedSleepSessionsUserId()
  if (!auth.ok) return auth.response

  const { userId } = auth

  const kvResult = requireSleepSessionsKV('DB unavailable')
  if (!kvResult.ok) return kvResult.response

  const { kv } = kvResult

  const entries = await getHistory(kv, userId, 20)
  return NextResponse.json({ success: true, data: { entries } })
}

export async function runSleepSessionsHistoryPostRoute(req: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedSleepSessionsUserId()
  if (!auth.ok) return auth.response

  const { userId } = auth

  const kvResult = requireSleepSessionsKV('DB unavailable')
  if (!kvResult.ok) return kvResult.response

  const { kv } = kvResult

  const requestBody = await parseSleepSessionsRequestBody(req, historySchema, 'Invalid JSON')
  if (!requestBody.ok) {
    return requestBody.response
  }

  const entry = {
    id: requestBody.data.sessionId,
    date: new Date().toISOString(),
    mode: requestBody.data.mode,
    title: requestBody.data.title,
    completed: requestBody.data.completed,
    durationSec: requestBody.data.durationSec,
  }

  await addToHistory(kv, userId, entry)
  return NextResponse.json({ success: true })
}

export async function runSleepSessionsLibraryRoute(req: Request): Promise<Response> {
  const auth = await getAuthenticatedSleepSessionsUserId()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const categoryStr = searchParams.get('category')

  let stories = []
  if (categoryStr) {
    stories = getLibraryStoriesByCategory(categoryStr as LibraryStoryCategory)
  } else {
    stories = getAllLibraryStories()
  }

  return NextResponse.json({ success: true, data: { stories } })
}
