import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { sttSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { speechToText } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"

export const runtime = "edge"

const STT_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("STT request timed out")), ms)
    ),
  ])
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

  // ── 2. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    logRequest("stt.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 3. Parse FormData ────────────────────────────────────────────────────
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

  // ── 4. Validate audio file with Zod ──────────────────────────────────────
  const parsed = sttSchema.safeParse({
    name: audioFile.name,
    size: audioFile.size,
    type: audioFile.type,
  })
  if (!parsed.success) {
    logRequest("stt.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  // ── 5. Env check ──────────────────────────────────────────────────────────
  let apiKey: string
  try {
    const appEnv = getEnv()
    apiKey = appEnv.ELEVENLABS_API_KEY
  } catch (e) {
    logError("stt.env_error", e, userId)
    return jsonResponse({ success: false, error: "Server configuration error", code: "INTERNAL_ERROR" }, 500)
  }

  // ── 6. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const result = await withTimeout(
      speechToText({ audio: audioFile, apiKey }),
      STT_TIMEOUT_MS
    )

    logRequest("stt.completed", userId, startTime, { 
      audioSize: audioFile.size,
      textLength: result.text?.length ?? 0 
    })

    return jsonResponse({ success: true, data: result })
  } catch (err) {
    logError("stt.error", err, userId)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ success: false, error: message, code: "INTERNAL_ERROR" }, 500)
  }
}
