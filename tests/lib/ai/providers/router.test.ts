import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GeminiStreamEvent } from "@/lib/ai/providers/gemini-stream"

const {
  streamGeminiResponseViaVertexMock,
  vertexHealthCheckMock,
  streamOpenAIResponseMock,
  isOpenAIFallbackEnabledMock,
  openAIHealthCheckMock,
  logErrorMock,
} = vi.hoisted(() => ({
  streamGeminiResponseViaVertexMock: vi.fn(),
  vertexHealthCheckMock: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 80 }),
  streamOpenAIResponseMock: vi.fn(),
  isOpenAIFallbackEnabledMock: vi.fn().mockReturnValue(true),
  openAIHealthCheckMock: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 120 }),
  logErrorMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/gemini-stream", () => ({
  streamGeminiResponseViaVertex: streamGeminiResponseViaVertexMock,
  vertexHealthCheck: vertexHealthCheckMock,
}))

vi.mock("@/lib/ai/providers/openai-stream", () => ({
  streamOpenAIResponse: streamOpenAIResponseMock,
  isOpenAIFallbackEnabled: isOpenAIFallbackEnabledMock,
  openAIHealthCheck: openAIHealthCheckMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
}))

import {
  streamChat,
  checkProviderHealth,
  getProviderHealthSnapshot,
  resetProviderHealth,
} from "@/lib/ai/providers/router"

describe("provider-router", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderHealth()
    isOpenAIFallbackEnabledMock.mockReturnValue(true)
  })

  function makeFakeStream(events: GeminiStreamEvent[]): ReadableStream<GeminiStreamEvent> {
    return new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(event)
        controller.close()
      },
    })
  }

  async function readAll(stream: ReadableStream<GeminiStreamEvent>): Promise<GeminiStreamEvent[]> {
    const reader = stream.getReader()
    const out: GeminiStreamEvent[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(value)
    }
    return out
  }

  // ── streamChat ────────────────────────────────────────────────────────────

  it("returns Vertex stream on success", async () => {
    const fakeEvents: GeminiStreamEvent[] = [{ type: "text", text: "Hello" }, { type: "done" }]
    streamGeminiResponseViaVertexMock.mockResolvedValueOnce(makeFakeStream(fakeEvents))

    const stream = await streamChat({
      model: "gemini-2.5-pro",
      requestBody: { test: true },
      userId: "user-1",
    })

    const events = await readAll(stream)
    expect(events).toEqual(fakeEvents)
    expect(streamGeminiResponseViaVertexMock).toHaveBeenCalledTimes(1)
    expect(streamOpenAIResponseMock).not.toHaveBeenCalled()
  })

  it("falls back to OpenAI on Vertex 503 when fallback enabled", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 503: unavailable")
    )

    const openaiEvents: GeminiStreamEvent[] = [{ type: "text", text: "Fallback" }, { type: "done" }]
    streamOpenAIResponseMock.mockResolvedValueOnce(makeFakeStream(openaiEvents))

    const stream = await streamChat({
      model: "gemini-2.5-pro",
      requestBody: { test: true },
      userId: "user-1",
    })

    const events = await readAll(stream)
    expect(events).toEqual(openaiEvents)
    expect(streamOpenAIResponseMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith(
      "provider.vertex_failure",
      expect.stringContaining("503"),
    )
  })

  it("falls back to OpenAI on Vertex 429", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 429: rate limit")
    )

    streamOpenAIResponseMock.mockResolvedValueOnce(
      makeFakeStream([{ type: "text", text: "OK" }, { type: "done" }])
    )

    const stream = await streamChat({
      model: "gemini-2.5-pro",
      requestBody: {},
    })

    const events = await readAll(stream)
    expect(events).toEqual([{ type: "text", text: "OK" }, { type: "done" }])
  })

  it("falls back to OpenAI on Vertex timeout", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("timeout")
    )

    streamOpenAIResponseMock.mockResolvedValueOnce(
      makeFakeStream([{ type: "text", text: "Recovered" }, { type: "done" }])
    )

    const stream = await streamChat({ model: "gemini-2.5-pro", requestBody: {} })
    const events = await readAll(stream)
    expect(events).toEqual([{ type: "text", text: "Recovered" }, { type: "done" }])
  })

  it("throws original Vertex error when fallback is disabled", async () => {
    isOpenAIFallbackEnabledMock.mockReturnValue(false)
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 503: unavailable")
    )

    await expect(
      streamChat({ model: "gemini-2.5-pro", requestBody: {} })
    ).rejects.toThrow("503")

    expect(streamOpenAIResponseMock).not.toHaveBeenCalled()
  })

  it("throws original Vertex error when OpenAI also fails", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 503: unavailable")
    )
    streamOpenAIResponseMock.mockRejectedValueOnce(
      new Error("OpenAI error 500")
    )

    await expect(
      streamChat({ model: "gemini-2.5-pro", requestBody: {} })
    ).rejects.toThrow("503")
  })

  it("throws on non-retryable Vertex error (e.g. 400) without fallback", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 400: bad request")
    )

    await expect(
      streamChat({ model: "gemini-2.5-pro", requestBody: {} })
    ).rejects.toThrow("400")

    expect(streamOpenAIResponseMock).not.toHaveBeenCalled()
  })

  it("does not log fallback message when userId is omitted", async () => {
    streamGeminiResponseViaVertexMock.mockRejectedValueOnce(
      new Error("Gemini API error 503")
    )
    streamOpenAIResponseMock.mockResolvedValueOnce(
      makeFakeStream([{ type: "done" }])
    )

    await streamChat({ model: "gemini-2.5-pro", requestBody: {} })
    expect(logErrorMock).toHaveBeenCalledWith(
      "provider.vertex_failure",
      expect.any(String),
    )
  })

  // ── checkProviderHealth ─────────────────────────────────────────────────────

  it("returns cached provider health without probing OpenAI by default", async () => {
    const health = getProviderHealthSnapshot()
    expect(health.vertex.healthy).toBe(true)
    expect(health.openai.healthy).toBe(true)
    expect(health.openai.latencyMs).toBe(0)
    expect(vertexHealthCheckMock).not.toHaveBeenCalled()
    expect(openAIHealthCheckMock).not.toHaveBeenCalled()
  })

  it("probes Vertex health even when OpenAI is not forced", async () => {
    const health = await checkProviderHealth()

    expect(vertexHealthCheckMock).toHaveBeenCalledTimes(1)
    expect(openAIHealthCheckMock).not.toHaveBeenCalled()
    expect(health.vertex.healthy).toBe(true)
  })

  it("forces an OpenAI health probe when explicitly requested", async () => {
    const health = await checkProviderHealth({ forceOpenAIProbe: true })

    expect(vertexHealthCheckMock).toHaveBeenCalledTimes(1)
    expect(openAIHealthCheckMock).toHaveBeenCalledTimes(1)
    expect(health.vertex.healthy).toBe(true)
    expect(health.openai.healthy).toBe(true)
    expect(health.openai.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("surfaces a failed Vertex probe immediately in the returned health status", async () => {
    vertexHealthCheckMock.mockResolvedValueOnce({ healthy: false, latencyMs: 45 })

    const health = await checkProviderHealth()

    expect(health.vertex.healthy).toBe(false)
    expect(health.vertex.latencyMs).toBe(45)
  })
})
