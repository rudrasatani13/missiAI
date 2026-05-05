import { buildGeminiRequest } from "@/lib/ai/providers/gemini-stream"
import { streamChat } from "@/lib/ai/providers/router"
import { logError, logLatency, createTimer } from "@/lib/server/observability/logger"
import { classifyChatError } from "@/lib/server/chat/errors"
import { runChatPostResponseTasks } from "@/lib/server/chat/post-response"
import type { ChatInput } from "@/lib/validation/schemas"
import type { KVStore, Message, PersonalityKey } from "@/types"

const REQUEST_TIMEOUT_MS = 45_000
const NEEDS_INPUT_PATTERN = /\b(kya|kise|kisko|kab|kahan|kaun|kitna|konsa|which|what|who|where|when|how)\b/i

export interface ChatStreamRunnerParams {
  kv: KVStore | null
  userId: string
  startTime: number
  inputTokens: number
  messages: Message[]
  personality: PersonalityKey
  voiceMode?: boolean
  customPrompt?: string
  aiDials?: ChatInput["aiDials"]
  incognito?: boolean
  analyticsOptOut?: boolean
  memories: string
  systemPrompt: string
  model: string
  maxOutputTokens: number
}

function shouldEmitNeedsInput(voiceMode: boolean | undefined, responseText: string): boolean {
  if (!voiceMode || !responseText.trim()) {
    return false
  }

  const trimmed = responseText.trim()
  return trimmed.endsWith("?") || NEEDS_INPUT_PATTERN.test(trimmed.slice(-200))
}

export function buildChatStreamSseStream({
  kv,
  userId,
  startTime,
  inputTokens,
  messages,
  personality,
  voiceMode,
  customPrompt,
  aiDials,
  incognito,
  analyticsOptOut,
  memories,
  systemPrompt,
  model: initialModel,
  maxOutputTokens,
}: ChatStreamRunnerParams): ReadableStream<Uint8Array> {
  const model = initialModel
  const requestBody = buildGeminiRequest(
    messages,
    personality,
    memories,
    model,
    maxOutputTokens,
    customPrompt,
    systemPrompt,
    aiDials,
  )

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      const sendSSE = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let sessionResponseText = ""
      let firstTokenLogged = false
      const firstTokenTimer = createTimer()

      const deadlineController = new AbortController()
      const deadlineTimer = setTimeout(() => deadlineController.abort(), REQUEST_TIMEOUT_MS)

      try {
        if (deadlineController.signal.aborted) {
          sendSSE({
            text: "\n\n[Response timed out — returning what I have so far.]",
            code: "CHAT_RESPONSE_TIMEOUT",
          })
          return
        }

        let eventStream: ReadableStream<any>
        try {
          eventStream = await streamChat({
            model,
            requestBody,
            signal: deadlineController.signal,
            userId,
          })
        } catch (streamErr) {
          const classified = classifyChatError(streamErr)
          logError("chat_stream.provider_error", classified.message, userId)
          sendSSE({ error: classified.message, code: classified.code, done: true })
          controller.close()
          return
        }

        const reader = eventStream.getReader()

        try {
          while (true) {
            if (deadlineController.signal.aborted) {
              sendSSE({ text: "\n\n[Response timed out.]", code: "CHAT_RESPONSE_TIMEOUT" })
              reader.cancel().catch(() => {})
              break
            }

            const { done, value } = await reader.read()
            if (done) break

            if (value.type === "text") {
              if (!firstTokenLogged) {
                firstTokenLogged = true
                logLatency("chat.latency.first_token", userId, firstTokenTimer(), {
                  model,
                  fallback: model !== initialModel,
                })
              }
              sessionResponseText += value.text
              sendSSE({ text: value.text })
            }
          }
        } catch (readErr) {
          const classified = classifyChatError(readErr)
          logError("chat_stream.read_error", classified.message, userId)
          sendSSE({ error: classified.message, code: classified.code })
          return
        }
      } finally {
        clearTimeout(deadlineTimer)
      }

      if (shouldEmitNeedsInput(voiceMode, sessionResponseText)) {
        sendSSE({ needsInput: true })
      }

      sendSSE({ done: true })
      controller.close()

      runChatPostResponseTasks({
        kv,
        userId,
        startTime,
        logEvent: "chat_stream.completed",
        model,
        inputTokens,
        responseText: sessionResponseText,
        messages,
        incognito,
        analyticsOptOut,
      })
    },
  })
}
