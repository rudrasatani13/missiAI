import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { z } from 'zod'
import { validationErrorResponse } from "@/lib/validation/schemas"
import { textToSpeech } from "@/services/voice.service"
import { createTimer, logRequest, logError, logApiError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getLibraryStory } from "@/lib/sleep-sessions/library-stories"
import { getLastGeneratedStory, checkTTSRateLimit, incrementTTSRateLimit } from "@/lib/sleep-sessions/session-store"
import { sanitizeStoryText } from "@/lib/sleep-sessions/story-generator"
import { awardXP } from "@/lib/gamification/xp-engine"
import { getVoiceId as getPersonaVoiceId } from "@/lib/personas/persona-config"
import type { KVStore } from "@/types"

export const runtime = "edge"

const TTS_TIMEOUT_MS = 25_000

const ttsReqSchema = z.object({
  storyId: z.string().min(1).max(40),
  source: z.enum(['library', 'last-generated', 'breathing']),
  text: z.string().optional() // Optional injected text ONLY for breathing, safely checked later
})

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("TTS request timed out")), ms)
    ),
  ])
}

export async function POST(req: NextRequest) {
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
    const { env } = getRequestContext()
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
    // Breathing sessions construct their text directly on the client right now.
    if (!customText || customText.length < 10) {
        return NextResponse.json({ success: false, error: "Missing breathing script" }, { status: 400 })
    }
    targetText = customText
  }

  // Final defensive sanitization pass to protect ElevenLabs API
  const cleanText = sanitizeStoryText(targetText)
  
  if (cleanText.length < 10 || cleanText.length > 6000) {
      return NextResponse.json({ success: false, error: "Text length out of bounds" }, { status: 400 })
  }

  let appEnv
  try {
    appEnv = getEnv()
  } catch (e) {
    return NextResponse.json({ success: false, error: "Configuration error" }, { status: 500 })
  }
  
  const apiKey = appEnv.ELEVENLABS_API_KEY
  let voiceId = appEnv.ELEVENLABS_SLEEP_VOICE_ID || "8quEMRkSpwEaWBzHvTLv" 

  try {
    // Look up persona override
    const personaPref = await kv.get(`sleep-session:persona-pref:${userId}`)
    if (personaPref) {
        const customVoiceId = getPersonaVoiceId(personaPref as any, appEnv)
        if (customVoiceId) voiceId = customVoiceId
    }
  } catch (e) {
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

    // Fire and forget
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
