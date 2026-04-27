import { estimateTokens } from "@/lib/memory/token-counter"
import { buildCacheKey, isCacheable, setCachedResponse } from "@/lib/server/cache/response-cache"
import { calculateTotalCost, checkBudgetAlert } from "@/lib/server/observability/cost-tracker"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { recordAnalyticsUsage } from "@/lib/analytics/event-store"
import { analyzeMoodFromConversation } from "@/lib/mood/mood-analyzer"
import { addMoodEntry } from "@/lib/mood/mood-store"
import { logError, logRequest } from "@/lib/server/observability/logger"
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

const POST_RESPONSE_TASK_TIMEOUT_MS = 5_000
const MOOD_ANALYSIS_TIMEOUT_MS = 3_000

function scheduleTimedTask(
  taskName: string,
  userId: string,
  task: (hasTimedOut: () => boolean) => Promise<unknown>,
  timeoutMs = POST_RESPONSE_TASK_TIMEOUT_MS,
): void {
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const taskPromise = Promise.resolve()
    .then(() => task(() => timedOut))
    .catch((err) => {
      logError(`chat_post_response.${taskName}_error`, err, userId)
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })

  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      logError(
        `chat_post_response.${taskName}_timeout`,
        `${taskName} timed out after ${timeoutMs}ms`,
        userId,
      )
      resolve()
    }, timeoutMs)
  })

  waitUntil(Promise.race([taskPromise.then(() => {}), timeoutPromise]).catch(() => {}))
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

  scheduleTimedTask(
    "budget_alert",
    options.userId,
    () => checkBudgetAlert(options.kv, costData.totalCostUsd),
  )

  if (options.kv && !options.analyticsOptOut) {
    scheduleTimedTask(
      "analytics",
      options.userId,
      () => recordAnalyticsUsage(options.kv!, {
        type: "chat",
        userId: options.userId,
        costUsd: costData.totalCostUsd,
        metadata: {
          model: costData.model,
          tokensIn: costData.inputTokens,
          tokensOut: costData.outputTokens,
          ...(options.toolCalls !== undefined ? { toolCalls: options.toolCalls } : {}),
        },
      }),
    )
  }

  if (options.cache?.enabled) {
    const cacheKey = buildCacheKey(options.cache.message, options.cache.personality)
    if (cacheKey && isCacheable(options.cache.message, options.responseText)) {
      scheduleTimedTask(
        "cache_write",
        options.userId,
        () => setCachedResponse(cacheKey, options.responseText),
      )
    }
  }

  const userMessages = options.messages.filter((message) => message.role === "user")
  if (options.kv && !options.incognito && userMessages.length >= 3) {
    const moodTranscript = options.messages
      .map((message) => (message.role === "user" ? `User: ${message.content}` : `Missi: ${message.content}`))
      .join("\n")
    const today = new Date().toISOString().slice(0, 10)
    const sessionId = crypto.randomUUID().slice(0, 8)
    scheduleTimedTask(
      "mood_analysis",
      options.userId,
      async (hasTimedOut) => {
        const entry = await analyzeMoodFromConversation(moodTranscript, today, sessionId)
        if (hasTimedOut()) return
        await addMoodEntry(options.kv!, options.userId, entry)
      },
      MOOD_ANALYSIS_TIMEOUT_MS,
    )
  }
}
