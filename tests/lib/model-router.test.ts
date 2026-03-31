import { describe, it, expect } from "vitest"
import { selectGeminiModel, estimateRequestCost } from "@/lib/ai/model-router"
import type { Message } from "@/types"

describe("selectGeminiModel", () => {
  it("returns lite model for short message + no memories + under 4 turns", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-2.0-flash-lite")
  })

  it("returns flash model for a long message", () => {
    const messages: Message[] = [
      { role: "user", content: "x".repeat(100) },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-2.5-pro")
  })

  it("returns flash model when memories are present", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
    ]
    const result = selectGeminiModel(messages, "User likes coffee.")
    expect(result).toBe("gemini-2.5-pro")
  })

  it("returns flash model when conversation has 4 or more turns", () => {
    const messages: Message[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "How?" },
      { role: "assistant", content: "Fine" },
    ]
    const result = selectGeminiModel(messages, "")
    expect(result).toBe("gemini-2.5-pro")
  })

  it("returns lite when all conditions met: short msg, no memories, few turns", () => {
    const messages: Message[] = [
      { role: "user", content: "Hey" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "Sup?" },
    ]
    const result = selectGeminiModel(messages, "  ")
    expect(result).toBe("gemini-2.0-flash-lite")
  })
})

describe("estimateRequestCost", () => {
  it("returns a number greater than 0 for valid inputs", () => {
    const cost = estimateRequestCost("gemini-2.5-pro", 1000, 500)
    expect(cost).toBeGreaterThan(0)
  })

  it("returns a number greater than 0 for lite model", () => {
    const cost = estimateRequestCost("gemini-2.0-flash-lite", 500, 200)
    expect(cost).toBeGreaterThan(0)
  })

  it("returns 0 when tokens are 0", () => {
    const cost = estimateRequestCost("gemini-2.5-pro", 0, 0)
    expect(cost).toBe(0)
  })

  it("lite model is cheaper than pro for same token counts", () => {
    const liteCost = estimateRequestCost("gemini-2.0-flash-lite", 1000, 500)
    const proCost = estimateRequestCost("gemini-2.5-pro", 1000, 500)
    expect(liteCost).toBeLessThan(proCost)
  })
})
