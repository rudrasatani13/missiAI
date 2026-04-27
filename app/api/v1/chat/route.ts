import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { logRequest, logError, logApiError } from "@/lib/server/observability/logger"
import { classifyChatError } from "@/lib/server/chat/errors"
import { buildChatRouteContext, prepareChatRouteCacheHit } from "@/lib/server/chat/route-context"
import { runChatRoutePreflight } from "@/lib/server/chat/route-preflight"
import { buildChatRouteSseResponse } from "@/lib/server/chat/route-runner"

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("chat.auth_error", e)
    throw e
  }

  const preflight = await runChatRoutePreflight(req, userId)
  if (!preflight.ok) {
    if (preflight.kind === "payload_too_large") {
      logRequest("chat.payload_too_large", userId, startTime, { size: req.headers.get("content-length") })
    }
    if (preflight.kind === "kv_unavailable") {
      logRequest("chat.kv_unavailable_blocked", userId, startTime)
    }
    if (preflight.kind === "rate_limited") {
      logRequest("chat.rate_limited", userId, startTime)
    }
    if (preflight.kind === "invalid_json") {
      logRequest("chat.invalid_json", userId, startTime)
    }
    if (preflight.kind === "validation") {
      logRequest("chat.validation_error", userId, startTime)
    }
    if (preflight.kind === "voice_limit") {
      logRequest("chat.voice_limit", userId, startTime)
    }
    return preflight.response
  }

  const { kv, vectorizeEnv, rateResult, input } = preflight.data

  // ── 2. Build context (memories, plugins, emotion, token budget) ────────────
  // Steps 2a–2d are encapsulated inside buildChatRouteContext:
  //   2a. Search Life Graph for relevant memories (3s timeout)
  //   2b. Load live plugin context (Google Calendar + Notion)
  //   2c. Append client-side emotion context
  //   2d. Token budget guard
  // Incognito mode skips memory lookup — user asked for a stateless turn.
  const {
    messages,
    memories,
    systemPrompt,
    maxOutputTokens,
    userMessageText,
    cacheKey,
  } = await buildChatRouteContext({
    userId,
    kv,
    input,
    vectorizeEnv,
    onMemoryError: (e) => {
      logError("chat.memory_fetch_error", e, userId)
    },
    onPluginError: (e) => {
      logError("chat.plugin_context_error", e, userId)
    },
  })

  // ── 3. Response cache check ───────────────────────────────────────────────
  const cacheHit = await prepareChatRouteCacheHit(cacheKey, (e) => {
    logError("chat.cache_error", e, userId)
  })
  if (cacheHit) {
    logRequest("chat.cache_hit", userId, startTime, { cacheKey: cacheHit.cacheKey })
    return cacheHit.response
  }

  // ── 4. Select model dynamically ───────────────────────────────────────────
  // Voice requests use Flash for speed — Pro's thinking
  // overhead adds 5-8s latency which is unacceptable for real-time voice.

  // ── 5. Build Gemini request & stream ──────────────────────────────────────
  try {
    return await buildChatRouteSseResponse({
      kv,
      userId,
      startTime,
      rateResult,
      input,
      messages,
      memories,
      systemPrompt,
      maxOutputTokens,
      userMessageText,
    })
  } catch (err) {
    const classified = classifyChatError(err)
    logApiError("chat.error", err, { userId, httpStatus: classified.status })
    return new Response(
      JSON.stringify({
        success: false,
        error: classified.message,
        code: classified.code,
      }),
      { status: classified.status, headers: { "Content-Type": "application/json" } }
    )
  }
}
