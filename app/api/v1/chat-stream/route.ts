import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { chatSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { buildGeminiRequest, streamGeminiResponse } from "@/lib/ai/gemini-stream"
import { buildSystemPrompt } from "@/services/ai.service"
import { estimateRequestTokens, estimateTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
import { selectGeminiModel, getFallbackModel } from "@/lib/ai/model-router"
import { createTimer, logRequest, logError, logApiError } from "@/lib/server/logger"
import { calculateTotalCost, checkBudgetAlert } from "@/lib/server/cost-tracker"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkVoiceLimit, incrementVoiceUsage, getTodayDate } from "@/lib/billing/usage-tracker"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import type { KVStore } from "@/types"

export const runtime = "edge"

const MAX_BODY_BYTES = 5_000_000 // 5 MB

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

  // 2. Billing & Rate limits
  const planId = await getUserPlan(userId)
  const kv = getKV()

  if (kv) {
    const voiceLimit = await checkVoiceLimit(kv, userId, planId)
    if (!voiceLimit.allowed) {
      return new Response(JSON.stringify({ error: "Daily voice limit reached", code: "USAGE_LIMIT_EXCEEDED" }), { status: 429 })
    }
  }

  const rateResult = await checkRateLimit(userId, planId === 'free' ? 'free' : 'paid', 'ai')
  if (!rateResult.allowed) return rateLimitExceededResponse(rateResult)

  // 3. Body validation
  let body: unknown
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }) }
  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  let { messages } = parsed.data
  const { personality, voiceEnabled } = parsed.data
  const maxOutputTokens = parsed.data.maxOutputTokens ?? 600
  const clientMemories = parsed.data.memories ?? ""

  // 4. Memory context
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
  const systemPrompt = buildSystemPrompt(personality, memories)
  const estimatedTokens = estimateRequestTokens(messages, systemPrompt, memories)
  if (estimatedTokens > LIMITS.WARN_THRESHOLD) messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)

  let model = selectGeminiModel(messages, memories)

  // 5. Build Streams
  const appEnv = getEnv()
  const voiceId = appEnv.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"
  const elevenParams = `output_format=pcm_24000&optimize_streaming_latency=3&xi-api-key=${appEnv.ELEVENLABS_API_KEY}` // Low latency profile
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_turbo_v2_5&${elevenParams}`

  let requestBody = buildGeminiRequest(messages, personality, memories, model, maxOutputTokens)
  
  try {
    let textStream: ReadableStream<string>
    try {
      textStream = await streamGeminiResponse(appEnv.GEMINI_API_KEY, model, requestBody)
    } catch (primaryErr) {
      const fallback = getFallbackModel(model)
      if (fallback && primaryErr instanceof Error && primaryErr.message.includes('503')) {
        model = fallback
        requestBody = buildGeminiRequest(messages, personality, memories, model, maxOutputTokens)
        textStream = await streamGeminiResponse(appEnv.GEMINI_API_KEY, model, requestBody)
      } else {
        throw primaryErr
      }
    }
    const reader = textStream.getReader()
    
    // We will establish an SSE stream to the client
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        let ws: WebSocket | null = null;
        let wsOpen = false;
        const sendQueue: string[] = [];

        // Try to connect WebSocket if voice is enabled and available in runtime
        if (voiceEnabled !== false && typeof WebSocket !== 'undefined') {
          ws = new WebSocket(wsUrl);
          // Required header mechanism for ElevenLabs WS: The first message must contain the API key and settings.
          ws.onopen = () => {
            wsOpen = true;
            ws!.send(JSON.stringify({
              text: " ",
              voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            }));
            while(sendQueue.length > 0) {
              const txt = sendQueue.shift();
              ws!.send(JSON.stringify({ text: txt }));
            }
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.audio) {
                // Send SSE data back to client containing the audio chunk
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ audio: data.audio })}\n\n`));
              }
              if (data.isFinal) {
                // Done playing
              }
            } catch { }
          };

          ws.onerror = (e) => {
            logError("chat_stream.ws_error", e, userId)
          };
          
          ws.onclose = () => { wsOpen = false; };
        }

        let fullResponse = ""
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              if (ws && wsOpen) ws.send(JSON.stringify({ text: "" })); // Empty text flushes elevenlabs buffer
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              controller.close();
              
              // Increment Voice Usage & Cost Logging...
              if (kv) incrementVoiceUsage(kv, userId).catch(()=>{});
              break;
            }
            
            fullResponse += value
            // Stream the text to the client
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`));
            
            // Stream the text to ElevenLabs
            if (ws) {
              if (wsOpen) {
                ws.send(JSON.stringify({ text: value }));
              } else {
                sendQueue.push(value);
              }
            }
          }
        } catch (streamErr) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        ...rateLimitHeaders(rateResult),
      },
    })
  } catch (err) {
    console.error("CHAT_STREAM FATAL ERROR", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }
}

