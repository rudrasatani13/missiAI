import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  logRequestMock,
  waitUntilMock,
  checkBudgetAlertMock,
  recordEventMock,
  recordUserSeenMock,
  setCachedResponseMock,
  addMoodEntryMock,
  analyzeMoodFromConversationMock,
} = vi.hoisted(() => ({
  logRequestMock: vi.fn(),
  waitUntilMock: vi.fn((promise: Promise<unknown>) => {
    void promise
  }),
  checkBudgetAlertMock: vi.fn(async () => false),
  recordEventMock: vi.fn(async () => {}),
  recordUserSeenMock: vi.fn(async () => {}),
  setCachedResponseMock: vi.fn(async () => {}),
  addMoodEntryMock: vi.fn(async () => {}),
  analyzeMoodFromConversationMock: vi.fn(async () => ({
    date: "2026-04-23",
    score: 7,
    label: "calm",
    trigger: "shipping fixes",
    recordedAt: Date.now(),
  })),
}))

vi.mock("@/lib/server/logger", () => ({
  logRequest: logRequestMock,
}))

vi.mock("@/lib/server/wait-until", () => ({
  waitUntil: waitUntilMock,
}))

vi.mock("@/lib/server/cost-tracker", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/cost-tracker")>("@/lib/server/cost-tracker")
  return {
    ...actual,
    checkBudgetAlert: checkBudgetAlertMock,
  }
})

vi.mock("@/lib/analytics/event-store", () => ({
  recordEvent: recordEventMock,
  recordUserSeen: recordUserSeenMock,
}))

vi.mock("@/lib/server/response-cache", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/response-cache")>("@/lib/server/response-cache")
  return {
    ...actual,
    setCachedResponse: setCachedResponseMock,
  }
})

vi.mock("@/lib/mood/mood-analyzer", () => ({
  analyzeMoodFromConversation: analyzeMoodFromConversationMock,
}))

vi.mock("@/lib/mood/mood-store", () => ({
  addMoodEntry: addMoodEntryMock,
}))

import { runChatPostResponseTasks } from "@/lib/server/chat-post-response"

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

  it("logs completion and schedules analytics, budget, cache, and mood work", async () => {
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
    expect(checkBudgetAlertMock).toHaveBeenCalledTimes(1)
    expect(recordEventMock).toHaveBeenCalledTimes(1)
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "chat",
        userId: "user_1",
        metadata: expect.objectContaining({ toolCalls: 2 }),
      }),
    )
    expect(recordUserSeenMock).toHaveBeenCalledTimes(1)
    expect(setCachedResponseMock).toHaveBeenCalledTimes(1)
    expect(analyzeMoodFromConversationMock).toHaveBeenCalledTimes(1)
    expect(addMoodEntryMock).toHaveBeenCalledTimes(1)
    expect(waitUntilMock).toHaveBeenCalled()
  })

  it("skips analytics and mood work when opted out or incognito", async () => {
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

    expect(recordEventMock).not.toHaveBeenCalled()
    expect(recordUserSeenMock).not.toHaveBeenCalled()
    expect(analyzeMoodFromConversationMock).not.toHaveBeenCalled()
    expect(addMoodEntryMock).not.toHaveBeenCalled()
    expect(checkBudgetAlertMock).toHaveBeenCalledTimes(1)
  })
})
