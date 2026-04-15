import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateConfirmToken, storeConfirmToken, verifyAndConsumeToken } from "@/lib/ai/agent-confirm"

// We use vitest env for crypto natively in Node >= 18/20 which supports global crypto.subtle

describe("Agent Confirm", () => {
  const mockKv = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("generateConfirmToken returns a non-empty string", async () => {
    const token = await generateConfirmToken("plan-123", "user_abc", "secret")
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
  })

  it("storeConfirmToken and verifyAndConsumeToken round-trip correctly", async () => {
    const token = "mock-token"
    const plan = { steps: [], summary: "Test plan", requiresConfirmation: true, estimatedSteps: 0, planId: "p1" }

    mockKv.get.mockResolvedValueOnce(JSON.stringify({ plan, userId: "user_abc", createdAt: Date.now() }))

    const verified = await verifyAndConsumeToken(mockKv as any, token, "user_abc")

    expect(verified).not.toBeNull()
    expect(verified?.summary).toBe("Test plan")
    expect(mockKv.delete).toHaveBeenCalledWith(`agent-confirm:${token}`)
  })

  it("verifyAndConsumeToken returns null for wrong userId", async () => {
    const token = "mock-token"
    const plan = { steps: [], summary: "Test plan", requiresConfirmation: true, estimatedSteps: 0, planId: "p1" }

    mockKv.get.mockResolvedValueOnce(JSON.stringify({ plan, userId: "user_abc", createdAt: Date.now() }))

    const verified = await verifyAndConsumeToken(mockKv as any, token, "user_wrong")

    expect(verified).toBeNull()
  })

  it("verifyAndConsumeToken returns null for missing token", async () => {
    mockKv.get.mockResolvedValueOnce(null)

    const verified = await verifyAndConsumeToken(mockKv as any, "missing-token", "user_abc")

    expect(verified).toBeNull()
  })
})
