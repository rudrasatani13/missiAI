import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  convertGeminiRequestToOpenAI,
  streamOpenAIResponse,
  openAIHealthCheck,
  isOpenAIFallbackEnabled,
} from "@/lib/ai/providers/openai-stream"

describe("openai-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (process.env as any).OPENAI_API_KEY
    delete (process.env as any).ENABLE_OPENAI_FALLBACK
  })

  describe("convertGeminiRequestToOpenAI", () => {
    it("maps system instruction to system message", () => {
      const result = convertGeminiRequestToOpenAI("gemini-2.5-pro", {
        system_instruction: { parts: [{ text: "You are helpful" }] },
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
          { role: "model", parts: [{ text: "Hi there" }] },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      })

      expect(result.model).toBe("gpt-4o")
      expect(result.messages).toEqual([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ])
      expect(result.temperature).toBe(0.7)
      expect(result.max_tokens).toBe(512)
      expect(result.stream).toBe(true)
    })

    it("maps gemini-2.5-flash to gpt-4o-mini", () => {
      const result = convertGeminiRequestToOpenAI("gemini-2.5-flash", {
        system_instruction: { parts: [{ text: "" }] },
        contents: [],
        generationConfig: {},
      })
      expect(result.model).toBe("gpt-4o-mini")
    })

    it("maps unknown model to gpt-4o", () => {
      const result = convertGeminiRequestToOpenAI("gemini-unknown", {
        system_instruction: { parts: [{ text: "" }] },
        contents: [],
        generationConfig: {},
      })
      expect(result.model).toBe("gpt-4o")
    })

    it("converts image parts to OpenAI vision format", () => {
      const result = convertGeminiRequestToOpenAI("gemini-2.5-pro", {
        system_instruction: { parts: [{ text: "" }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: "What's in this image?" },
              { inlineData: { mimeType: "image/jpeg", data: "base64abc" } },
            ],
          },
        ],
        generationConfig: {},
      })

      expect(result.messages).toEqual([
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,base64abc" },
            },
          ],
        },
      ])
    })

    it("applies defaults when generationConfig missing", () => {
      const result = convertGeminiRequestToOpenAI("gemini-2.5-pro", {
        system_instruction: { parts: [{ text: "" }] },
        contents: [],
      })
      expect(result.temperature).toBe(0.85)
      expect(result.max_tokens).toBe(600)
    })
  })

  describe("streamOpenAIResponse", () => {
    function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder()
      return new ReadableStream({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(encoder.encode(line + "\n"))
          }
          controller.close()
        },
      })
    }

    async function readAll(stream: ReadableStream<any>): Promise<any[]> {
      const reader = stream.getReader()
      const out: any[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        out.push(value)
      }
      return out
    }

    it("throws when OPENAI_API_KEY is missing", async () => {
      await expect(
        streamOpenAIResponse("gemini-2.5-pro", { system_instruction: { parts: [{ text: "" }] }, contents: [] })
      ).rejects.toThrow("OPENAI_API_KEY not configured")
    })

    it("parses text delta SSE events", async () => {
      process.env.OPENAI_API_KEY = "sk-test"

      const lines = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]',
      ]

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          body: makeSSEStream(lines),
        })
      )

      const stream = await streamOpenAIResponse("gemini-2.5-pro", {
        system_instruction: { parts: [{ text: "" }] },
        contents: [],
      })

      const events = await readAll(stream)
      expect(events).toEqual([
        { type: "text", text: "Hello" },
        { type: "text", text: " world" },
        { type: "done" },
      ])

      vi.unstubAllGlobals()
    })

    it("throws on OpenAI API error", async () => {
      process.env.OPENAI_API_KEY = "sk-test"

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve("Rate limited"),
        })
      )

      await expect(
        streamOpenAIResponse("gemini-2.5-pro", {
          system_instruction: { parts: [{ text: "" }] },
          contents: [],
        })
      ).rejects.toThrow("OpenAI API error 429: Rate limited")

      vi.unstubAllGlobals()
    })
  })

  describe("openAIHealthCheck", () => {
    it("returns healthy=false when key is missing", async () => {
      const result = await openAIHealthCheck()
      expect(result).toEqual({ healthy: false, latencyMs: 0 })
    })

    it("returns healthy=true on 200", async () => {
      process.env.OPENAI_API_KEY = "sk-test"
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
        })
      )

      const result = await openAIHealthCheck()
      expect(result.healthy).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)

      vi.unstubAllGlobals()
    })

    it("returns healthy=false on 4xx/5xx", async () => {
      process.env.OPENAI_API_KEY = "sk-test"
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
      )

      const result = await openAIHealthCheck()
      expect(result.healthy).toBe(false)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)

      vi.unstubAllGlobals()
    })
  })

  describe("isOpenAIFallbackEnabled", () => {
    it("returns true when ENABLE_OPENAI_FALLBACK=true", () => {
      process.env.ENABLE_OPENAI_FALLBACK = "true"
      expect(isOpenAIFallbackEnabled()).toBe(true)
    })

    it("returns true when ENABLE_OPENAI_FALLBACK=1", () => {
      process.env.ENABLE_OPENAI_FALLBACK = "1"
      expect(isOpenAIFallbackEnabled()).toBe(true)
    })

    it("returns false when ENABLE_OPENAI_FALLBACK=false", () => {
      process.env.ENABLE_OPENAI_FALLBACK = "false"
      expect(isOpenAIFallbackEnabled()).toBe(false)
    })

    it("defaults to true when key is present and flag is unset", () => {
      delete (process.env as any).ENABLE_OPENAI_FALLBACK
      process.env.OPENAI_API_KEY = "sk-test"
      expect(isOpenAIFallbackEnabled()).toBe(true)
    })

    it("defaults to false when key is absent and flag is unset", () => {
      delete (process.env as any).ENABLE_OPENAI_FALLBACK
      delete (process.env as any).OPENAI_API_KEY
      expect(isOpenAIFallbackEnabled()).toBe(false)
    })
  })
})
