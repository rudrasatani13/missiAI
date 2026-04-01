import { describe, it, expect, vi, beforeEach } from "vitest"
import { detectIntent, isActionable } from "@/lib/actions/intent-detector"

// Mock callAIDirect
vi.mock("@/services/ai.service", () => ({
  callAIDirect: vi.fn(),
}))

import { callAIDirect } from "@/services/ai.service"

const mockedCallAIDirect = vi.mocked(callAIDirect)

describe("intent-detector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("detectIntent", () => {
    it('should detect web_search intent for "search for flights to Goa"', async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        JSON.stringify({
          type: "web_search",
          confidence: 0.92,
          parameters: { query: "flights to Goa" },
        }),
      )

      const result = await detectIntent("search for flights to Goa", "", "test-key")
      expect(result.type).toBe("web_search")
      expect(result.confidence).toBeGreaterThanOrEqual(0.75)
      expect(result.parameters.query).toBe("flights to Goa")
      expect(result.rawUserMessage).toBe("search for flights to Goa")
    })

    it('should return none for casual messages like "hi how are you"', async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        JSON.stringify({
          type: "none",
          confidence: 0.1,
          parameters: {},
        }),
      )

      const result = await detectIntent("hi how are you", "", "test-key")
      expect(result.type).toBe("none")
    })

    it("should return safe default when AI returns invalid JSON", async () => {
      mockedCallAIDirect.mockResolvedValueOnce("this is not valid json at all")

      const result = await detectIntent("some message", "", "test-key")
      expect(result.type).toBe("none")
      expect(result.confidence).toBe(0)
      expect(result.parameters).toEqual({})
      expect(result.rawUserMessage).toBe("some message")
    })

    it("should return safe default when callAIDirect throws", async () => {
      mockedCallAIDirect.mockRejectedValueOnce(new Error("API failed"))

      const result = await detectIntent("some message", "", "test-key")
      expect(result.type).toBe("none")
      expect(result.confidence).toBe(0)
    })

    it("should handle markdown-wrapped JSON from AI", async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        '```json\n{"type": "translate", "confidence": 0.88, "parameters": {"text": "hello", "targetLanguage": "Hindi"}}\n```',
      )

      const result = await detectIntent("translate hello to Hindi", "", "test-key")
      expect(result.type).toBe("translate")
      expect(result.confidence).toBe(0.88)
    })

    it("should attach rawUserMessage to result", async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        JSON.stringify({ type: "none", confidence: 0, parameters: {} }),
      )

      const result = await detectIntent("my test message", "some context", "key")
      expect(result.rawUserMessage).toBe("my test message")
    })

    it("should pass conversation context to the AI call", async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        JSON.stringify({ type: "none", confidence: 0, parameters: {} }),
      )

      await detectIntent("test", "user: hello\nassistant: hi", "key")

      expect(mockedCallAIDirect).toHaveBeenCalledTimes(1)
      const userPrompt = mockedCallAIDirect.mock.calls[0][1]
      expect(userPrompt).toContain("test")
      expect(userPrompt).toContain("user: hello")
    })
  })

  describe("isActionable", () => {
    it("should return false for type: none", () => {
      expect(
        isActionable({ type: "none", confidence: 0, parameters: {}, rawUserMessage: "" }),
      ).toBe(false)
    })

    it("should return true for web_search with confidence >= 0.75", () => {
      expect(
        isActionable({
          type: "web_search",
          confidence: 0.9,
          parameters: {},
          rawUserMessage: "",
        }),
      ).toBe(true)
    })

    it("should return false for web_search with confidence < 0.75", () => {
      expect(
        isActionable({
          type: "web_search",
          confidence: 0.6,
          parameters: {},
          rawUserMessage: "",
        }),
      ).toBe(false)
    })

    it("should return true for exactly 0.75 confidence", () => {
      expect(
        isActionable({
          type: "calculate",
          confidence: 0.75,
          parameters: {},
          rawUserMessage: "",
        }),
      ).toBe(true)
    })

    it("should return false for none even with high confidence", () => {
      expect(
        isActionable({
          type: "none",
          confidence: 0.99,
          parameters: {},
          rawUserMessage: "",
        }),
      ).toBe(false)
    })
  })
})
