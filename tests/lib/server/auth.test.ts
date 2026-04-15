import { describe, it, expect, vi, beforeEach } from "vitest"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

describe("lib/server/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getVerifiedUserId", () => {
    it("returns userId when authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })

      const userId = await getVerifiedUserId()

      expect(userId).toBe("user_123")
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })

    it("throws AuthenticationError when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      await expect(getVerifiedUserId()).rejects.toThrow(AuthenticationError)
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })
  })

  describe("AuthenticationError", () => {
    it("has correct properties", () => {
      const error = new AuthenticationError()

      expect(error.message).toBe("Unauthorized")
      expect(error.name).toBe("AuthenticationError")
      expect(error.status).toBe(401)
    })
  })

  describe("unauthorizedResponse", () => {
    it("returns a 401 response with correct body and headers", async () => {
      const response = unauthorizedResponse()

      expect(response.status).toBe(401)
      expect(response.headers.get("Content-Type")).toBe("application/json")

      const body = await response.json()
      expect(body).toEqual({
        success: false,
        error: "Unauthorized",
        code: "UNAUTHORIZED"
      })
    })
  })
})
