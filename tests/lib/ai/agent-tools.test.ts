import { describe, it, expect, vi, beforeEach } from "vitest"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { ToolContext } from "@/lib/ai/agent-tools"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: vi.fn(),
  saveGoogleTokens: vi.fn(),
  getNotionTokens: vi.fn(),
}))

vi.mock("@/lib/plugins/calendar-plugin", () => ({
  createCalendarEvent: vi.fn(),
}))

vi.mock("@/lib/memory/life-graph", () => ({
  addOrUpdateNode: vi.fn(),
  getLifeGraph: vi.fn(),
  searchLifeGraph: vi.fn(),
  formatLifeGraphForPrompt: vi.fn(),
}))

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "mock-id"),
}))

import { executeAgentTool } from "@/lib/ai/agent-tools"
import { getGoogleTokens, getNotionTokens } from "@/lib/plugins/data-fetcher"
import { createCalendarEvent as gcalCreateEvent } from "@/lib/plugins/calendar-plugin"
import { addOrUpdateNode, getLifeGraph, searchLifeGraph } from "@/lib/memory/life-graph"

const mockGetGoogleTokens = vi.mocked(getGoogleTokens)
const mockGetNotionTokens = vi.mocked(getNotionTokens)
const mockGcalCreate = vi.mocked(gcalCreateEvent)
const mockAddOrUpdateNode = vi.mocked(addOrUpdateNode)
const mockGetLifeGraph = vi.mocked(getLifeGraph)
const mockSearchLifeGraph = vi.mocked(searchLifeGraph)

function makeMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

function makeCtx(kvOverride?: KVStore | null): ToolContext {
  return {
    kv: kvOverride !== undefined ? kvOverride : makeMockKV(),
    vectorizeEnv: null,
    userId: "user_test123",
    apiKey: "test-api-key",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
  }
}

describe("executeAgentTool — readCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns error when Google tokens are not present", async () => {
    mockGetGoogleTokens.mockResolvedValueOnce(null)

    const result = await executeAgentTool({ name: "readCalendar", args: {} }, makeCtx())

    expect(result.status).toBe("error")
    expect(result.output).toContain("not connected")
  })

  it("returns error when KV is null", async () => {
    const result = await executeAgentTool({ name: "readCalendar", args: {} }, makeCtx(null))

    expect(result.status).toBe("error")
  })

  it("returns calendar events on success", async () => {
    mockGetGoogleTokens.mockResolvedValueOnce({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      expiresAt: Date.now() + 3_600_000,
    })

    const mockCalResponse = {
      items: [
        { summary: "Team Meeting", start: { dateTime: "2026-04-16T10:00:00Z" } },
        { summary: "Lunch", start: { dateTime: "2026-04-16T12:00:00Z" } },
      ],
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(mockCalResponse), { status: 200 })))

    const result = await executeAgentTool({ name: "readCalendar", args: { hoursAhead: 24 } }, makeCtx())

    expect(result.status).toBe("done")
    expect(result.output).toContain("Team Meeting")
    expect(result.output).toContain("Lunch")
  })
})

describe("executeAgentTool — createCalendarEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns error when Google tokens are not present", async () => {
    mockGetGoogleTokens.mockResolvedValueOnce(null)

    const result = await executeAgentTool({
      name: "createCalendarEvent",
      args: { title: "Meeting", dateTimeISO: "2026-04-16T15:00:00Z" },
    }, makeCtx())

    expect(result.status).toBe("error")
    expect(result.output).toContain("not connected")
  })

  it("returns error when KV is null", async () => {
    const result = await executeAgentTool({
      name: "createCalendarEvent",
      args: { title: "Meeting", dateTimeISO: "2026-04-16T15:00:00Z" },
    }, makeCtx(null))

    expect(result.status).toBe("error")
  })

  it("creates event and returns success with URL", async () => {
    mockGetGoogleTokens.mockResolvedValueOnce({
      accessToken: "test-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
    })
    mockGcalCreate.mockResolvedValueOnce({ success: true, url: "https://calendar.google.com/event/123", output: "Created", pluginId: "google_calendar", action: "create_event", executedAt: Date.now() })

    const result = await executeAgentTool({
      name: "createCalendarEvent",
      args: { title: "Team Meeting", dateTimeISO: "2026-04-16T15:00:00Z", durationMinutes: 60 },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(result.output).toContain("https://calendar.google.com/event/123")
  })
})

