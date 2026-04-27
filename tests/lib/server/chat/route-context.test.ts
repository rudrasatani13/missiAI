import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"
import type { Message } from "@/types"

const {
  buildSystemPromptMock,
  estimateRequestTokensMock,
  truncateToTokenLimitMock,
  buildCacheKeyMock,
  getCachedResponseMock,
  getEnvMock,
  getLastUserMessageContentMock,
  loadLifeGraphMemoryContextMock,
  loadPluginContextMock,
} = vi.hoisted(() => ({
  buildSystemPromptMock: vi.fn(),
  estimateRequestTokensMock: vi.fn(),
  truncateToTokenLimitMock: vi.fn(),
  buildCacheKeyMock: vi.fn(),
  getCachedResponseMock: vi.fn(),
  getEnvMock: vi.fn(),
  getLastUserMessageContentMock: vi.fn(),
  loadLifeGraphMemoryContextMock: vi.fn(),
  loadPluginContextMock: vi.fn(),
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

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/server/chat/shared", () => ({
  getLastUserMessageContent: getLastUserMessageContentMock,
  loadLifeGraphMemoryContext: loadLifeGraphMemoryContextMock,
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  loadPluginContext: loadPluginContextMock,
}))

import { buildChatRouteContext, prepareChatRouteCacheHit } from "@/lib/server/chat/route-context"

function createMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

describe("buildChatRouteContext", () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    buildSystemPromptMock.mockReturnValue("system prompt")
    estimateRequestTokensMock.mockReturnValue(100)
    truncateToTokenLimitMock.mockImplementation((messages) => messages)
    buildCacheKeyMock.mockReturnValue("cache-key")
    getCachedResponseMock.mockResolvedValue(null)
    getEnvMock.mockReturnValue({
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      NOTION_API_KEY: "test-notion-key",
    })
    getLastUserMessageContentMock.mockReturnValue("last user message")
    loadLifeGraphMemoryContextMock.mockResolvedValue("life-memory")
    loadPluginContextMock.mockResolvedValue("plugin-context")
  })

  it("assembles memory, plugin context, token budgeting, and cache preparation", async () => {
    const truncatedMessages = [{ role: "user", content: "trimmed question" }] as Message[]
    estimateRequestTokensMock.mockReturnValueOnce(1200)
    truncateToTokenLimitMock.mockReturnValueOnce(truncatedMessages)
    getLastUserMessageContentMock.mockReturnValueOnce("trimmed question")

    const result = await buildChatRouteContext({
      userId: "user_1",
      kv,
      input: {
        messages: [{ role: "user", content: "what should I do today?" }],
        personality: "assistant",
        memories: "client-memory",
      },
      vectorizeEnv: null,
    })

    expect(loadLifeGraphMemoryContextMock).toHaveBeenCalledWith(expect.objectContaining({
      kv,
      vectorizeEnv: null,
      userId: "user_1",
      messages: [{ role: "user", content: "what should I do today?" }],
      skip: undefined,
      onError: undefined,
    }))
    expect(loadPluginContextMock).toHaveBeenCalledWith(
      kv,
      "user_1",
      "test-google-client",
      "test-google-secret",
      "test-notion-key",
    )
    expect(result.memories).toBe("life-memory\n\nplugin-context\nclient-memory")
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      "assistant",
      "life-memory\n\nplugin-context\nclient-memory",
      undefined,
      undefined,
    )
    expect(truncateToTokenLimitMock).toHaveBeenCalledWith(
      [{ role: "user", content: "what should I do today?" }],
      1000,
    )
    expect(getLastUserMessageContentMock).toHaveBeenCalledWith(truncatedMessages)
    expect(buildCacheKeyMock).toHaveBeenCalledWith("trimmed question", "assistant")
    expect(result.messages).toBe(truncatedMessages)
    expect(result.systemPrompt).toBe("system prompt")
    expect(result.maxOutputTokens).toBe(600)
    expect(result.userMessageText).toBe("trimmed question")
    expect(result.cacheKey).toBe("cache-key")
  })

  it("skips plugin loading and drops client memories in incognito", async () => {
    loadLifeGraphMemoryContextMock.mockResolvedValueOnce("")

    const result = await buildChatRouteContext({
      userId: "user_2",
      kv,
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
        incognito: true,
        memories: "should-be-dropped",
        maxOutputTokens: 900,
      },
      vectorizeEnv: null,
    })

    expect(loadLifeGraphMemoryContextMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: true,
    }))
    expect(loadPluginContextMock).not.toHaveBeenCalled()
    expect(result.memories).toBe("")
    expect(buildSystemPromptMock).toHaveBeenCalledWith("assistant", "", undefined, undefined)
    expect(result.maxOutputTokens).toBe(900)
  })

  it("parallelizes memory and plugin context fetches", async () => {
    const callOrder: string[] = []

    loadLifeGraphMemoryContextMock.mockImplementation(async () => {
      callOrder.push("memory-start")
      await new Promise((r) => setTimeout(r, 5))
      callOrder.push("memory-end")
      return "life-memory"
    })
    loadPluginContextMock.mockImplementation(async () => {
      callOrder.push("plugin-start")
      await new Promise((r) => setTimeout(r, 5))
      callOrder.push("plugin-end")
      return "plugin-context"
    })

    const result = await buildChatRouteContext({
      userId: "user_3",
      kv,
      input: {
        messages: [{ role: "user", content: "hi" }],
        personality: "assistant",
      },
      vectorizeEnv: null,
    })

    // Both should have started before either finished — proving parallel execution
    const memoryStartIdx = callOrder.indexOf("memory-start")
    const pluginStartIdx = callOrder.indexOf("plugin-start")
    const memoryEndIdx = callOrder.indexOf("memory-end")
    const pluginEndIdx = callOrder.indexOf("plugin-end")

    expect(memoryStartIdx).toBeLessThan(memoryEndIdx)
    expect(pluginStartIdx).toBeLessThan(pluginEndIdx)
    // One started before the other ended (interleaved)
    expect(
      memoryStartIdx < pluginEndIdx && pluginStartIdx < memoryEndIdx,
    ).toBe(true)

    expect(result.memories).toBe("life-memory\n\nplugin-context")
  })

  it("survives plugin context failure and still returns memory context", async () => {
    loadLifeGraphMemoryContextMock.mockResolvedValue("life-memory")
    loadPluginContextMock.mockRejectedValue(new Error("plugin boom"))

    const result = await buildChatRouteContext({
      userId: "user_4",
      kv,
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
        memories: "client-mem",
      },
      vectorizeEnv: null,
    })

    expect(result.memories).toBe("life-memory\nclient-mem")
    expect(buildSystemPromptMock).toHaveBeenCalledWith(
      "assistant",
      "life-memory\nclient-mem",
      undefined,
      undefined,
    )
  })
})

describe("prepareChatRouteCacheHit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an SSE response when a cached value is present", async () => {
    getCachedResponseMock.mockResolvedValueOnce("Cached hello")

    const result = await prepareChatRouteCacheHit("cache-key")

    expect(result).not.toBeNull()
    expect(result?.cacheKey).toBe("cache-key")
    expect(result?.response.headers.get("Content-Type")).toBe("text/event-stream")
    const text = await result?.response.text()
    expect(text).toContain('data: {"text":"Cached hello"}')
    expect(text).toContain("data: [DONE]")
  })

  it("returns null and reports cache lookup failures", async () => {
    const onError = vi.fn()
    getCachedResponseMock.mockRejectedValueOnce(new Error("cache boom"))

    const result = await prepareChatRouteCacheHit("cache-key", onError)

    expect(result).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
