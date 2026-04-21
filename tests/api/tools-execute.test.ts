/**
 * Tests for POST /api/v1/tools/execute
 *
 * Verifies the safe-tool allowlist: high-risk tools that require a server-issued
 * agent-confirm token must be blocked here; safe read/draft tools must pass through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock("@/lib/server/auth", () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() { super("Unauthorized"); this.name = "AuthenticationError" }
  },
  unauthorizedResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  ),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn().mockResolvedValue("free"),
}))

vi.mock("@/lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetAt: 0, retryAfter: 0 }),
  rateLimitExceededResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }),
  ),
}))

vi.mock("@/lib/server/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    RESEND_API_KEY: undefined,
  }),
}))

vi.mock("@/lib/server/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@/lib/ai/agent-tools", () => ({
  executeAgentTool: vi.fn().mockResolvedValue({
    toolName: "searchMemory",
    status: "done",
    summary: "Found 0 memories",
    output: "No memories found.",
  }),
  AGENT_FUNCTION_DECLARATIONS: [
    { name: "searchMemory" },
    { name: "setReminder" },
    { name: "takeNote" },
    { name: "readCalendar" },
    { name: "findFreeSlot" },
    { name: "createNote" },
    { name: "draftEmail" },
    { name: "searchWeb" },
    { name: "searchNews" },
    { name: "searchYouTube" },
    { name: "logExpense" },
    { name: "getWeekSummary" },
    { name: "updateGoalProgress" },
    { name: "lookupContact" },
    { name: "saveContact" },
    { name: "sendEmail" },
    { name: "confirmSendEmail" },
    { name: "createCalendarEvent" },
    { name: "deleteCalendarEvent" },
    { name: "updateCalendarEvent" },
  ],
}))

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId } from "@/lib/server/auth"
import { POST } from "@/app/api/v1/tools/execute/route"
import { NextRequest } from "next/server"

const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)

function makeMockKV() {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function setupMockContext() {
  mockGetRequestContext.mockReturnValue({
    env: { MISSI_MEMORY: makeMockKV() },
    ctx: {} as unknown,
    cf: {} as unknown,
  } as ReturnType<typeof getCloudflareContext>)
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetVerifiedUserId.mockResolvedValue("user_test123")
  setupMockContext()
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — auth", () => {
  it("returns 401 without a Clerk session", async () => {
    const { AuthenticationError } = await import("@/lib/server/auth")
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const res = await POST(makeRequest({ name: "searchMemory", args: { query: "test" } }))
    expect(res.status).toBe(401)
  })
})

// ─── Blocked high-risk tools ──────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — blocked tools (require agent-confirm)", () => {
  const BLOCKED_TOOLS = [
    "sendEmail",
    "confirmSendEmail",
    "createCalendarEvent",
    "deleteCalendarEvent",
    "updateCalendarEvent",
  ]

  for (const toolName of BLOCKED_TOOLS) {
    it(`blocks "${toolName}" with 400`, async () => {
      const res = await POST(makeRequest({ name: toolName, args: {} }))
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toContain("agent confirmation")
    })
  }

  it("does not execute the tool when blocked", async () => {
    const { executeAgentTool } = await import("@/lib/ai/agent-tools")
    const mockExecute = vi.mocked(executeAgentTool)
    mockExecute.mockClear()

    await POST(makeRequest({ name: "confirmSendEmail", args: { to: "victim@example.com", subject: "pwned", body: "..." } }))

    expect(mockExecute).not.toHaveBeenCalled()
  })
})

// ─── Unknown tools ────────────────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — unknown tools", () => {
  it("returns 400 for a completely unknown tool name", async () => {
    const res = await POST(makeRequest({ name: "notARealTool", args: {} }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain("Unknown tool")
  })
})

// ─── Allowed safe tools ───────────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — allowed safe tools", () => {
  const SAFE_TOOLS = [
    "searchMemory",
    "setReminder",
    "takeNote",
    "readCalendar",
    "findFreeSlot",
    "draftEmail",
    "searchWeb",
    "logExpense",
    "getWeekSummary",
    "updateGoalProgress",
    "lookupContact",
    "saveContact",
  ]

  for (const toolName of SAFE_TOOLS) {
    it(`allows "${toolName}" to execute`, async () => {
      const { executeAgentTool } = await import("@/lib/ai/agent-tools")
      const mockExecute = vi.mocked(executeAgentTool)
      mockExecute.mockResolvedValueOnce({
        toolName,
        status: "done",
        summary: "OK",
        output: "Done.",
      })

      const res = await POST(makeRequest({ name: toolName, args: {} }))
      expect(res.status).toBe(200)
    })
  }
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — input validation", () => {
  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/v1/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when tool name is missing", async () => {
    const res = await POST(makeRequest({ args: {} }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when tool name exceeds 50 chars", async () => {
    const res = await POST(makeRequest({ name: "x".repeat(51), args: {} }))
    expect(res.status).toBe(400)
  })
})
