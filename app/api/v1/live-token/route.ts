import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, unauthorizedResponse } from "@/lib/server/security/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { logRequest, logError } from "@/lib/server/observability/logger"
import { getLiveTransportSession, type LiveTransportSession } from "@/lib/ai/live/transport"
import { LIVE_TICKET_COOKIE_NAME, LIVE_TICKET_COOKIE_PATH } from "@/lib/ai/live/ticket"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkVoiceLimit } from "@/lib/billing/usage-tracker"
import { API_ERROR_CODES, errorResponse } from "@/types/api"
import {
  buildLiveTokenSuccessResponse,
  LIVE_MODEL as SHARED_LIVE_MODEL,
} from "@/lib/ai/live/runtime"

// Live model — all plans use the same low-latency native-audio model.
// The preview model (gemini-3.1-flash-live-preview) had significantly higher
// latency, so we standardise on the fast production model for everyone.
// Pro users are differentiated via system prompt depth, memory, etc.
const LIVE_MODEL = SHARED_LIVE_MODEL

function splitRelayTicket(session: LiveTransportSession): {
  session: LiveTransportSession
  relayTicket: string | null
} {
  const relayTicket =
    typeof session.relayTicket === "string" && session.relayTicket.length > 0
      ? session.relayTicket
      : null

  try {
    const url = new URL(session.wsUrl)
    if (url.pathname !== LIVE_TICKET_COOKIE_PATH) {
      return { session, relayTicket }
    }

    const queryRelayTicket = url.searchParams.get("ticket")
    if (!queryRelayTicket) {
      return { session, relayTicket }
    }

    url.searchParams.delete("ticket")
    return {
      session: {
        ...session,
        wsUrl: url.toString(),
      },
      relayTicket: relayTicket ?? queryRelayTicket,
    }
  } catch {
    return { session, relayTicket }
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
 * real GCP token stays inside the Cloudflare Worker (see /api/v1/voice-relay).
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
  const kv = getCloudflareKVBinding()
  const isDev = process.env.NODE_ENV === "development"
  if (!kv && planId !== "pro" && !isDev) {
    return errorResponse(
      "Service temporarily unavailable",
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      503,
    )
  }

  if (kv && planId !== "pro") {
    const voiceCheck = await checkVoiceLimit(kv, userId, planId)
    if (!voiceCheck.allowed) {
      if (voiceCheck.unavailable) {
        return errorResponse(
          "Service temporarily unavailable",
          API_ERROR_CODES.SERVICE_UNAVAILABLE,
          503,
        )
      }

      return errorResponse(
        "Voice time limit reached for today. Upgrade your plan for more voice time.",
        API_ERROR_CODES.USAGE_LIMIT_EXCEEDED,
        429,
      )
    }
  }

  try {
    const liveTransport = await getLiveTransportSession({
      userId,
      requestUrl: req.url,
      nodeEnv: process.env.NODE_ENV,
      model: LIVE_MODEL,
    })
    if (!liveTransport.ok) {
      return errorResponse(
        "Live API backend not configured",
        API_ERROR_CODES.SERVICE_UNAVAILABLE,
        503,
      )
    }

    logRequest("live-token.created", userId, startTime)

    const { session, relayTicket } = splitRelayTicket(liveTransport.session)
    const response = NextResponse.json(
      buildLiveTokenSuccessResponse({
        wsUrl: session.wsUrl,
        modelPath: session.modelPath,
        ttlSeconds: session.ttlSeconds,
      }),
    )

    if (relayTicket) {
      response.cookies.set({
        name: LIVE_TICKET_COOKIE_NAME,
        value: relayTicket,
        httpOnly: true,
        sameSite: "strict",
        secure: req.nextUrl.protocol === "https:",
        path: LIVE_TICKET_COOKIE_PATH,
        maxAge: session.ttlSeconds,
      })
    }

    return response
  } catch (err) {
    logError("live-token.error", err instanceof Error ? err : new Error(String(err)), userId)
    return errorResponse(
      "Internal server error",
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
    )
  }
}
