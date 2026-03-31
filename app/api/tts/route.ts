import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"
import { ttsSchema, validationErrorResponse } from "@/lib/schemas"
import { textToSpeech } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError } from "@/lib/logger"
import { getEnv } from "@/lib/env"

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

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // ── 2. Request size guard ─────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: "Payload too large (max 1 MB)" },
      { status: 413 }
    )
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse & validate ───────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ttsSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { text } = parsed.data
  const charCount = text.length

  // ── 5. Env check ──────────────────────────────────────────────────────────
  const appEnv = getEnv()
  const apiKey = appEnv.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID

  if (!voiceId) {
    return NextResponse.json(
      { success: false, error: "ElevenLabs voice ID not configured" },
      { status: 500 }
    )
  }

  // ── 6. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const audioData = await withTimeout(
      textToSpeech({ text, voiceId, apiKey }),
      TTS_TIMEOUT_MS
    )

    logRequest("tts.request", userId, Date.now() - elapsed(), { charCount })

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    logError("tts.error", err, userId)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
