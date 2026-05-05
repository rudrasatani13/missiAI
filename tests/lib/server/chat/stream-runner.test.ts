import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  buildGeminiRequestMock,
  streamChatMock,
  logErrorMock,
  logLatencyMock,
  createTimerMock,
  runChatPostResponseTasksMock,
} = vi.hoisted(() => ({
  buildGeminiRequestMock: vi.fn(),
  streamChatMock: vi.fn(),
  logErrorMock: vi.fn(),
  logLatencyMock: vi.fn(),
  createTimerMock: vi.fn(() => () => 0),
  runChatPostResponseTasksMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/gemini-stream", () => ({
  buildGeminiRequest: buildGeminiRequestMock,
}))

vi.mock("@/lib/ai/providers/router", () => ({
  streamChat: streamChatMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
  logLatency: logLatencyMock,
  createTimer: createTimerMock,
}))

vi.mock("@/lib/server/chat/post-response", () => ({
  runChatPostResponseTasks: runChatPostResponseTasksMock,
}))

import { buildChatStreamSseStream } from "@/lib/server/chat/stream-runner"

function createMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function createGeminiEventStream(events: Array<{ type: string; [key: string]: unknown }>): ReadableStream<any> {
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event)
      }
      controller.close()
    },
  })
}

async function readSseEvents(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, unknown>>> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let raw = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()

  return raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, "")) as Record<string, unknown>)
}

describe("buildChatStreamSseStream", () => {
  let kv: KVStore
  let baseRequestBody: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()
    baseRequestBody = {
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    }

    buildGeminiRequestMock.mockReturnValue(baseRequestBody)
  })

  it("streams text, emits needsInput for voice follow-up questions, and runs post-response tasks", async () => {
    streamChatMock.mockResolvedValueOnce(
      createGeminiEventStream([{ type: "text", text: "What should I do next?" }]),
    )

    const events = await readSseEvents(buildChatStreamSseStream({
      kv,
      userId: "user_1",
      startTime: 100,
      inputTokens: 222,
      messages: [{ role: "user", content: "hello" }],
      personality: "assistant",
      voiceMode: true,
      memories: "",
      systemPrompt: "system",
      model: "gemini-2.5-pro",
      maxOutputTokens: 600,
    }))

    expect(events).toEqual([
      { text: "What should I do next?" },
      { needsInput: true },
      { done: true },
    ])
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      model: "gemini-2.5-pro",
      inputTokens: 222,
      responseText: "What should I do next?",
    }))
  })

  it("completes successfully when streamChat resolves (provider handles fallback internally)", async () => {
    streamChatMock.mockResolvedValueOnce(
      createGeminiEventStream([{ type: "text", text: "Recovered answer" }]),
    )

    const events = await readSseEvents(buildChatStreamSseStream({
      kv: null,
      userId: "user_3",
      startTime: 300,
      inputTokens: 444,
      messages: [{ role: "user", content: "hello" }],
      personality: "assistant",
      memories: "memory",
      systemPrompt: "system",
      model: "gemini-2.5-pro",
      maxOutputTokens: 700,
    }))

    expect(events).toEqual([
      { text: "Recovered answer" },
      { done: true },
    ])
    expect(buildGeminiRequestMock).toHaveBeenCalledTimes(1)
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_3",
      model: "gemini-2.5-pro",
      responseText: "Recovered answer",
    }))
  })
})
