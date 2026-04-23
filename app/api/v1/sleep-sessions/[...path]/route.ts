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
  MAX_SLEEP_STORY_CHARS,
  sanitizeStoryText,
  type UserContext,
} from '@/lib/sleep-sessions/story-generator'
import { generateBreathingScript } from '@/lib/sleep-sessions/breathing-generator'
import { getAllLibraryStories, getLibraryStoriesByCategory, getLibraryStory } from '@/lib/sleep-sessions/library-stories'
import { geminiTextToSpeech } from '@/services/voice.service'
import { awardXP } from '@/lib/gamification/xp-engine'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { clerkClient } from '@clerk/nextjs/server'
import type { LibraryStoryCategory, SleepStory } from '@/types/sleep-sessions'
import type { KVStore } from '@/types'

type GlobalWithSleepKV = typeof globalThis & {
  __MISSI_SLEEP_SESSIONS_LOCAL_STORE__?: Map<string, string>
}

function getLocalStore() {
  const globalScope = globalThis as GlobalWithSleepKV
  if (!globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__) {
    globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__ = new Map<string, string>()
  }
  return globalScope.__MISSI_SLEEP_SESSIONS_LOCAL_STORE__
}

const localKV = {
  async get<T>(key: string, options?: { type: 'json' }) {
    const value = getLocalStore().get(key) ?? null
    if (value === null) return null
    if (options?.type === 'json') {
      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    }
    return value
  },
  async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
    getLocalStore().set(key, value)
  },
  async delete(key: string) {
    getLocalStore().delete(key)
  },
} as KVStore

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    const kv = (env as any).MISSI_MEMORY ?? null
    if (kv) return kv as KVStore
  } catch {
  }
  if (process.env.NODE_ENV !== 'production') return localKV
  return null
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
    if (returnStory.text.length > MAX_SLEEP_STORY_CHARS) {
      returnStory.text = returnStory.text.slice(0, MAX_SLEEP_STORY_CHARS)
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

const TTS_TIMEOUT_MS = 90_000
const MAX_SLEEP_TTS_RETRIES = 2
const MAX_SLEEP_TTS_CHUNK_CHARS = 2400

function getSleepTtsPerformanceDirection(
  source: 'library' | 'last-generated' | 'breathing',
  text: string,
  story: Pick<SleepStory, 'mode' | 'title' | 'category'> | null,
): string {
  if (source === 'breathing') {
    return 'serene, grounded, measured, and deeply calming like a gentle breathwork guide'
  }

  if (story?.category) {
    switch (story.category) {
      case 'nature':
        return 'grounded, airy, whisper-soft, and reflective like a peaceful walk through nature'
      case 'ocean':
        return 'wave-like, flowing, hushed, and gently hypnotic with an ebb-and-flow cadence'
      case 'space':
        return 'hushed, spacious, awe-filled, and slightly mysterious like drifting through a quiet cosmos'
      case 'childhood':
        return 'tender, nostalgic, cozy, and warmly protective like a cherished childhood memory'
      case 'adventure':
        return 'wonder-filled, softly cinematic, and curious while staying calm and sleep-safe'
      case 'meditation':
        return 'deeply centered, slow, breathy, and meditative with a soothing inner stillness'
    }
  }

  const styleText = `${story?.title ?? ''}\n${text}`.toLowerCase()

  if (/\b(funny|laugh|giggle|smile|silly|joke|playful|cheerful|comic|humor)\b/.test(styleText)) {
    return 'lightly playful, smiling, warm, and softly amused without becoming loud or cartoonish'
  }

  if (/\b(mystery|mysterious|mystic|secret|shadow|moonlit|midnight|whisper|mist|fog|lantern|ancient|unknown)\b/.test(styleText)) {
    return 'softly mysterious, intimate, shadowy, and gently suspenseful without sounding scary'
  }

  if (/\b(magic|magical|enchanted|dream|dreamy|glow|wonder|starlight)\b/.test(styleText)) {
    return 'dreamy, glowing, wonder-filled, and lightly enchanted'
  }

  if (/\b(ocean|wave|sea|shore|tide)\b/.test(styleText)) {
    return 'slow, flowing, wave-like, and calming'
  }

  if (/\b(forest|wood|tree|river|meadow|breeze|garden)\b/.test(styleText)) {
    return 'earthy, grounded, soft, and nature-soaked'
  }

  if (/\b(space|star|stars|cosmos|galaxy|moon|nebula)\b/.test(styleText)) {
    return 'hushed, spacious, mysterious, and full of quiet awe'
  }

  if (/\b(home|childhood|kitchen|blanket|cabin|fireplace|warm|cozy)\b/.test(styleText)) {
    return 'cozy, tender, intimate, and softly comforting'
  }

  if (story?.mode === 'personalized_story') {
    return 'warm, reassuring, deeply safe, intimate, and caring like a bedtime narrator offering comfort'
  }

  if (story?.mode === 'custom_story') {
    return 'gentle, expressive, imaginative, and softly cinematic while remaining soothing'
  }

  return 'warm, intimate, slow, and soothing with subtle emotional color'
}

function buildSleepTtsPrompt(
  source: 'library' | 'last-generated' | 'breathing',
  text: string,
  story: Pick<SleepStory, 'mode' | 'title' | 'category'> | null,
): string {
  const performanceDirection = getSleepTtsPerformanceDirection(source, text, story)
  const styleText = `${story?.title ?? ''}\n${text}`.toLowerCase()
  const playfulHint = /\b(funny|laugh|giggle|smile|silly|joke|playful|cheerful|comic|humor)\b/.test(styleText)
    ? 'Let a soft smile come through playful moments, but do not add extra words or laughter not already in the script.'
    : 'Do not add extra words, sound effects, or ad-libs outside the script.'

  return [
    'Narrate the SCRIPT below as a single-speaker bedtime performance.',
    `Base tone: ${performanceDirection}.`,
    'Keep the pacing slow, smooth, intimate, and natural.',
    'Do not keep one flat emotion for the entire script.',
    'Shift your delivery moment by moment with the story itself, sentence by sentence and scene by scene.',
    'If a moment is calm, sound calm. If it becomes mysterious, sound softly mysterious. If it becomes playful or funny, let a gentle playful smile enter the voice. If it becomes dreamy or wondrous, let the voice open with quiet awe.',
    'Let these emotional changes blend naturally and smoothly, never abruptly.',
    'Match the emotional color of each line while staying sleep-safe: never loud, sharp, panicked, scary, aggressive, or cartoonish.',
    'Keep the whole performance bedtime-friendly even when the mood shifts.',
    'Use gentle pauses and breaths between sentences.',
    playfulHint,
    'Only speak the words from the SCRIPT section. Do not read these instructions or the label aloud.',
    'SCRIPT:',
    text,
  ].join('\n')
}

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

function splitSleepTtsText(text: string, maxChunkChars: number = MAX_SLEEP_TTS_CHUNK_CHARS): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkChars) return [normalized]

  const units = normalized
    .replace(/\n+/g, ' ')
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [normalized]

  const chunks: string[] = []
  let current = ''

  const flushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim())
      current = ''
    }
  }

  const appendUnit = (unit: string) => {
    if (unit.length <= maxChunkChars) {
      const next = current ? `${current} ${unit}` : unit
      if (next.length <= maxChunkChars) {
        current = next
      } else {
        flushCurrent()
        current = unit
      }
      return
    }

    const words = unit.split(/\s+/).filter(Boolean)
    let wordChunk = current

    for (const word of words) {
      const next = wordChunk ? `${wordChunk} ${word}` : word
      if (next.length <= maxChunkChars) {
        wordChunk = next
      } else {
        if (wordChunk.trim()) {
          chunks.push(wordChunk.trim())
        }
        wordChunk = word
      }
    }

    current = wordChunk.trim()
  }

  for (const unit of units) {
    appendUnit(unit)
  }

  flushCurrent()
  return chunks.length > 0 ? chunks : [normalized]
}

function combineWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers to combine')
  }

  if (buffers.length === 1) {
    return buffers[0]
  }

  const headerBytes = new Uint8Array(buffers[0]).slice(0, 44)
  const totalDataBytes = buffers.reduce((sum, buffer) => sum + Math.max(0, buffer.byteLength - 44), 0)
  const mergedBytes = new Uint8Array(44 + totalDataBytes)
  mergedBytes.set(headerBytes, 0)

  let offset = 44
  for (const buffer of buffers) {
    const chunkBytes = new Uint8Array(buffer).slice(44)
    mergedBytes.set(chunkBytes, offset)
    offset += chunkBytes.byteLength
  }

  const view = new DataView(mergedBytes.buffer)
  view.setUint32(4, 36 + totalDataBytes, true)
  view.setUint32(40, totalDataBytes, true)
  return mergedBytes.buffer
}

async function synthesizeSleepTtsChunk(text: string, prompt?: string): Promise<ArrayBuffer> {
  const promptVariants = prompt?.trim() ? [prompt.trim(), undefined] : [undefined]
  let lastErr: unknown = null

  for (const promptVariant of promptVariants) {
    for (let attempt = 1; attempt <= MAX_SLEEP_TTS_RETRIES; attempt++) {
      try {
        return await withTimeout(
          geminiTextToSpeech({
            text,
            voiceName: 'Kore',
            ...(promptVariant ? { prompt: promptVariant } : {}),
          }),
          TTS_TIMEOUT_MS
        )
      } catch (err) {
        lastErr = err
        const errMessage = err instanceof Error ? err.message : String(err)
        const errStatus = (err as any)?.status
        const isRetryable =
          /timed out/i.test(errMessage) ||
          errStatus === 408 ||
          errStatus === 429 ||
          errStatus === 500 ||
          errStatus === 502 ||
          errStatus === 503 ||
          errStatus === 504

        if (isRetryable && attempt < MAX_SLEEP_TTS_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
          continue
        }

        break
      }
    }
  }

  throw lastErr ?? new Error('Failed to synthesize audio')
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

  const kv = getKV()

  if (!kv && source === 'last-generated') {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 503 }
    )
  }

  if (kv) {
    const planId = await getUserPlan(userId)
    const rateResult = await checkTTSRateLimit(kv, userId, planId)

    if (!rateResult.allowed) {
      logRequest("sleep-tts.rate_limited", userId, startTime)
      return NextResponse.json(
        { success: false, error: "Daily sleep audio limit reached.", upgrade: "/pricing" },
        { status: 429 }
      )
    }
  }

  let targetText = ''
  let storyForVoice: Pick<SleepStory, 'mode' | 'title' | 'category'> | null = null

  if (source === 'library') {
    const story = getLibraryStory(storyId)
    if (!story) return NextResponse.json({ success: false, error: "Story not found" }, { status: 404 })
    targetText = story.text
    storyForVoice = { mode: story.mode, title: story.title, category: story.category }
  } else if (source === 'last-generated') {
    if (!kv) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable" },
        { status: 503 }
      )
    }
    const story = await getLastGeneratedStory(kv, userId)
    if (!story || story.id !== storyId) {
      return NextResponse.json({ success: false, error: "Invalid or expired story request" }, { status: 400 })
    }
    targetText = story.text
    storyForVoice = { mode: story.mode, title: story.title, category: story.category }
  } else if (source === 'breathing') {
    if (!customText || customText.length < 10) {
      return NextResponse.json({ success: false, error: "Missing breathing script" }, { status: 400 })
    }
    targetText = customText
  }

  const cleanText = sanitizeStoryText(targetText)

  if (cleanText.length < 10 || cleanText.length > MAX_SLEEP_STORY_CHARS) {
    return NextResponse.json({ success: false, error: "Text length out of bounds" }, { status: 400 })
  }

  try {
    const ttsChunks = splitSleepTtsText(cleanText)
    const audioChunks: ArrayBuffer[] = []

    for (const chunkText of ttsChunks) {
      const ttsPrompt = buildSleepTtsPrompt(source, chunkText, storyForVoice)
      const audioChunk = await synthesizeSleepTtsChunk(chunkText, ttsPrompt)
      audioChunks.push(audioChunk)
    }

    const audioData = combineWavBuffers(audioChunks)

    if (kv) {
      incrementTTSRateLimit(kv, userId).catch(() => {})
      awardXP(kv, userId, 'memory', 1).catch(() => {})
    }

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    logApiError("sleep-tts.error", err, { userId, httpStatus: 500 })
    const errMessage = err instanceof Error ? err.message : String(err)
    const isTimeout = /timed out/i.test(errMessage) || (err as any)?.status === 408 || (err as any)?.status === 504
    return NextResponse.json(
      { success: false, error: isTimeout ? "Audio generation timed out. Please try again." : "Failed to synthesize audio" },
      { status: isTimeout ? 504 : 500 }
    )
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
