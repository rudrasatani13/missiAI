import { buildGeminiRequest } from "@/lib/ai/providers/gemini-stream"
import { estimateRequestTokens } from "@/lib/memory/token-counter"
import { selectGeminiModel } from "@/lib/ai/providers/model-router"
import { streamChat } from "@/lib/ai/providers/router"
import { rateLimitHeaders, type RateLimitResult } from "@/lib/server/security/rate-limiter"
import { runChatPostResponseTasks } from "@/lib/server/chat/post-response"
import { logError, logLatency, createTimer } from "@/lib/server/observability/logger"
import { classifyChatError } from "@/lib/server/chat/errors"
import type { ChatInput } from "@/lib/validation/schemas"
import type { KVStore, Message } from "@/types"

export interface ChatRouteRunnerParams {
  kv: KVStore | null
  userId: string
  startTime: number
  rateResult: RateLimitResult
  input: ChatInput
  messages: Message[]
  memories: string
  systemPrompt: string
  maxOutputTokens: number
  userMessageText: string
}

export async function buildChatRouteSseResponse({
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
}: ChatRouteRunnerParams): Promise<Response> {
  const { personality, customPrompt, aiDials, incognito, analyticsOptOut, voiceDurationMs } = input

  let model = selectGeminiModel(messages, memories)
  if (voiceDurationMs && voiceDurationMs > 0) {
    model = "gemini-2.5-flash" as any
  }
  const initialModel = model

  const buildRequest = (currentModel: string) => buildGeminiRequest(
    messages,
    personality,
    memories,
    currentModel,
    maxOutputTokens,
    undefined,
    customPrompt,
    undefined,
    aiDials,
  )

  const requestBody = buildRequest(model)
  const textStream = await streamChat({ model, requestBody, userId })

  let fullResponse = ""
  const inputTokens = estimateRequestTokens(messages, systemPrompt, memories)
  const encoder = new TextEncoder()
  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = textStream.getReader()
      let firstTokenLogged = false
      const firstTokenTimer = createTimer()
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

          if (value.type === "text") {
            if (!firstTokenLogged) {
              firstTokenLogged = true
              logLatency("chat.latency.first_token", userId, firstTokenTimer(), {
                model,
                fallback: model !== initialModel,
              })
            }
            fullResponse += value.text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: value.text })}\n\n`),
            )
          }
        }
      } catch (streamErr) {
        const classified = classifyChatError(streamErr)
        logError("chat.stream_error", streamErr, userId)
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: classified.message, code: classified.code }) }\n\n`))
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch {}
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
}
