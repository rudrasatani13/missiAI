import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "@/app/api/v1/live-token/route"

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// C1 pre-launch audit: these tests were rewritten after we replaced the
// direct Vertex WebSocket URL + GCP OAuth token with a same-origin relay
// URL + HMAC-signed ticket. We no longer mock `getGeminiLiveWsUrl` because
// the route no longer calls it — the real GCP token stays on the server.

vi.mock("@/lib/server/auth", () => ({
  getVerifiedUserId: vi.fn(),
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn(),
}))

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })),
}))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkVoiceLimit: vi.fn(),
}))

vi.mock("@/lib/ai/vertex-auth", () => ({
  isVertexAI: vi.fn(),
  getVertexProjectId: vi.fn(),
  getVertexLocation: vi.fn(),
}))

vi.mock("@/lib/ai/live-ticket", () => ({
  issueLiveTicket: vi.fn(),
  LIVE_TICKET_TTL_SECONDS: 300,
}))

vi.mock("@/lib/server/env", () => ({
  getEnv: vi.fn(),
}))

vi.mock("@/lib/server/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

// Import the mocked functions so we can modify their return values in tests
import { getVerifiedUserId } from "@/lib/server/auth"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkRateLimit } from "@/lib/rateLimiter"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { checkVoiceLimit } from "@/lib/billing/usage-tracker"
import { isVertexAI, getVertexProjectId, getVertexLocation } from "@/lib/ai/vertex-auth"
import { issueLiveTicket } from "@/lib/ai/live-ticket"
import { getEnv } from "@/lib/server/env"

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockCheckVoiceLimit = vi.mocked(checkVoiceLimit)
const mockIsVertexAI = vi.mocked(isVertexAI)
const mockGetVertexProjectId = vi.mocked(getVertexProjectId)
const mockGetVertexLocation = vi.mocked(getVertexLocation)
const mockIssueLiveTicket = vi.mocked(issueLiveTicket)
const mockGetEnv = vi.mocked(getEnv)

const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

function makeReq(): NextRequest {
  return new NextRequest("https://missi.space/api/v1/live-token", { method: "POST" })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Setup default successful state
  mockGetVerifiedUserId.mockResolvedValue("user_123")
  mockGetUserPlan.mockResolvedValue("free")
  mockCheckRateLimit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: 0, retryAfter: 0 })
  mockCheckVoiceLimit.mockResolvedValue({ allowed: true, usedSeconds: 0, limitSeconds: 100, remainingSeconds: 100 })
  mockIsVertexAI.mockReturnValue(true)
  mockGetVertexProjectId.mockReturnValue("test-project")
  mockGetVertexLocation.mockReturnValue("us-central1")
  mockIssueLiveTicket.mockResolvedValue("ticket-abc.sig-xyz")
  mockGetEnv.mockReturnValue({
    APP_URL: "https://missi.space",
    // Only the fields the route actually reads need to exist here.
  } as any)

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

  it("returns 503 when Vertex AI is not configured", async () => {
    mockIsVertexAI.mockReturnValue(false)

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Live API backend not configured")
  })

  it("returns 200 with same-origin relay URL and ticket when Vertex AI is enabled", async () => {
    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(200)
    // C1 assertion: the wsUrl is a same-origin relay URL, never the raw Vertex URL
    expect(body.wsUrl).toBe("wss://missi.space/api/v1/voice-relay?ticket=ticket-abc.sig-xyz")
    expect(body.wsUrl).not.toMatch(/aiplatform\.googleapis\.com/)
    expect(body.wsUrl).not.toMatch(/access_token=/)
    expect(body.modelPath).toBe(`projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`)
    expect(body.expiresAt).toBeDefined()
  })

  it("passes the resolved userId and modelPath into the ticket", async () => {
    await POST(makeReq())

    expect(mockIssueLiveTicket).toHaveBeenCalledTimes(1)
    const [, opts] = mockIssueLiveTicket.mock.calls[0]
    expect(opts.userId).toBe("user_123")
    expect(opts.modelPath).toBe(
      `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
    )
  })

  it("returns 500 if the ticket issuer throws", async () => {
    mockIssueLiveTicket.mockRejectedValue(new Error("KV secret missing"))

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

  it("skips the voice limit check when KV is unavailable", async () => {
    mockGetRequestContext.mockImplementation(() => {
      throw new Error("No context")
    })

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toContain("/api/v1/voice-relay")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })

  it("skips the voice limit check when MISSI_MEMORY is missing", async () => {
    mockGetRequestContext.mockReturnValue({ env: {} } as any)

    const response = await POST(makeReq())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toContain("/api/v1/voice-relay")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })
})
