import { describe, it, expect } from "vitest"
import {
  estimateTokens,
  truncateToTokenLimit,
  estimateRequestTokens,
} from "@/lib/memory/token-counter"
import type { ConversationEntry } from "@/types/chat"

describe("estimateTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })

  it("returns ~100 for a 400-char string", () => {
    const text = "a".repeat(400)
    const tokens = estimateTokens(text)
    expect(tokens).toBe(100)
  })

  it("rounds up for non-divisible lengths", () => {
    const text = "a".repeat(401)
    const tokens = estimateTokens(text)
    expect(tokens).toBe(101)
  })
})

describe("truncateToTokenLimit", () => {
  function makeMessages(count: number, charsPer: number): ConversationEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(charsPer),
    }))
  }

  it("always keeps at least 4 messages", () => {
    const messages = makeMessages(10, 1000)
    const result = truncateToTokenLimit(messages, 1)
    expect(result.length).toBeGreaterThanOrEqual(4)
  })

  it("reduces array when over token limit", () => {
    const messages = makeMessages(20, 500)
    const result = truncateToTokenLimit(messages, 100)
    expect(result.length).toBeLessThan(20)
  })

  it("never removes the most recent message", () => {
    const messages = makeMessages(10, 500)
    const lastMessage = messages[messages.length - 1]
    const result = truncateToTokenLimit(messages, 100)
    expect(result[result.length - 1].content).toBe(lastMessage.content)
  })

  it("returns all messages if under limit", () => {
    const messages = makeMessages(3, 10)
    const result = truncateToTokenLimit(messages, 100000)
    expect(result.length).toBe(3)
  })

  it("does not truncate when exactly 4 messages", () => {
    const messages = makeMessages(4, 5000)
    const result = truncateToTokenLimit(messages, 1)
    expect(result.length).toBe(4)
  })
})

describe("estimateRequestTokens", () => {
  it("returns a number greater than the sum of parts (overhead)", () => {
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]
    const systemPrompt = "You are a helpful assistant."
    const memories = "User likes cats."

    const sumOfParts =
      estimateTokens(systemPrompt) +
      estimateTokens(memories) +
      messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

    const result = estimateRequestTokens(messages, systemPrompt, memories)

    expect(result).toBeGreaterThan(sumOfParts)
  })

  it("returns a positive number for non-empty inputs", () => {
    const result = estimateRequestTokens(
      [{ role: "user", content: "test" }],
      "prompt",
      "memory"
    )
    expect(result).toBeGreaterThan(0)
  })
})
