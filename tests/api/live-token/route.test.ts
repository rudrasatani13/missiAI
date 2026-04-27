import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "@/app/api/v1/live-token/route"

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// C1 pre-launch audit: these tests were rewritten after we replaced the
// direct Vertex WebSocket URL + GCP OAuth token with a same-origin relay
// URL + HMAC-signed ticket. We no longer mock `getGeminiLiveWsUrl` because
// the route no longer calls it — the real GCP token stays on the server.

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: vi.fn(),
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn(),
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })),
}))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkVoiceLimit: vi.fn(),
}))

vi.mock("@/lib/ai/live/transport", () => ({
  getLiveTransportSession: vi.fn(),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

// Import the mocked functions so we can modify their return values in tests
import { getVerifiedUserId } from "@/lib/server/security/auth"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkRateLimit } from "@/lib/server/security/rate-limiter"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { checkVoiceLimit } from "@/lib/billing/usage-tracker"
import { getLiveTransportSession } from "@/lib/ai/live/transport"

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockCheckVoiceLimit = vi.mocked(checkVoiceLimit)
const mockGetLiveTransportSession = vi.mocked(getLiveTransportSession)

const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

function makeReq(): NextRequest {
  return new NextRequest("https://missi.space/api/v1/live-token", { method: "POST" })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()

  // Setup default successful state
  mockGetVerifiedUserId.mockResolvedValue("user_123")
  mockGetUserPlan.mockResolvedValue("free")
  mockCheckRateLimit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: 0, retryAfter: 0 })
  mockCheckVoiceLimit.mockResolvedValue({ allowed: true, usedSeconds: 0, limitSeconds: 100, remainingSeconds: 100 })
  mockGetLiveTransportSession.mockResolvedValue({
    ok: true,
    session: {
      wsUrl: "wss://missi.space/api/v1/voice-relay",
      modelPath: `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
      ttlSeconds: 300,
      relayTicket: "ticket-abc.sig-xyz",
    },
  })

  mockGetRequestContext.mockReturnValue({
    env: {
      MISSI_MEMORY: {
        get: async () => null,
        put: async () => {},
      },
    },
    ctx: {} as any,
    cf: {} as any,
  } as any)
})

describe("POST /api/v1/live-token", () => {
  it("returns 401 if user is not authorized", async () => {
    mockGetVerifiedUserId.mockRejectedValue(new Error("Unauthorized"))

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 429 if rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, limit: 10, remaining: 0, resetAt: 0, retryAfter: 60 })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toBe("Rate limit exceeded")
  })

  it("returns 429 if voice time limit is reached", async () => {
    mockCheckVoiceLimit.mockResolvedValue({ allowed: false, usedSeconds: 100, limitSeconds: 100, remainingSeconds: 0 })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toBe("Voice time limit reached for today. Upgrade your plan for more voice time.")
  })

  it("returns 503 if the voice quota service is unavailable", async () => {
    mockCheckVoiceLimit.mockResolvedValue({ allowed: false, usedSeconds: 0, limitSeconds: 100, remainingSeconds: 0, unavailable: true })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Service temporarily unavailable")
  })

  it("returns 503 when Vertex AI is not configured", async () => {
    mockGetLiveTransportSession.mockResolvedValue({ ok: false, reason: "not_configured" })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Live API backend not configured")
  })

  it("returns 200 with same-origin relay URL and ticket when Vertex AI is enabled", async () => {
    const response = await POST(makeReq())
    const body = await response.json()
    const setCookie = response.headers.get("set-cookie")

    expect(response.status).toBe(200)
    // C1 assertion: the wsUrl is a same-origin relay URL, never the raw Vertex URL
    expect(body.wsUrl).toBe("wss://missi.space/api/v1/voice-relay")
    expect(body.wsUrl).not.toMatch(/aiplatform\.googleapis\.com/)
    expect(body.wsUrl).not.toMatch(/access_token=/)
    expect(body.wsUrl).not.toMatch(/[?&]ticket=/)
    expect(body.modelPath).toBe(`projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`)
    expect(body.expiresAt).toBeDefined()
    expect(setCookie).toContain("__Secure-missi_live_ticket=ticket-abc.sig-xyz")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("SameSite=strict")
    expect(setCookie).toContain("Path=/api/v1/voice-relay")
    expect(setCookie).toContain("Secure")
  })

  it("returns the helper-provided direct Gemini Live websocket URL", async () => {
    mockGetLiveTransportSession.mockResolvedValue({
      ok: true,
      session: {
        wsUrl: "wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=test-token",
        modelPath: `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
        ttlSeconds: 3300,
      },
    })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toContain("aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent")
    expect(body.wsUrl).toContain("access_token=")
    expect(body.expiresAt).toBeDefined()
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("passes the resolved userId, request url, and model into the transport helper", async () => {
    await POST(makeReq())

    expect(mockGetLiveTransportSession).toHaveBeenCalledTimes(1)
    const [args] = mockGetLiveTransportSession.mock.calls[0]
    expect(args.userId).toBe("user_123")
    expect(args.requestUrl).toBe("https://missi.space/api/v1/live-token")
    expect(args.model).toBe(LIVE_MODEL)
  })

  it("returns 500 if the transport helper throws", async () => {
    mockGetLiveTransportSession.mockRejectedValue(new Error("KV secret missing"))

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal server error")
  })

  it("uses the correct rate limit tier for free plans", async () => {
    mockGetUserPlan.mockResolvedValue("free")

    await POST(makeReq())

    expect(mockCheckRateLimit).toHaveBeenCalledWith("user_123", "free", "ai")
  })

  it("uses the correct rate limit tier for paid plans", async () => {
    mockGetUserPlan.mockResolvedValue("pro")

    await POST(makeReq())

    expect(mockCheckRateLimit).toHaveBeenCalledWith("user_123", "paid", "ai")
  })

  it("returns 503 when KV is unavailable for non-pro users", async () => {
    mockGetRequestContext.mockImplementation(() => {
      throw new Error("No context")
    })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Service temporarily unavailable")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })

  it("returns 503 when MISSI_MEMORY is missing for non-pro users", async () => {
    mockGetRequestContext.mockReturnValue({ env: {} } as any)

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Service temporarily unavailable")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })

  it("allows pro users when KV is unavailable", async () => {
    mockGetUserPlan.mockResolvedValue("pro")
    mockGetRequestContext.mockImplementation(() => {
      throw new Error("No context")
    })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toContain("/api/v1/voice-relay")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })
})
