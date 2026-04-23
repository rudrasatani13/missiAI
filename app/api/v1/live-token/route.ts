import { NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, unauthorizedResponse } from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { logRequest, logError } from "@/lib/server/logger"
import { isVertexAI, getVertexProjectId, getVertexLocation } from "@/lib/ai/vertex-auth"
import { getGeminiLiveWsUrl } from "@/lib/ai/vertex-client"
import { issueLiveTicket, LIVE_TICKET_TTL_SECONDS } from "@/lib/ai/live-ticket"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkVoiceLimit } from "@/lib/billing/usage-tracker"
import type { KVStore } from "@/types"
import { API_ERROR_CODES, errorResponse } from "@/types/api"


// Live model — all plans use the same low-latency native-audio model.
// The preview model (gemini-3.1-flash-live-preview) had significantly higher
// latency, so we standardise on the fast production model for everyone.
// Pro users are differentiated via system prompt depth, memory, etc.
const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

/**
 * POST /api/v1/live-token
 *
 * Returns credentials for the Gemini Live relay. All authenticated users share
 * the same fast native-audio model.
 *
 * C1 fix: we no longer return the upstream Vertex AI WebSocket URL (which
 * included a `cloud-platform`-scoped Google OAuth access token). Instead we
 * issue a short-lived HMAC-signed ticket and a same-origin relay URL. The
 * real GCP token stays inside the Cloudflare Worker (see /api/v1/live-ws).
 */
export async function POST(req: NextRequest) {
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

  // 4. Check voice time limit before issuing live token.
  // Uses read-only checkVoiceLimit (no increment) — we just want to know
  // if the user still has remaining voice quota before giving them a WS token.
  const kv = getKV()
  if (kv) {
    const voiceCheck = await checkVoiceLimit(kv, userId, planId)
    if (!voiceCheck.allowed) {
      return errorResponse(
        "Voice time limit reached for today. Upgrade your plan for more voice time.",
        API_ERROR_CODES.USAGE_LIMIT_EXCEEDED,
        429,
      )
    }
  }

  // 5. Must be Vertex — no other Live backend is supported.
  if (!isVertexAI()) {
    return errorResponse(
      "Live API backend not configured",
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      503,
    )
  }

  // Build model path for the configured backend
  const project = getVertexProjectId()
  const location = getVertexLocation()
  const modelPath = `projects/${project}/locations/${location}/publishers/google/models/${LIVE_MODEL}`
  const reqUrl = new URL(req.url)
  const isLocalDev =
    process.env.NODE_ENV !== "production"
    && (reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1")

  if (isLocalDev) {
    try {
      const wsUrl = await getGeminiLiveWsUrl()

      logRequest("live-token.created", userId, startTime)

      return NextResponse.json({
        success: true,
        wsUrl,
        modelPath,
        expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      })
    } catch (err) {
      logError("live-token.error", err instanceof Error ? err : new Error(String(err)), userId)
      return errorResponse(
        "Internal server error",
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
      )
    }
  }

  // 6. C1 fix: issue a signed ticket and return a same-origin relay URL.
  try {
    const env = getEnv()
    const ticket = await issueLiveTicket(env, { userId, modelPath })

    // Derive the relay URL from the incoming request origin so it always
    // matches the actual deployment host. APP_URL is not reliable at runtime
    // on Cloudflare Workers because NEXT_PUBLIC_* vars are baked in at build
    // time and may resolve to localhost when built in CI without that var set.
    const wsScheme = reqUrl.protocol === "https:" ? "wss://" : "ws://"
    const wsUrl = `${wsScheme}${reqUrl.host}/api/v1/voice-relay?ticket=${encodeURIComponent(ticket)}`

    logRequest("live-token.created", userId, startTime)

    return NextResponse.json({
      success: true,
      wsUrl,
      modelPath,
      // Expose ticket TTL so the client can re-request before expiry if needed.
      expiresAt: new Date(Date.now() + LIVE_TICKET_TTL_SECONDS * 1000).toISOString(),
    })
  } catch (err) {
    logError("live-token.error", err instanceof Error ? err : new Error(String(err)), userId)
    return errorResponse(
      "Internal server error",
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
    )
  }
}
