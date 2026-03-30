import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { textToSpeech } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { ttsSchema, validationErrorResponse } from "@/lib/validation"

export const runtime = "edge"

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
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 3. Parse & validate ───────────────────────────────────────────────────
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

  // ── 4. Env check ──────────────────────────────────────────────────────────
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { success: false, error: "ElevenLabs not configured" },
      { status: 500 }
    )
  }

  // ── 5. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const audioData = await withTimeout(
      textToSpeech({ text, voiceId, apiKey }),
      TTS_TIMEOUT_MS
    )

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("TTS route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
