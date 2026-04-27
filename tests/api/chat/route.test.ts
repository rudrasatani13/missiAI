import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import type { KVStore } from "@/types"

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  getChatKVMock,
  getChatVectorizeEnvMock,
  getLastUserMessageContentMock,
  loadLifeGraphMemoryContextMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  rateLimitHeadersMock,
  buildGeminiRequestMock,
  streamChatMock,
  buildSystemPromptMock,
  estimateRequestTokensMock,
  truncateToTokenLimitMock,
  buildCacheKeyMock,
  getCachedResponseMock,
  selectGeminiModelMock,
  logRequestMock,
  logErrorMock,
  logApiErrorMock,
  logLatencyMock,
  createTimerMock,
  getEnvMock,
  getUserPlanMock,
  checkAndIncrementVoiceTimeMock,
  runChatPostResponseTasksMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor() {
      super("Unauthorized")
      this.name = "AuthenticationError"
    }
  }

  return {
    getVerifiedUserIdMock: vi.fn(),
    unauthorizedResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    ),
    getChatKVMock: vi.fn(),
    getChatVectorizeEnvMock: vi.fn(),
    getLastUserMessageContentMock: vi.fn(),
    loadLifeGraphMemoryContextMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: "Rate limited", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    ),
    rateLimitHeadersMock: vi.fn(() => ({ "x-ratelimit-remaining": "59" })),
    buildGeminiRequestMock: vi.fn(),
    streamChatMock: vi.fn(),
    buildSystemPromptMock: vi.fn(),
    estimateRequestTokensMock: vi.fn(),
    truncateToTokenLimitMock: vi.fn(),
    buildCacheKeyMock: vi.fn(),
    getCachedResponseMock: vi.fn(),
    selectGeminiModelMock: vi.fn(),
    logRequestMock: vi.fn(),
    logErrorMock: vi.fn(),
    logApiErrorMock: vi.fn(),
    logLatencyMock: vi.fn(),
    createTimerMock: vi.fn(() => () => 0),
    getEnvMock: vi.fn(),
    getUserPlanMock: vi.fn(),
    checkAndIncrementVoiceTimeMock: vi.fn(),
    runChatPostResponseTasksMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock("@/lib/server/chat/shared", () => ({
  CHAT_REQUEST_MAX_BODY_BYTES: 1024,
  getChatKV: getChatKVMock,
  getChatVectorizeEnv: getChatVectorizeEnvMock,
  getLastUserMessageContent: getLastUserMessageContentMock,
  loadLifeGraphMemoryContext: loadLifeGraphMemoryContextMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
  rateLimitHeaders: rateLimitHeadersMock,
}))

vi.mock("@/lib/ai/providers/gemini-stream", () => ({
  buildGeminiRequest: buildGeminiRequestMock,
}))

vi.mock("@/lib/ai/providers/router", () => ({
  streamChat: streamChatMock,
}))

vi.mock("@/lib/ai/services/ai-service", () => ({
  buildSystemPrompt: buildSystemPromptMock,
}))

vi.mock("@/lib/memory/token-counter", () => ({
  estimateRequestTokens: estimateRequestTokensMock,
  LIMITS: { WARN_THRESHOLD: 1000 },
  truncateToTokenLimit: truncateToTokenLimitMock,
}))

vi.mock("@/lib/server/cache/response-cache", () => ({
  buildCacheKey: buildCacheKeyMock,
  getCachedResponse: getCachedResponseMock,
}))

vi.mock("@/lib/ai/providers/model-router", () => ({
  selectGeminiModel: selectGeminiModelMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: logRequestMock,
  logError: logErrorMock,
  logApiError: logApiErrorMock,
  logLatency: logLatencyMock,
  createTimer: createTimerMock,
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkAndIncrementVoiceTime: checkAndIncrementVoiceTimeMock,
}))

vi.mock("@/lib/server/chat/post-response", () => ({
  runChatPostResponseTasks: runChatPostResponseTasksMock,
}))

import { POST } from "@/app/api/v1/chat/route"

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
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

