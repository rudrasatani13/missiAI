import { describe, it, expect } from "vitest"
import { buildCacheKey, isCacheable } from "@/lib/server/cache/response-cache"

describe("buildCacheKey", () => {
  it("produces the same key for the same message and personality", () => {
    const key1 = buildCacheKey("hello world", "bestfriend")
    const key2 = buildCacheKey("hello world", "bestfriend")
    expect(key1).toBe(key2)
  })

  it("produces a different key for a different personality", () => {
    const key1 = buildCacheKey("hello world", "bestfriend")
    const key2 = buildCacheKey("hello world", "professional")
    expect(key1).not.toBe(key2)
  })

  it("normalizes whitespace and casing", () => {
    const key1 = buildCacheKey("Hello  World", "bestfriend")
    const key2 = buildCacheKey("hello world", "bestfriend")
    expect(key1).toBe(key2)
  })

  it("returns null for messages over 120 chars", () => {
    const longMessage = "a".repeat(121)
    const key = buildCacheKey(longMessage, "bestfriend")
    expect(key).toBeNull()
  })

  it("returns a string key for short messages", () => {
    const key = buildCacheKey("hi", "mentor")
    expect(key).toBeTypeOf("string")
    expect(key).toContain("chat-cache:")
  })
})

describe("isCacheable", () => {
  it("returns true for short message + short response with no pronouns", () => {
    const result = isCacheable("what is the capital of france", "Paris is the capital of France.")
    expect(result).toBe(true)
  })

  it("returns false when response contains 'you'", () => {
    const result = isCacheable("hello", "How are you doing today?")
    expect(result).toBe(false)
  })

  it("returns false when message is over 120 chars", () => {
    const longMessage = "a".repeat(121)
    const result = isCacheable(longMessage, "Short response.")
    expect(result).toBe(false)
  })

  it("returns false when response is over 500 chars", () => {
    const longResponse = "x".repeat(501)
    const result = isCacheable("short question", longResponse)
    expect(result).toBe(false)
  })

  it("returns false when response contains 'my'", () => {
    const result = isCacheable("tell me", "That is my favorite thing.")
    expect(result).toBe(false)
  })

  it("returns false when response contains 'I'", () => {
    const result = isCacheable("hello", "I think that is correct.")
    expect(result).toBe(false)
  })
})
