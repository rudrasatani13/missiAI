import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit, rateLimitHeaders, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"

// The module has dynamic import, so we can mock the import module directly
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      MISSI_MEMORY: {
        get: async (key: string) => (globalThis as any).KV_NAMESPACE.get(key),
        put: async (key: string, val: string) => (globalThis as any).KV_NAMESPACE.put(key, val),
        delete: async (key: string) => (globalThis as any).KV_NAMESPACE.delete(key),
      },
      ...((globalThis as any).ATOMIC_COUNTER ? { ATOMIC_COUNTER: (globalThis as any).ATOMIC_COUNTER } : {}),
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
    vi.unstubAllEnvs()
    delete (globalThis as any).ATOMIC_COUNTER
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

    it("should fail closed in production when the atomic and KV backends are unavailable", async () => {
      vi.stubEnv("NODE_ENV", "production")

      const originalKV = (globalThis as any).KV_NAMESPACE
      try {
        delete (globalThis as any).KV_NAMESPACE

        const result = await checkRateLimit("user-unavailable", "free", "api")

        expect(result).toMatchObject({
          allowed: false,
          remaining: 0,
          limit: 60,
          retryAfter: 0,
          unavailable: true,
        })
      } finally {
        (globalThis as any).KV_NAMESPACE = originalKV
      }
    })

    it("should use the atomic counter binding before falling back to KV", async () => {
      const now = new Date("2024-01-01T12:00:00.000Z")
      vi.setSystemTime(now)
      const windowMinute = Math.floor(now.getTime() / 60_000)
      const calls: string[] = []
      const counts = new Map<string, number>()
      ;(globalThis as any).ATOMIC_COUNTER = {
        idFromName: (name: string) => name,
        get: (name: string) => ({
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(String(input)).pathname
            calls.push(`${path}:${name}`)
            const body = JSON.parse(String(init?.body ?? "{}")) as { limit: number }
            const count = counts.get(name) ?? 0
            if (path === "/counter/check") {
              return Response.json({ allowed: count < body.limit, count, remaining: Math.max(0, body.limit - count) })
            }
            if (path === "/counter/check-increment") {
              if (count >= body.limit) {
                return Response.json({ allowed: false, count, remaining: 0 })
              }
              const next = count + 1
              counts.set(name, next)
              return Response.json({ allowed: true, count: next, remaining: Math.max(0, body.limit - next) })
            }
            return new Response(null, { status: 404 })
          },
        }),
      }
      const kvGet = vi.fn(async () => null)
      ;(globalThis as any).KV_NAMESPACE = {
        get: kvGet,
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      }

      const result = await checkRateLimit("user-atomic", "free", "api")

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(59)
      expect(kvGet).not.toHaveBeenCalled()
      expect(calls).toEqual([
        `/counter/check:ratelimit:user-atomic:api:${windowMinute - 1}`,
        `/counter/check-increment:ratelimit:user-atomic:api:${windowMinute}`,
      ])
    })

    it("should enforce the isolate-local fallback cap outside production when backends are unavailable", async () => {
      vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"))

      const originalKV = (globalThis as any).KV_NAMESPACE
      try {
        delete (globalThis as any).KV_NAMESPACE

        const results = []
        for (let index = 0; index < 65; index += 1) {
          results.push(await checkRateLimit("user-fallback", "free", "api"))
        }

        expect(results.filter((result) => result.allowed)).toHaveLength(60)
        expect(results.filter((result) => !result.allowed)).toHaveLength(5)
        expect(results.at(-1)).toMatchObject({ allowed: false, remaining: 0 })
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
        error: "Rate limit exceeded. Please slow down.",
        code: "RATE_LIMITED",
      })
    })

    it("should generate correct 503 response when the rate limit service is unavailable", async () => {
      const result = {
        allowed: false,
        remaining: 0,
        limit: 60,
        resetAt: 1234567890,
        retryAfter: 0,
        unavailable: true,
      }

      const response = rateLimitExceededResponse(result)

      expect(response.status).toBe(503)
      expect(response.headers.get("Retry-After")).toBeNull()
      expect(response.headers.get("X-RateLimit-Limit")).toBe("60")
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0")
      expect(response.headers.get("X-RateLimit-Reset")).toBe("1234567890")

      const body = await response.json()
      expect(body).toEqual({
        success: false,
        error: "Rate limit service unavailable",
        code: "SERVICE_UNAVAILABLE",
      })
    })
  })
})
