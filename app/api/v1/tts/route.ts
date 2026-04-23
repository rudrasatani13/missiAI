import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { ttsSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { geminiTextToSpeech } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { logRequest, logError, logApiError } from "@/lib/server/logger"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { checkVoiceLimit, getTodayDate } from "@/lib/billing/usage-tracker"
import { waitUntil } from "@/lib/server/wait-until"
import { COST_CONSTANTS } from "@/lib/server/cost-tracker"
import type { KVStore } from "@/types"

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
      const { env } = getCloudflareContext()
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
  const charCount = text.length

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
      try {
        const { env } = getCloudflareContext()
        const kv = (env as any).MISSI_MEMORY as KVStore | null
        if (kv) {
          waitUntil(
            recordEvent(kv, {
              type: 'tts',
              userId,
              costUsd: charCount * COST_CONSTANTS.TTS_COST_PER_CHAR,
            }).catch(() => {}),
          )
          waitUntil(recordUserSeen(kv, userId, getTodayDate()).catch(() => {}))
        }
      } catch {
        // KV unavailable, skip analytics
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
