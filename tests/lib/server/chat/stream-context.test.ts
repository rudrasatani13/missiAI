import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  searchLifeGraphMock,
  formatLifeGraphForPromptMock,
  buildSystemPromptMock,
  buildVoiceSystemPromptMock,
  estimateRequestTokensMock,
  truncateToTokenLimitMock,
  selectGeminiModelMock,
} = vi.hoisted(() => ({
  searchLifeGraphMock: vi.fn(),
  formatLifeGraphForPromptMock: vi.fn(),
  buildSystemPromptMock: vi.fn(),
  buildVoiceSystemPromptMock: vi.fn(),
  estimateRequestTokensMock: vi.fn(),
  truncateToTokenLimitMock: vi.fn(),
  selectGeminiModelMock: vi.fn(),
}))

vi.mock("@/lib/memory/life-graph", () => ({
  searchLifeGraph: searchLifeGraphMock,
  formatLifeGraphForPrompt: formatLifeGraphForPromptMock,
  MEMORY_TIMEOUT_MS: 5000,
}))

vi.mock("@/lib/ai/services/ai-service", () => ({
  buildSystemPrompt: buildSystemPromptMock,
  buildVoiceSystemPrompt: buildVoiceSystemPromptMock,
}))

vi.mock("@/lib/memory/token-counter", () => ({
  estimateRequestTokens: estimateRequestTokensMock,
  LIMITS: { WARN_THRESHOLD: 1000 },
  truncateToTokenLimit: truncateToTokenLimitMock,
}))

vi.mock("@/lib/ai/providers/model-router", () => ({
  selectGeminiModel: selectGeminiModelMock,
}))

import { buildChatStreamContext } from "@/lib/server/chat/stream-context"

function createMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

describe("buildChatStreamContext", () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    searchLifeGraphMock.mockResolvedValue([])
    formatLifeGraphForPromptMock.mockReturnValue("")
    buildSystemPromptMock.mockReturnValue("base-prompt")
    buildVoiceSystemPromptMock.mockReturnValue("voice-prompt")
    estimateRequestTokensMock.mockReset()
    truncateToTokenLimitMock.mockImplementation((messages) => messages)
    selectGeminiModelMock.mockReturnValue("gemini-2.5-pro")
  })

  it("assembles memories, voice prompt modifier, and token budgeting for voice mode", async () => {
    const truncatedMessages = [{ role: "user", content: "trimmed question" }] as const

    formatLifeGraphForPromptMock.mockReturnValue("life-memory")
    estimateRequestTokensMock
      .mockReturnValueOnce(1200)
      .mockReturnValueOnce(700)
    truncateToTokenLimitMock.mockReturnValue(truncatedMessages)

    const result = await buildChatStreamContext({
      userId: "user_1",
      kv,
      input: {
        messages: [{ role: "user", content: "what should I study next?" }],
        personality: "assistant",
        voiceMode: true,
        voiceDurationMs: 3000,
        memories: "client-memory",
      },
      vectorizeEnv: null,
    })

    expect(searchLifeGraphMock).toHaveBeenCalledWith(
      kv,
      null,
      "user_1",
      "what should I study next?",
      { topK: 5 },
    )
    expect(result.memories).toBe("life-memory\nclient-memory")
    expect(buildVoiceSystemPromptMock).toHaveBeenCalledWith(
      "assistant",
      "life-memory\nclient-memory",
      undefined,
      undefined,
    )
    expect(result.systemPrompt).toContain("voice-prompt")
    expect(truncateToTokenLimitMock).toHaveBeenCalledWith(
      [{ role: "user", content: "what should I study next?" }],
      1000,
    )
    expect(result.messages).toBe(truncatedMessages)
    expect(result.inputTokens).toBe(700)
    expect(result.maxOutputTokens).toBe(800)
    expect(selectGeminiModelMock).toHaveBeenCalledWith(truncatedMessages, "life-memory\nclient-memory")
    expect(result.model).toBe("gemini-2.5-pro")
  })

  it("skips memory loading in incognito", async () => {
    estimateRequestTokensMock
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(180)
    selectGeminiModelMock.mockReturnValue("gemini-2.5-flash")

    const result = await buildChatStreamContext({
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

    expect(searchLifeGraphMock).not.toHaveBeenCalled()
    expect(result.memories).toBe("")
    expect(buildSystemPromptMock).toHaveBeenCalledWith("assistant", "", undefined, undefined)
    expect(result.systemPrompt).toBe("base-prompt")
    expect(result.maxOutputTokens).toBe(900)
    expect(result.inputTokens).toBe(180)
    expect(result.model).toBe("gemini-2.5-flash")
  })

  it("parallelizes independent context fetches and resolves the fastest combined path", async () => {
    let memoryResolved = false

    searchLifeGraphMock.mockImplementation(async () => {
      memoryResolved = true
      return [{ id: "node-1" }]
    })
    const result = await buildChatStreamContext({
      userId: "user_3",
      kv,
      input: {
        messages: [{ role: "user", content: "hi" }],
        personality: "assistant",
      },
      vectorizeEnv: null,
    })

    expect(memoryResolved).toBe(true)
    expect(result.model).toBe("gemini-2.5-pro")
  })

  it("survives a partial fetch failure and still assembles usable context", async () => {
    formatLifeGraphForPromptMock.mockReturnValue("life-memory")
    searchLifeGraphMock.mockResolvedValue([{ id: "m1" }])

    const result = await buildChatStreamContext({
      userId: "user_4",
      kv,
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
      },
      vectorizeEnv: null,
    })

    expect(result.memories).toContain("life-memory")
    expect(result.systemPrompt).toBe("base-prompt")
  })
})
