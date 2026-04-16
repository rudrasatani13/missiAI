import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit, rateLimitHeaders, rateLimitExceededResponse } from "@/lib/rateLimiter"

// The module has dynamic import, so we can mock the import module directly
vi.mock("@cloudflare/next-on-pages", () => ({
  getRequestContext: vi.fn(() => ({
    env: {
      MISSI_MEMORY: {
        get: async (key: string) => (globalThis as any).KV_NAMESPACE.get(key),
        put: async (key: string, val: string) => (globalThis as any).KV_NAMESPACE.put(key, val),
        delete: async (key: string) => (globalThis as any).KV_NAMESPACE.delete(key),
      }
    }
  }))
}))

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear global store
    const store = new Map<string, string>();
    (globalThis as any).KV_NAMESPACE = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, val: string) => { store.set(key, val) },
      delete: async (key: string) => { store.delete(key) }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("checkRateLimit", () => {
    it("should allow request below limit", async () => {
      // 0 seconds into the current minute
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"))

      const result = await checkRateLimit("user-1", "free", "api")

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(59) // 60 - 1
      expect(result.limit).toBe(60)
      expect(result.retryAfter).toBe(0)
    })

    it("should reject request above limit", async () => {
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"))

      // Consume all 60 limits
      for (let i = 0; i < 60; i++) {
        await checkRateLimit("user-1", "free", "api")
      }

      // 61st request should be blocked
      const result = await checkRateLimit("user-1", "free", "api")

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBe(60) // full minute left since we are at :00
    })

    it("should apply different limits based on tier and route", async () => {
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"))

      const freeAiResult = await checkRateLimit("user-tier", "free", "ai")
      expect(freeAiResult.limit).toBe(60)

      const paidApiResult = await checkRateLimit("user-tier", "paid", "api")
      expect(paidApiResult.limit).toBe(200)

      const paidAiResult = await checkRateLimit("user-tier", "paid", "ai")
      expect(paidAiResult.limit).toBe(120)
    })

    it("should use sliding window weighting", async () => {
      // Start at 12:00:00
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"))

      // Consume 30 requests in the first window
      for (let i = 0; i < 30; i++) {
        await checkRateLimit("user-sliding", "free", "api")
      }

      // Move to 12:01:30 (30 seconds into next minute)
      vi.setSystemTime(new Date("2024-01-01T12:01:30.000Z"))

      // prevWeight = (60 - 30) / 60 = 0.5
      // prevCount = 30
      // effectiveCount = 30 * 0.5 + 0 = 15
      // remaining should be 60 - 15 - 1 = 44

      const result = await checkRateLimit("user-sliding", "free", "api")

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(44)
    })

    it("should fail open if KV is unavailable", async () => {
      // Override the mock to throw/simulate no env for this test
      vi.doMock("@cloudflare/next-on-pages", () => ({
        getRequestContext: vi.fn(() => ({ env: {} }))
      }))

      // We need to re-import checkRateLimit after doMock, but we can also just
      // break the KV directly for the current execution context by wiping globalThis
      const originalKV = (globalThis as any).KV_NAMESPACE
      try {
        delete (globalThis as any).KV_NAMESPACE

        // This will now catch in getKV() or resolve to null if the module mock handles it
        // Actually, since getKV dynamically imports, let's reset the module registry
        const { checkRateLimit: checkRateLimitLocal } = await import("@/lib/rateLimiter")

        const result = await checkRateLimitLocal("user-failopen", "free", "api")
        expect(result.allowed).toBe(true)
        expect(result.limit).toBe(60)
        expect(result.remaining).toBe(1)
      } finally {
        (globalThis as any).KV_NAMESPACE = originalKV
      }
    })
  })

  describe("rateLimitHeaders", () => {
    it("should generate correct headers from result", () => {
      const result = {
        allowed: false,
        remaining: 0,
        limit: 60,
        resetAt: 1234567890,
        retryAfter: 30
      }

      const headers = rateLimitHeaders(result)
      expect(headers).toEqual({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1234567890",
      })
    })
  })

  describe("rateLimitExceededResponse", () => {
    it("should generate correct 429 response", async () => {
      const result = {
        allowed: false,
        remaining: 0,
        limit: 120,
        resetAt: 1234567890,
        retryAfter: 45
      }

      const response = rateLimitExceededResponse(result)

      expect(response.status).toBe(429)
      expect(response.headers.get("Retry-After")).toBe("45")
      expect(response.headers.get("X-RateLimit-Limit")).toBe("120")
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0")
      expect(response.headers.get("X-RateLimit-Reset")).toBe("1234567890")

      const body = await response.json()
      expect(body).toEqual({
        success: false,
        error: "Rate limit exceeded. Please slow down."
      })
    })
  })
})
