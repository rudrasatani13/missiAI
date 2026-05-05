import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  buildGeminiRequestMock,
  streamChatMock,
  logErrorMock,
  logLatencyMock,
  createTimerMock,
  runChatPostResponseTasksMock,
  executeAgentToolMock,
  getToolLabelMock,
  classifyAgentToolMock,
} = vi.hoisted(() => ({
  buildGeminiRequestMock: vi.fn(),
  streamChatMock: vi.fn(),
  logErrorMock: vi.fn(),
  logLatencyMock: vi.fn(),
  createTimerMock: vi.fn(() => () => 0),
  runChatPostResponseTasksMock: vi.fn(),
  executeAgentToolMock: vi.fn(),
  getToolLabelMock: vi.fn(),
  classifyAgentToolMock: vi.fn(),
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

vi.mock("@/lib/ai/agents/tools/dispatcher", () => ({
  executeAgentTool: executeAgentToolMock,
  getToolLabel: getToolLabelMock,
}))

vi.mock("@/lib/ai/agents/tools/policy", () => ({
  classifyAgentTool: classifyAgentToolMock,
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
    getToolLabelMock.mockImplementation((toolName: string) => toolName)
    classifyAgentToolMock.mockReturnValue({ allowed: true })
    executeAgentToolMock.mockResolvedValue({
      toolName: "searchMemory",
      status: "done",
      summary: "Found memory",
      output: "Memory result",
    })
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
      availableDeclarations: [],
      maxOutputTokens: 600,
      vectorizeEnv: null,
      appEnv: {
        CLERK_SECRET_KEY: "test",
        DAILY_BUDGET_USD: 5,
        NODE_ENV: "test",
        DODO_PAYMENTS_API_KEY: "dodo",
        DODO_WEBHOOK_SECRET: "secret",
        DODO_PRO_PRODUCT_ID: "prod",
        DODO_PAYMENTS_MODE: "test_mode",
        VAPID_PRIVATE_KEY: undefined,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        NOTION_CLIENT_ID: undefined,
        NOTION_CLIENT_SECRET: undefined,
        NOTION_API_KEY: undefined,
        MISSI_KV_ENCRYPTION_SECRET: undefined,
        APP_URL: "http://localhost:3000",
        AI_BACKEND: "vertex",
        VERTEX_AI_PROJECT_ID: undefined,
        VERTEX_AI_LOCATION: undefined,
        GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
        RESEND_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        ENABLE_OPENAI_FALLBACK: false,
      },
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
      toolCalls: 0,
    }))
  })

  it("blocks disallowed tools at runtime, emits agentStep, and still completes the loop", async () => {
    classifyAgentToolMock.mockReturnValueOnce({ allowed: false, reason: "destructive" })
    getToolLabelMock.mockReturnValueOnce("Delete calendar event")
    streamChatMock
      .mockResolvedValueOnce(
        createGeminiEventStream([
          { type: "functionCall", call: { name: "deleteCalendarEvent", args: { eventId: "evt_1" } } },
        ]),
      )
      .mockResolvedValueOnce(
        createGeminiEventStream([{ type: "text", text: "I need your confirmation first." }]),
      )

    const events = await readSseEvents(buildChatStreamSseStream({
      kv,
      userId: "user_2",
      startTime: 200,
      inputTokens: 333,
      messages: [{ role: "user", content: "delete my event" }],
      personality: "assistant",
      memories: "",
      systemPrompt: "system",
      model: "gemini-2.5-pro",
      availableDeclarations: [],
      maxOutputTokens: 600,
      vectorizeEnv: null,
      appEnv: {
        CLERK_SECRET_KEY: "test",
        DAILY_BUDGET_USD: 5,
        NODE_ENV: "test",
        DODO_PAYMENTS_API_KEY: "dodo",
        DODO_WEBHOOK_SECRET: "secret",
        DODO_PRO_PRODUCT_ID: "prod",
        DODO_PAYMENTS_MODE: "test_mode",
        VAPID_PRIVATE_KEY: undefined,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        NOTION_CLIENT_ID: undefined,
        NOTION_CLIENT_SECRET: undefined,
        NOTION_API_KEY: undefined,
        MISSI_KV_ENCRYPTION_SECRET: undefined,
        APP_URL: "http://localhost:3000",
        AI_BACKEND: "vertex",
        VERTEX_AI_PROJECT_ID: undefined,
        VERTEX_AI_LOCATION: undefined,
        GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
        RESEND_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        ENABLE_OPENAI_FALLBACK: false,
      },
    }))

    expect(events).toEqual([
      {
        agentStep: {
          toolName: "deleteCalendarEvent",
          status: "error",
          label: "Delete calendar event",
          summary: "Tool blocked by policy",
        },
      },
      { text: "I need your confirmation first." },
      { done: true },
    ])
    expect(executeAgentToolMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      "chat_stream.tool_blocked",
      'Blocked destructive tool "deleteCalendarEvent" from agent loop',
      "user_2",
    )
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_2",
      responseText: "I need your confirmation first.",
      toolCalls: 1,
    }))
  })

  it("preserves the full streamed assistant transcript across tool loops", async () => {
    streamChatMock
      .mockResolvedValueOnce(
        createGeminiEventStream([
          { type: "text", text: "Let me check that. " },
          { type: "functionCall", call: { name: "searchMemory", args: { query: "forecast" } } },
        ]),
      )
      .mockResolvedValueOnce(
        createGeminiEventStream([{ type: "text", text: "It looks clear now." }]),
      )

    const events = await readSseEvents(buildChatStreamSseStream({
      kv,
      userId: "user_4",
      startTime: 400,
      inputTokens: 555,
      messages: [{ role: "user", content: "what's the plan?" }],
      personality: "assistant",
      memories: "",
      systemPrompt: "system",
      model: "gemini-2.5-pro",
      availableDeclarations: [],
      maxOutputTokens: 600,
      vectorizeEnv: null,
      appEnv: {
        CLERK_SECRET_KEY: "test",
        DAILY_BUDGET_USD: 5,
        NODE_ENV: "test",
        DODO_PAYMENTS_API_KEY: "dodo",
        DODO_WEBHOOK_SECRET: "secret",
        DODO_PRO_PRODUCT_ID: "prod",
        DODO_PAYMENTS_MODE: "test_mode",
        VAPID_PRIVATE_KEY: undefined,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        NOTION_CLIENT_ID: undefined,
        NOTION_CLIENT_SECRET: undefined,
        NOTION_API_KEY: undefined,
        MISSI_KV_ENCRYPTION_SECRET: undefined,
        APP_URL: "http://localhost:3000",
        AI_BACKEND: "vertex",
        VERTEX_AI_PROJECT_ID: undefined,
        VERTEX_AI_LOCATION: undefined,
        GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
        RESEND_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        ENABLE_OPENAI_FALLBACK: false,
      },
    }))

    expect(events).toEqual([
      { text: "Let me check that. " },
      {
        agentStep: {
          toolName: "searchMemory",
          status: "done",
          label: "searchMemory",
          summary: "Found memory",
        },
      },
      { text: "It looks clear now." },
      { done: true },
    ])
    expect(runChatPostResponseTasksMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_4",
      responseText: "Let me check that. It looks clear now.",
      toolCalls: 1,
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
      availableDeclarations: [{ name: "searchMemory" }],
      maxOutputTokens: 700,
      vectorizeEnv: null,
      appEnv: {
        CLERK_SECRET_KEY: "test",
        DAILY_BUDGET_USD: 5,
        NODE_ENV: "test",
        DODO_PAYMENTS_API_KEY: "dodo",
        DODO_WEBHOOK_SECRET: "secret",
        DODO_PRO_PRODUCT_ID: "prod",
        DODO_PAYMENTS_MODE: "test_mode",
        VAPID_PRIVATE_KEY: undefined,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        NOTION_CLIENT_ID: undefined,
        NOTION_CLIENT_SECRET: undefined,
        NOTION_API_KEY: undefined,
        MISSI_KV_ENCRYPTION_SECRET: undefined,
        APP_URL: "http://localhost:3000",
        AI_BACKEND: "vertex",
        VERTEX_AI_PROJECT_ID: undefined,
        VERTEX_AI_LOCATION: undefined,
        GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
        RESEND_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        ENABLE_OPENAI_FALLBACK: false,
      },
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
      toolCalls: 0,
    }))
  })
})
