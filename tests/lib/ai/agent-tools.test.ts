import { describe, it, expect, vi, beforeEach } from "vitest"
import { executeAgentTool, AgentToolCall } from "@/lib/ai/agent-tools"

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: vi.fn(),
  fetchCalendarContext: vi.fn(),
  getNotionTokens: vi.fn()
}))

vi.mock("@/lib/plugins/calendar-plugin", () => ({
  parseEventFromCommand: vi.fn(),
  createCalendarEvent: vi.fn()
}))

vi.mock("@/lib/memory/life-graph", () => ({
  searchLifeGraph: vi.fn(),
  formatLifeGraphForPrompt: vi.fn(),
  addOrUpdateNode: vi.fn(),
  getLifeGraph: vi.fn()
}))

vi.mock("@/lib/gamification/streak", () => ({
  getGamificationData: vi.fn()
}))

describe("Agent Tools", () => {
  const mockKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
  const ctx = { kv: mockKv as any, vectorizeEnv: null, userId: "user_1", apiKey: "test-key" }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("readCalendar returns error when Google tokens not present", async () => {
    const call: AgentToolCall = { name: "readCalendar", args: {} }

    // We mocked getGoogleTokens above but need to import it to mock its implementation
    const { getGoogleTokens } = await import("@/lib/plugins/data-fetcher")
    vi.mocked(getGoogleTokens).mockResolvedValueOnce(null)

    const res = await executeAgentTool(call, ctx)
    expect(res.status).toBe("error")
    expect(res.output).toContain("Google Calendar is not connected")
  })

  it("createCalendarEvent returns error when Google tokens not present", async () => {
    const call: AgentToolCall = { name: "createCalendarEvent", args: { title: "Test", dateTimeISO: "2024-01-01" } }

    const { getGoogleTokens } = await import("@/lib/plugins/data-fetcher")
    vi.mocked(getGoogleTokens).mockResolvedValueOnce(null)

    const res = await executeAgentTool(call, ctx)
    expect(res.status).toBe("error")
    expect(res.output).toContain("Google Calendar is not connected")
  })

  it("logExpense creates correct LifeNode structure", async () => {
    const call: AgentToolCall = { name: "logExpense", args: { amount: 100, category: "food", description: "Lunch" } }

    const { addOrUpdateNode } = await import("@/lib/memory/life-graph")

    const res = await executeAgentTool(call, ctx)

    expect(res.status).toBe("done")
    expect(addOrUpdateNode).toHaveBeenCalled()
    const callArgs = vi.mocked(addOrUpdateNode).mock.calls[0][3]
    expect(callArgs.category).toBe("event")
    expect(callArgs.tags).toContain("expense")
    expect(callArgs.tags).toContain("food")
  })

  it("updateGoalProgress finds and updates existing goal node", async () => {
    const call: AgentToolCall = { name: "updateGoalProgress", args: { goalTitle: "Get Fit", progressNote: "Ran 5k" } }

    const { getLifeGraph, addOrUpdateNode } = await import("@/lib/memory/life-graph")
    vi.mocked(getLifeGraph).mockResolvedValueOnce({
      nodes: [
        { id: "1", title: "Get Fit", category: "goal", detail: "Initial goal", tags: [], people: [], emotionalWeight: 0, confidence: 0, source: "explicit", createdAt: 0, updatedAt: 0, userId: "u", accessCount: 0, lastAccessedAt: 0 }
      ],
      totalInteractions: 0,
      lastUpdatedAt: 0,
      version: 1
    })

    const res = await executeAgentTool(call, ctx)

    expect(res.status).toBe("done")
    expect(addOrUpdateNode).toHaveBeenCalled()
    const callArgs = vi.mocked(addOrUpdateNode).mock.calls[0][3]
    expect(callArgs.title).toBe("Get Fit")
    expect(callArgs.detail).toContain("Ran 5k")
  })
})
