import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendPushNotification } from "../../../lib/push/edge-web-push"

describe("edge-web-push", () => {
  const mockSubscription = {
    endpoint: "https://example.com/push",
    keys: {
      p256dh: "mock-p256dh",
      auth: "mock-auth",
    },
  }

  const mockPayload = { title: "Test", body: "Test body" }
  const mockPubKey = "mock-pub-key"
  // A valid P-256 base64url private key for testing
  const mockPrivKey = "9xK6jCqPzCxg5Q7j-g-XlqZ9Xv5BqX_Y-1rQ7ZpY6w4"

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should return success when push service returns 201", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 })
    )

    const result = await sendPushNotification(
      mockSubscription,
      mockPayload,
      mockPubKey,
      mockPrivKey
    )

    expect(result).toEqual({ success: true, statusCode: 201 })
    expect(fetchSpy).toHaveBeenCalledWith(
      mockSubscription.endpoint,
      expect.objectContaining({
        method: "POST",
      })
    )
  })

  it("should return success false and 410 when subscription expired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 410 })
    )

    const result = await sendPushNotification(
      mockSubscription,
      mockPayload,
      mockPubKey,
      mockPrivKey
    )

    expect(result).toEqual({ success: false, statusCode: 410, error: "Subscription expired" })
  })

  it("should return success false and generic error when push service returns 400", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 400 })
    )

    const result = await sendPushNotification(
      mockSubscription,
      mockPayload,
      mockPubKey,
      mockPrivKey
    )

    expect(result).toEqual({ success: false, statusCode: 400, error: "Push service returned 400" })
  })

  it("should return success false when fetch throws an error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Error"))

    const result = await sendPushNotification(
      mockSubscription,
      mockPayload,
      mockPubKey,
      mockPrivKey
    )

    expect(result).toEqual({ success: false, error: "Push failed: Network Error" })
  })
})
