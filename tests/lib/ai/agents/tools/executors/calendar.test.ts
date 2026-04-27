import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import type { KVStore } from "@/types"

const { getGoogleTokensMock } = vi.hoisted(() => ({
  getGoogleTokensMock: vi.fn(),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  getGoogleTokens: getGoogleTokensMock,
}))

vi.mock("@/lib/plugins/calendar-plugin", () => ({
  createCalendarEvent: vi.fn(),
}))

import { executeCalendarTool } from "@/lib/ai/agents/tools/executors/calendar"

function makeMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function makeCtx(): ToolContext {
  return {
    kv: makeMockKV(),
    vectorizeEnv: null,
    userId: "user_test123",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
  }
}

describe("executeCalendarTool", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGoogleTokensMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
    })
  })

  it("asks for clarification before deleting when multiple events match", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      items: [
        { id: "evt-1", summary: "Team Meeting", start: { dateTime: "2026-04-25T10:00:00Z" } },
        { id: "evt-2", summary: "Team Meeting", start: { dateTime: "2026-04-26T12:00:00Z" } },
      ],
    }), { status: 200 })))

    const result = await executeCalendarTool({
      name: "deleteCalendarEvent",
      args: { searchQuery: "team meeting" },
    }, makeCtx())

    expect(result).not.toBeNull()
    expect(result?.status).toBe("done")
    expect(result?.summary).toContain("Found 2 matching events")
    expect(result?.output).toContain("Which one should I delete?")
    expect(result?.output).toContain("1. \"Team Meeting\"")
    expect(result?.output).toContain("2. \"Team Meeting\"")
  })

  it("returns null for tool names outside the calendar executor", async () => {
    const result = await executeCalendarTool({ name: "searchWeb", args: {} }, makeCtx())
    expect(result).toBeNull()
  })
})
