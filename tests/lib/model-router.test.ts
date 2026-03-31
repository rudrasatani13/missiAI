import { describe, it, expect } from "vitest"
import { selectGeminiModel, estimateRequestCost } from "@/lib/ai/model-router"
import type { Message } from "@/types"

describe("selectGeminiModel", () => {
  it("always returns gemini-3-flash-preview for short messages", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-3-flash-preview")
  })

  it("returns gemini-3-flash-preview for long messages", () => {
    const messages: Message[] = [
      { role: "user", content: "x".repeat(100) },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-3-flash-preview")
  })

  it("returns gemini-3-flash-preview when memories are present", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
    ]
    const result = selectGeminiModel(messages, "User likes coffee.")
    expect(result).toBe("gemini-3-flash-preview")
  })

  it("returns gemini-3-flash-preview for long conversations", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "How?" },
      { role: "assistant", content: "Fine" },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-3-flash-preview")
  })

  it("returns gemini-3-flash-preview regardless of conditions", () => {
    const messages: Message[] = [
      { role: "user", content: "Hey" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "Sup?" },
    ]
    const result = selectGeminiModel(messages, "  ")
    expect(result).toBe("gemini-3-flash-preview")
  })
})

describe("estimateRequestCost", () => {
  it("returns a number greater than 0 for valid inputs", () => {
    const cost = estimateRequestCost("gemini-3-flash-preview", 1000, 500)
    expect(cost).toBeGreaterThan(0)
  })

  it("returns 0 when tokens are 0", () => {
    const cost = estimateRequestCost("gemini-3-flash-preview", 0, 0)
    expect(cost).toBe(0)
  })

  it("calculates cost correctly", () => {
    // 1000 input tokens * 0.0001 + 500 output tokens * 0.0004 = 0.1 + 0.2 = 0.3
    const cost = estimateRequestCost("gemini-3-flash-preview", 1000, 500)
    expect(cost).toBeCloseTo(0.0003, 4)
  })
})
