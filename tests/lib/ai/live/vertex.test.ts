import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getVertexAccessTokenMock,
  getVertexLocationMock,
  getVertexProjectIdMock,
  isVertexAIMock,
} = vi.hoisted(() => ({
  getVertexAccessTokenMock: vi.fn(),
  getVertexLocationMock: vi.fn(),
  getVertexProjectIdMock: vi.fn(),
  isVertexAIMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/vertex-auth", () => ({
  getVertexAccessToken: getVertexAccessTokenMock,
  getVertexLocation: getVertexLocationMock,
  getVertexProjectId: getVertexProjectIdMock,
  isVertexAI: isVertexAIMock,
}))

import {
  buildVertexLiveDirectWsUrl,
  buildVertexLiveRelayUpstreamUrl,
  getVertexLiveDirectWsUrl,
  getVertexLiveRelayRequest,
  getVertexLiveRuntimeConfig,
} from "@/lib/ai/live/vertex"

describe("live-vertex", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isVertexAIMock.mockReturnValue(true)
    getVertexAccessTokenMock.mockResolvedValue("test-token")
    getVertexLocationMock.mockReturnValue("us-central1")
    getVertexProjectIdMock.mockReturnValue("test-project")
  })

  describe("getVertexLiveRuntimeConfig", () => {
    it("returns the live model path and location when Vertex is enabled", () => {
      expect(getVertexLiveRuntimeConfig("gemini-live-2.5-flash-native-audio")).toEqual({
        location: "us-central1",
        modelPath: "projects/test-project/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
      })
    })

    it("returns null when Vertex is not configured", () => {
      isVertexAIMock.mockReturnValue(false)

      expect(getVertexLiveRuntimeConfig("gemini-live-2.5-flash-native-audio")).toBeNull()
    })
  })

  describe("buildVertexLiveDirectWsUrl", () => {
    it("builds the direct Vertex websocket URL", () => {
      expect(buildVertexLiveDirectWsUrl("us-central1", "test-token")).toBe(
        "wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=test-token",
      )
    })
  })

  describe("buildVertexLiveRelayUpstreamUrl", () => {
    it("builds the relay upstream URL", () => {
      expect(buildVertexLiveRelayUpstreamUrl("us-central1")).toBe(
        "https://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent",
      )
    })
  })

  describe("getVertexLiveRelayRequest", () => {
    it("returns the relay upstream request when auth is available", async () => {
      await expect(getVertexLiveRelayRequest()).resolves.toEqual({
        ok: true,
        upstreamUrl: "https://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent",
        headers: {
          Upgrade: "websocket",
          Authorization: "Bearer test-token",
        },
      })
    })

    it("returns not_configured when Vertex is disabled", async () => {
      isVertexAIMock.mockReturnValue(false)

      await expect(getVertexLiveRelayRequest()).resolves.toEqual({
        ok: false,
        reason: "not_configured",
      })
    })

    it("returns auth_failed when the access token is unavailable", async () => {
      getVertexAccessTokenMock.mockResolvedValue(null)

      await expect(getVertexLiveRelayRequest()).resolves.toEqual({
        ok: false,
        reason: "auth_failed",
      })
    })
  })

  describe("getVertexLiveDirectWsUrl", () => {
    it("returns the direct live URL using the configured token and location", async () => {
      await expect(getVertexLiveDirectWsUrl()).resolves.toBe(
        "wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=test-token",
      )
    })

    it("throws when Vertex AI is not configured", async () => {
      isVertexAIMock.mockReturnValue(false)

      await expect(getVertexLiveDirectWsUrl()).rejects.toThrow(
        "Only Vertex AI backend is supported for Live API",
      )
    })

    it("throws when the access token is unavailable", async () => {
      getVertexAccessTokenMock.mockResolvedValue(null)

      await expect(getVertexLiveDirectWsUrl()).rejects.toThrow(
        "Failed to obtain Vertex AI access token for Live API",
      )
    })
  })
})
