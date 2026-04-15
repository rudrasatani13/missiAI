import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST as PlanRoute } from "@/app/api/v1/agents/plan/route"
import { POST as ConfirmRoute } from "@/app/api/v1/agents/confirm/route"
import { GET as HistoryRoute } from "@/app/api/v1/agents/history/route"
import { GET as ExpensesRoute } from "@/app/api/v1/agents/expenses/route"
import * as Auth from "@/lib/server/auth"

vi.mock("@/lib/server/auth", () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {},
  unauthorizedResponse: () => new Response("Unauthorized", { status: 401 })
}))

// We'll also mock getRequestContext to provide KV
vi.mock("@cloudflare/next-on-pages", () => ({
  getRequestContext: () => ({
    env: {
      MISSI_MEMORY: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      }
    }
  })
}))

describe("Agents API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POST /plan returns 401 without Clerk session", async () => {
    vi.mocked(Auth.getVerifiedUserId).mockRejectedValueOnce(new Auth.AuthenticationError())

    const req = new Request("http://localhost/api/v1/agents/plan", { method: "POST", body: JSON.stringify({ message: "test" }) }) as any
    const res = await PlanRoute(req)

    expect(res.status).toBe(401)
  })

  it("POST /plan returns 400 if message exceeds 500 chars", async () => {
    vi.mocked(Auth.getVerifiedUserId).mockResolvedValueOnce("user_1")

    const req = new Request("http://localhost/api/v1/agents/plan", { method: "POST", body: JSON.stringify({ message: "A".repeat(501) }) }) as any
    const res = await PlanRoute(req)

    expect(res.status).toBe(400)
  })

  it("POST /confirm returns 400 with invalid/expired token", async () => {
    vi.mocked(Auth.getVerifiedUserId).mockResolvedValueOnce("user_1")

    const req = new Request("http://localhost/api/v1/agents/confirm", { method: "POST", body: JSON.stringify({ confirmToken: "bad", approved: true }) }) as any
    const res = await ConfirmRoute(req)

    expect(res.status).toBe(400)
  })

  it("GET /history returns 401 without session", async () => {
    vi.mocked(Auth.getVerifiedUserId).mockRejectedValueOnce(new Auth.AuthenticationError())

    const req = new Request("http://localhost/api/v1/agents/history", { method: "GET" }) as any
    const res = await HistoryRoute(req)

    expect(res.status).toBe(401)
  })

  it("GET /expenses returns 401 without session", async () => {
    vi.mocked(Auth.getVerifiedUserId).mockRejectedValueOnce(new Auth.AuthenticationError())

    const req = new Request("http://localhost/api/v1/agents/expenses", { method: "GET" }) as any
    const res = await ExpensesRoute(req)

    expect(res.status).toBe(401)
  })
})
