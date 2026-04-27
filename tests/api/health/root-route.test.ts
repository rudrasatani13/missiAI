import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const {
  checkProviderHealthMock,
  getProviderHealthSnapshotMock,
  getCloudflareKVBindingMock,
  getCloudflareD1BindingMock,
  getCloudflareVectorizeEnvMock,
  getCloudflareAtomicCounterBindingMock,
  envExistsMock,
} = vi.hoisted(() => ({
  checkProviderHealthMock: vi.fn(),
  getProviderHealthSnapshotMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  getCloudflareD1BindingMock: vi.fn(),
  getCloudflareVectorizeEnvMock: vi.fn(),
  getCloudflareAtomicCounterBindingMock: vi.fn(),
  envExistsMock: vi.fn(),
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

import { GET } from "@/app/api/v1/health/route"

function makeReq(path = "/api/v1/health"): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

describe("GET /api/v1/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderHealthSnapshotMock.mockReturnValue({
      vertex: { healthy: true, latencyMs: 0, lastCheckedAt: 0 },
      openai: { healthy: true, latencyMs: 0, lastCheckedAt: 0 },
    })
  })

  it("returns a cheap default readiness response without live provider or durable-object probes", async () => {
    getCloudflareKVBindingMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    })

    getCloudflareD1BindingMock.mockReturnValue({
      prepare: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(1),
      })),
    })

    const vectorizeQueryMock = vi.fn().mockResolvedValue({ matches: [], count: 0 })

    getCloudflareVectorizeEnvMock.mockReturnValue({
      LIFE_GRAPH: {
        query: vectorizeQueryMock,
      },
    })

    const durableFetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    )

    getCloudflareAtomicCounterBindingMock.mockReturnValue({
      idFromName: vi.fn(() => ({})),
      get: vi.fn(() => ({
        fetch: durableFetchMock,
      })),
    })

    envExistsMock.mockReturnValue(true)

    const res = await GET(makeReq())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body.checks.kv.status).toBe("ok")
    expect(body.checks.d1.status).toBe("ok")
    expect(body.checks.vectorize.status).toBe("skipped")
    expect(body.checks.durable_object.status).toBe("skipped")
    expect(body.checks.vertex.status).toBe("skipped")
    expect(body.checks.openai.status).toBe("skipped")
    expect(body.latencyMs).toBeGreaterThanOrEqual(0)

    expect(checkProviderHealthMock).not.toHaveBeenCalled()
    expect(durableFetchMock).not.toHaveBeenCalled()
    expect(vectorizeQueryMock).not.toHaveBeenCalled()
  })

  it("runs opt-in deep probes for providers, vectorize, and the durable object", async () => {
    checkProviderHealthMock.mockResolvedValue({
      vertex: { healthy: true, latencyMs: 0, lastCheckedAt: Date.now() },
      openai: { healthy: true, latencyMs: 150, lastCheckedAt: Date.now() },
    })

    getCloudflareKVBindingMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    })
    getCloudflareD1BindingMock.mockReturnValue({
      prepare: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(1),
      })),
    })
    const vectorizeQueryMock = vi.fn().mockResolvedValue({ matches: [], count: 0 })
    getCloudflareVectorizeEnvMock.mockReturnValue({
      LIFE_GRAPH: {
        query: vectorizeQueryMock,
      },
    })
    const durableFetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    )
    getCloudflareAtomicCounterBindingMock.mockReturnValue({
      idFromName: vi.fn(() => ({})),
      get: vi.fn(() => ({
        fetch: durableFetchMock,
      })),
    })
    envExistsMock.mockReturnValue(true)

    const res = await GET(makeReq("/api/v1/health?deep=true"))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body.checks.vectorize.status).toBe("ok")
    expect(body.checks.durable_object.status).toBe("ok")
    expect(body.checks.vertex.status).toBe("ok")
    expect(body.checks.openai.status).toBe("ok")

    expect(checkProviderHealthMock).toHaveBeenCalledWith({ forceOpenAIProbe: true })
    expect(durableFetchMock).toHaveBeenCalledTimes(1)
    expect(vectorizeQueryMock).toHaveBeenCalledTimes(1)
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

    const res = await GET(makeReq("/api/v1/health?probe=providers"))
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

    const res = await GET(makeReq("/api/v1/health?probe=providers"))
    expect(res.status).toBe(503)

    const body = await res.json()
    expect(body.status).toBe("degraded")
    expect(body.checks.vertex.status).toBe("degraded")
    expect(body.checks.openai.status).toBe("degraded")
  })
})