describe("executeAgentTool — logExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddOrUpdateNode.mockResolvedValue({
      id: "node-123",
      userId: "user_test123",
      category: "event",
      title: "Expense: lunch",
      detail: "Amount: 350 INR on 2026-04-15. Category: food.",
      tags: ["expense", "food", "inr"],
      people: [],
      emotionalWeight: 0.2,
      confidence: 0.9,
      source: "explicit",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: 0,
    })
  })

  it("creates a LifeNode with correct structure", async () => {
    const result = await executeAgentTool({
      name: "logExpense",
      args: { amount: 350, currency: "INR", category: "food", description: "lunch", date: "2026-04-15" },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(mockAddOrUpdateNode).toHaveBeenCalledOnce()

    const nodeArg = mockAddOrUpdateNode.mock.calls[0][3]
    expect(nodeArg.category).toBe("event")
    expect(nodeArg.title).toBe("Expense: lunch")
    expect(nodeArg.tags).toContain("expense")
    expect(nodeArg.tags).toContain("food")
    expect(nodeArg.source).toBe("explicit")
  })

  it("updates monthly KV total with correct TTL", async () => {
    const mockKV = makeMockKV()
    const ctx = makeCtx(mockKV)

    await executeAgentTool({
      name: "logExpense",
      args: { amount: 500, currency: "INR", category: "transport", description: "taxi", date: "2026-04-15" },
    }, ctx)

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining("expense:total:user_test123:2026-04"),
      expect.any(String),
      expect.objectContaining({ expirationTtl: 35 * 86_400 }),
    )

    // Verify the stored value has the correct total
    const storedKey = `expense:total:user_test123:2026-04`
    const storedRaw = await mockKV.get(storedKey)
    expect(storedRaw).not.toBeNull()
    const stored = JSON.parse(storedRaw!)
    expect(stored.total).toBe(500)
    expect(stored.byCategory.transport).toBe(500)
  })

  it("returns error for zero/invalid amount", async () => {
    const result = await executeAgentTool({
      name: "logExpense",
      args: { amount: 0, category: "food", description: "something" },
    }, makeCtx())

    expect(result.status).toBe("error")
  })

  it("defaults to 'other' category for unknown categories", async () => {
    await executeAgentTool({
      name: "logExpense",
      args: { amount: 100, category: "invalidCategory", description: "misc" },
    }, makeCtx())

    const nodeArg = mockAddOrUpdateNode.mock.calls[0][3]
    expect(nodeArg.tags).toContain("other")
  })
})

describe("executeAgentTool — getWeekSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a formatted summary even with no data (new user)", async () => {
    mockGetLifeGraph.mockResolvedValueOnce({
      nodes: [],
      totalInteractions: 0,
      lastUpdatedAt: Date.now(),
      version: 1,
    })

    const mockKV = makeMockKV()
    // gamification key returns null
    vi.mocked(mockKV.get).mockResolvedValue(null)

    const result = await executeAgentTool({ name: "getWeekSummary", args: {} }, makeCtx(mockKV))

    expect(result.status).toBe("done")
    expect(typeof result.output).toBe("string")
    expect(result.output.length).toBeGreaterThan(0)
    expect(result.output).toContain("Week Summary")
  })

  it("includes goal count when goals exist", async () => {
    mockGetLifeGraph.mockResolvedValueOnce({
      nodes: [
        { id: "g1", userId: "user_test123", category: "goal", title: "Learn Spanish", detail: "", tags: [], people: [], emotionalWeight: 0.5, confidence: 0.7, source: "explicit", createdAt: 0, updatedAt: 0, accessCount: 0, lastAccessedAt: 0 },
        { id: "g2", userId: "user_test123", category: "goal", title: "Run 5k", detail: "", tags: [], people: [], emotionalWeight: 0.6, confidence: 0.8, source: "explicit", createdAt: 0, updatedAt: 0, accessCount: 0, lastAccessedAt: 0 },
      ],
      totalInteractions: 10,
      lastUpdatedAt: Date.now(),
      version: 1,
    })

    const mockKV = makeMockKV()
    vi.mocked(mockKV.get).mockResolvedValue(null)

    const result = await executeAgentTool({ name: "getWeekSummary", args: {} }, makeCtx(mockKV))

    expect(result.status).toBe("done")
    expect(result.output).toContain("Learn Spanish")
  })
})

