import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getEnvMock,
  verifyLiveTicketMock,
  openLiveWsUpstreamMock,
} = vi.hoisted(() => ({
  getEnvMock: vi.fn(),
  verifyLiveTicketMock: vi.fn(),
  openLiveWsUpstreamMock: vi.fn(),
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/ai/live/ticket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/live/ticket")>("@/lib/ai/live/ticket")
  return {
    ...actual,
    verifyLiveTicket: verifyLiveTicketMock,
  }
})

vi.mock("../../workers/live/upstream", () => ({
  openLiveWsUpstream: openLiveWsUpstreamMock,
}))

import { handleLiveWs } from "../../workers/live/handler"

describe("live-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEnvMock.mockReturnValue({ MISSI_KV_ENCRYPTION_SECRET: "x".repeat(32) })
    verifyLiveTicketMock.mockResolvedValue({ valid: false, reason: "signature" })
    openLiveWsUpstreamMock.mockResolvedValue({
      ok: false,
      status: 503,
      code: "UPSTREAM_AUTH_FAILED",
      message: "Unable to obtain upstream credentials",
    })
  })

  it("rejects websocket requests that only provide the ticket in the query string", async () => {
    const response = await handleLiveWs(
      new Request("https://missi.space/api/v1/voice-relay?ticket=query-ticket", {
        headers: { upgrade: "websocket" },
      }),
      {},
      {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "MISSING_TICKET",
    })
    expect(verifyLiveTicketMock).not.toHaveBeenCalled()
  })

  it("verifies the relay ticket from the secure cookie", async () => {
    const response = await handleLiveWs(
      new Request("https://missi.space/api/v1/voice-relay", {
        headers: {
          upgrade: "websocket",
          cookie: "foo=bar; __Secure-missi_live_ticket=ticket-abc.sig-xyz",
        },
      }),
      {},
      {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    )

    expect(verifyLiveTicketMock).toHaveBeenCalledWith(
      { MISSI_KV_ENCRYPTION_SECRET: "x".repeat(32) },
      "ticket-abc.sig-xyz",
    )
    expect(openLiveWsUpstreamMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "INVALID_TICKET",
    })
  })

  it("opens the upstream only after a valid secure-cookie ticket is verified", async () => {
    verifyLiveTicketMock.mockResolvedValue({
      valid: true,
      payload: {
        userId: "user_123",
        modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
        expiresAt: Date.now() + 60_000,
      },
    })

    const response = await handleLiveWs(
      new Request("https://missi.space/api/v1/voice-relay", {
        headers: {
          upgrade: "websocket",
          cookie: "__Secure-missi_live_ticket=ticket-abc.sig-xyz",
        },
      }),
      {},
      {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    )

    expect(openLiveWsUpstreamMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "UPSTREAM_AUTH_FAILED",
    })
  })
})
