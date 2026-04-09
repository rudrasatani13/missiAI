import { NextResponse } from "next/server"
import { getVerifiedUserId, unauthorizedResponse } from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { logRequest, logError } from "@/lib/server/logger"
import { getGeminiLiveWsUrl } from "@/lib/ai/vertex-client"
import { isVertexAI, getVertexProjectId, getVertexLocation } from "@/lib/ai/vertex-auth"
import { getUserPlan } from "@/lib/billing/tier-checker"

export const runtime = "edge"

// Live model names — selected by user plan.
// Pro users get the newer preview model via Google AI Studio (not yet on Vertex).
// Free/Plus users get the stable native-audio model on whichever backend is configured.
const PRO_LIVE_MODEL = "gemini-3.1-flash-live-preview"
const STANDARD_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

/**
 * POST /api/v1/live-token
 *
 * Returns credentials for Gemini Live API WebSocket.
 * All authenticated users can access Gemini Live, but the model differs by plan:
 *   - Pro:        gemini-3.1-flash-live-preview (Google AI Studio)
 *   - Free/Plus:  gemini-live-2.5-flash-native-audio (configured backend)
 */
export async function POST() {
  const startTime = Date.now()

  // 1. Auth
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch {
    return unauthorizedResponse()
  }

  // 2. Plan lookup — determines which Live model + backend to use
  const planId = await getUserPlan(userId)
  const isPro = planId === "pro"

  // 3. Rate limit — Pro/Plus share the "paid" bucket, free uses its own
  const rlTier = planId === "free" ? "free" : "paid"
  const rl = await checkRateLimit(userId, rlTier, "ai")
  if (!rl.allowed) return rateLimitExceededResponse(rl)

  // Build the standard (Vertex-or-Google-AI) model path — used by Free/Plus,
  // and as a safety fallback for Pro if Google AI Studio is unreachable.
  const standardModelPath = (() => {
    if (isVertexAI()) {
      const project = getVertexProjectId()
      const location = getVertexLocation()
      return `projects/${project}/locations/${location}/publishers/google/models/${STANDARD_LIVE_MODEL}`
    }
    return `models/${STANDARD_LIVE_MODEL}`
  })()

  try {
    let wsUrl: string
    let modelPath: string

    if (isPro) {
      // Pro uses the preview model, which is Google AI Studio only.
      // If Google AI Studio can't be reached (e.g. GEMINI_API_KEY missing),
      // fall back to the standard model on the configured backend so the
      // user still gets a working voice session.
      try {
        wsUrl = await getGeminiLiveWsUrl(true)
        modelPath = `models/${PRO_LIVE_MODEL}`
      } catch (proErr) {
        logError(
          "live-token.pro-fallback",
          proErr instanceof Error ? proErr : new Error(String(proErr)),
          userId
        )
        wsUrl = await getGeminiLiveWsUrl(false)
        modelPath = standardModelPath
      }
    } else {
      wsUrl = await getGeminiLiveWsUrl(false)
      modelPath = standardModelPath
    }

    logRequest("live-token.created", userId, startTime)

    return NextResponse.json({
      wsUrl,
      modelPath,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
  } catch (err) {
    logError("live-token.error", err instanceof Error ? err : new Error(String(err)), userId)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
