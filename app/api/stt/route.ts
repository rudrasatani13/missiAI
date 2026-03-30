import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"
import { sttSchema, validationErrorResponse } from "@/lib/schemas"
import { speechToText } from "@/services/voice.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"

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

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  )
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // ── 2. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 3. Parse FormData ────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError("Invalid form data", 400)
  }

  const audioFile = formData.get("audio") as File | null
  if (!audioFile) {
    return jsonError("No audio file provided", 400)
  }

  // ── 4. Validate audio file with Zod ──────────────────────────────────────
  const parsed = sttSchema.safeParse({
    name: audioFile.name,
    size: audioFile.size,
    type: audioFile.type,
  })
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  // ── 5. Env check ──────────────────────────────────────────────────────────
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return jsonError("ElevenLabs API key not configured", 500)
  }

  // ── 6. Call ElevenLabs with timeout ───────────────────────────────────────
  try {
    const result = await withTimeout(
      speechToText({ audio: audioFile, apiKey }),
      STT_TIMEOUT_MS
    )

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("STT route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonError(message, 500)
  }
}
