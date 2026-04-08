import { NextResponse } from "next/server"
import { getVerifiedUserId, unauthorizedResponse } from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { getEnv } from "@/lib/server/env"
import { logRequest, logError } from "@/lib/server/logger"

export const runtime = "edge"

/**
 * POST /api/v1/live-token
 *
 * Returns credentials for Gemini Live API WebSocket.
 *
 * For now: returns the API key + v1beta WebSocket URL.
 * TODO: Replace with ephemeral tokens for production (v1alpha endpoint).
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

  // 2. Rate limit
  const rl = await checkRateLimit(userId, "free", "ai")
  if (!rl.allowed) return rateLimitExceededResponse(rl)

  try {
    const appEnv = getEnv()

    logRequest("live-token.created", userId, startTime)

    // Return the WebSocket URL with embedded API key
    // The client will connect directly to Gemini's WebSocket
    return NextResponse.json({
      wsUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${appEnv.GEMINI_API_KEY}`,
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
