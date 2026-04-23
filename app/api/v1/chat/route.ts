import { NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { chatSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { searchLifeGraph, formatLifeGraphForPrompt, MEMORY_TIMEOUT_MS } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { buildGeminiRequest, streamGeminiResponse } from "@/lib/ai/gemini-stream"
import { buildSystemPrompt } from "@/services/ai.service"
import { estimateRequestTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
import { buildCacheKey, getCachedResponse } from "@/lib/server/response-cache"
import { selectGeminiModel, getFallbackModel } from "@/lib/ai/model-router"
import { logRequest, logError, logApiError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkAndIncrementVoiceTime } from "@/lib/billing/usage-tracker"
import { runChatPostResponseTasks } from "@/lib/server/chat-post-response"
import type { KVStore } from "@/types"


const MAX_BODY_BYTES = 5_000_000 // 5 MB

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

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

  // ── 2. Request size guard ──────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    logRequest("chat.payload_too_large", userId, startTime, { size: contentLength })
    return new Response(
      JSON.stringify({ success: false, error: "Payload too large (max 5 MB)", code: "PAYLOAD_TOO_LARGE" }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Plan & KV setup (fail-closed) ────────────────────────────────────────
  const planId = await getUserPlan(userId)
  const kv = getKV()

  // If KV is unavailable, block non-pro users entirely (fail-closed security)
  if (!kv && planId !== 'pro') {
    logRequest("chat.kv_unavailable_blocked", userId, startTime)
    return new Response(
      JSON.stringify({
        success: false,
        error: "Service temporarily unavailable — please try again",
        code: "SERVICE_UNAVAILABLE",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 4. Rate limit ─────────────────────────────────────────────────────────
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("chat.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 5. Parse & validate body ──────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logRequest("chat.invalid_json", userId, startTime)
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    logRequest("chat.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  let { messages } = parsed.data
  const { personality, customPrompt, aiDials, incognito, analyticsOptOut } = parsed.data
  const maxOutputTokens = parsed.data.maxOutputTokens ?? 600
  const clientMemories = incognito ? "" : (parsed.data.memories ?? "")
  const voiceDurationMs = parsed.data.voiceDurationMs

  // ── 5b. Voice usage gating (time-based, pessimistic) ──────────────────────
  // Check-and-increment BEFORE serving the response using actual duration
  if (kv) {
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, voiceDurationMs)
    if (!voiceLimit.allowed) {
      logRequest("chat.voice_limit", userId, startTime)
      return new Response(
        JSON.stringify({
          success: false,
          error: "Daily voice limit reached",
          code: "USAGE_LIMIT_EXCEEDED",
          upgrade: "/pricing",
          usedSeconds: voiceLimit.usedSeconds,
          limitSeconds: voiceLimit.limitSeconds,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  // ── 6. Fetch Life Graph context via semantic search ─────────────────────────
  // Capped at 3s so memory lookup doesn't delay the response.
  // Incognito mode skips this entirely — user asked for a stateless turn.
  let memories = ""
  if (kv && !incognito) {
    try {
      const lastUserMessage = messages.filter((m) => m.role === "user").pop()
      const currentMessage = lastUserMessage?.content ?? ""

      
      const vectorizeEnv = getVectorizeEnv()
      const memoryPromise = searchLifeGraph(kv, vectorizeEnv, userId, currentMessage,
        { topK: 5 },
      )
      // M3 fix: aligned across chat / chat-stream / bot-pipeline to 5s.
      const results = await Promise.race([
        memoryPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Memory search timeout")), MEMORY_TIMEOUT_MS)
        ),
      ])
      memories = formatLifeGraphForPrompt(results)
    } catch (e) {
      logError("chat.memory_fetch_error", e, userId)
      // Continue without memories — don't block the response
    }

    // ── 6b. Load live plugin context (Google Calendar + Notion) ───────────────
    try {
      const { loadPluginContext } = await import("@/lib/plugins/data-fetcher")
      let googleClientId: string | undefined
      let googleClientSecret: string | undefined
      let notionApiKey: string | undefined
      try {
        const env = getEnv()
        googleClientId = env.GOOGLE_CLIENT_ID
        googleClientSecret = env.GOOGLE_CLIENT_SECRET
        notionApiKey = env.NOTION_API_KEY
      } catch {}

      const pluginContext = await loadPluginContext(kv, userId, googleClientId, googleClientSecret, notionApiKey)
      if (pluginContext) {
        memories = memories ? `${memories}\n\n${pluginContext}` : pluginContext
      }
    } catch (e) {
      logError("chat.plugin_context_error", e, userId)
      // Non-blocking — continue without plugin context
    }
  }

  // ── 6. Token budget guard ─────────────────────────────────────────────────
  // Append client-side emotion context to server-side memories
  if (clientMemories) {
    memories = memories ? memories + "\n" + clientMemories : clientMemories
  }

  const systemPrompt = buildSystemPrompt(personality, memories, customPrompt, aiDials)

  const estimatedTokens = estimateRequestTokens(messages, systemPrompt, memories)

  if (estimatedTokens > LIMITS.WARN_THRESHOLD) {
    messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)
  }

  // ── 7. Response cache check ───────────────────────────────────────────────
  const lastUserMsg = messages.filter((m) => m.role === "user").pop()
  const userMessageText = lastUserMsg?.content ?? ""
  const cacheKey = buildCacheKey(userMessageText, personality)

  if (cacheKey) {
    try {
      const cached = await getCachedResponse(cacheKey)
      if (cached) {
        logRequest("chat.cache_hit", userId, startTime, { cacheKey })
        const encoder = new TextEncoder()
        const cachedStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: cached })}\n\n`)
            )
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
          },
        })
        return new Response(cachedStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          },
        })
      }
    } catch (e) {
      logError("chat.cache_error", e, userId)
      // Continue without cache
    }
  }

  // ── 8. Select model dynamically ───────────────────────────────────────────
  let model = selectGeminiModel(messages, memories)

  // Voice requests use Flash for speed — Pro's thinking
  // overhead adds 5-8s latency which is unacceptable for real-time voice.
  if (voiceDurationMs && voiceDurationMs > 0) {
    model = "gemini-2.5-flash" as any
  }

  // ── 9. Build Gemini request & stream ──────────────────────────────────────
  try {
    let requestBody = buildGeminiRequest(messages, personality, memories, model, maxOutputTokens, undefined, customPrompt, undefined, aiDials)
    let textStream: ReadableStream<import("@/lib/ai/gemini-stream").GeminiStreamEvent>
    try {
      textStream = await streamGeminiResponse(model, requestBody)
    } catch (primaryErr) {
      // If primary model is overloaded (503), try fallback
      const fallback = getFallbackModel(model)
      if (fallback && primaryErr instanceof Error && primaryErr.message.includes('503')) {
        logError('chat.primary_model_503', primaryErr, userId)
        model = fallback
        requestBody = buildGeminiRequest(messages, personality, memories, model, maxOutputTokens, undefined, customPrompt, undefined, aiDials)
        textStream = await streamGeminiResponse(model, requestBody)
      } else {
        throw primaryErr
      }
    }

    // Accumulate full response for post-stream cache + cost logging
    let fullResponse = ""
    const inputTokens = estimateRequestTokens(messages, systemPrompt, memories)

    // Transform text deltas into SSE events for the client
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = textStream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()

              runChatPostResponseTasks({
                kv,
                userId,
                startTime,
                logEvent: "chat.completed",
                model,
                inputTokens,
                responseText: fullResponse,
                messages,
                incognito,
                analyticsOptOut,
                cache: {
                  enabled: true,
                  message: userMessageText,
                  personality,
                },
              })

              return
            }
            // Extract text from the typed GeminiStreamEvent
            if (value.type === "text") {
              fullResponse += value.text
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: value.text })}\n\n`)
              )
            }
          }
        } catch (streamErr) {
          logError("chat.stream_error", streamErr, userId)
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
          } catch {
            // controller already closed
          }
        }
      },
    })

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        ...rateLimitHeaders(rateResult),
      },
    })
  } catch (err) {
    logApiError("chat.error", err, { userId, httpStatus: 500 })
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
