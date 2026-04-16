import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, unauthorizedResponse } from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { logRequest, logError } from "@/lib/server/logger"
import { getGeminiLiveWsUrl } from "@/lib/ai/vertex-client"
import { isVertexAI, getVertexProjectId, getVertexLocation } from "@/lib/ai/vertex-auth"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkVoiceLimit } from "@/lib/billing/usage-tracker"
import type { KVStore } from "@/types"

export const runtime = "edge"

// Live model — all plans use the same low-latency native-audio model.
// The preview model (gemini-3.1-flash-live-preview) had significantly higher
// latency, so we standardise on the fast production model for everyone.
// Pro users are differentiated via system prompt depth, memory, etc.
const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

/**
 * POST /api/v1/live-token
 *
 * Returns credentials for Gemini Live API WebSocket.
 * All authenticated users share the same fast native-audio model.
 *
 * BUG-013 fix: Now checks voice time limits before issuing a token.
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

  // 2. Plan lookup — used for rate limit bucket
  const planId = await getUserPlan(userId)

  // 3. Rate limit — Pro/Plus share the "paid" bucket, free uses its own
  const rlTier = planId === "free" ? "free" : "paid"
  const rl = await checkRateLimit(userId, rlTier, "ai")
  if (!rl.allowed) return rateLimitExceededResponse(rl)

  // 4. BUG-013 fix: Check voice time limit before issuing live token.
  // Uses read-only checkVoiceLimit (no increment) — we just want to know
  // if the user still has remaining voice quota before giving them a WS token.
  const kv = getKV()
  if (kv) {
    const voiceCheck = await checkVoiceLimit(kv, userId, planId)
    if (!voiceCheck.allowed) {
      return NextResponse.json(
        { error: "Voice time limit reached for today. Upgrade your plan for more voice time." },
        { status: 429 },
      )
    }
  }

  // Build model path for the configured backend
  const modelPath = (() => {
    if (isVertexAI()) {
      const project = getVertexProjectId()
      const location = getVertexLocation()
      return `projects/${project}/locations/${location}/publishers/google/models/${LIVE_MODEL}`
    }
    return `models/${LIVE_MODEL}`
  })()

  try {
    const wsUrl = await getGeminiLiveWsUrl(false)

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
