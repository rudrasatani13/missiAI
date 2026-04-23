import { NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { sttSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { geminiSpeechToText } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { logRequest, logError, logApiError } from "@/lib/server/logger"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkAndIncrementVoiceTime } from "@/lib/billing/usage-tracker"
import type { KVStore } from "@/types"



function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

const STT_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("STT request timed out")), ms)
    ),
  ])
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("stt.auth_error", e)
    throw e
  }

  // ── 2. Plan & KV setup (fail-closed for non-pro when KV is down) ─────────
  const planId = await getUserPlan(userId)
  const kv = getKV()

  if (!kv && planId !== 'pro') {
    return jsonResponse({ success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" }, 503)
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("stt.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse FormData ────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    logRequest("stt.invalid_form_data", userId, startTime)
    return jsonResponse({ success: false, error: "Invalid form data", code: "VALIDATION_ERROR" }, 400)
  }

  const audioFile = formData.get("audio") as File | null
  if (!audioFile) {
    logRequest("stt.missing_audio", userId, startTime)
    return jsonResponse({ success: false, error: "No audio file provided", code: "VALIDATION_ERROR" }, 400)
  }

  // ── 5. Validate audio file with Zod ──────────────────────────────────────
  const parsed = sttSchema.safeParse({
    name: audioFile.name,
    size: audioFile.size,
    type: audioFile.type,
  })
  if (!parsed.success) {
    logRequest("stt.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  // ── 6. Voice-time check-and-increment (H3 fix) ───────────────────────────
  //
  // Previously this endpoint only did a read-only check, which meant a client
  // could hammer STT without ever hitting the daily voice quota tracked by
  // /api/v1/chat(-stream). We now debit the user's voice-time budget here
  // using either the client-reported `voiceDurationMs` (clamped server-side
  // to [3s, 120s] by sanitizeDuration) or a conservative estimate derived
  // from the audio file size (assume 64 kbps → ~8 KB/s).
  const rawDurationField = formData.get("voiceDurationMs")
  const clientDurationMs =
    typeof rawDurationField === "string" && rawDurationField.trim().length > 0
      ? Number.parseInt(rawDurationField, 10)
      : NaN
  const estimatedDurationMs = Math.max(
    3000,
    Math.round((audioFile.size / 8000) * 1000), // ~64 kbps audio
  )
  const effectiveDurationMs = Number.isFinite(clientDurationMs) && clientDurationMs > 0
    ? clientDurationMs
    : estimatedDurationMs

  if (kv) {
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, effectiveDurationMs)
    if (!voiceLimit.allowed) {
      logRequest("stt.voice_limit", userId, startTime)
      return jsonResponse({
        success: false,
        error: "Daily voice limit reached",
        code: "USAGE_LIMIT_EXCEEDED",
        upgrade: "/pricing",
        usedSeconds: voiceLimit.usedSeconds,
        limitSeconds: voiceLimit.limitSeconds,
      }, 429)
    }
  }

  const MAX_STT_RETRIES = 2
  let lastErr: unknown = null

  for (let attempt = 1; attempt <= MAX_STT_RETRIES; attempt++) {
    try {
      const result = await withTimeout(
        geminiSpeechToText({ audio: audioFile }),
        STT_TIMEOUT_MS
      )

      logRequest("stt.completed", userId, startTime, { 
        audioSize: audioFile.size,
        textLength: result.text?.length ?? 0,
        attempt,
      })

      return jsonResponse({ success: true, data: result }, 200, rateLimitHeaders(rateResult))
    } catch (err) {
      lastErr = err
      const errStatus = (err as any)?.status
      const isTransient = errStatus === 500 || errStatus === 502 || errStatus === 503
      if (isTransient && attempt < MAX_STT_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt))
        continue
      }
      break
    }
  }

  logApiError("stt.error", lastErr, { userId, httpStatus: 500 })
  return jsonResponse({ success: false, error: "Transcription failed", code: "INTERNAL_ERROR" }, 500)
}
