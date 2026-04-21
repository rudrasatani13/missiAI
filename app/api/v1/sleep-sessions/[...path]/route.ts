// ─── Sleep Sessions — Consolidated Catch-All Route ────────────────────────────
//
// Handles: generate, history, library, tts
// Consolidation reduces 4 separate edge function bundles into 1.

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getLifeGraph } from '@/lib/memory/life-graph'
import { getRecentEntries } from '@/lib/mood/mood-store'
import { logRequest, logError, logApiError } from '@/lib/server/logger'
import { getEnv } from '@/lib/server/env'
import { getUserPlan } from '@/lib/billing/tier-checker'
import {
  checkGenerationRateLimit,
  incrementGenerationRateLimit,
  cacheGeneratedStory,
  getHistory,
  addToHistory,
  getLastGeneratedStory,
  checkTTSRateLimit,
  incrementTTSRateLimit,
} from '@/lib/sleep-sessions/session-store'
import {
  generatePersonalizedStory,
  generateCustomStory,
  sanitizeStoryText,
  type UserContext,
} from '@/lib/sleep-sessions/story-generator'
import { generateBreathingScript } from '@/lib/sleep-sessions/breathing-generator'
import { getAllLibraryStories, getLibraryStoriesByCategory, getLibraryStory } from '@/lib/sleep-sessions/library-stories'
import { textToSpeech } from '@/services/voice.service'
import { awardXP } from '@/lib/gamification/xp-engine'
import { getVoiceId as getPersonaVoiceId } from '@/lib/personas/persona-config'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { clerkClient } from '@clerk/nextjs/server'
import type { LibraryStoryCategory } from '@/types/sleep-sessions'
import type { KVStore } from '@/types'

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

// ─── Generate Handler (POST /generate) ────────────────────────────────────────

const generateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('personalized') }),
  z.object({ mode: z.literal('custom'), prompt: z.string().min(3).max(200) }),
  z.object({
    mode: z.literal('breathing'),
    technique: z.enum(['4-7-8', 'box', 'belly']),
    cycles: z.number().int().min(3).max(10).default(6)
  }),
])

async function handleGenerate(req: NextRequest) {
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
    if (reqData.mode === 'breathing') {
      const session = generateBreathingScript(reqData.technique, reqData.cycles)
      return NextResponse.json({ success: true, data: session })
    }

    let story

    if (reqData.mode === 'personalized') {
      const recentMoods = await getRecentEntries(kv, userId, 1)
      const lastMood = recentMoods.length > 0 ? recentMoods[recentMoods.length - 1] : undefined

      const graph = await getLifeGraph(kv, userId)
      const topFocus = [...graph.nodes]
        .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
        .slice(0, 3)
        .map(n => n.title.replace(/<[^>]+>/g, '').slice(0, 50))

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

      story = await generatePersonalizedStory(context)
    } else if (reqData.mode === 'custom') {
      story = await generateCustomStory(reqData.prompt)
    }

    if (!story) {
      throw new Error('Failed to generate story')
    }

    cacheGeneratedStory(kv, userId, story).catch(() => {})
    incrementGenerationRateLimit(kv, userId).catch(() => {})

    logRequest('sleep-gen.success', userId, startTime, { mode: reqData.mode })

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

// ─── History Handler (GET/POST /history) ──────────────────────────────────────

const historySchema = z.object({
  sessionId: z.string().min(1).max(40),
  mode: z.enum(['personalized_story', 'custom_story', 'breathing', 'library']),
  title: z.string().max(80),
  completed: z.boolean(),
  durationSec: z.number().int().min(0).max(7200)
})

async function handleHistoryGet() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return NextResponse.json({ success: false, error: "DB unavailable" }, { status: 500 })

  const entries = await getHistory(kv, userId, 20)
  return NextResponse.json({ success: true, data: { entries } })
}

