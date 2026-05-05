import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  getUserPlanMock,
  getCloudflareKVBindingMock,
  checkAndIncrementVoiceTimeMock,
  checkRateLimitMock,
  geminiTextToSpeechMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  checkAndIncrementVoiceTimeMock: vi.fn(),
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
  checkAndIncrementVoiceTime: checkAndIncrementVoiceTimeMock,
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

vi.mock("@/lib/analytics/event-store", () => ({
  recordAnalyticsUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/server/platform/wait-until", () => ({
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}))

vi.mock("@/lib/server/observability/cost-tracker", () => ({
  COST_CONSTANTS: { TTS_COST_PER_CHAR: 0.000015 },
}))

import { POST } from "@/app/api/v1/tts/route"

function makeRequest(body?: object): NextRequest {
  return new NextRequest("https://missi.space/api/v1/tts", {
    method: "POST",
    body: JSON.stringify(body ?? { text: "Hello world" }),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/v1/tts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getCloudflareKVBindingMock.mockReturnValue({} as never)
    checkAndIncrementVoiceTimeMock.mockResolvedValue({ allowed: true, usedSeconds: 10, limitSeconds: 600, remainingSeconds: 590 })
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: 123456, retryAfter: 60 })
    geminiTextToSpeechMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
  })

  it("returns 401 for unauthenticated requests", async () => {
    const { AuthenticationError } = await import("@/lib/server/security/auth")
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationError())

    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
  })

  it("returns 503 when KV is unavailable for non-pro user outside development", async () => {
    getCloudflareKVBindingMock.mockReturnValue(null)
    // NODE_ENV is 'test' (not 'development'), so isDev = false → fail-closed
    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "SERVICE_UNAVAILABLE",
    })
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
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
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
  })

  it("returns 429 when daily voice quota is exhausted", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 600,
      limitSeconds: 600,
      remainingSeconds: 0,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(429)
    const json = await response.json()
    expect(json.code).toBe("USAGE_LIMIT_EXCEEDED")
    expect(json.upgrade).toBe("/pricing")
    expect(json.usedSeconds).toBe(600)
    expect(geminiTextToSpeechMock).not.toHaveBeenCalled()
  })

  it("debits quota and returns audio on successful TTS", async () => {
    const response = await POST(makeRequest({ text: "Hello world" }))

    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledOnce()
    expect(geminiTextToSpeechMock).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/wav")
  })

  it("debits quota only once even when the provider retries", async () => {
    geminiTextToSpeechMock
      .mockRejectedValueOnce(Object.assign(new Error("transient"), { status: 503 }))
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))

    const response = await POST(makeRequest({ text: "Hello world" }))

    // Quota debited exactly once, not once per retry attempt
    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledOnce()
    expect(geminiTextToSpeechMock).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
  })

  it("quota is consumed even when the provider ultimately fails (pessimistic pattern)", async () => {
    geminiTextToSpeechMock.mockRejectedValue(new Error("provider error"))

    const response = await POST(makeRequest({ text: "Hello world" }))

    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledOnce()
    expect(response.status).toBe(500)
  })

  it("skips quota check for pro users", async () => {
    getUserPlanMock.mockResolvedValue("pro")

    const response = await POST(makeRequest({ text: "Hello world" }))

    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })

  it("estimates quota duration from text length (15 chars/sec)", async () => {
    // 150 chars → ceil(150/15)*1000 = 10000 ms
    const text = "a".repeat(150)
    await POST(makeRequest({ text }))

    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledWith(
      expect.anything(), // kv
      "user_123",
      "free",
      10000
    )
  })

  it("applies minimum 3000 ms duration for very short text", async () => {
    // 10 chars → ceil(10/15)*1000 = 1000 ms, clamped to Math.max(3000,...) = 3000
    await POST(makeRequest({ text: "Hi there!" }))

    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_123",
      "free",
      3000
    )
  })

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("https://missi.space/api/v1/tts", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(req)

    expect(response.status).toBe(400)
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
  })
})
