import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { chatSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { buildGeminiRequest, streamGeminiResponse } from "@/lib/ai/gemini-stream"
import { buildSystemPrompt } from "@/services/ai.service"
import { estimateRequestTokens, estimateTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
import { buildCacheKey, getCachedResponse, setCachedResponse, isCacheable } from "@/lib/server/response-cache"
import { selectGeminiModel } from "@/lib/ai/model-router"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { calculateTotalCost, checkBudgetAlert } from "@/lib/server/cost-tracker"
import { getEnv } from "@/lib/server/env"
import type { KVStore } from "@/types"

export const runtime = "edge"

const MAX_BODY_BYTES = 1_000_000 // 1 MB

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const elapsed = createTimer()
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
      JSON.stringify({ success: false, error: "Payload too large (max 1 MB)", code: "PAYLOAD_TOO_LARGE" }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    logRequest("chat.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse & validate body ──────────────────────────────────────────────
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
  const { personality } = parsed.data

  // ── 5. Fetch Life Graph context via semantic search ─────────────────────────
  const kv = getKV()
  let memories = ""
  if (kv) {
    try {
      const lastUserMessage = messages.filter((m) => m.role === "user").pop()
      const currentMessage = lastUserMessage?.content ?? ""

      let apiKey = ""
      try {
        apiKey = getEnv().GEMINI_API_KEY
      } catch {
        apiKey = ""
      }

      const vectorizeEnv = getVectorizeEnv()
      const results = await searchLifeGraph(
        kv,
        vectorizeEnv,
        userId,
        currentMessage,
        apiKey,
        { topK: 8 },
      )
      memories = formatLifeGraphForPrompt(results)
    } catch (e) {
      logError("chat.memory_fetch_error", e, userId)
      // Continue without memories
    }
  }

  // ── 6. Token budget guard ─────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(personality, memories)
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
  const model = selectGeminiModel(messages, memories)

  // ── 9. Build Gemini request & stream ──────────────────────────────────────
  try {
    const appEnv = getEnv()
    const apiKey = appEnv.GEMINI_API_KEY

    const requestBody = buildGeminiRequest(messages, personality, memories, model)
    const textStream = await streamGeminiResponse(apiKey, model, requestBody)

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

              // ── Post-stream: cost tracking + logging ───────────────────
              const outputTokens = estimateTokens(fullResponse)
              const costData = calculateTotalCost(model, inputTokens, outputTokens, 0)

              logRequest("chat.completed", userId, startTime, {
                model: costData.model,
                inputTokens: costData.inputTokens,
                outputTokens: costData.outputTokens,
                costUsd: costData.costUsd,
                ttsChars: costData.ttsChars,
                ttsCostUsd: costData.ttsCostUsd,
                totalCostUsd: costData.totalCostUsd,
              })

              // Budget alert check (non-blocking)
              checkBudgetAlert(kv, costData.totalCostUsd).catch(() => {})

              if (cacheKey && isCacheable(userMessageText, fullResponse)) {
                setCachedResponse(cacheKey, fullResponse).catch(() => {})
              }
              return
            }
            fullResponse += value
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`)
            )
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
      },
    })
  } catch (err) {
    logError("chat.error", err, userId)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
