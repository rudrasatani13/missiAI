import { buildGeminiRequest } from "@/lib/ai/providers/gemini-stream"
import { streamChat } from "@/lib/ai/providers/router"
import { logError, logLatency, createTimer } from "@/lib/server/observability/logger"
import { classifyChatError } from "@/lib/server/chat/errors"
import { runChatPostResponseTasks } from "@/lib/server/chat/post-response"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { getToolLabel, type AgentToolCall } from "@/lib/ai/agents/tools/dispatcher"
import { executeToolGuarded } from "@/lib/ai/agents/tools/execution"
import { awardXP } from "@/lib/gamification/xp-engine"
import type { AppEnv } from "@/lib/server/platform/env"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { ChatInput } from "@/lib/validation/schemas"
import type { KVStore, Message, PersonalityKey } from "@/types"

const MAX_AGENT_LOOPS = 8
const MAX_TOTAL_TOOL_CALLS = 12
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
  availableDeclarations: Record<string, unknown>[]
  maxOutputTokens: number
  vectorizeEnv: VectorizeEnv | null
  appEnv: AppEnv
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
  availableDeclarations,
  maxOutputTokens,
  vectorizeEnv,
  appEnv,
}: ChatStreamRunnerParams): ReadableStream<Uint8Array> {
  let model = initialModel
  const buildRequest = (currentModel: string) => buildGeminiRequest(
    messages,
    personality,
    memories,
    currentModel,
    maxOutputTokens,
    availableDeclarations,
    customPrompt,
    systemPrompt,
    aiDials,
  )
  let requestBody = buildRequest(model)

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      const sendSSE = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let currentRequestBody = requestBody
      let loopCount = 0
      let totalToolCalls = 0
      let sessionResponseText = ""
      let agentContents: any[] = [...(currentRequestBody.contents as any[])]
      let firstTokenLogged = false
      const firstTokenTimer = createTimer()

      const deadlineController = new AbortController()
      const deadlineTimer = setTimeout(() => deadlineController.abort(), REQUEST_TIMEOUT_MS)

      try {
      while (loopCount < MAX_AGENT_LOOPS && totalToolCalls < MAX_TOTAL_TOOL_CALLS) {
        if (deadlineController.signal.aborted) {
          sendSSE({
            text: "\n\n[Agent loop timed out — returning what I have so far.]",
            code: "CHAT_TOOL_LOOP_TIMEOUT",
          })
          break
        }
        loopCount++

        let eventStream: ReadableStream<any>
        try {
          eventStream = await streamChat({
            model,
            requestBody: currentRequestBody,
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
        let pendingFunctionCall: AgentToolCall | null = null
        let loopText = ""

        try {
          while (true) {
            if (deadlineController.signal.aborted) {
              sendSSE({ text: "\n\n[Response timed out.]", code: "CHAT_TOOL_LOOP_TIMEOUT" })
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
                  loop: loopCount,
                  fallback: model !== initialModel,
                })
              }
              loopText += value.text
              sessionResponseText += value.text
              sendSSE({ text: value.text })
            } else if (value.type === "functionCall") {
              pendingFunctionCall = value.call
            }
          }
        } catch (readErr) {
          const classified = classifyChatError(readErr)
          logError("chat_stream.read_error", classified.message, userId)
          sendSSE({ error: classified.message, code: classified.code })
          break
        }

        if (!pendingFunctionCall) {
          break
        }

        totalToolCalls++
        const toolLabel = getToolLabel(pendingFunctionCall.name)
        const guardedResult = await executeToolGuarded(
          pendingFunctionCall,
          {
            kv,
            vectorizeEnv,
            userId,
            googleClientId: appEnv.GOOGLE_CLIENT_ID,
            googleClientSecret: appEnv.GOOGLE_CLIENT_SECRET,
            resendApiKey: appEnv.RESEND_API_KEY,
          },
          {
            userId,
            logPrefix: "chat_stream",
            executionSurface: "chat_loop",
            blockedLogEvent: "chat_stream.tool_blocked",
            blockedLogMessage: `Blocked destructive tool "${pendingFunctionCall.name}" from agent loop`,
          },
        )
        const toolResult = guardedResult.result

        sendSSE({
          agentStep: {
            toolName: pendingFunctionCall.name,
            status: toolResult.status,
            label: toolLabel,
            summary: toolResult.summary,
          },
        })

        if (kv) {
          waitUntil(awardXP(kv, userId, "agent", 3).catch(() => {}))
        }

        const modelParts: any[] = []
        if (loopText.length > 0) {
          modelParts.push({ text: loopText })
        }
        modelParts.push({
          functionCall: {
            name: pendingFunctionCall.name,
            args: pendingFunctionCall.args,
          },
        })

        const modelEntry = {
          role: "model",
          parts: modelParts,
        }
        const userEntry = {
          role: "user",
          parts: [{
            functionResponse: {
              name: pendingFunctionCall.name,
              response: {
                result: toolResult.output,
              },
            },
          }],
        }
        agentContents.push(modelEntry)
        agentContents.push(userEntry)

        currentRequestBody = {
          ...currentRequestBody,
          contents: agentContents,
        }
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
        toolCalls: totalToolCalls,
      })
    },
  })
}
