import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import type { KVStore } from "@/types"

const { saveGoogleTokensMock, logErrorMock } = vi.hoisted(() => ({
  saveGoogleTokensMock: vi.fn(),
  logErrorMock: vi.fn(),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  saveGoogleTokens: saveGoogleTokensMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
}))

import { VALID_EXPENSE_CATEGORIES, refreshGoogleTokenIfNeeded, safeProviderError, type GoogleTokenSet } from "@/lib/ai/agents/tools/shared"

function makeMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function makeCtx(kv: KVStore | null = makeMockKV()): ToolContext {
  return {
    kv,
    vectorizeEnv: null,
    userId: "user_test123",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
  }
}

describe("agent-tool-shared", () => {
  const baseTokens: GoogleTokenSet = {
    accessToken: "old-access-token",
    refreshToken: "refresh-token",
    expiresAt: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exports the allowed expense categories and truncates provider errors", () => {
    expect(VALID_EXPENSE_CATEGORIES).toContain("food")
    expect(VALID_EXPENSE_CATEGORIES).toContain("other")
    expect(safeProviderError("x".repeat(200))).toHaveLength(120)
  })

  it("returns existing tokens when refresh cannot run", async () => {
    const freshTokens = { ...baseTokens, expiresAt: Date.now() + 120_000 }

    await expect(refreshGoogleTokenIfNeeded(freshTokens, makeCtx())).resolves.toBe(freshTokens)
    await expect(refreshGoogleTokenIfNeeded(baseTokens, makeCtx(null))).resolves.toBe(baseTokens)
    await expect(refreshGoogleTokenIfNeeded(baseTokens, {
      ...makeCtx(),
      googleClientId: undefined,
      googleClientSecret: undefined,
    })).resolves.toBe(baseTokens)
  })

  it("refreshes and persists Google tokens when the provider returns a new access token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ access_token: "new-access-token", expires_in: 3600 }),
      { status: 200 },
    )))

    const ctx = makeCtx()
    const refreshed = await refreshGoogleTokenIfNeeded(baseTokens, ctx)

    expect(refreshed.accessToken).toBe("new-access-token")
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now())
    expect(saveGoogleTokensMock).toHaveBeenCalledWith(ctx.kv, ctx.userId, refreshed)
  })

  it("logs and preserves existing tokens when the provider refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })))

    const ctx = makeCtx()
    await expect(refreshGoogleTokenIfNeeded(baseTokens, ctx)).resolves.toEqual(baseTokens)

    expect(logErrorMock).toHaveBeenCalledWith("agents.google.refresh_error", "HTTP 401", ctx.userId)
    expect(saveGoogleTokensMock).not.toHaveBeenCalled()
  })

  it("logs and preserves existing tokens when the provider response shape is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ expires_in: 3600 }),
      { status: 200 },
    )))

    const ctx = makeCtx()
    await expect(refreshGoogleTokenIfNeeded(baseTokens, ctx)).resolves.toEqual(baseTokens)

    expect(logErrorMock).toHaveBeenCalledWith(
      "agents.google.refresh_error",
      expect.any(Error),
      ctx.userId,
    )
    expect(saveGoogleTokensMock).not.toHaveBeenCalled()
  })
})
