import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock("@/lib/server/security/auth", () => ({
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

vi.mock("@/lib/server/platform/atomic-quota", () => ({
  checkAndIncrementAtomicCounter: vi.fn(),
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    MISSI_KV_ENCRYPTION_SECRET: "test-secret-32-chars-long!!!!!",
  }),
}))

vi.mock("@/lib/memory/life-graph", () => ({
  searchLifeGraph: vi.fn().mockResolvedValue([]),
  formatLifeGraphForPrompt: vi.fn().mockReturnValue(""),
  getLifeGraph: vi.fn().mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }),
  getLifeGraphReadSnapshot: vi.fn().mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/ai/agents/planner", () => ({
  buildAgentPlan: vi.fn(),
  DESTRUCTIVE_TOOLS: new Set(["createCalendarEvent", "createNote", "draftEmail"]),
}))

vi.mock("@/lib/ai/agents/confirm", () => ({
  generateConfirmToken: vi.fn().mockResolvedValue("mock-token-abc"),
  storeConfirmToken: vi.fn().mockResolvedValue(undefined),
  verifyAndConsumeToken: vi.fn(),
}))

vi.mock("@/lib/ai/agents/history", () => ({
  getAgentHistory: vi.fn().mockResolvedValue([]),
  saveAgentHistory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/ai/agents/tools/dispatcher", () => ({
  executeAgentTool: vi.fn(),
  AGENT_FUNCTION_DECLARATIONS: [
    { name: "searchMemory" }, { name: "createCalendarEvent" },
  ],
}))

