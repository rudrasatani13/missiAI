import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const {
  getVerifiedUserIdMock,
  getEnvMock,
  getCloudflareKVBindingMock,
  randomHexMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getEnvMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  randomHexMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  rateLimitExceededResponseMock: vi.fn(),
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: class AuthenticationError extends Error {},
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock("@/lib/bot/bot-crypto", () => ({
  randomHex: randomHexMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
}))

import { GET } from "@/app/api/auth/connect/google/route"

// ─── Test helpers ──────────────────────────────────────────────────────────────

const kv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const ALLOWED_RATE_RESULT = {
  allowed: true,
  remaining: 4,
  limit: 5,
  resetAt: Math.floor(Date.now() / 1000) + 60,
  retryAfter: 0,
}

const BLOCKED_RATE_RESULT = {
  allowed: false,
  remaining: 0,
  limit: 5,
  resetAt: Math.floor(Date.now() / 1000) + 60,
  retryAfter: 60,
}

function makeReq(): NextRequest {
  return new NextRequest("https://missi.space/api/auth/connect/google")
}

describe("GET /api/auth/connect/google", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getEnvMock.mockReturnValue({
      GOOGLE_CLIENT_ID: "gid_test",
      GOOGLE_CLIENT_SECRET: "gsecret_test",
      APP_URL: "https://missi.space",
    })
    getCloudflareKVBindingMock.mockReturnValue(kv)
    randomHexMock.mockReturnValue("deadbeefcafe0011223344556677889900112233445566778899")
    checkRateLimitMock.mockResolvedValue(ALLOWED_RATE_RESULT)
    kv.put.mockResolvedValue(undefined)
    rateLimitExceededResponseMock.mockReturnValue(
      new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    )
  })

  // ── Item 6: OAuth connect rate limit works ────────────────────────────────

  it("returns the rate-limit response when the limit is exceeded", async () => {
    checkRateLimitMock.mockResolvedValueOnce(BLOCKED_RATE_RESULT)

    const res = await GET(makeReq())

    expect(rateLimitExceededResponseMock).toHaveBeenCalledWith(BLOCKED_RATE_RESULT)
    // Must NOT redirect to Google or write to KV
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("enforces the rate limit before generating the state token", async () => {
    checkRateLimitMock.mockResolvedValueOnce(BLOCKED_RATE_RESULT)

    await GET(makeReq())

    // randomHex must not be called when rate-limited
    expect(randomHexMock).not.toHaveBeenCalled()
  })

  it("checks the OAuth rate-limit bucket for the authenticated user", async () => {
    await GET(makeReq())

    expect(checkRateLimitMock).toHaveBeenCalledWith("user_123", "free", "oauth")
  })

  // ── Item 7: OAuth state has TTL ───────────────────────────────────────────

  it("stores the state token in KV with a 600-second TTL (10 minutes)", async () => {
    await GET(makeReq())

    // kv.put must be called with the state key and the correct expirationTtl
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining("oauth:state:"),
      expect.stringContaining("user_123"),
      { expirationTtl: 600 },
    )
  })

  it("stores userId and createdAt in the KV state value", async () => {
    await GET(makeReq())

    const [, rawValue] = kv.put.mock.calls[0]
    const parsed = JSON.parse(rawValue as string)
    expect(parsed.userId).toBe("user_123")
    expect(typeof parsed.createdAt).toBe("number")
  })

  it("includes the state token in the redirect URL to Google", async () => {
    const res = await GET(makeReq())

    // Should be a redirect (3xx) pointing to Google OAuth
    expect([301, 302, 307, 308]).toContain(res.status)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("accounts.google.com")
    expect(location).toContain("state=")
  })

  it("returns 503 when KV is unavailable (fail-closed for OAuth)", async () => {
    getCloudflareKVBindingMock.mockReturnValue(null)

    const res = await GET(makeReq())

    // Cannot proceed without KV — fail closed
    expect(res.status).toBe(503)
    expect(kv.put).not.toHaveBeenCalled()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("redirects to /sign-in for unauthenticated users", async () => {
    const { AuthenticationError } = await import("@/lib/server/security/auth")
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationError())

    const res = await GET(makeReq())

    expect([301, 302, 307, 308]).toContain(res.status)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("sign-in")
    expect(checkRateLimitMock).not.toHaveBeenCalled()
  })

  // ── Config guard ──────────────────────────────────────────────────────────

  it("returns 503 when GOOGLE_CLIENT_ID is not configured", async () => {
    getEnvMock.mockReturnValue({
      GOOGLE_CLIENT_ID: undefined,
      APP_URL: "https://missi.space",
    })

    const res = await GET(makeReq())

    expect(res.status).toBe(503)
    expect(kv.put).not.toHaveBeenCalled()
  })
})
