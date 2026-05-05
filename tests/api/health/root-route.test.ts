import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const {
  checkProviderHealthMock,
  getProviderHealthSnapshotMock,
  getCloudflareKVBindingMock,
  getCloudflareD1BindingMock,
  getCloudflareVectorizeEnvMock,
  getCloudflareAtomicCounterBindingMock,
  envExistsMock,
  authMock,
  isAdminUserMock,
  checkRateLimitMock,
  rateLimitExceededResponseMock,
  logMock,
} = vi.hoisted(() => ({
  checkProviderHealthMock: vi.fn(),
  getProviderHealthSnapshotMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  getCloudflareD1BindingMock: vi.fn(),
  getCloudflareVectorizeEnvMock: vi.fn(),
  getCloudflareAtomicCounterBindingMock: vi.fn(),
  envExistsMock: vi.fn(),
  authMock: vi.fn(),
  isAdminUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  rateLimitExceededResponseMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/router", () => ({
  checkProviderHealth: checkProviderHealthMock,
  getProviderHealthSnapshot: getProviderHealthSnapshotMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
  getCloudflareD1Binding: getCloudflareD1BindingMock,
  getCloudflareVectorizeEnv: getCloudflareVectorizeEnvMock,
  getCloudflareAtomicCounterBinding: getCloudflareAtomicCounterBindingMock,
}))

vi.mock("@/lib/server/platform/env", () => ({
  envExists: envExistsMock,
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}))

vi.mock("@/lib/server/security/admin-auth", () => ({
  isAdminUser: isAdminUserMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: rateLimitExceededResponseMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  log: logMock,
}))

import { GET } from "@/app/api/v1/health/route"

const INTERNAL_TOKEN = "super-secret-health-token-32-chars"

function makeReq(path = "/api/v1/health", headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers })
}

function makeAuthorizedReq(path = "/api/v1/health"): NextRequest {
  return makeReq(path, { authorization: `Bearer ${INTERNAL_TOKEN}` })
}

const ALLOWED_RATE_RESULT = {
  allowed: true,
  remaining: 59,
  limit: 60,
  resetAt: Math.floor(Date.now() / 1000) + 60,
  retryAfter: 0,
}

