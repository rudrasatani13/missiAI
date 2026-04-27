import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  getCloudflareContextMock,
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  getUserPlanMock,
  checkAndIncrementVoiceTimeMock,
  awardXPMock,
  waitUntilMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    readonly status = 401

    constructor() {
      super("Unauthorized")
      this.name = "AuthenticationError"
    }
  }

  return {
    getCloudflareContextMock: vi.fn(),
    getVerifiedUserIdMock: vi.fn(),
    unauthorizedResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    ),
    checkRateLimitMock: vi.fn(),
    rateLimitExceededResponseMock: vi.fn(
      () => new Response(
        JSON.stringify({ success: false, error: "Rate limited", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    ),
    getUserPlanMock: vi.fn(),
    checkAndIncrementVoiceTimeMock: vi.fn(),
    awardXPMock: vi.fn(async () => {}),
    waitUntilMock: vi.fn((promise: Promise<unknown>) => {
      void promise
    }),
    AuthenticationErrorMock,
  }
})

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock("@/lib/server/security/rate-limiter", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/security/rate-limiter")>("@/lib/server/security/rate-limiter")
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
    rateLimitExceededResponse: rateLimitExceededResponseMock,
  }
})

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkAndIncrementVoiceTime: checkAndIncrementVoiceTimeMock,
}))

vi.mock("@/lib/gamification/xp-engine", () => ({
  awardXP: awardXPMock,
}))

vi.mock("@/lib/server/platform/wait-until", () => ({
  waitUntil: waitUntilMock,
}))

import { runChatStreamPreflight } from "@/lib/server/chat/stream-preflight"

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/chat-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("runChatStreamPreflight", () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getCloudflareContextMock.mockReturnValue({
      env: {
        MISSI_MEMORY: kv,
      },
    } as any)
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })
    checkAndIncrementVoiceTimeMock.mockResolvedValue({
      allowed: true,
      usedSeconds: 3,
      limitSeconds: 600,
      remainingSeconds: 597,
    })
  })

  it("returns unauthorized when auth fails", async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const result = await runChatStreamPreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalledTimes(1)
  })

  it("blocks non-pro requests when KV is unavailable outside development", async () => {
    getCloudflareContextMock.mockReturnValueOnce({ env: {} } as any)

    const result = await runChatStreamPreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(503)
  })

  it("returns the rate-limit response when the user is throttled", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const result = await runChatStreamPreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalledTimes(1)
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
  })

  it("normalizes voice duration and charges voice quota even when EDITH mode is off", async () => {
    const result = await runChatStreamPreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 250,
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected preflight success")
    expect(result.data.userId).toBe("user_123")
    expect(result.data.planId).toBe("free")
    expect(result.data.input.personality).toBe("assistant")
    expect(result.data.input.voiceDurationMs).toBe(3000)
    expect(checkRateLimitMock).toHaveBeenCalledWith("user_123", "free", "ai")
    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledWith(kv, "user_123", "free", 3000)
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
  })

  it("does not charge voice quota for non-voice requests", async () => {
    const result = await runChatStreamPreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected preflight success")
    expect(result.data.input.voiceDurationMs).toBeUndefined()
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
  })

  it("returns 503 when the voice quota service is unavailable", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 0,
      limitSeconds: 600,
      remainingSeconds: 0,
      unavailable: true,
    })

    const result = await runChatStreamPreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 4000,
    }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(503)
    const body = await result.response.json() as {
      success: boolean
      error: string
      code: string
    }
    expect(body).toEqual({
      success: false,
      error: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
    })
  })

  it("returns 429 when the daily voice quota is exhausted", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 600,
      limitSeconds: 600,
      remainingSeconds: 0,
    })

    const result = await runChatStreamPreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 4000,
    }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(429)
    const body = await result.response.json() as {
      success: boolean
      error: string
      code: string
      usedSeconds: number
      limitSeconds: number
    }
    expect(body).toEqual({
      success: false,
      error: "Daily voice limit reached",
      code: "USAGE_LIMIT_EXCEEDED",
      usedSeconds: 600,
      limitSeconds: 600,
    })
  })

  it("returns 400 on invalid JSON", async () => {
    const result = await runChatStreamPreflight(makeRequest("{"))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.response.status).toBe(400)
  })
})
