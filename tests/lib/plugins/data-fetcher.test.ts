import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore } from "@/types"
import {
  fetchCalendarContextResult,
  fetchNotionContextResult,
  getGoogleTokensResult,
  getNotionTokensResult,
  getGoogleTokens,
  getNotionTokens,
  googleTokenKey,
  notionTokenKey,
  saveGoogleTokens,
  saveNotionTokens,
  type GoogleTokens,
  type NotionTokens,
} from "@/lib/plugins/data-fetcher"
import { decryptFromKV } from "@/lib/server/security/kv-crypto"

const { logMock } = vi.hoisted(() => ({
  logMock: vi.fn(),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  log: logMock,
}))

function createMockKV() {
  const store = new Map<string, string>()
  const kv: KVStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }

  return { kv, store }
}

describe("plugin data fetcher token storage", () => {
  let kv: KVStore
  let store: Map<string, string>
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
    const mock = createMockKV()
    kv = mock.kv
    store = mock.store
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("encrypts Google OAuth tokens at rest", async () => {
    const tokens: GoogleTokens = {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: 1234567890,
    }

    await saveGoogleTokens(kv, "user_1", tokens)

    const raw = store.get(googleTokenKey("user_1"))
    expect(raw).toBeTruthy()
    expect(raw).toMatch(/^enc:v1:/)
    await expect(decryptFromKV(raw!)).resolves.toBe(JSON.stringify(tokens))
    await expect(getGoogleTokens(kv, "user_1")).resolves.toEqual(tokens)
  })

  it("migrates legacy plaintext Google OAuth tokens on read", async () => {
    const tokens: GoogleTokens = {
      accessToken: "legacy-google-access",
      refreshToken: "legacy-google-refresh",
      expiresAt: 2222222222,
    }

    store.set(googleTokenKey("user_2"), JSON.stringify(tokens))

    await expect(getGoogleTokens(kv, "user_2")).resolves.toEqual(tokens)

    const migrated = store.get(googleTokenKey("user_2"))
    expect(migrated).toBeTruthy()
    expect(migrated).toMatch(/^enc:v1:/)
    await expect(decryptFromKV(migrated!)).resolves.toBe(JSON.stringify(tokens))
  })

  it("logs a warning when legacy plaintext Google token migration rewrite fails", async () => {
    const tokens: GoogleTokens = {
      accessToken: "legacy-google-access",
      refreshToken: "legacy-google-refresh",
      expiresAt: 3333333333,
    }

    const failingKv: KVStore = {
      ...kv,
      put: async () => {
        throw new Error("google rewrite failed")
      },
    }

    store.set(googleTokenKey("user_legacy_google_warn"), JSON.stringify(tokens))

    await expect(getGoogleTokensResult(failingKv, "user_legacy_google_warn")).resolves.toEqual({
      status: "available",
      tokens,
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "warn",
      event: "plugins.google_tokens.migrate_error",
      userId: "user_legacy_google_warn",
    }))
  })

  it("encrypts and migrates Notion OAuth tokens", async () => {
    const tokens: NotionTokens = {
      accessToken: "notion-access",
      workspaceName: "Workspace",
      botId: "bot_123",
    }

    await saveNotionTokens(kv, "user_3", tokens)
    const encrypted = store.get(notionTokenKey("user_3"))
    expect(encrypted).toBeTruthy()
    expect(encrypted).toMatch(/^enc:v1:/)
    await expect(getNotionTokens(kv, "user_3")).resolves.toEqual(tokens)

    store.set(notionTokenKey("user_4"), JSON.stringify(tokens))
    await expect(getNotionTokens(kv, "user_4")).resolves.toEqual(tokens)
    const migrated = store.get(notionTokenKey("user_4"))
    expect(migrated).toBeTruthy()
    expect(migrated).toMatch(/^enc:v1:/)
  })

  it("logs a warning when legacy plaintext Notion token migration rewrite fails", async () => {
    const tokens: NotionTokens = {
      accessToken: "legacy-notion-access",
      workspaceName: "Workspace",
      botId: "bot_legacy",
    }

    const failingKv: KVStore = {
      ...kv,
      put: async () => {
        throw new Error("notion rewrite failed")
      },
    }

    store.set(notionTokenKey("user_legacy_notion_warn"), JSON.stringify(tokens))

    await expect(getNotionTokensResult(failingKv, "user_legacy_notion_warn")).resolves.toEqual({
      status: "available",
      tokens,
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "warn",
      event: "plugins.notion_tokens.migrate_error",
      userId: "user_legacy_notion_warn",
    }))
  })

  it("returns an error result and logs when Google token state is corrupted", async () => {
    store.set(googleTokenKey("user_bad_google"), "{")

    await expect(getGoogleTokensResult(kv, "user_bad_google")).resolves.toEqual({
      status: "error",
      tokens: null,
      errorCode: "TOKEN_LOAD_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.google_tokens.read_error",
      userId: "user_bad_google",
    }))
  })

  it("returns an error result and logs when Notion token state is corrupted", async () => {
    store.set(notionTokenKey("user_bad_notion"), "{")

    await expect(getNotionTokensResult(kv, "user_bad_notion")).resolves.toEqual({
      status: "error",
      tokens: null,
      errorCode: "TOKEN_LOAD_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.notion_tokens.read_error",
      userId: "user_bad_notion",
    }))
  })

  it("returns an error result and logs when Google token refresh fails", async () => {
    await saveGoogleTokens(kv, "user_refresh_fail", {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: Date.now() - 1_000,
    })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(fetchCalendarContextResult(
      kv,
      "user_refresh_fail",
      "client-id",
      "client-secret",
      true,
    )).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "TOKEN_REFRESH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.google.refresh_error",
      userId: "user_refresh_fail",
    }))
  })

  it("returns an error result and logs when Google refresh payload shape is invalid", async () => {
    await saveGoogleTokens(kv, "user_refresh_invalid", {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: Date.now() - 1_000,
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ access_token: 123, expires_in: "3600" }),
    })

    await expect(fetchCalendarContextResult(
      kv,
      "user_refresh_invalid",
      "client-id",
      "client-secret",
      true,
    )).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "TOKEN_REFRESH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.google.refresh_error",
      userId: "user_refresh_invalid",
    }))
  })

  it("returns an error result and logs when Google calendar context fetch fails", async () => {
    await saveGoogleTokens(kv, "user_calendar_fail", {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: Date.now() + 120_000,
    })
    fetchMock.mockRejectedValueOnce(new Error("calendar down"))

    await expect(fetchCalendarContextResult(
      kv,
      "user_calendar_fail",
      "client-id",
      "client-secret",
      true,
    )).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "CONTEXT_FETCH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.google.context_fetch_error",
      userId: "user_calendar_fail",
    }))
  })

  it("returns an error result and logs when Google calendar payload shape is invalid", async () => {
    await saveGoogleTokens(kv, "user_calendar_invalid", {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: Date.now() + 120_000,
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ items: ["bad-event"] }),
    })

    await expect(fetchCalendarContextResult(
      kv,
      "user_calendar_invalid",
      "client-id",
      "client-secret",
      true,
    )).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "CONTEXT_FETCH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.google.context_fetch_error",
      userId: "user_calendar_invalid",
    }))
  })

  it("returns an error result and logs when Notion context fetch fails", async () => {
    await saveNotionTokens(kv, "user_notion_fail", {
      accessToken: "notion-access",
      workspaceName: "Workspace",
      botId: "bot_123",
    })
    fetchMock.mockRejectedValueOnce(new Error("notion down"))

    await expect(fetchNotionContextResult(kv, "user_notion_fail", true)).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "CONTEXT_FETCH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.notion.context_fetch_error",
      userId: "user_notion_fail",
    }))
  })

  it("returns an error result and logs when Notion search payload shape is invalid", async () => {
    await saveNotionTokens(kv, "user_notion_invalid", {
      accessToken: "notion-access",
      workspaceName: "Workspace",
      botId: "bot_123",
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ properties: { title: { title: ["bad-rich-text"] } } }],
      }),
    })

    await expect(fetchNotionContextResult(kv, "user_notion_invalid", true)).resolves.toEqual({
      status: "error",
      context: "",
      errorCode: "CONTEXT_FETCH_FAILED",
    })
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "error",
      event: "plugins.notion.context_fetch_error",
      userId: "user_notion_invalid",
    }))
  })
})