function makeRequest(
  body: unknown,
  options?: {
    headers?: Record<string, string>
  },
): NextRequest {
  return new NextRequest("http://localhost/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const BASE_BODY = {
  messages: [{ role: "user", content: "hello" }],
  incognito: true,
}

describe("POST /api/v1/chat", () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getChatKVMock.mockReturnValue(kv)
    getChatVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
    getLastUserMessageContentMock.mockReturnValue("hello")
    loadLifeGraphMemoryContextMock.mockResolvedValue("")
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })
    buildGeminiRequestMock.mockReturnValue({ request: true })
    buildSystemPromptMock.mockReturnValue("system prompt")
    estimateRequestTokensMock.mockReturnValue(100)
    truncateToTokenLimitMock.mockImplementation((messages) => messages)
    buildCacheKeyMock.mockReturnValue("cache-key")
    getCachedResponseMock.mockResolvedValue(null)
    selectGeminiModelMock.mockReturnValue("gemini-2.5-pro")
    getEnvMock.mockReturnValue({
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      NOTION_API_KEY: "test-notion-key",
      ENABLE_OPENAI_FALLBACK: false,
    })
    checkAndIncrementVoiceTimeMock.mockResolvedValue({
      allowed: true,
      usedSeconds: 3,
      limitSeconds: 600,
      remainingSeconds: 597,
    })
  })

  it("returns 413 when the request exceeds the payload-size guard", async () => {
    const res = await POST(makeRequest(BASE_BODY, {
      headers: { "content-length": "1025" },
    }))

    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Payload too large (max 5 MB)",
      code: "PAYLOAD_TOO_LARGE",
    })
  })

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(makeRequest("not-json{{{"))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Invalid JSON body",
      code: "VALIDATION_ERROR",
    })
  })

  it("blocks free users when KV is unavailable", async () => {
    getChatKVMock.mockReturnValueOnce(null)
    getUserPlanMock.mockResolvedValueOnce("free")

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Service temporarily unavailable — please try again",
      code: "SERVICE_UNAVAILABLE",
    })
    expect(streamChatMock).not.toHaveBeenCalled()
  })

  it("returns the shared rate-limit response when the user is throttled", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalledTimes(1)
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
    expect(streamChatMock).not.toHaveBeenCalled()
  })

  it("allows pro users to continue when KV is unavailable", async () => {
    getChatKVMock.mockReturnValueOnce(null)
    getUserPlanMock.mockResolvedValueOnce("pro")
    streamChatMock.mockResolvedValueOnce(createTextEventStream(["Hello from pro path."]))

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")
    const text = await res.text()
    expect(text).toContain("Hello from pro path.")
    expect(streamChatMock).toHaveBeenCalledTimes(1)
  })

  it("returns 429 when the daily voice limit is exhausted", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 600,
      limitSeconds: 600,
    })

    const res = await POST(makeRequest({
      ...BASE_BODY,
      voiceMode: false,
      voiceDurationMs: 4000,
    }))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Daily voice limit reached",
      code: "USAGE_LIMIT_EXCEEDED",
      upgrade: "/pricing",
      usedSeconds: 600,
      limitSeconds: 600,
    })
    expect(streamChatMock).not.toHaveBeenCalled()
  })

  it("returns 503 when the voice quota service is unavailable", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 0,
      limitSeconds: 600,
      remainingSeconds: 0,
      unavailable: true,
    })

    const res = await POST(makeRequest({
      ...BASE_BODY,
      voiceMode: false,
      voiceDurationMs: 4000,
    }))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Service temporarily unavailable — please try again",
      code: "SERVICE_UNAVAILABLE",
    })
    expect(streamChatMock).not.toHaveBeenCalled()
  })

  it("returns cached SSE output without calling Gemini when a cache hit is found", async () => {
    getCachedResponseMock.mockResolvedValueOnce("Cached hello")

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")
    const text = await res.text()
    expect(text).toContain('data: {"text":"Cached hello"}')
    expect(text).toContain("data: [DONE]")
    expect(streamChatMock).not.toHaveBeenCalled()
    expect(runChatPostResponseTasksMock).not.toHaveBeenCalled()
  })

  it("streams Gemini text events and schedules post-response tasks on success", async () => {
    streamChatMock.mockResolvedValueOnce(createTextEventStream(["Hello", " there"]))

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")
    expect(res.headers.get("x-ratelimit-remaining")).toBe("59")

    const text = await res.text()
    expect(text).toContain('data: {"text":"Hello"}')
    expect(text).toContain('data: {"text":" there"}')
    expect(text).toContain("data: [DONE]")
    expect(runChatPostResponseTasksMock).toHaveBeenCalledTimes(1)
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      kv,
      userId: "user_123",
      responseText: "Hello there",
      model: "gemini-2.5-pro",
      cache: {
        enabled: true,
        message: "hello",
        personality: "assistant",
      },
    }))
  })

  it("returns 500 when the provider path fails", async () => {
    streamChatMock.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(makeRequest(BASE_BODY))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "boom",
      code: "INTERNAL_ERROR",
    })
    expect(logApiErrorMock).toHaveBeenCalledTimes(1)
  })
})
