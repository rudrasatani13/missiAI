import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getVertexLiveRelayRequestMock,
} = vi.hoisted(() => ({
  getVertexLiveRelayRequestMock: vi.fn(),
}))

vi.mock("@/lib/ai/live/vertex", () => ({
  getVertexLiveRelayRequest: getVertexLiveRelayRequestMock,
}))

import { openLiveWsUpstream } from "../../workers/live/upstream"

describe("live-ws-upstream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns not configured when the provider helper reports that state", async () => {
    getVertexLiveRelayRequestMock.mockResolvedValue({ ok: false, reason: "not_configured" })

    await expect(openLiveWsUpstream()).resolves.toEqual({
      ok: false,
      status: 500,
      code: "NOT_CONFIGURED",
      message: "Vertex AI backend not configured",
    })
  })

  it("returns auth failed when upstream credentials are unavailable", async () => {
    getVertexLiveRelayRequestMock.mockResolvedValue({ ok: false, reason: "auth_failed" })

    await expect(openLiveWsUpstream()).resolves.toEqual({
      ok: false,
      status: 503,
      code: "UPSTREAM_AUTH_FAILED",
      message: "Unable to obtain upstream credentials",
    })
  })

  it("returns unreachable when fetch throws", async () => {
    getVertexLiveRelayRequestMock.mockResolvedValue({
      ok: true,
      upstreamUrl: "https://example.com/ws",
      headers: {
        Upgrade: "websocket",
        Authorization: "Bearer test-token",
      },
    })
    vi.mocked(fetch).mockRejectedValue(new Error("boom"))

    await expect(openLiveWsUpstream()).resolves.toEqual({
      ok: false,
      status: 502,
      code: "UPSTREAM_UNREACHABLE",
      message: "Upstream unavailable",
    })
  })

  it("returns no websocket when the upstream response does not upgrade", async () => {
    getVertexLiveRelayRequestMock.mockResolvedValue({
      ok: true,
      upstreamUrl: "https://example.com/ws",
      headers: {
        Upgrade: "websocket",
        Authorization: "Bearer test-token",
      },
    })
    vi.mocked(fetch).mockResolvedValue(new Response(null))

    await expect(openLiveWsUpstream()).resolves.toEqual({
      ok: false,
      status: 502,
      code: "UPSTREAM_NO_WEBSOCKET",
      message: "Upstream did not upgrade to WebSocket",
    })
  })

  it("returns the accepted upstream websocket on success", async () => {
    const upstreamWs = {
      accept: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
    }
    const upstreamRes = new Response(null) as Response & { webSocket?: typeof upstreamWs }
    upstreamRes.webSocket = upstreamWs

    getVertexLiveRelayRequestMock.mockResolvedValue({
      ok: true,
      upstreamUrl: "https://example.com/ws",
      headers: {
        Upgrade: "websocket",
        Authorization: "Bearer test-token",
      },
    })
    vi.mocked(fetch).mockResolvedValue(upstreamRes)

    const result = await openLiveWsUpstream()

    expect(result).toEqual({ ok: true, upstreamWs })
    expect(upstreamWs.accept).toHaveBeenCalledTimes(1)
  })
})
