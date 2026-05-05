import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { ttsSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { geminiTextToSpeech } from "@/lib/ai/services/voice-service"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/server/security/rate-limiter"
import { logRequest, logError, logApiError } from "@/lib/server/observability/logger"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { recordAnalyticsUsage } from "@/lib/analytics/event-store"
import { checkAndIncrementVoiceTime } from "@/lib/billing/usage-tracker"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { COST_CONSTANTS } from "@/lib/server/observability/cost-tracker"

const MAX_BODY_BYTES = 1_000_000 // 1 MB
const TTS_TIMEOUT_MS = 15_000
/** Estimated TTS speaking rate used to debit voice quota (chars per second). */
const TTS_CHARS_PER_SECOND = 15

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

  // ── 3. KV availability + plan (fail-closed for non-pro outside dev) ───────
  const kv = getCloudflareKVBinding()
  const planId = await getUserPlan(userId)
  const isDev = process.env.NODE_ENV === "development"

  if (!kv && planId !== "pro" && !isDev) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 503 }
    )
  }

  // ── 4. Rate limit ─────────────────────────────────────────────────────────
  const rateTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("tts.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 5. Parse & validate ───────────────────────────────────────────────────
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
  const charCount = text.length

  // ── 6. Voice quota check + debit ─────────────────────────────────────────
  // Estimate TTS audio duration from text length before the provider call.
  // Follows the pessimistic increment-first pattern: quota is consumed before
  // the provider call, so retries within this request cannot bypass the
  // counter. Provider failures still consume quota (same design as chat).
  if (kv && planId !== "pro") {
    const estimatedDurationMs = Math.max(3000, Math.ceil(charCount / TTS_CHARS_PER_SECOND) * 1000)
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, estimatedDurationMs)
    if (!voiceLimit.allowed) {
      if (voiceLimit.unavailable) {
        logRequest("tts.voice_quota_unavailable", userId, startTime)
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        )
      }
      logRequest("tts.voice_limit", userId, startTime)
      return NextResponse.json(
        { success: false, error: "Daily voice limit reached", code: "USAGE_LIMIT_EXCEEDED", upgrade: "/pricing", usedSeconds: voiceLimit.usedSeconds, limitSeconds: voiceLimit.limitSeconds },
        { status: 429 }
      )
    }
  }

  const MAX_TTS_RETRIES = 2
  let lastErr: unknown = null

  for (let attempt = 1; attempt <= MAX_TTS_RETRIES; attempt++) {
    try {
      const audioData = await withTimeout(
        geminiTextToSpeech({ text, voiceName: "Kore" }),
        TTS_TIMEOUT_MS
      )

      logRequest("tts.completed", userId, startTime, { charCount, attempt })

      // Analytics: fire-and-forget
      if (kv) {
        waitUntil(
          recordAnalyticsUsage(kv, {
            type: 'tts',
            userId,
            costUsd: charCount * COST_CONSTANTS.TTS_COST_PER_CHAR,
          }).catch((err) => logError('tts.analytics_error', err, userId)),
        )
      }

      return new NextResponse(audioData, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-cache",
          ...rateLimitHeaders(rateResult),
        },
      })
    } catch (err) {
      lastErr = err
      const errStatus = (err as any)?.status
      const isTransient = errStatus === 500 || errStatus === 502 || errStatus === 503
      if (isTransient && attempt < MAX_TTS_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt))
        continue
      }
      break
    }
  }

  logApiError("tts.error", lastErr, { userId, httpStatus: 500 })
  return NextResponse.json(
    { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 },
  )
}
