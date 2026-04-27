import { describe, it, expect, vi, beforeEach } from "vitest"
import type { KVStore } from "@/types"
import type { AgentPlan } from "@/lib/ai/agents/planner"

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-plan-id"),
}))

import { generateConfirmToken, storeConfirmToken, verifyAndConsumeToken } from "@/lib/ai/agents/confirm"

const MOCK_SECRET = "test-encryption-secret-32-chars!!"
const MOCK_USER_ID = "user_abc123"
const MOCK_PLAN: AgentPlan = {
  planId: "test-plan-id",
  steps: [
    {
      stepNumber: 1,
      toolName: "createCalendarEvent",
      description: "Create the event",
      isDestructive: true,
      estimatedDuration: "~2s",
      args: { title: "Meeting", dateTimeISO: "2026-04-16T15:00:00Z" },
    },
  ],
  summary: "Create a calendar event",
  requiresConfirmation: true,
  estimatedSteps: 1,
}

function makeMockKV(): KVStore & { _store: Map<string, string> } {
  const _store = new Map<string, string>()
  return {
    _store,
    get: vi.fn(async (key: string) => _store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { _store.set(key, value) }),
    delete: vi.fn(async (key: string) => { _store.delete(key) }),
  }
}

describe("generateConfirmToken", () => {
  it("returns a non-empty hex string", async () => {
    const token = await generateConfirmToken("planhash123", MOCK_USER_ID, MOCK_SECRET)
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
    expect(/^[0-9a-f]+$/.test(token)).toBe(true)
  })

  it("returns different tokens for different inputs (non-deterministic due to timestamp)", async () => {
    const t1 = await generateConfirmToken("hash1", "user1", MOCK_SECRET)
    // A small wait ensures the timestamp differs
    await new Promise(r => setTimeout(r, 2))
    const t2 = await generateConfirmToken("hash2", "user2", MOCK_SECRET)
    expect(t1).not.toBe(t2)
  })

  it("throws when the confirmation secret is missing", async () => {
    await expect(generateConfirmToken("planhash123", MOCK_USER_ID, "")).rejects.toThrow("MISSI_KV_ENCRYPTION_SECRET is required")
  })
})

describe("storeConfirmToken + verifyAndConsumeToken", () => {
  let mockKV: ReturnType<typeof makeMockKV>

  beforeEach(() => {
    vi.clearAllMocks()
    mockKV = makeMockKV()
  })

  it("round-trips correctly — stores plan and retrieves it", async () => {
    const token = await generateConfirmToken("hash", MOCK_USER_ID, MOCK_SECRET)
    await storeConfirmToken(mockKV, token, MOCK_PLAN, MOCK_USER_ID)

    const result = await verifyAndConsumeToken(mockKV, token, MOCK_USER_ID)

    expect(result).not.toBeNull()
    expect(result?.planId).toBe(MOCK_PLAN.planId)
    expect(result?.summary).toBe(MOCK_PLAN.summary)
    expect(result?.steps).toHaveLength(1)
  })

  it("returns null when token doesn't exist (expired or never issued)", async () => {
    const result = await verifyAndConsumeToken(mockKV, "nonexistent-token", MOCK_USER_ID)
    expect(result).toBeNull()
  })

  it("returns null when userId doesn't match (prevents cross-user replay)", async () => {
    const token = await generateConfirmToken("hash", MOCK_USER_ID, MOCK_SECRET)
    await storeConfirmToken(mockKV, token, MOCK_PLAN, MOCK_USER_ID)

    const result = await verifyAndConsumeToken(mockKV, token, "different-user-id")
    expect(result).toBeNull()
  })

  it("token is consumed (deleted) after successful verify — single-use", async () => {
    const token = await generateConfirmToken("hash", MOCK_USER_ID, MOCK_SECRET)
    await storeConfirmToken(mockKV, token, MOCK_PLAN, MOCK_USER_ID)

    // First verify — should succeed
    const first = await verifyAndConsumeToken(mockKV, token, MOCK_USER_ID)
    expect(first).not.toBeNull()

    // Second verify — token should be gone (consumed)
    const second = await verifyAndConsumeToken(mockKV, token, MOCK_USER_ID)
    expect(second).toBeNull()
  })

  it("kv.delete is called immediately on successful verify", async () => {
    const token = await generateConfirmToken("hash", MOCK_USER_ID, MOCK_SECRET)
    await storeConfirmToken(mockKV, token, MOCK_PLAN, MOCK_USER_ID)

    await verifyAndConsumeToken(mockKV, token, MOCK_USER_ID)

    expect(mockKV.delete).toHaveBeenCalledWith(`agent-confirm:${token}`)
  })
})
