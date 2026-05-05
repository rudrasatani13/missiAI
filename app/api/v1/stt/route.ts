import { NextRequest } from "next/server"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { sttSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { geminiSpeechToText } from "@/lib/ai/services/voice-service"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/server/security/rate-limiter"
import { logRequest, logError, logApiError } from "@/lib/server/observability/logger"
import {
  validateAudioMagicBytes,
} from "@/lib/server/routes/stt/helpers"

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

  // ── 2. KV setup ───────────────────────────────────────────────────────────────
  const kv = getCloudflareKVBinding()
  const isDev = process.env.NODE_ENV === "development"
  if (!kv && !isDev) {
    return jsonResponse({ success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" }, 503)
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free", 'ai')
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

  // ── 5. Validate audio file metadata with Zod ────────────────────────────
  const parsed = sttSchema.safeParse({
    name: audioFile.name,
    size: audioFile.size,
    type: audioFile.type,
  })
  if (!parsed.success) {
    logRequest("stt.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  // ── 6. Read bytes and validate audio magic bytes ─────────────────────────
  //
  // The browser-supplied MIME type cannot be trusted on its own. Read the
  // leading bytes of the upload and verify they match known audio file
  // signatures. This rejects disguised non-audio content (e.g. a JPEG
  // declared as audio/wav) before the bytes reach the AI provider.
  let audioBytes: Uint8Array
  try {
    audioBytes = new Uint8Array(await audioFile.arrayBuffer())
  } catch {
    logRequest("stt.read_error", userId, startTime)
    return jsonResponse({ success: false, error: "Failed to read audio file", code: "VALIDATION_ERROR" }, 400)
  }

  if (!validateAudioMagicBytes(audioBytes, audioFile.type)) {
    logRequest("stt.invalid_magic_bytes", userId, startTime, { declaredType: audioFile.type })
    return jsonResponse({ success: false, error: "File content does not match declared audio type", code: "INVALID_FILE" }, 400)
  }

  // ── 7. Voice-time tracking removed (billing was deleted) ─────────────────────

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
