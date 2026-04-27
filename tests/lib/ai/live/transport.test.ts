import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getEnvMock,
  issueLiveTicketMock,
  getVertexLiveDirectWsUrlMock,
  getVertexLiveRuntimeConfigMock,
} = vi.hoisted(() => ({
  getEnvMock: vi.fn(),
  issueLiveTicketMock: vi.fn(),
  getVertexLiveDirectWsUrlMock: vi.fn(),
  getVertexLiveRuntimeConfigMock: vi.fn(),
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/ai/live/ticket", () => ({
  issueLiveTicket: issueLiveTicketMock,
  LIVE_TICKET_TTL_SECONDS: 300,
}))

vi.mock("@/lib/ai/live/vertex", () => ({
  getVertexLiveDirectWsUrl: getVertexLiveDirectWsUrlMock,
  getVertexLiveRuntimeConfig: getVertexLiveRuntimeConfigMock,
}))

import { getLiveTransportSession } from "@/lib/ai/live/transport"

describe("live-transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEnvMock.mockReturnValue({ MISSI_KV_ENCRYPTION_SECRET: "x".repeat(32) })
    getVertexLiveRuntimeConfigMock.mockReturnValue({
      location: "us-central1",
      modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
    })
    getVertexLiveDirectWsUrlMock.mockResolvedValue(
      "wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=test-token",
    )
    issueLiveTicketMock.mockResolvedValue("ticket-abc.sig-xyz")
  })

  it("returns not_configured when the live runtime config is unavailable", async () => {
    getVertexLiveRuntimeConfigMock.mockReturnValue(null)

    await expect(
      getLiveTransportSession({
        userId: "user_123",
        requestUrl: "https://missi.space/api/v1/live-token",
        nodeEnv: "production",
        model: "gemini-live-2.5-flash-native-audio",
      }),
    ).resolves.toEqual({ ok: false, reason: "not_configured" })
  })

  it("returns the direct live websocket session for localhost development", async () => {
    await expect(
      getLiveTransportSession({
        userId: "user_123",
        requestUrl: "http://localhost:3000/api/v1/live-token",
        nodeEnv: "development",
        model: "gemini-live-2.5-flash-native-audio",
      }),
    ).resolves.toEqual({
      ok: true,
      session: {
        wsUrl: "wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=test-token",
        modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
        ttlSeconds: 3300,
      },
    })

    expect(issueLiveTicketMock).not.toHaveBeenCalled()
    expect(getEnvMock).not.toHaveBeenCalled()
  })

  it("returns the same-origin relay session for deployed environments", async () => {
    await expect(
      getLiveTransportSession({
        userId: "user_123",
        requestUrl: "https://missi.space/api/v1/live-token",
        nodeEnv: "production",
        model: "gemini-live-2.5-flash-native-audio",
      }),
    ).resolves.toEqual({
      ok: true,
      session: {
        wsUrl: "wss://missi.space/api/v1/voice-relay",
        modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
        ttlSeconds: 300,
        relayTicket: "ticket-abc.sig-xyz",
      },
    })

    expect(getEnvMock).toHaveBeenCalledTimes(1)
    expect(issueLiveTicketMock).toHaveBeenCalledWith(
      { MISSI_KV_ENCRYPTION_SECRET: "x".repeat(32) },
      {
        userId: "user_123",
        modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
      },
    )
  })
})