describe("GET /api/v1/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_INTERNAL_TOKEN = INTERNAL_TOKEN
    getProviderHealthSnapshotMock.mockReturnValue({
      vertex: { healthy: true, latencyMs: 0, lastCheckedAt: 0 },
      openai: { healthy: true, latencyMs: 0, lastCheckedAt: 0 },
    })
    checkProviderHealthMock.mockResolvedValue({
      vertex: { healthy: true, latencyMs: 0, lastCheckedAt: Date.now() },
      openai: { healthy: true, latencyMs: 0, lastCheckedAt: Date.now() },
    })
    checkRateLimitMock.mockResolvedValue(ALLOWED_RATE_RESULT)
  })

  afterEach(() => {
    delete process.env.HEALTH_INTERNAL_TOKEN
  })

  // ─── Public minimal liveness ──────────────────────────────────────────────

  it("returns { ok: true } for a plain GET without deep or probe params — no infra probes run", async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(checkProviderHealthMock).not.toHaveBeenCalled()
    expect(authMock).not.toHaveBeenCalled()
    expect(checkRateLimitMock).not.toHaveBeenCalled()
  })

  // ─── Deep probe: unauthorized ─────────────────────────────────────────────

  it("returns 401 for ?deep=true with no token and unauthenticated Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null })
    isAdminUserMock.mockReturnValue(false)

    const res = await GET(makeReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "health.deep.unauthorized" }),
    )
  })

  it("returns 401 for ?probe=kv with authenticated but non-admin session", async () => {
    authMock.mockResolvedValue({ userId: "user_regular", sessionClaims: {} })
    isAdminUserMock.mockReturnValue(false)

    const res = await GET(makeReq("/api/v1/health?probe=kv"))
    expect(res.status).toBe(401)
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
  })

  it("returns 401 when an incorrect bearer token is supplied", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null })
    isAdminUserMock.mockReturnValue(false)

    const res = await GET(
      makeReq("/api/v1/health?deep=true", { authorization: "Bearer wrong-token" }),
    )
    expect(res.status).toBe(401)
  })

  // ─── Deep probe: internal token ───────────────────────────────────────────

  it("runs full checks for ?deep=true with valid internal token and returns detailed status", async () => {
    getCloudflareKVBindingMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null) })
    getCloudflareD1BindingMock.mockReturnValue({
      prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue(1) })),
    })
    getCloudflareVectorizeEnvMock.mockReturnValue({
      LIFE_GRAPH: { query: vi.fn().mockResolvedValue({ matches: [] }) },
    })
    getCloudflareAtomicCounterBindingMock.mockReturnValue({
      idFromName: vi.fn(() => ({})),
      get: vi.fn(() => ({
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }), { status: 200 }),
        ),
      })),
    })
    envExistsMock.mockReturnValue(true)

    const res = await GET(makeAuthorizedReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body.checks.kv.status).toBe("ok")
    expect(body.checks.d1.status).toBe("ok")
    expect(body.checks.durable_object.status).toBe("ok")
    expect(checkRateLimitMock).toHaveBeenCalledWith("__health_internal__", "free", "api")
    expect(authMock).not.toHaveBeenCalled()
  })

  // ─── Deep probe: admin Clerk session ─────────────────────────────────────

  it("runs full checks for ?deep=true with an admin Clerk session", async () => {
    delete process.env.HEALTH_INTERNAL_TOKEN
    authMock.mockResolvedValue({
      userId: "admin_user_1",
      sessionClaims: { metadata: { role: "admin" } },
    })
    isAdminUserMock.mockReturnValue(true)
    getCloudflareKVBindingMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null) })
    getCloudflareD1BindingMock.mockReturnValue({
      prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue(1) })),
    })
    getCloudflareVectorizeEnvMock.mockReturnValue({
      LIFE_GRAPH: { query: vi.fn().mockResolvedValue({ matches: [] }) },
    })
    getCloudflareAtomicCounterBindingMock.mockReturnValue({
      idFromName: vi.fn(() => ({})),
      get: vi.fn(() => ({
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }), { status: 200 }),
        ),
      })),
    })
    envExistsMock.mockReturnValue(false)

    const res = await GET(makeReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(checkRateLimitMock).toHaveBeenCalledWith("admin_user_1", "free", "api")
  })

  // ─── Rate limiting ────────────────────────────────────────────────────────

  it("returns rate-limit response when deep probe caller is rate-limited", async () => {
    const blockedResult = {
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfter: 60,
    }
    checkRateLimitMock.mockResolvedValue(blockedResult)
    rateLimitExceededResponseMock.mockReturnValue(
      Response.json({ error: "Rate limit exceeded" }, { status: 429 }),
    )

    const res = await GET(makeAuthorizedReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(429)
    expect(rateLimitExceededResponseMock).toHaveBeenCalledWith(blockedResult)
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "health.deep.rate_limited" }),
    )
    expect(getCloudflareKVBindingMock).not.toHaveBeenCalled()
  })

  // ─── Probe-specific behavior (requires auth) ──────────────────────────────

  it("runs opt-in deep probes for providers, vectorize, and the durable object", async () => {
    checkProviderHealthMock.mockResolvedValue({
      vertex: { healthy: true, latencyMs: 0, lastCheckedAt: Date.now() },
      openai: { healthy: true, latencyMs: 150, lastCheckedAt: Date.now() },
    })
    getCloudflareKVBindingMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null) })
    getCloudflareD1BindingMock.mockReturnValue({
      prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue(1) })),
    })
    const vectorizeQueryMock = vi.fn().mockResolvedValue({ matches: [], count: 0 })
    getCloudflareVectorizeEnvMock.mockReturnValue({ LIFE_GRAPH: { query: vectorizeQueryMock } })
    const durableFetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    )
    getCloudflareAtomicCounterBindingMock.mockReturnValue({
      idFromName: vi.fn(() => ({})),
      get: vi.fn(() => ({ fetch: durableFetchMock })),
    })
    envExistsMock.mockReturnValue(true)

    const res = await GET(makeAuthorizedReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body.checks.durable_object.status).toBe("ok")
    expect(body.checks.vertex.status).toBe("ok")
    expect(body.checks.openai.status).toBe("ok")
    expect(checkProviderHealthMock).toHaveBeenCalledWith({ forceOpenAIProbe: true })
    expect(durableFetchMock).toHaveBeenCalledTimes(1)
  })

  it("still probes providers when OpenAI is not configured so Vertex health is live", async () => {
    checkProviderHealthMock.mockResolvedValue({
      vertex: { healthy: true, latencyMs: 20, lastCheckedAt: Date.now() },
      openai: { healthy: true, latencyMs: 0, lastCheckedAt: 0 },
    })
    getCloudflareKVBindingMock.mockReturnValue(null)
    getCloudflareD1BindingMock.mockReturnValue(null)
    getCloudflareVectorizeEnvMock.mockReturnValue(null)
    getCloudflareAtomicCounterBindingMock.mockReturnValue(null)
    envExistsMock.mockReturnValue(false)

    const res = await GET(makeAuthorizedReq("/api/v1/health?probe=providers"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.vertex.status).toBe("ok")
    expect(body.checks.openai.status).toBe("not_configured")
    expect(checkProviderHealthMock).toHaveBeenCalledWith({ forceOpenAIProbe: false })
  })

  it("handles provider health probe failures gracefully", async () => {
    checkProviderHealthMock.mockRejectedValue(new Error("Probe failed"))
    getCloudflareKVBindingMock.mockReturnValue(null)
    getCloudflareD1BindingMock.mockReturnValue(null)
    getCloudflareVectorizeEnvMock.mockReturnValue(null)
    getCloudflareAtomicCounterBindingMock.mockReturnValue(null)
    envExistsMock.mockReturnValue(true)

    const res = await GET(makeAuthorizedReq("/api/v1/health?probe=providers"))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe("degraded")
    expect(body.checks.vertex.status).toBe("degraded")
    expect(body.checks.openai.status).toBe("degraded")
  })
})
