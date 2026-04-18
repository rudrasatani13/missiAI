import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/v1/live-token/route"

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

vi.mock("@/lib/ai/vertex-client", () => ({
  getGeminiLiveWsUrl: vi.fn(),
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
import { getGeminiLiveWsUrl } from "@/lib/ai/vertex-client"

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockCheckVoiceLimit = vi.mocked(checkVoiceLimit)
const mockIsVertexAI = vi.mocked(isVertexAI)
const mockGetVertexProjectId = vi.mocked(getVertexProjectId)
const mockGetVertexLocation = vi.mocked(getVertexLocation)
const mockGetGeminiLiveWsUrl = vi.mocked(getGeminiLiveWsUrl)

const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

beforeEach(() => {
  vi.clearAllMocks()

  // Setup default successful state
  mockGetVerifiedUserId.mockResolvedValue("user_123")
  mockGetUserPlan.mockResolvedValue("free")
  mockCheckRateLimit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetAt: 0, retryAfter: 0 })
  mockCheckVoiceLimit.mockResolvedValue({ allowed: true, usedSeconds: 0, limitSeconds: 100, remainingSeconds: 100 })
  mockIsVertexAI.mockReturnValue(false)
  mockGetGeminiLiveWsUrl.mockResolvedValue("wss://gemini.test.com/ws")

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

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 429 if rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, limit: 10, remaining: 0, resetAt: 0, retryAfter: 60 })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toBe("Rate limit exceeded")
  })

  it("returns 429 if voice time limit is reached", async () => {
    mockCheckVoiceLimit.mockResolvedValue({ allowed: false, usedSeconds: 100, limitSeconds: 100, remainingSeconds: 0 })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toBe("Voice time limit reached for today. Upgrade your plan for more voice time.")
  })

  it("returns 200 and standard model path when Vertex AI is disabled", async () => {
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toBe("wss://gemini.test.com/ws")
    expect(body.modelPath).toBe(`models/${LIVE_MODEL}`)
    expect(body.expiresAt).toBeDefined()
  })

  it("returns 200 and Vertex AI model path when Vertex AI is enabled", async () => {
    mockIsVertexAI.mockReturnValue(true)
    mockGetVertexProjectId.mockReturnValue("test-project")
    mockGetVertexLocation.mockReturnValue("test-location")

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toBe("wss://gemini.test.com/ws")
    expect(body.modelPath).toBe(`projects/test-project/locations/test-location/publishers/google/models/${LIVE_MODEL}`)
    expect(body.expiresAt).toBeDefined()
  })

  it("returns 500 if an error occurs while generating the WebSocket URL", async () => {
    mockGetGeminiLiveWsUrl.mockRejectedValue(new Error("Failed to generate WS URL"))

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal server error")
  })

  it("uses the correct rate limit tier for free plans", async () => {
    mockGetUserPlan.mockResolvedValue("free")

    await POST()

    expect(mockCheckRateLimit).toHaveBeenCalledWith("user_123", "free", "ai")
  })

  it("uses the correct rate limit tier for paid plans", async () => {
    mockGetUserPlan.mockResolvedValue("pro")

    await POST()

    expect(mockCheckRateLimit).toHaveBeenCalledWith("user_123", "paid", "ai")
  })

  it("handles when getKV() returns null (RequestContext error)", async () => {
    // Force getCloudflareContext to throw an error so getKV returns null
    mockGetRequestContext.mockImplementation(() => {
      throw new Error("No context")
    })

    const response = await POST()
    const body = await response.json()

    // It should just skip the voice limit check and continue successfully
    expect(response.status).toBe(200)
    expect(body.wsUrl).toBe("wss://gemini.test.com/ws")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })

  it("handles when getKV() returns null (MISSI_MEMORY undefined)", async () => {
    mockGetRequestContext.mockReturnValue({
      env: {},
    } as any)

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.wsUrl).toBe("wss://gemini.test.com/ws")
    expect(mockCheckVoiceLimit).not.toHaveBeenCalled()
  })

  it("handles non-Error objects in catch block when generating WS URL fails", async () => {
    mockGetGeminiLiveWsUrl.mockRejectedValue("String error")

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe("Internal server error")
    expect(mockGetGeminiLiveWsUrl).toHaveBeenCalled()
  })
})
