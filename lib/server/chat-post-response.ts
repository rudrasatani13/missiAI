import { estimateTokens } from "@/lib/memory/token-counter"
import { buildCacheKey, isCacheable, setCachedResponse } from "@/lib/server/response-cache"
import { calculateTotalCost, checkBudgetAlert } from "@/lib/server/cost-tracker"
import { waitUntil } from "@/lib/server/wait-until"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { analyzeMoodFromConversation } from "@/lib/mood/mood-analyzer"
import { addMoodEntry } from "@/lib/mood/mood-store"
import { logRequest } from "@/lib/server/logger"
import type { KVStore } from "@/types"

interface ChatPostResponseMessage {
  role: "user" | "assistant"
  content: string
}

interface ChatPostResponseOptions {
  kv: KVStore | null
  userId: string
  startTime: number
  logEvent: string
  model: string
  inputTokens: number
  responseText: string
  messages: ChatPostResponseMessage[]
  incognito?: boolean
  analyticsOptOut?: boolean
  toolCalls?: number
  cache?: {
    enabled: boolean
    message: string
    personality: string
  }
}

export function runChatPostResponseTasks(options: ChatPostResponseOptions): void {
  const outputTokens = estimateTokens(options.responseText)
  const costData = calculateTotalCost(options.model, options.inputTokens, outputTokens, 0)

  logRequest(options.logEvent, options.userId, options.startTime, {
    model: costData.model,
    inputTokens: costData.inputTokens,
    outputTokens: costData.outputTokens,
    costUsd: costData.costUsd,
    ttsChars: costData.ttsChars,
    ttsCostUsd: costData.ttsCostUsd,
    totalCostUsd: costData.totalCostUsd,
    ...(options.toolCalls !== undefined ? { toolCalls: options.toolCalls } : {}),
  })

  waitUntil(checkBudgetAlert(options.kv, costData.totalCostUsd).catch(() => {}))

  if (options.kv && !options.analyticsOptOut) {
    waitUntil(
      recordEvent(options.kv, {
        type: "chat",
        userId: options.userId,
        costUsd: costData.totalCostUsd,
        metadata: {
          model: costData.model,
          tokensIn: costData.inputTokens,
          tokensOut: costData.outputTokens,
          ...(options.toolCalls !== undefined ? { toolCalls: options.toolCalls } : {}),
        },
      }).catch(() => {}),
    )
    waitUntil(recordUserSeen(options.kv, options.userId, getTodayDate()).catch(() => {}))
  }

  if (options.cache?.enabled) {
    const cacheKey = buildCacheKey(options.cache.message, options.cache.personality)
    if (cacheKey && isCacheable(options.cache.message, options.responseText)) {
      waitUntil(setCachedResponse(cacheKey, options.responseText).catch(() => {}))
    }
  }

  const userMessages = options.messages.filter((message) => message.role === "user")
  if (options.kv && !options.incognito && userMessages.length >= 3) {
    const moodTranscript = options.messages
      .map((message) => (message.role === "user" ? `User: ${message.content}` : `Missi: ${message.content}`))
      .join("\n")
    const today = new Date().toISOString().slice(0, 10)
    const sessionId = crypto.randomUUID().slice(0, 8)
    waitUntil(
      analyzeMoodFromConversation(moodTranscript, today, sessionId)
        .then((entry) => addMoodEntry(options.kv!, options.userId, entry))
        .catch(() => {}),
    )
  }
}