vi.mock("@/lib/gamification/xp-engine", () => ({
  awardXP: vi.fn().mockResolvedValue(2),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("nanoid", () => ({
  nanoid: vi.fn().mockReturnValue("mock-nanoid-id"),
}))

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { buildAgentPlan } from "@/lib/ai/agents/planner"
import { verifyAndConsumeToken } from "@/lib/ai/agents/confirm"
import { getAgentHistory, saveAgentHistory } from "@/lib/ai/agents/history"
import { executeAgentTool } from "@/lib/ai/agents/tools/dispatcher"
import { logRequest, logError } from "@/lib/server/observability/logger"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { buildBudgetMonthLinkRecord, putBudgetEntryRecord, putBudgetMonthLink } from "@/lib/budget/budget-record-store"
import { checkAndIncrementAtomicCounter } from "@/lib/server/platform/atomic-quota"
import type { ExpenseEntry } from "@/types/budget"

import { GET, POST } from "@/app/api/v1/agents/[...path]/route"

// Wrappers for sub-route dispatching via catch-all path params
const planPost = (req: Request) => POST(req, { params: Promise.resolve({ path: ['plan'] }) })
const confirmPost = (req: Request) => POST(req, { params: Promise.resolve({ path: ['confirm'] }) })
const historyGet = () => GET(new Request('http://localhost/api/v1/agents/history'), { params: Promise.resolve({ path: ['history'] }) })
const expensesGet = () => GET(new Request('http://localhost/api/v1/agents/expenses'), { params: Promise.resolve({ path: ['expenses'] }) })

const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockBuildAgentPlan = vi.mocked(buildAgentPlan)
const mockVerifyAndConsumeToken = vi.mocked(verifyAndConsumeToken)
const mockGetAgentHistory = vi.mocked(getAgentHistory)
const mockSaveAgentHistory = vi.mocked(saveAgentHistory)
const mockExecuteAgentTool = vi.mocked(executeAgentTool)
const mockLogRequest = vi.mocked(logRequest)
const mockLogError = vi.mocked(logError)
const mockSearchLifeGraph = vi.mocked(searchLifeGraph)
const mockFormatLifeGraphForPrompt = vi.mocked(formatLifeGraphForPrompt)
const mockGetGoogleTokens = vi.mocked(getGoogleTokens)
const mockCheckAndIncrementAtomicCounter = vi.mocked(checkAndIncrementAtomicCounter)

function makeMockKV(store: Map<string, string> = new Map()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

function setupMockContext(kv = makeMockKV()) {
  mockGetRequestContext.mockReturnValue({
    env: { MISSI_MEMORY: kv, LIFE_GRAPH: {} },
    ctx: {} as unknown,
    cf: {} as unknown,
  } as ReturnType<typeof getCloudflareContext>)
  return kv
}

function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/v1/agents/plan", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function waitForAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0))
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
    mockCheckAndIncrementAtomicCounter.mockResolvedValue({ allowed: true, count: 1, remaining: 99 })
    setupMockContext()
  })

  it("returns 400 for invalid JSON", async () => {
    const res = await planPost(new Request("http://localhost/api/v1/agents/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid JSON" })
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

  it("returns 429 if the atomic daily agent limit is exceeded", async () => {
    mockCheckAndIncrementAtomicCounter.mockResolvedValueOnce({ allowed: false, count: 100, remaining: 0 })

    const res = await planPost(makeRequest({ message: "do something" }))

    expect(res.status).toBe(429)
  })

  it("returns 503 if the atomic daily agent limit is unavailable", async () => {
    mockCheckAndIncrementAtomicCounter.mockResolvedValueOnce(null)

    const res = await planPost(makeRequest({ message: "do something" }))
    const body = await res.json() as { error: string }

    expect(res.status).toBe(503)
    expect(body.error).toBe("Rate limit service unavailable")
    expect(mockBuildAgentPlan).not.toHaveBeenCalled()
    expect(mockLogError).toHaveBeenCalledWith(
      "agents.plan.rate_limit_unavailable",
      "Rate limit service unavailable",
      "user_test",
    )
  })

  it("shapes memory context and declared available tools before building the plan", async () => {
    mockSearchLifeGraph.mockResolvedValueOnce([
      { id: "memory-result" },
    ] as unknown as Awaited<ReturnType<typeof searchLifeGraph>>)
    mockFormatLifeGraphForPrompt.mockReturnValueOnce("memory context for planning")
    mockGetGoogleTokens.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
    })
    mockBuildAgentPlan.mockResolvedValueOnce(READ_ONLY_PLAN)

    const res = await planPost(makeRequest({ message: "what's on my calendar?" }))

    expect(res.status).toBe(200)
    expect(mockBuildAgentPlan).toHaveBeenCalledWith(
      "what's on my calendar?",
      ["searchMemory", "createCalendarEvent"],
      "memory context for planning",
    )
  })

  it("returns plan with confirmToken for a destructive plan", async () => {
    mockGetGoogleTokens.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
    })
    mockBuildAgentPlan.mockResolvedValueOnce(DESTRUCTIVE_PLAN)

    const res = await planPost(makeRequest({ message: "schedule a meeting" }))
    const body = await res.json() as { plan: unknown; confirmToken: string | null; requiresConfirmation: boolean }

    expect(res.status).toBe(200)
    expect(body.requiresConfirmation).toBe(true)
    expect(body.confirmToken).toBe("mock-token-abc")
    expect(mockLogRequest).toHaveBeenCalledWith(
      "agents.plan.created",
      "user_test",
      expect.any(Number),
      expect.objectContaining({
        steps: 1,
        requiresConfirmation: true,
        confirmTokenIssued: true,
      }),
    )
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

  it("returns 503 when MISSI_KV_ENCRYPTION_SECRET is missing for destructive plans", async () => {
    const { getEnv } = await import("@/lib/server/platform/env")
    vi.mocked(getEnv).mockReturnValueOnce({
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      MISSI_KV_ENCRYPTION_SECRET: undefined,
    } as ReturnType<typeof getEnv>)
    mockGetGoogleTokens.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
    })
    mockBuildAgentPlan.mockResolvedValueOnce(DESTRUCTIVE_PLAN)

    const res = await planPost(makeRequest({ message: "schedule a meeting" }))
    expect(res.status).toBe(503)
    expect(mockLogError).toHaveBeenCalledWith(
      "agents.plan.confirmation_unavailable",
      "Confirmation unavailable",
      "user_test",
    )
  })
})

// ─── POST /api/v1/agents/confirm ─────────────────────────────────────────────