describe("executeAgentTool — updateGoalProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddOrUpdateNode.mockResolvedValue({
      id: "goal-node-1",
      userId: "user_test123",
      category: "goal",
      title: "Learn Spanish",
      detail: "Progress noted",
      tags: ["goal"],
      people: [],
      emotionalWeight: 0.6,
      confidence: 0.75,
      source: "explicit",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: 0,
    })
  })

  it("finds and updates an existing goal node", async () => {
    mockSearchLifeGraph.mockResolvedValueOnce([
      {
        node: {
          id: "goal-node-1",
          userId: "user_test123",
          category: "goal",
          title: "Learn Spanish",
          detail: "Started learning",
          tags: ["goal"],
          people: [],
          emotionalWeight: 0.6,
          confidence: 0.7,
          source: "explicit",
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
          accessCount: 2,
          lastAccessedAt: Date.now() - 86400000,
        },
        score: 0.95,
        reason: "title match",
      },
    ])

    const result = await executeAgentTool({
      name: "updateGoalProgress",
      args: { goalTitle: "Learn Spanish", progressNote: "Completed lesson 5" },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(result.summary).toContain("Learn Spanish")
    expect(mockAddOrUpdateNode).toHaveBeenCalledOnce()

    const nodeArg = mockAddOrUpdateNode.mock.calls[0][3]
    expect(nodeArg.detail).toContain("Completed lesson 5")
    // Confidence should increase by 0.05
    expect(nodeArg.confidence).toBeCloseTo(0.75)
  })

  it("creates a new goal node when the goal is not found", async () => {
    mockSearchLifeGraph.mockResolvedValueOnce([])

    const result = await executeAgentTool({
      name: "updateGoalProgress",
      args: { goalTitle: "New Goal", progressNote: "Started today" },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(mockAddOrUpdateNode).toHaveBeenCalledOnce()

    const nodeArg = mockAddOrUpdateNode.mock.calls[0][3]
    expect(nodeArg.category).toBe("goal")
    expect(nodeArg.title).toBe("New Goal")
    expect(nodeArg.detail).toContain("Started today")
  })
})

describe("executeAgentTool — draftEmail", () => {
  it("returns formatted draft without making any API calls", async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal("fetch", mockFetch)

    const result = await executeAgentTool({
      name: "draftEmail",
      args: { to: "rahul@example.com", subject: "Meeting tomorrow", body: "Hi Rahul, let's meet tomorrow at 3pm." },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(result.output).toContain("To: rahul@example.com")
    expect(result.output).toContain("Subject: Meeting tomorrow")
    expect(result.output).toContain("Hi Rahul")
    // Ensure no external calls were made
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("executeAgentTool — searchWeb", () => {
  it("returns SEARCH: prefix signal without making API calls", async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal("fetch", mockFetch)

    const result = await executeAgentTool({
      name: "searchWeb",
      args: { query: "current weather in Mumbai" },
    }, makeCtx())

    expect(result.status).toBe("done")
    expect(result.output).toBe("SEARCH:current weather in Mumbai")
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
