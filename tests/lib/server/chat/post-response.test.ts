import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  logErrorMock,
  logRequestMock,
  waitUntilMock,
  checkBudgetAlertMock,
  incrementDailySpendMock,
  recordAnalyticsUsageMock,
  setCachedResponseMock,
} = vi.hoisted(() => ({
  logErrorMock: vi.fn(),
  logRequestMock: vi.fn(),
  waitUntilMock: vi.fn((promise: Promise<unknown>) => {
    void promise
  }),
  checkBudgetAlertMock: vi.fn(async () => false),
  incrementDailySpendMock: vi.fn(async () => {}),
  recordAnalyticsUsageMock: vi.fn(async () => {}),
  setCachedResponseMock: vi.fn(async () => {}),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
  logRequest: logRequestMock,
}))

vi.mock("@/lib/server/platform/wait-until", () => ({
  waitUntil: waitUntilMock,
}))

vi.mock("@/lib/server/observability/cost-tracker", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/observability/cost-tracker")>("@/lib/server/observability/cost-tracker")
  return {
    ...actual,
    checkBudgetAlert: checkBudgetAlertMock,
    incrementDailySpend: incrementDailySpendMock,
  }
})

vi.mock("@/lib/analytics/event-store", () => ({
  recordAnalyticsUsage: recordAnalyticsUsageMock,
}))

vi.mock("@/lib/server/cache/response-cache", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/cache/response-cache")>("@/lib/server/cache/response-cache")
  return {
    ...actual,
    setCachedResponse: setCachedResponseMock,
  }
})

import { runChatPostResponseTasks } from "@/lib/server/chat/post-response"

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }
}

describe("runChatPostResponseTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("logs completion and schedules analytics, budget, and cache work", async () => {
    const kv = createMockKV()

    runChatPostResponseTasks({
      kv,
      userId: "user_1",
      startTime: Date.now() - 500,
      logEvent: "chat_stream.completed",
      model: "gemini-2.5-flash",
      inputTokens: 120,
      responseText: "Paris is the capital of France.",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Tell me something" },
        { role: "assistant", content: "Sure" },
        { role: "user", content: "What's the capital of France?" },
      ],
      cache: {
        enabled: true,
        message: "What's the capital of France?",
        personality: "assistant",
      },
      toolCalls: 2,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(logRequestMock).toHaveBeenCalledTimes(1)
    expect(logRequestMock.mock.calls[0][0]).toBe("chat_stream.completed")
    expect(incrementDailySpendMock).toHaveBeenCalledTimes(1)
    expect(checkBudgetAlertMock).toHaveBeenCalledTimes(1)
    expect(recordAnalyticsUsageMock).toHaveBeenCalledTimes(1)
    expect(recordAnalyticsUsageMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "chat",
        userId: "user_1",
        metadata: expect.objectContaining({ toolCalls: 2 }),
      }),
    )
    expect(setCachedResponseMock).toHaveBeenCalledTimes(1)
    expect(waitUntilMock).toHaveBeenCalled()
  })

  it("skips analytics work when opted out", async () => {
    const kv = createMockKV()

    runChatPostResponseTasks({
      kv,
      userId: "user_2",
      startTime: Date.now() - 500,
      logEvent: "chat.completed",
      model: "gemini-2.5-flash",
      inputTokens: 100,
      responseText: "Here is your answer.",
      messages: [
        { role: "user", content: "One" },
        { role: "assistant", content: "Two" },
        { role: "user", content: "Three" },
      ],
      analyticsOptOut: true,
      incognito: true,
      cache: {
        enabled: false,
        message: "One",
        personality: "assistant",
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(recordAnalyticsUsageMock).not.toHaveBeenCalled()
    expect(incrementDailySpendMock).toHaveBeenCalledTimes(1)
    expect(checkBudgetAlertMock).toHaveBeenCalledTimes(1)
  })

  it("logs partial task failures without blocking other background work", async () => {
    const kv = createMockKV()
    recordAnalyticsUsageMock.mockRejectedValueOnce(new Error("analytics down"))

    runChatPostResponseTasks({
      kv,
      userId: "user_4",
      startTime: Date.now() - 500,
      logEvent: "chat.completed",
      model: "gemini-2.5-flash",
      inputTokens: 120,
      responseText: "Paris is the capital of France.",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      cache: {
        enabled: true,
        message: "What's the capital of France?",
        personality: "assistant",
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(checkBudgetAlertMock).toHaveBeenCalledTimes(1)
    expect(recordAnalyticsUsageMock).toHaveBeenCalledTimes(1)
    expect(setCachedResponseMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith(
      "chat_post_response.analytics_error",
      expect.any(Error),
      "user_4",
    )
  })
})