describe("POST /api/v1/agents/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerifiedUserId.mockResolvedValue("user_test")
    setupMockContext()
  })

  it("returns 400 for invalid JSON", async () => {
    const res = await confirmPost(new Request("http://localhost/api/v1/agents/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid JSON" })
  })

  it("returns 400 for schema validation failures", async () => {
    const res = await confirmPost(makeRequest({ confirmToken: "", approved: true }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "Validation error" })
  })

  it("returns 401 without a Clerk session", async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())
    const res = await confirmPost(makeRequest({ confirmToken: "tok", approved: true }))
    expect(res.status).toBe(401)
  })

  it("returns 503 when storage is unavailable", async () => {
    mockGetRequestContext.mockReturnValueOnce({
      env: {},
      ctx: {} as unknown,
      cf: {} as unknown,
    } as ReturnType<typeof getCloudflareContext>)

    const res = await confirmPost(makeRequest({ confirmToken: "tok", approved: true }))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ error: "Storage unavailable" })
  })

  it("returns 400 with invalid/expired token", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(null)
    const res = await confirmPost(makeRequest({ confirmToken: "invalid", approved: true }))
    expect(res.status).toBe(400)
    expect(mockLogRequest).toHaveBeenCalledWith(
      "agents.confirm.invalid_token",
      "user_test",
      expect.any(Number),
      { approved: true },
    )
  })

  it("returns { status: 'cancelled' } when approved is false — no tools executed", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(DESTRUCTIVE_PLAN)
    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: false }))
    const body = await res.json() as { status: string }

    expect(res.status).toBe(200)
    expect(body.status).toBe("cancelled")
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
    expect(mockLogRequest).toHaveBeenCalledWith(
      "agents.confirm.cancelled",
      "user_test",
      expect.any(Number),
      { approved: false },
    )
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

  it("executes destructive tools after confirmed approval", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(DESTRUCTIVE_PLAN)
    mockExecuteAgentTool.mockResolvedValueOnce({
      toolName: "createCalendarEvent",
      status: "done",
      summary: "Created event",
      output: "Done.",
    })

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"type":"step_done"')
    expect(text).toContain('"status":"completed"')
    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      { name: "createCalendarEvent", args: {} },
      expect.objectContaining({ executionSurface: "confirmed_agent" }),
    )
  })

  it("records agent history after successful confirmed execution", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(READ_ONLY_PLAN)
    mockExecuteAgentTool.mockResolvedValueOnce({
      toolName: "searchMemory",
      status: "done",
      summary: "Found 0 memories",
      output: "No memories",
    })

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    await res.text()
    await waitForAsyncWork()

    expect(mockSaveAgentHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        get: expect.any(Function),
        put: expect.any(Function),
        delete: expect.any(Function),
      }),
      "user_test",
      expect.objectContaining({
        userMessage: READ_ONLY_PLAN.summary.slice(0, 100),
        planSummary: READ_ONLY_PLAN.summary,
        stepsCompleted: 1,
        stepsTotal: 1,
        status: "completed",
      }),
    )
  })

  it("passes the expected ToolContext to confirmed tool execution", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(READ_ONLY_PLAN)
    mockExecuteAgentTool.mockResolvedValueOnce({
      toolName: "searchMemory",
      status: "done",
      summary: "Found 0 memories",
      output: "No memories",
    })

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    await res.text()
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(1)
    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      { name: "searchMemory", args: {} },
      expect.objectContaining({
        userId: "user_test",
        googleClientId: "test-client-id",
        googleClientSecret: "test-client-secret",
        kv: expect.objectContaining({
          get: expect.any(Function),
          put: expect.any(Function),
          delete: expect.any(Function),
        }),
        vectorizeEnv: expect.objectContaining({
          LIFE_GRAPH: expect.anything(),
        }),
      }),
    )
  })

  it("returns 400 with mismatched userId (verifyAndConsumeToken returns null)", async () => {
    // verifyAndConsumeToken returns null when userId doesn't match
    mockVerifyAndConsumeToken.mockResolvedValueOnce(null)
    const res = await confirmPost(makeRequest({ confirmToken: "tok-other-user", approved: true }))
    expect(res.status).toBe(400)
  })

  it("emits step_error and skips tools not in the hardcoded TOOL_ALLOWLIST", async () => {
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
    const text = await res.text()
    expect(text).toContain('"type":"step_error"')
    expect(text).toContain('"error":"Tool not available"')
    expect(text).toContain('"status":"cancelled"')
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
  })

  it("emits step_error when confirmed tool execution throws", async () => {
    mockVerifyAndConsumeToken.mockResolvedValueOnce(READ_ONLY_PLAN)
    mockExecuteAgentTool.mockRejectedValueOnce(new Error("boom"))

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"type":"step_error"')
    expect(text).toContain('"error":"Tool execution failed"')
    expect(text).toContain('"status":"cancelled"')
  })

  it("runs dependent confirmed steps sequentially", async () => {
    const firstResult = createDeferred<{ toolName: string; status: "done"; summary: string; output: string }>()
    const secondResult = createDeferred<{ toolName: string; status: "done"; summary: string; output: string }>()
    mockVerifyAndConsumeToken.mockResolvedValueOnce({
      planId: "plan-dependent",
      steps: [
        { stepNumber: 1, toolName: "setReminder", description: "Set a reminder", isDestructive: false, estimatedDuration: "~1s", args: {} },
        { stepNumber: 2, toolName: "searchMemory", description: "Search memory", isDestructive: false, estimatedDuration: "~1s", args: {} },
      ],
      summary: "Reminder then search",
      requiresConfirmation: false,
      estimatedSteps: 2,
    })
    mockExecuteAgentTool
      .mockImplementationOnce(() => firstResult.promise)
      .mockImplementationOnce(() => secondResult.promise)

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    await waitForAsyncWork()
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(1)

    firstResult.resolve({
      toolName: "setReminder",
      status: "done",
      summary: "Reminder set",
      output: "Done.",
    })

    await waitForAsyncWork()
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(2)
    expect(mockExecuteAgentTool).toHaveBeenNthCalledWith(2, { name: "searchMemory", args: {} }, expect.anything())

    secondResult.resolve({
      toolName: "searchMemory",
      status: "done",
      summary: "Found memory",
      output: "Done.",
    })

    const text = await res.text()
    expect(text).toContain('"stepsCompleted":2')
    expect(text).toContain('"status":"completed"')
  })

  it("starts read-only confirmed steps in parallel", async () => {
    const firstResult = createDeferred<{ toolName: string; status: "done"; summary: string; output: string }>()
    const secondResult = createDeferred<{ toolName: string; status: "done"; summary: string; output: string }>()
    mockVerifyAndConsumeToken.mockResolvedValueOnce({
      planId: "plan-parallel",
      steps: [
        { stepNumber: 1, toolName: "searchMemory", description: "Search memory", isDestructive: false, estimatedDuration: "~1s", args: {} },
        { stepNumber: 2, toolName: "searchWeb", description: "Search web", isDestructive: false, estimatedDuration: "~1s", args: {} },
      ],
      summary: "Search memory and web",
      requiresConfirmation: false,
      estimatedSteps: 2,
    })
    mockExecuteAgentTool
      .mockImplementationOnce(() => firstResult.promise)
      .mockImplementationOnce(() => secondResult.promise)

    const res = await confirmPost(makeRequest({ confirmToken: "valid-tok", approved: true }))

    expect(res.status).toBe(200)
    await waitForAsyncWork()
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(2)

    firstResult.resolve({
      toolName: "searchMemory",
      status: "done",
      summary: "Found memory",
      output: "Done.",
    })
    secondResult.resolve({
      toolName: "searchWeb",
      status: "done",
      summary: "Found web result",
      output: "Done.",
    })

    const text = await res.text()
    expect(text).toContain('"stepsCompleted":2')
    expect(text).toContain('"status":"completed"')
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
    expect(body.currency).toBe("INR")
    expect(body.recentEntries).toEqual([])
  })

  it("returns expense totals from shared budget data when present", async () => {
    const kv = makeMockKV()
    const yearMonth = new Date().toISOString().slice(0, 7)
    const foodEntry: ExpenseEntry = {
      id: 'entry_food',
      userId: 'user_test',
      amount: 700,
      currency: 'INR',
      category: 'food',
      description: 'Lunch',
      date: `${yearMonth}-10`,
      createdAt: 1,
      updatedAt: 1,
      source: 'manual',
    }
    const transportEntry: ExpenseEntry = {
      id: 'entry_transport',
      userId: 'user_test',
      amount: 500,
      currency: 'INR',
      category: 'transport',
      description: 'Taxi',
      date: `${yearMonth}-11`,
      createdAt: 2,
      updatedAt: 2,
      source: 'manual',
    }
    await putBudgetEntryRecord(kv, foodEntry)
    await putBudgetEntryRecord(kv, transportEntry)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(foodEntry)!)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(transportEntry)!)
    setupMockContext(kv)

    const res = await expensesGet()
    const body = await res.json() as { monthlyTotal: number; byCategory: Record<string, number> }

    expect(res.status).toBe(200)
    expect(body.monthlyTotal).toBe(1200)
    expect(body.byCategory.food).toBe(700)
    expect(body.byCategory.transport).toBe(500)
  })
})
