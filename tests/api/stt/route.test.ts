import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  getUserPlanMock,
  getCloudflareKVBindingMock,
  checkAndIncrementVoiceTimeMock,
  checkRateLimitMock,
  geminiSpeechToTextMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  checkAndIncrementVoiceTimeMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  geminiSpeechToTextMock: vi.fn(),
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
  checkAndIncrementVoiceTime: checkAndIncrementVoiceTimeMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ success: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), { status: 429 })),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "60" })),
}))

vi.mock("@/lib/ai/services/voice-service", () => ({
  geminiSpeechToText: geminiSpeechToTextMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
  logApiError: vi.fn(),
}))

import { POST } from "@/app/api/v1/stt/route"

function makeRequest(): NextRequest {
  const formData = new FormData()
  formData.set("audio", new File([new Uint8Array([1, 2, 3, 4])], "sample.wav", { type: "audio/wav" }))
  formData.set("voiceDurationMs", "4000")

  return new NextRequest("https://missi.space/api/v1/stt", {
    method: "POST",
    body: formData,
  })
}

describe("POST /api/v1/stt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getCloudflareKVBindingMock.mockReturnValue({} as never)
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: 123456, retryAfter: 60 })
    checkAndIncrementVoiceTimeMock.mockResolvedValue({ allowed: true, usedSeconds: 4, limitSeconds: 600, remainingSeconds: 596 })
  })

  it("returns 503 when the voice quota service is unavailable", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
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
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })
})
