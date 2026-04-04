import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { ttsSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { textToSpeech } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { COST_CONSTANTS } from "@/lib/server/cost-tracker"
import type { KVStore } from "@/types"

export const runtime = "edge"

const MAX_BODY_BYTES = 1_000_000 // 1 MB
const TTS_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("TTS request timed out")), ms)
    ),
  ])
}

export async function POST(req: NextRequest) {
  const elapsed = createTimer()
  const startTime = Date.now()

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("tts.auth_error", e)
    throw e
  }

  // ── 2. Request size guard ─────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    logRequest("tts.payload_too_large", userId, startTime, { size: contentLength })
    return NextResponse.json(
      { success: false, error: "Payload too large (max 1 MB)", code: "PAYLOAD_TOO_LARGE" },
      { status: 413 }
    )
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    logRequest("tts.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse & validate ───────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logRequest("tts.invalid_json", userId, startTime)
    return NextResponse.json({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }, { status: 400 })
  }

  const parsed = ttsSchema.safeParse(body)
  if (!parsed.success) {
    logRequest("tts.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  const { text } = parsed.data
  const stability = parsed.data.stability ?? 0.7
  const similarityBoost = parsed.data.similarityBoost ?? 0.85
  const style = parsed.data.style ?? 0.15
  const charCount = text.length

  // ── 5. Env check ──────────────────────────────────────────────────────────
  let appEnv
  try {
    appEnv = getEnv()
  } catch (e) {
    logError("tts.env_error", e, userId)
    return NextResponse.json(
      { success: false, error: "Server configuration error", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
  
  const apiKey = appEnv.ELEVENLABS_API_KEY
  const voiceId = "kdmDKE6EkgrWrrykO9Qt"

  if (!voiceId) {
    logError("tts.missing_voice_id", "ELEVENLABS_VOICE_ID not configured", userId)
    return NextResponse.json(
      { success: false, error: "ElevenLabs voice ID not configured", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }

  // ── 6. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const audioData = await withTimeout(
      textToSpeech({ text, voiceId, apiKey, stability, similarityBoost, style }),
      TTS_TIMEOUT_MS
    )

    logRequest("tts.completed", userId, startTime, { charCount })

    // Analytics: fire-and-forget
    try {
      const { env } = getRequestContext()
      const kv = (env as any).MISSI_MEMORY as KVStore | null
      if (kv) {
        recordEvent(kv, {
          type: 'tts',
          userId,
          costUsd: charCount * COST_CONSTANTS.TTS_COST_PER_CHAR,
        }).catch(() => {})
        recordUserSeen(kv, userId, getTodayDate()).catch(() => {})
      }
    } catch {
      // KV unavailable, skip analytics
    }

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    logError("tts.error", err, userId)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message, code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
