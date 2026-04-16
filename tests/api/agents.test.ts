import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@cloudflare/next-on-pages", () => ({
  getRequestContext: vi.fn(),
}))

vi.mock("@/lib/server/auth", () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() { super("Unauthorized"); this.name = "AuthenticationError" }
  },
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn().mockResolvedValue("free"),
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  getTodayDate: vi.fn().mockReturnValue("2026-04-15"),
}))

vi.mock("@/lib/server/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  }),
}))

vi.mock("@/lib/memory/life-graph", () => ({
  searchLifeGraph: vi.fn().mockResolvedValue([]),
  formatLifeGraphForPrompt: vi.fn().mockReturnValue(""),
  getLifeGraph: vi.fn().mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/ai/agent-planner", () => ({
  buildAgentPlan: vi.fn(),
  DESTRUCTIVE_TOOLS: new Set(["createCalendarEvent", "createNote", "draftEmail"]),
}))

vi.mock("@/lib/ai/agent-confirm", () => ({
  generateConfirmToken: vi.fn().mockResolvedValue("mock-token-abc"),
  storeConfirmToken: vi.fn().mockResolvedValue(undefined),
  verifyAndConsumeToken: vi.fn(),
}))

vi.mock("@/lib/ai/agent-history", () => ({
  getAgentHistory: vi.fn().mockResolvedValue([]),
  saveAgentHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/ai/agent-tools", () => ({
  executeAgentTool: vi.fn(),
  AGENT_FUNCTION_DECLARATIONS: [
    { name: "searchMemory" }, { name: "createCalendarEvent" },
  ],
}))

vi.mock("@/lib/gamification/xp-engine", () => ({
  awardXP: vi.fn().mockResolvedValue(2),
}))

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("mock-nanoid-id"),
}))

import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { buildAgentPlan } from "@/lib/ai/agent-planner"
import { verifyAndConsumeToken } from "@/lib/ai/agent-confirm"
import { getAgentHistory } from "@/lib/ai/agent-history"
import { executeAgentTool } from "@/lib/ai/agent-tools"

import { POST as planPost } from "@/app/api/v1/agents/plan/route"
import { POST as confirmPost } from "@/app/api/v1/agents/confirm/route"
import { GET as historyGet } from "@/app/api/v1/agents/history/route"
import { GET as expensesGet } from "@/app/api/v1/agents/expenses/route"

