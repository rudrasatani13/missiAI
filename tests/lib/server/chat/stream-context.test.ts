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
  getGoogleTokensMock,
  getProfileMock,
  buildExamBuddyModifierMock,
} = vi.hoisted(() => ({
  searchLifeGraphMock: vi.fn(),
  formatLifeGraphForPromptMock: vi.fn(),
  buildSystemPromptMock: vi.fn(),
  buildVoiceSystemPromptMock: vi.fn(),
  estimateRequestTokensMock: vi.fn(),
  truncateToTokenLimitMock: vi.fn(),
  selectGeminiModelMock: vi.fn(),
  getGoogleTokensMock: vi.fn(),
  getProfileMock: vi.fn(),
  buildExamBuddyModifierMock: vi.fn(),
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

vi.mock("@/lib/ai/agents/tools/dispatcher", () => ({
  AGENT_FUNCTION_DECLARATIONS: [
    { name: "searchMemory", description: "search", parameters: {} },
    { name: "readCalendar", description: "read", parameters: {} },
    { name: "deleteCalendarEvent", description: "delete", parameters: {} },
  ],
}))

vi.mock("@/lib/ai/agents/tools/policy", () => ({
  AGENT_DESTRUCTIVE_TOOL_NAMES: new Set(["deleteCalendarEvent"]),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: getGoogleTokensMock,
}))

vi.mock("@/lib/exam-buddy/profile-store", () => ({
  getProfile: getProfileMock,
}))

vi.mock("@/lib/exam-buddy/exam-prompt", () => ({
  buildExamBuddyModifier: buildExamBuddyModifierMock,
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
    getGoogleTokensMock.mockResolvedValue(null)
    getProfileMock.mockResolvedValue(null)
    buildExamBuddyModifierMock.mockReturnValue("exam-modifier")
  })

  it("assembles memories, prompt modifiers, token budgeting, and tool availability for voice mode", async () => {
    const truncatedMessages = [{ role: "user", content: "trimmed question" }] as const

    formatLifeGraphForPromptMock.mockReturnValue("life-memory")
    getProfileMock.mockResolvedValue({ board: "cbse" })
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
        examBuddy: {
          examTarget: "jee_mains",
          subject: "physics",
          topic: "waves",
        },
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
    expect(buildExamBuddyModifierMock).toHaveBeenCalledWith(
      { board: "cbse" },
      {
        examTarget: "jee_mains",
        mode: "doubt",
        currentSubject: "physics",
        currentTopic: "waves",
      },
    )
    expect(result.systemPrompt).toContain("voice-prompt")
    expect(result.systemPrompt).toContain("EDITH MODE — VOICE-FIRST AUTONOMOUS AGENT")
    expect(result.systemPrompt).toContain("exam-modifier")
    expect(truncateToTokenLimitMock).toHaveBeenCalledWith(
      [{ role: "user", content: "what should I study next?" }],
      1000,
    )
    expect(result.messages).toBe(truncatedMessages)
    expect(result.inputTokens).toBe(700)
    expect(result.maxOutputTokens).toBe(800)
    expect(selectGeminiModelMock).toHaveBeenCalledWith(truncatedMessages, "life-memory\nclient-memory")
    expect(result.model).toBe("gemini-2.5-pro")
    expect(result.availableDeclarations.map((declaration) => declaration.name)).toEqual(["searchMemory"])
  })

  it("skips memory loading in incognito while preserving connected calendar tools", async () => {
    getGoogleTokensMock.mockResolvedValue({ accessToken: "token" })
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
    expect(result.availableDeclarations.map((declaration) => declaration.name)).toEqual([
      "searchMemory",
      "readCalendar",
    ])
  })

  it("parallelizes independent context fetches and resolves the fastest combined path", async () => {
    let memoryResolved = false
    let googleResolved = false
    let profileResolved = false

    searchLifeGraphMock.mockImplementation(async () => {
      memoryResolved = true
      return [{ id: "node-1" }]
    })
    getGoogleTokensMock.mockImplementation(async () => {
      googleResolved = true
      return { accessToken: "tok" }
    })
    getProfileMock.mockImplementation(async () => {
      profileResolved = true
      return { board: "cbse" }
    })

    const result = await buildChatStreamContext({
      userId: "user_3",
      kv,
      input: {
        messages: [{ role: "user", content: "hi" }],
        personality: "assistant",
        examBuddy: { examTarget: "jee_mains", subject: "physics", topic: "waves" },
      },
      vectorizeEnv: null,
    })

    expect(memoryResolved).toBe(true)
    expect(googleResolved).toBe(true)
    expect(profileResolved).toBe(true)
    expect(result.availableDeclarations.map((d) => d.name)).toContain("readCalendar")
  })

  it("survives a partial fetch failure and still assembles usable context", async () => {
    formatLifeGraphForPromptMock.mockReturnValue("life-memory")
    getProfileMock.mockRejectedValue(new Error("profile boom"))
    getGoogleTokensMock.mockResolvedValue({ accessToken: "tok" })
    searchLifeGraphMock.mockResolvedValue([{ id: "m1" }])

    const result = await buildChatStreamContext({
      userId: "user_4",
      kv,
      input: {
        messages: [{ role: "user", content: "hello" }],
        personality: "assistant",
        examBuddy: { examTarget: "jee_mains" },
      },
      vectorizeEnv: null,
    })

    expect(result.memories).toContain("life-memory")
    expect(result.availableDeclarations.map((d) => d.name)).toContain("readCalendar")
    expect(result.systemPrompt).toBe("base-prompt\n\nexam-modifier")
  })
})
