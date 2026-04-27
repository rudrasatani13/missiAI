import { describe, expect, it } from "vitest"
import {
  LIVE_MODEL,
  LOCAL_LIVE_DIRECT_TTL_SECONDS,
  buildLiveModelPath,
  buildLiveRelayWsUrl,
  buildLiveTokenSuccessResponse,
  isLocalLiveDevelopmentRequest,
} from "@/lib/ai/live/runtime"

describe("live-runtime", () => {
  describe("buildLiveModelPath", () => {
    it("builds the default live model path", () => {
      expect(buildLiveModelPath("test-project", "us-central1")).toBe(
        `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
      )
    })
  })

  describe("isLocalLiveDevelopmentRequest", () => {
    it("returns true for localhost requests outside production", () => {
      expect(
        isLocalLiveDevelopmentRequest("http://localhost:3000/api/v1/live-token", "development"),
      ).toBe(true)
      expect(
        isLocalLiveDevelopmentRequest("http://127.0.0.1:3000/api/v1/live-token", "test"),
      ).toBe(true)
    })

    it("returns false for non-local hosts or production", () => {
      expect(
        isLocalLiveDevelopmentRequest("https://missi.space/api/v1/live-token", "development"),
      ).toBe(false)
      expect(
        isLocalLiveDevelopmentRequest("http://localhost:3000/api/v1/live-token", "production"),
      ).toBe(false)
    })
  })

  describe("buildLiveRelayWsUrl", () => {
    it("builds a same-origin relay websocket URL", () => {
      expect(
        buildLiveRelayWsUrl("https://missi.space/api/v1/live-token"),
      ).toBe("wss://missi.space/api/v1/voice-relay")
    })
  })

  describe("buildLiveTokenSuccessResponse", () => {
    it("returns the shared success payload shape with expiry", () => {
      const response = buildLiveTokenSuccessResponse({
        wsUrl: "wss://missi.space/api/v1/voice-relay",
        modelPath: `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
        ttlSeconds: LOCAL_LIVE_DIRECT_TTL_SECONDS,
        nowMs: 0,
      })

      expect(response).toEqual({
        success: true,
        wsUrl: "wss://missi.space/api/v1/voice-relay",
        modelPath: `projects/test-project/locations/us-central1/publishers/google/models/${LIVE_MODEL}`,
        expiresAt: new Date(LOCAL_LIVE_DIRECT_TTL_SECONDS * 1000).toISOString(),
      })
    })
  })
})
