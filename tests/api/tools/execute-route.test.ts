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

vi.mock("@/lib/server/security/auth", () => ({
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

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetAt: 0, retryAfter: 0 }),
  rateLimitExceededResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }),
  ),
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    RESEND_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    ENABLE_OPENAI_FALLBACK: false,
  }),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@/lib/ai/agents/tools/dispatcher", () => ({
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
import { getVerifiedUserId } from "@/lib/server/security/auth"
import { executeAgentTool } from "@/lib/ai/agents/tools/dispatcher"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"
import { logError } from "@/lib/server/observability/logger"
import { POST } from "@/app/api/v1/tools/execute/route"
import { NextRequest } from "next/server"

const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockExecuteAgentTool = vi.mocked(executeAgentTool)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockRateLimitExceededResponse = vi.mocked(rateLimitExceededResponse)
const mockLogError = vi.mocked(logError)

function makeMockKV() {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function setupMockContext() {
  mockGetRequestContext.mockReturnValue({
    env: { MISSI_MEMORY: makeMockKV(), LIFE_GRAPH: {} },
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
  mockCheckRateLimit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetAt: 0, retryAfter: 0 })
  setupMockContext()
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/tools/execute — auth", () => {
  it("returns 401 without a Clerk session", async () => {
    const { AuthenticationError } = await import("@/lib/server/security/auth")
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const res = await POST(makeRequest({ name: "searchMemory", args: { query: "test" } }))
    expect(res.status).toBe(401)
  })
})

describe("POST /api/v1/tools/execute — rate limiting", () => {
  it("returns the shared rate-limit response and does not execute the tool", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, limit: 60, remaining: 0, resetAt: 0, retryAfter: 12 })

    const res = await POST(makeRequest({ name: "searchMemory", args: { query: "test" } }))

    expect(res.status).toBe(429)
    expect(mockRateLimitExceededResponse).toHaveBeenCalledTimes(1)
    expect(mockExecuteAgentTool).not.toHaveBeenCalled()
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
    const { executeAgentTool } = await import("@/lib/ai/agents/tools/dispatcher")
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
    "createNote",
    "draftEmail",
    "searchWeb",
    "searchNews",
    "searchYouTube",
    "getWeekSummary",
    "updateGoalProgress",
    "lookupContact",
    "saveContact",
  ]

  for (const toolName of SAFE_TOOLS) {
    it(`allows "${toolName}" to execute`, async () => {
      const { executeAgentTool } = await import("@/lib/ai/agents/tools/dispatcher")
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

  it("passes the expected ToolContext to executeAgentTool", async () => {
    mockExecuteAgentTool.mockResolvedValueOnce({
      toolName: "searchMemory",
      status: "done",
      summary: "OK",
      output: "Done.",
    })

    const res = await POST(makeRequest({ name: "searchMemory", args: { query: "rent" } }))

    expect(res.status).toBe(200)
    expect(mockExecuteAgentTool).toHaveBeenCalledTimes(1)
    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      { name: "searchMemory", args: { query: "rent" } },
      expect.objectContaining({
        userId: "user_test123",
        googleClientId: "test-client-id",
        googleClientSecret: "test-client-secret",
        resendApiKey: undefined,
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

describe("POST /api/v1/tools/execute — executor failures", () => {
  it("returns 500 and logs the error when tool execution throws", async () => {
    mockExecuteAgentTool.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(makeRequest({ name: "searchMemory", args: { query: "test" } }))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: "INTERNAL_ERROR",
    })
    expect(mockLogError).toHaveBeenCalledTimes(1)
  })
})
