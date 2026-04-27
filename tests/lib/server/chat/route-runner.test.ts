import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  buildGeminiRequestMock,
  streamChatMock,
  estimateRequestTokensMock,
  selectGeminiModelMock,
  rateLimitHeadersMock,
  runChatPostResponseTasksMock,
  logErrorMock,
  logLatencyMock,
  createTimerMock,
} = vi.hoisted(() => ({
  buildGeminiRequestMock: vi.fn(),
  streamChatMock: vi.fn(),
  estimateRequestTokensMock: vi.fn(),
  selectGeminiModelMock: vi.fn(),
  rateLimitHeadersMock: vi.fn(() => ({ "x-ratelimit-remaining": "59" })),
  runChatPostResponseTasksMock: vi.fn(),
  logErrorMock: vi.fn(),
  logLatencyMock: vi.fn(),
  createTimerMock: vi.fn(() => () => 0),
}))

vi.mock("@/lib/ai/providers/gemini-stream", () => ({
  buildGeminiRequest: buildGeminiRequestMock,
}))

vi.mock("@/lib/ai/providers/router", () => ({
  streamChat: streamChatMock,
}))

vi.mock("@/lib/memory/token-counter", () => ({
  estimateRequestTokens: estimateRequestTokensMock,
}))

vi.mock("@/lib/ai/providers/model-router", () => ({
  selectGeminiModel: selectGeminiModelMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock("@/lib/server/chat/post-response", () => ({
  runChatPostResponseTasks: runChatPostResponseTasksMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
  logLatency: logLatencyMock,
  createTimer: createTimerMock,
}))

import { buildChatRouteSseResponse } from "@/lib/server/chat/route-runner"

function createMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function createTextEventStream(texts: string[]): ReadableStream<{ type: "text"; text: string }> {
  return new ReadableStream({
    start(controller) {
      for (const text of texts) {
        controller.enqueue({ type: "text", text })
      }
      controller.close()
    },
  })
}

function createFailingEventStream(): ReadableStream<{ type: "text"; text: string }> {
  let emitted = false

  return new ReadableStream({
    pull(controller) {
      if (!emitted) {
        emitted = true
        controller.enqueue({ type: "text", text: "Partial" })
        return
      }

      throw new Error("stream boom")
    },
  })
}

describe("buildChatRouteSseResponse", () => {
  let kv: KVStore
  let baseRequestBody: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()
    baseRequestBody = {
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    }

    buildGeminiRequestMock.mockReturnValue(baseRequestBody)
    estimateRequestTokensMock.mockReturnValue(222)
    selectGeminiModelMock.mockReturnValue("gemini-2.5-pro")
  })

  it("streams Gemini text deltas and schedules post-response tasks", async () => {
    streamChatMock.mockResolvedValueOnce(createTextEventStream(["Hello", " there"]))

    const res = await buildChatRouteSseResponse({
      kv,
      userId: "user_1",
      startTime: 100,
      rateResult: {
        allowed: true,
        remaining: 59,
        limit: 60,
        resetAt: 123456,
        retryAfter: 60,
      },
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
        incognito: true,
      },
      messages: [{ role: "user", content: "hello" }],
      memories: "memory",
      systemPrompt: "system prompt",
      maxOutputTokens: 600,
      userMessageText: "hello",
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")
    expect(res.headers.get("x-ratelimit-remaining")).toBe("59")
    const text = await res.text()
    expect(text).toContain('data: {"text":"Hello"}')
    expect(text).toContain('data: {"text":" there"}')
    expect(text).toContain("data: [DONE]")
    expect(selectGeminiModelMock).toHaveBeenCalledWith([{ role: "user", content: "hello" }], "memory")
    expect(buildGeminiRequestMock).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }],
      "assistant",
      "memory",
      "gemini-2.5-pro",
      600,
      undefined,
      undefined,
      undefined,
      undefined,
    )
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      kv,
      userId: "user_1",
      model: "gemini-2.5-pro",
      inputTokens: 222,
      responseText: "Hello there",
      cache: {
        enabled: true,
        message: "hello",
        personality: "assistant",
      },
    }))
  })

  it("forces the flash model for voice requests", async () => {
    streamChatMock.mockResolvedValueOnce(createTextEventStream(["Voice reply"]))

    const res = await buildChatRouteSseResponse({
      kv: null,
      userId: "user_2",
      startTime: 200,
      rateResult: {
        allowed: true,
        remaining: 59,
        limit: 60,
        resetAt: 123456,
        retryAfter: 60,
      },
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
        voiceDurationMs: 4000,
      },
      messages: [{ role: "user", content: "hello" }],
      memories: "",
      systemPrompt: "system prompt",
      maxOutputTokens: 600,
      userMessageText: "hello",
    })

    await res.text()

    expect(buildGeminiRequestMock).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }],
      "assistant",
      "",
      "gemini-2.5-flash",
      600,
      undefined,
      undefined,
      undefined,
      undefined,
    )
    expect(streamChatMock).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-2.5-flash",
      requestBody: baseRequestBody,
    }))
  })

  it("propagates streamChat errors since provider-router handles fallback internally", async () => {
    const primaryError = new Error("Gemini API error 503: overloaded")
    streamChatMock.mockRejectedValueOnce(primaryError)

    await expect(
      buildChatRouteSseResponse({
        kv: null,
        userId: "user_3",
        startTime: 300,
        rateResult: {
          allowed: true,
          remaining: 59,
          limit: 60,
          resetAt: 123456,
          retryAfter: 60,
        },
        input: {
          messages: [{ role: "user", content: "hello" }],
          personality: "assistant",
        },
        messages: [{ role: "user", content: "hello" }],
        memories: "memory",
        systemPrompt: "system prompt",
        maxOutputTokens: 700,
        userMessageText: "hello",
      })
    ).rejects.toThrow("503")

    expect(buildGeminiRequestMock).toHaveBeenCalledTimes(1)
    expect(runChatPostResponseTasksMock).not.toHaveBeenCalled()
  })

  it("logs stream errors, emits DONE, and skips post-response tasks", async () => {
    streamChatMock.mockResolvedValueOnce(createFailingEventStream())

    const res = await buildChatRouteSseResponse({
      kv,
      userId: "user_4",
      startTime: 400,
      rateResult: {
        allowed: true,
        remaining: 59,
        limit: 60,
        resetAt: 123456,
        retryAfter: 60,
      },
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
      },
      messages: [{ role: "user", content: "hello" }],
      memories: "",
      systemPrompt: "system prompt",
      maxOutputTokens: 600,
      userMessageText: "hello",
    })

    const text = await res.text()

    expect(text).toContain('data: {"text":"Partial"}')
    expect(text).toContain("data: [DONE]")
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith("chat.stream_error", expect.any(Error), "user_4")
    expect(runChatPostResponseTasksMock).not.toHaveBeenCalled()
  })
})
