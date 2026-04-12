import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { chatSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { buildGeminiRequest, streamGeminiResponse } from "@/lib/ai/gemini-stream"
import type { GeminiStreamEvent } from "@/lib/ai/gemini-stream"
import { buildSystemPrompt } from "@/services/ai.service"
import { estimateRequestTokens, estimateTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
import { selectGeminiModel, getFallbackModel } from "@/lib/ai/model-router"
import { createTimer, logRequest, logError, logApiError } from "@/lib/server/logger"
import { calculateTotalCost, checkBudgetAlert } from "@/lib/server/cost-tracker"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkAndIncrementVoiceTime, getTodayDate } from "@/lib/billing/usage-tracker"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { AGENT_FUNCTION_DECLARATIONS, executeAgentTool, getToolLabel } from "@/lib/ai/agent-tools"
import type { AgentToolCall } from "@/lib/ai/agent-tools"
import { awardXP } from "@/lib/gamification/xp-engine"
import { geminiGenerateStream } from "@/lib/ai/vertex-client"
import type { KVStore } from "@/types"

export const runtime = "edge"

const MAX_BODY_BYTES = 5_000_000 // 5 MB
const MAX_AGENT_LOOPS = 3 // Safety limit: max tool-call rounds

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

  // 1. Auth & Size checks
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response("Unauthorized", { status: 401 })
  }

  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 })
  }

  // 2. Plan & KV setup (fail-closed)
  const planId = await getUserPlan(userId)
  const kv = getKV()

  if (!kv && planId !== 'pro') {
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  const rateResult = await checkRateLimit(userId, planId === 'free' ? 'free' : 'paid', 'ai')
  if (!rateResult.allowed) return rateLimitExceededResponse(rateResult)

  // 3. Body validation
  let body: unknown
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }) }
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  let { messages } = parsed.data
  const { personality, voiceEnabled, customPrompt } = parsed.data
  const maxOutputTokens = parsed.data.maxOutputTokens ?? 600
  const clientMemories = parsed.data.memories ?? ""
  const voiceDurationMs = parsed.data.voiceDurationMs

  // 3b. Voice usage gating (time-based, pessimistic)
  if (kv) {
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, voiceDurationMs)
    if (!voiceLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Daily voice limit reached", code: "USAGE_LIMIT_EXCEEDED", usedSeconds: voiceLimit.usedSeconds, limitSeconds: voiceLimit.limitSeconds }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  // 4. Memory context (pre-fetch)
  let memories = ""
  if (kv) {
    try {
      const lastUserMessage = messages.filter((m) => m.role === "user").pop()
      const currentMessage = lastUserMessage?.content ?? ""
      const apiKey = getEnv().GEMINI_API_KEY
      const vectorizeEnv = getVectorizeEnv()
      
      const memoryPromise = searchLifeGraph(kv, vectorizeEnv, userId, currentMessage, apiKey, { topK: 5 })
      const results = await Promise.race([ memoryPromise, new Promise<never>((_, r) => setTimeout(() => r(new Error("Timeout")), 3000)) ])
      memories = formatLifeGraphForPrompt(results)
    } catch { }
  }

  if (clientMemories) memories = memories ? `${memories}\n${clientMemories}` : clientMemories
  const systemPrompt = buildSystemPrompt(personality, memories, customPrompt)
  const estimatedTokens = estimateRequestTokens(messages, systemPrompt, memories)
  if (estimatedTokens > LIMITS.WARN_THRESHOLD) messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)

  let model = selectGeminiModel(messages, memories)

  // 5. Build Streams
  const appEnv = getEnv()
  const voiceId = appEnv.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"
  const elevenParams = `output_format=pcm_24000&optimize_streaming_latency=3&xi-api-key=${appEnv.ELEVENLABS_API_KEY}` // Low latency profile
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_turbo_v2_5&${elevenParams}`

  // Build request WITH agent tool declarations
  let requestBody = buildGeminiRequest(
    messages,
    personality,
    memories,
    model,
    maxOutputTokens,
    AGENT_FUNCTION_DECLARATIONS,
    customPrompt,
  )
  
  try {
    const encoder = new TextEncoder()
    const vectorizeEnv = getVectorizeEnv()

    const sseStream = new ReadableStream({
      async start(controller) {
        // Helper to send SSE events to the client
        const sendSSE = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        let ws: WebSocket | null = null
        let wsOpen = false
        const sendQueue: string[] = []

        // Try to connect WebSocket if voice is enabled
        if (voiceEnabled !== false && typeof WebSocket !== 'undefined') {
          ws = new WebSocket(wsUrl)
          ws.onopen = () => {
            wsOpen = true
            ws!.send(JSON.stringify({
              text: " ",
              voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            }))
            while(sendQueue.length > 0) {
              const txt = sendQueue.shift()
              ws!.send(JSON.stringify({ text: txt }))
            }
          }
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.audio) {
                sendSSE({ audio: data.audio })
              }
            } catch { }
          }
          ws.onerror = (e) => {
            logError("chat_stream.ws_error", e, userId)
          }
          ws.onclose = () => { wsOpen = false }
        }

        // ── Agentic Loop ──────────────────────────────────────────────────
        // The model may respond with text OR a functionCall.
        // If it's a functionCall, we execute it, feed the result back,
        // and let the model generate the final response.
        // Max iterations = MAX_AGENT_LOOPS to prevent infinite loops.

        let currentRequestBody = requestBody
        let loopCount = 0
        let fullResponse = ""
        // Track conversation contents for multi-turn tool calling
        let agentContents: any[] = [...(currentRequestBody.contents as any[])]

        while (loopCount < MAX_AGENT_LOOPS) {
          loopCount++

          let eventStream: ReadableStream<GeminiStreamEvent>
          try {
            eventStream = await streamGeminiResponse(appEnv.GEMINI_API_KEY, model, currentRequestBody)
          } catch (primaryErr) {
            const fallback = getFallbackModel(model)
            if (fallback && primaryErr instanceof Error && primaryErr.message.includes('503')) {
              model = fallback
              currentRequestBody = buildGeminiRequest(
                messages,
                personality,
                memories,
                model,
                maxOutputTokens,
                AGENT_FUNCTION_DECLARATIONS,
              )
              // Update contents reference
              agentContents = [...(currentRequestBody.contents as any[])]
              eventStream = await streamGeminiResponse(appEnv.GEMINI_API_KEY, model, currentRequestBody)
            } else {
              throw primaryErr
            }
          }

          const reader = eventStream.getReader()
          let pendingFunctionCall: AgentToolCall | null = null
          let loopText = ""

          // Read the stream for this iteration
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            if (value.type === "text") {
              loopText += value.text
              fullResponse += value.text
              // Stream text to client
              sendSSE({ text: value.text })
              // Stream to ElevenLabs
              if (ws) {
                if (wsOpen) {
                  ws.send(JSON.stringify({ text: value.text }))
                } else {
                  sendQueue.push(value.text)
                }
              }
            } else if (value.type === "functionCall") {
              pendingFunctionCall = value.call
              // Don't break — read remaining events in this chunk
            }
          }

          // If no function call, we're done — final text response
          if (!pendingFunctionCall) {
            break
          }

          // ── Execute the tool ──────────────────────────────────────────
          const toolLabel = getToolLabel(pendingFunctionCall.name)

          // Tell the client about the agent step (running)
          sendSSE({
            agentStep: {
              toolName: pendingFunctionCall.name,
              status: "running",
              label: toolLabel,
            },
          })

          const toolResult = await executeAgentTool(pendingFunctionCall, {
            kv,
            vectorizeEnv,
            userId,
            apiKey: appEnv.GEMINI_API_KEY,
          })

          // Tell the client the step is done
          sendSSE({
            agentStep: {
              toolName: pendingFunctionCall.name,
              status: toolResult.status,
              label: toolLabel,
              summary: toolResult.summary,
            },
          })

          // Award XP for agent tool usage
          if (kv) awardXP(kv, userId, 'agent', 3).catch(() => {})

          // ── Feed tool result back to Gemini ───────────────────────────
          // Append the model's functionCall and our functionResponse
          agentContents.push({
            role: "model",
            parts: [{
              functionCall: {
                name: pendingFunctionCall.name,
                args: pendingFunctionCall.args,
              },
            }],
          })

          agentContents.push({
            role: "user",
            parts: [{
              functionResponse: {
                name: pendingFunctionCall.name,
                response: {
                  result: toolResult.output,
                },
              },
            }],
          })

          // Rebuild the request with updated conversation
          currentRequestBody = {
            ...currentRequestBody,
            contents: agentContents,
          }

          // Reset for next iteration
          fullResponse = ""
        }

        // ── Stream Complete ──────────────────────────────────────────────
        if (ws && wsOpen) ws.send(JSON.stringify({ text: "" }))
        sendSSE({ done: true })
        controller.close()

        // Usage already incremented pre-response via checkAndIncrementVoice
      }
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
    logError("chat_stream.fatal_error", err, userId)
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
