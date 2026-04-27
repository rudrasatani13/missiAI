import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/push/[...path]/route"

vi.mock("@/lib/server/security/auth", () => {
  class AuthenticationError extends Error {}
  return {
    getVerifiedUserId: vi.fn(),
    AuthenticationError,
    unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
  }
})

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "10" })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn(),
}))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: vi.fn(),
}))

import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { checkRateLimit } from "@/lib/server/security/rate-limiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getCloudflareContext } from "@opennextjs/cloudflare"

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockGetCloudflareContext = vi.mocked(getCloudflareContext)

function makeRequest(body: unknown, contentLength?: number) {
  return new Request("https://example.com/api/push/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(contentLength ? { "content-length": String(contentLength) } : {}),
    },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetVerifiedUserId.mockResolvedValue("user_123")
  mockGetUserPlan.mockResolvedValue("free")
  mockCheckRateLimit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: 0, retryAfter: 0 })
  mockGetCloudflareContext.mockReturnValue({
    env: {
      MISSI_MEMORY: {
        get: async () => null,
        put: vi.fn(async () => {}),
      },
    },
  } as any)
})

describe("POST /api/push/[...path]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetVerifiedUserId.mockRejectedValue(new AuthenticationError())

    const response = await POST(makeRequest({}), { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(401)
  })

  it("returns 413 for oversized payloads", async () => {
    const response = await POST(makeRequest({ endpoint: "https://example.com", keys: { p256dh: "a", auth: "b" } }, 20_000), { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(413)
  })

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("https://example.com/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    }) as any

    const response = await POST(req, { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(400)
  })

  it("returns 400 for invalid subscription format", async () => {
    const response = await POST(makeRequest({ endpoint: "not-a-url" }), { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(400)
  })

  it("returns 500 when KV is unavailable", async () => {
    mockGetCloudflareContext.mockImplementation(() => { throw new Error("No context") })

    const response = await POST(makeRequest({ endpoint: "https://example.com", keys: { p256dh: "a", auth: "b" } }), { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(500)
  })

  it("subscribes successfully", async () => {
    const response = await POST(makeRequest({ endpoint: "https://example.com", keys: { p256dh: "a", auth: "b" } }), { params: Promise.resolve({ path: ["subscribe"] }) })
    expect(response.status).toBe(200)
  })

  it("returns placeholder response for trigger", async () => {
    const response = await POST(makeRequest({}), { params: Promise.resolve({ path: ["trigger"] }) })
    expect(response.status).toBe(200)
  })

  it("returns 404 for unknown path", async () => {
    const response = await POST(makeRequest({}), { params: Promise.resolve({ path: ["unknown"] }) })
    expect(response.status).toBe(404)
  })
})
