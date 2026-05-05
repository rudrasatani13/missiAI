import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"

const {
  getChatKVMock,
  getChatVectorizeEnvMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  getUserPlanMock,
  checkAndIncrementVoiceTimeMock,
  checkHardBudgetMock,
} = vi.hoisted(() => ({
  getChatKVMock: vi.fn(),
  getChatVectorizeEnvMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  rateLimitExceededResponseMock: vi.fn(
    () => new Response(
      JSON.stringify({ success: false, error: "Rate limited", code: "RATE_LIMITED" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    ),
  ),
  getUserPlanMock: vi.fn(),
  checkAndIncrementVoiceTimeMock: vi.fn(),
  checkHardBudgetMock: vi.fn(async () => ({ allowed: true, spendUsd: 0, budgetUsd: 5.0 })),
}))

vi.mock("@/lib/server/observability/cost-tracker", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/observability/cost-tracker")>("@/lib/server/observability/cost-tracker")
  return {
    ...actual,
    checkHardBudget: checkHardBudgetMock,
  }
})

vi.mock("@/lib/server/chat/shared", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/chat/shared")>("@/lib/server/chat/shared")
  return {
    ...actual,
    getChatKV: getChatKVMock,
    getChatVectorizeEnv: getChatVectorizeEnvMock,
    CHAT_REQUEST_MAX_BODY_BYTES: 1024,
  }
})

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

import { runChatRoutePreflight } from "@/lib/server/chat/route-preflight"

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
  return new Request("http://localhost/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("runChatRoutePreflight", () => {
  let kv: KVStore

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()

    getUserPlanMock.mockResolvedValue("free")
    getChatKVMock.mockReturnValue(kv)
    getChatVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: {} })
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

  it("returns 413 when the payload exceeds the request limit", async () => {
    const result = await runChatRoutePreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }, {
      "content-length": "1025",
    }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("payload_too_large")
    expect(result.response.status).toBe(413)
  })

  it("blocks free users when KV is unavailable", async () => {
    getChatKVMock.mockReturnValueOnce(null)

    const result = await runChatRoutePreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("kv_unavailable")
    expect(result.response.status).toBe(503)
  })

  it("returns the shared rate-limit response when throttled", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 123456,
      retryAfter: 60,
    })

    const result = await runChatRoutePreflight(makeRequest({ messages: [{ role: "user", content: "hi" }] }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("rate_limited")
    expect(result.response.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalledTimes(1)
    expect(checkAndIncrementVoiceTimeMock).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid JSON", async () => {
    const result = await runChatRoutePreflight(makeRequest("{"), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("invalid_json")
    expect(result.response.status).toBe(400)
  })

  it("returns a validation response for invalid chat payloads", async () => {
    const result = await runChatRoutePreflight(makeRequest({ messages: [] }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("validation")
    expect(result.response.status).toBe(400)
  })

  it("does not charge voice quota when no voice duration is present", async () => {
    const result = await runChatRoutePreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
    }), "user_123")

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

    const result = await runChatRoutePreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 4000,
    }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("voice_quota_unavailable")
    expect(result.response.status).toBe(503)
    await expect(result.response.json()).resolves.toEqual({
      success: false,
      error: "Service temporarily unavailable — please try again",
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

    const result = await runChatRoutePreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 4000,
    }), "user_123")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected preflight failure")
    expect(result.kind).toBe("voice_limit")
    expect(result.response.status).toBe(429)
    await expect(result.response.json()).resolves.toEqual({
      success: false,
      error: "Daily voice limit reached",
      code: "USAGE_LIMIT_EXCEEDED",
      upgrade: "/pricing",
      usedSeconds: 600,
      limitSeconds: 600,
    })
  })

  it("returns typed preflight data on success", async () => {
    const result = await runChatRoutePreflight(makeRequest({
      messages: [{ role: "user", content: "hello" }],
      voiceMode: false,
      voiceDurationMs: 250,
    }), "user_123")

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected preflight success")
    expect(result.data.input.personality).toBe("assistant")
    expect(result.data.kv).toBe(kv)
    expect(result.data.vectorizeEnv).toEqual({ LIFE_GRAPH: {} })
    expect(result.data.input.voiceDurationMs).toBe(3000)
    expect(checkRateLimitMock).toHaveBeenCalledWith("user_123", "free", "ai")
    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledWith(kv, "user_123", "free", 3000)
  })
})