const mockGetRequestContext = vi.mocked(getRequestContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockBuildAgentPlan = vi.mocked(buildAgentPlan)
const mockVerifyAndConsumeToken = vi.mocked(verifyAndConsumeToken)
const mockGetAgentHistory = vi.mocked(getAgentHistory)
const mockExecuteAgentTool = vi.mocked(executeAgentTool)

function makeMockKV(store: Map<string, string> = new Map()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

function setupMockContext(kv = makeMockKV()) {
  mockGetRequestContext.mockReturnValue({
    env: { MISSI_MEMORY: kv },
    ctx: {} as unknown,
    cf: {} as unknown,
  } as ReturnType<typeof getRequestContext>)
  return kv
}

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/v1/agents/plan", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const READ_ONLY_PLAN = {
  planId: "plan-readonly",
  steps: [{ stepNumber: 1, toolName: "searchMemory", description: "Search memory", isDestructive: false, estimatedDuration: "~1s", args: {} }],
  summary: "Search your memory",
  requiresConfirmation: false,
  estimatedSteps: 1,
}

const DESTRUCTIVE_PLAN = {
  planId: "plan-destructive",
  steps: [{ stepNumber: 1, toolName: "createCalendarEvent", description: "Create event", isDestructive: true, estimatedDuration: "~2s", args: {} }],
  summary: "Create a calendar event",
  requiresConfirmation: true,
  estimatedSteps: 1,
}

// ─── POST /api/v1/agents/plan ─────────────────────────────────────────────────

describe("POST /api/v1/agents/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MISSI_KV_ENCRYPTION_SECRET = "test-secret-32-chars-long!!!!!"
    mockGetVerifiedUserId.mockResolvedValue("user_test")
    setupMockContext()
  })

  it("returns 401 without a Clerk session", async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())
    const res = await planPost(makeRequest({ message: "do something" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 if message exceeds 500 chars", async () => {
    const res = await planPost(makeRequest({ message: "x".repeat(501) }))
    expect(res.status).toBe(400)
  })

  it("returns 400 if message is empty", async () => {
    const res = await planPost(makeRequest({ message: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 429 if rate limit exceeded (free=10/day)", async () => {
    const kv = makeMockKV(new Map([["ratelimit:agent-exec:user_test:2026-04-15", "10"]]))
    setupMockContext(kv)

    const res = await planPost(makeRequest({ message: "do something" }))
    expect(res.status).toBe(429)
  })

  it("returns plan with confirmToken for a destructive plan", async () => {
    mockBuildAgentPlan.mockResolvedValueOnce(DESTRUCTIVE_PLAN)

    const res = await planPost(makeRequest({ message: "schedule a meeting" }))
    const body = await res.json() as { plan: unknown; confirmToken: string | null; requiresConfirmation: boolean }

    expect(res.status).toBe(200)
    expect(body.requiresConfirmation).toBe(true)
    expect(body.confirmToken).toBe("mock-token-abc")
  })

  it("returns plan with confirmToken even for a read-only plan", async () => {
    mockBuildAgentPlan.mockResolvedValueOnce(READ_ONLY_PLAN)

    const res = await planPost(makeRequest({ message: "what's on my calendar?" }))
    const body = await res.json() as { plan: unknown; confirmToken: string | null; requiresConfirmation: boolean }

    expect(res.status).toBe(200)
    expect(body.requiresConfirmation).toBe(false)
    // Token is always issued for plans with steps so the confirm route never receives null
    expect(body.confirmToken).toBe("mock-token-abc")
  })
})

// ─── POST /api/v1/agents/confirm ─────────────────────────────────────────────

describe("POST /api/v1/agents/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerifiedUserId.mockResolvedValue("user_test")
    setupMockContext()
  })

  it("returns 401 without a Clerk session", async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())
    const res = await confirmPost(makeRequest({ confirmToken: "tok", approved: true }))
    expect(res.status).toBe(401)
  })

  it("returns 400 with invalid/expired token", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(null)
    const res = await confirmPost(makeRequest({ confirmToken: "invalid", approved: true }))
    expect(res.status).toBe(400)
  })

  it("returns { status: 'cancelled' } when approved is false — no tools executed", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(DESTRUCTIVE_PLAN)
    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: false }))
    const body = await res.json() as { status: string }

    expect(res.status).toBe(200)
    expect(body.status).toBe("cancelled")
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
  })

  it("streams SSE events when approved is true", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(READ_ONLY_PLAN)
    mockExecuteAgentTool.mockResolvedValueOnce({
      toolName: "searchMemory",
      status: "done",
      summary: "Found 0 memories",
      output: "No memories",
    })

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")

    // Read the full stream
    const text = await res.text()
    expect(text).toContain('"type":"step_start"')
    expect(text).toContain('"type":"step_done"')
    expect(text).toContain('"type":"complete"')
  })

  it("returns 400 with mismatched userId (verifyAndConsumeToken returns null)", async () => {
    // verifyAndConsumeToken returns null when userId doesn't match
    mockVerifyAndConsumeToken.mockResolvedValueOnce(null)
    const res = await confirmPost(makeRequest({ confirmToken: "tok-other-user", approved: true }))
    expect(res.status).toBe(400)
  })

  it("skips tools not in the hardcoded TOOL_ALLOWLIST", async () => {
    const planWithUnknownTool = {
      planId: "plan-unknown",
      steps: [{ stepNumber: 1, toolName: "injectedMaliciousTool", description: "Bad tool", isDestructive: false, estimatedDuration: "~1s", args: {} }],
      summary: "Do bad stuff",
      requiresConfirmation: false,
      estimatedSteps: 1,
    }
    mockVerifyAndConsumeToken.mockResolvedValueOnce(planWithUnknownTool)

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))
    expect(res.status).toBe(200)
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
  })
})

// ─── GET /api/v1/agents/history ───────────────────────────────────────────────

describe("GET /api/v1/agents/history", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerifiedUserId.mockResolvedValue("user_test")
    setupMockContext()
  })

  it("returns 401 without a Clerk session", async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())
    const res = await historyGet()
    expect(res.status).toBe(401)
  })

  it("returns array of history entries", async () => {
    const mockEntries = [
      { id: "h1", date: "2026-04-15T10:00:00Z", userMessage: "schedule a meeting", planSummary: "Create event", stepsCompleted: 1, stepsTotal: 1, status: "completed" as const },
    ]
    mockGetAgentHistory.mockResolvedValueOnce(mockEntries)

    const res = await historyGet()
    const body = await res.json() as { entries: unknown[] }

    expect(res.status).toBe(200)
    expect(body.entries).toHaveLength(1)
    expect((body.entries[0] as { id: string }).id).toBe("h1")
  })
})

// ─── GET /api/v1/agents/expenses ─────────────────────────────────────────────

describe("GET /api/v1/agents/expenses", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerifiedUserId.mockResolvedValue("user_test")
    setupMockContext()
  })

  it("returns 401 without a Clerk session", async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())
    const res = await expensesGet()
    expect(res.status).toBe(401)
  })

  it("returns zero totals for a new user with no expenses", async () => {
    const res = await expensesGet()
    const body = await res.json() as { monthlyTotal: number; currency: string; byCategory: Record<string, number>; recentEntries: unknown[] }

    expect(res.status).toBe(200)
    expect(body.monthlyTotal).toBe(0)
    expect(body.currency).toBe("INR")
    expect(body.recentEntries).toEqual([])
  })

  it("returns expense totals from KV when present", async () => {
    const kv = makeMockKV(new Map([
      [
        `expense:total:user_test:${new Date().toISOString().slice(0, 7)}`,
        JSON.stringify({ total: 1200, byCategory: { food: 700, transport: 500 } }),
      ],
    ]))
    setupMockContext(kv)

    const res = await expensesGet()
    const body = await res.json() as { monthlyTotal: number; byCategory: Record<string, number> }

    expect(res.status).toBe(200)
    expect(body.monthlyTotal).toBe(1200)
    expect(body.byCategory.food).toBe(700)
    expect(body.byCategory.transport).toBe(500)
  })
})
