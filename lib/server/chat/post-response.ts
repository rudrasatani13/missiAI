import { estimateTokens } from "@/lib/memory/token-counter"
import { buildCacheKey, isCacheable, setCachedResponse } from "@/lib/server/cache/response-cache"
import { calculateTotalCost, checkBudgetAlert, incrementDailySpend } from "@/lib/server/observability/cost-tracker"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { recordAnalyticsUsage } from "@/lib/analytics/event-store"
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

  if (options.kv) {
    scheduleTimedTask(
      "spend_increment",
      options.userId,
      () => incrementDailySpend(options.kv!, costData.totalCostUsd),
    )
  }

  scheduleTimedTask(
    "budget_alert",
    options.userId,
    () => checkBudgetAlert(options.kv),
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

  // Mood auto-extraction was removed in 2026-05. Auto-derived mental-health
  // signals from chat were a privacy/regulatory liability under India DPDPA
  // and GDPR sensitive-category rules. Any future mood capture must be
  // explicitly opt-in by the user, never default-on.
}
