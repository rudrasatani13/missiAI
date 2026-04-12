import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { ttsSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { textToSpeech } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError, logApiError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { checkVoiceLimit, getTodayDate } from "@/lib/billing/usage-tracker"
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

  // ── 3. Voice limit check (read-only — chat endpoint does the increment) ──
  const planId = await getUserPlan(userId)

  // Fail-closed: block non-pro users if KV unavailable
  {
    let kvCheck: KVStore | null = null
    try {
      const { env } = getRequestContext()
      kvCheck = (env as any).MISSI_MEMORY ?? null
    } catch {}

    if (!kvCheck && planId !== 'pro') {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      )
    }

    if (kvCheck && planId !== 'pro') {
      const voiceLimit = await checkVoiceLimit(kvCheck, userId, planId)
      if (!voiceLimit.allowed) {
        logRequest("tts.voice_limit", userId, startTime)
        return NextResponse.json(
          { success: false, error: "Daily voice limit reached", code: "USAGE_LIMIT_EXCEEDED", upgrade: "/pricing", usedSeconds: voiceLimit.usedSeconds, limitSeconds: voiceLimit.limitSeconds },
          { status: 429 }
        )
      }
    }
  }

  // ── 4. Rate limit ─────────────────────────────────────────────────────────
  const rateTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
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
  const stability = parsed.data.stability ?? 0.82
  const similarityBoost = parsed.data.similarityBoost ?? 0.8
  const style = parsed.data.style ?? 0.05
  const speed = parsed.data.speed ?? 0.9
  const charCount = text.length

  // ── 5. Env check ──────────────────────────────────────────────────────────
  let appEnv
  try {
    appEnv = getEnv()
  } catch (e) {
    logApiError("tts.env_error", e, { userId, httpStatus: 500 })
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
  
  const apiKey = appEnv.ELEVENLABS_API_KEY
  const voiceId = appEnv.ELEVENLABS_VOICE_ID

  if (!voiceId) {
    logError("tts.missing_voice_id", "ELEVENLABS_VOICE_ID not configured", userId)
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }

  // ── 6. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const audioData = await withTimeout(
      textToSpeech({ text, voiceId, apiKey, stability, similarityBoost, style, speed }),
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
        ...rateLimitHeaders(rateResult),
      },
    })
  } catch (err) {
    logApiError("tts.error", err, { userId, httpStatus: 500 })
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