async function handleHistoryPost(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return NextResponse.json({ success: false, error: "DB unavailable" }, { status: 500 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = historySchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const entry = {
    id: parsed.data.sessionId,
    date: new Date().toISOString(),
    mode: parsed.data.mode,
    title: parsed.data.title,
    completed: parsed.data.completed,
    durationSec: parsed.data.durationSec
  }

  await addToHistory(kv, userId, entry)
  return NextResponse.json({ success: true })
}

// ─── Library Handler (GET /library) ───────────────────────────────────────────

async function handleLibrary(req: Request) {
  try {
    await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

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

// ─── TTS Handler (POST /tts) ──────────────────────────────────────────────────

const TTS_TIMEOUT_MS = 25_000

const ttsReqSchema = z.object({
  storyId: z.string().min(1).max(40),
  source: z.enum(['library', 'last-generated', 'breathing']),
  text: z.string().optional()
})

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("TTS request timed out")), ms)
    ),
  ])
}

async function handleTts(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("sleep-tts.auth_error", e)
    throw e
  }

  let kv: KVStore | null = null
  try {
    const { env } = getCloudflareContext()
    kv = (env as any).MISSI_MEMORY ?? null
  } catch {}

  if (!kv) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ttsReqSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { storyId, source, text: customText } = parsed.data

  const planId = await getUserPlan(userId)
  const rateResult = await checkTTSRateLimit(kv, userId, planId)

  if (!rateResult.allowed) {
    logRequest("sleep-tts.rate_limited", userId, startTime)
    return NextResponse.json(
      { success: false, error: "Daily sleep audio limit reached.", upgrade: "/pricing" },
      { status: 429 }
    )
  }

  let targetText = ''

  if (source === 'library') {
    const story = getLibraryStory(storyId)
    if (!story) return NextResponse.json({ success: false, error: "Story not found" }, { status: 404 })
    targetText = story.text
  } else if (source === 'last-generated') {
    const story = await getLastGeneratedStory(kv, userId)
    if (!story || story.id !== storyId) {
      return NextResponse.json({ success: false, error: "Invalid or expired story request" }, { status: 400 })
    }
    targetText = story.text
  } else if (source === 'breathing') {
    if (!customText || customText.length < 10) {
      return NextResponse.json({ success: false, error: "Missing breathing script" }, { status: 400 })
    }
    targetText = customText
  }

  const cleanText = sanitizeStoryText(targetText)

  if (cleanText.length < 10 || cleanText.length > 6000) {
    return NextResponse.json({ success: false, error: "Text length out of bounds" }, { status: 400 })
  }

  let appEnv
  try {
    appEnv = getEnv()
  } catch {
    return NextResponse.json({ success: false, error: "Configuration error" }, { status: 500 })
  }

  const apiKey = appEnv.ELEVENLABS_API_KEY
  let voiceId = appEnv.ELEVENLABS_SLEEP_VOICE_ID || "8quEMRkSpwEaWBzHvTLv"

  try {
    const personaPref = await kv.get(`sleep-session:persona-pref:${userId}`)
    if (personaPref) {
      const customVoiceId = getPersonaVoiceId(personaPref as any, appEnv)
      if (customVoiceId) voiceId = customVoiceId
    }
  } catch {
    // ignore
  }

  try {
    const audioData = await withTimeout(
      textToSpeech({
        text: cleanText,
        voiceId,
        apiKey,
        stability: 0.85,
        similarityBoost: 0.75,
        style: 0.0,
        speed: 0.85
      }),
      TTS_TIMEOUT_MS
    )

    incrementTTSRateLimit(kv, userId).catch(() => {})
    awardXP(kv, userId, 'memory', 1).catch(() => {})

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    logApiError("sleep-tts.error", err, { userId, httpStatus: 500 })
    return NextResponse.json({ success: false, error: "Failed to synthesize audio" }, { status: 500 })
  }
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'history':
      return handleHistoryGet()
    case 'library':
      return handleLibrary(req)
    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'generate':
      return handleGenerate(req)
    case 'history':
      return handleHistoryPost(req)
    case 'tts':
      return handleTts(req)
    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
