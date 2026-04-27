import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  getUserPlanMock,
  getCloudflareKVBindingMock,
  checkVoiceLimitMock,
  checkRateLimitMock,
  geminiTextToSpeechMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  checkVoiceLimitMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  geminiTextToSpeechMock: vi.fn(),
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: class AuthenticationError extends Error {},
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkVoiceLimit: checkVoiceLimitMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ success: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), { status: 429 })),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "60" })),
}))

vi.mock("@/lib/ai/services/voice-service", () => ({
  geminiTextToSpeech: geminiTextToSpeechMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
  logApiError: vi.fn(),
}))

import { POST } from "@/app/api/v1/tts/route"

function makeRequest(): NextRequest {
  return new NextRequest("https://missi.space/api/v1/tts", { method: "POST" })
}

describe("POST /api/v1/tts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getCloudflareKVBindingMock.mockReturnValue({} as never)
    checkVoiceLimitMock.mockResolvedValue({ allowed: true, usedSeconds: 0, limitSeconds: 600, remainingSeconds: 600 })
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: 123456, retryAfter: 60 })
  })

  it("returns 503 when the voice quota service is unavailable", async () => {
    checkVoiceLimitMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 0,
      limitSeconds: 600,
      remainingSeconds: 0,
      unavailable: true,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
    })
    expect(checkRateLimitMock).not.toHaveBeenCalled()
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
  })
})
