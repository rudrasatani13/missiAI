import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  getEnvMock,
  saveGoogleTokensMock,
  fetchCalendarContextMock,
  saveNotionTokensMock,
  fetchNotionContextMock,
  getCloudflareKVBindingMock,
  logErrorMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getEnvMock: vi.fn(),
  saveGoogleTokensMock: vi.fn(),
  fetchCalendarContextMock: vi.fn(),
  saveNotionTokensMock: vi.fn(),
  fetchNotionContextMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  logErrorMock: vi.fn(),
  AuthenticationErrorMock: class extends Error {
    constructor() {
      super("Unauthorized")
      this.name = "AuthenticationError"
    }
  },
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: getEnvMock,
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  saveGoogleTokens: saveGoogleTokensMock,
  fetchCalendarContext: fetchCalendarContextMock,
  saveNotionTokens: saveNotionTokensMock,
  fetchNotionContext: fetchNotionContextMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
}))

import { GET as googleCallbackGet } from "@/app/api/auth/callback/google/route"
import { GET as notionCallbackGet } from "@/app/api/auth/callback/notion/route"

const kvMock = {
  get: vi.fn(async (_key: string): Promise<string | null> => null),
  put: vi.fn(async (_key: string, _value: string) => undefined),
  delete: vi.fn(async (_key: string) => undefined),
}

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

describe("OAuth callback routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("btoa", (value: string) => Buffer.from(value, "binary").toString("base64"))
    getVerifiedUserIdMock.mockResolvedValue("user_oauth")
    getEnvMock.mockReturnValue({
      APP_URL: "http://localhost",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      NOTION_CLIENT_ID: "notion-client-id",
      NOTION_CLIENT_SECRET: "notion-client-secret",
    })
    getCloudflareKVBindingMock.mockReturnValue(kvMock as never)
    kvMock.get.mockResolvedValue(JSON.stringify({ userId: "user_oauth", createdAt: Date.now() }))
    kvMock.delete.mockResolvedValue(undefined)
    saveGoogleTokensMock.mockResolvedValue(undefined)
    fetchCalendarContextMock.mockResolvedValue("")
    saveNotionTokensMock.mockResolvedValue(undefined)
    fetchNotionContextMock.mockResolvedValue("")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("logs and rejects invalid Google OAuth state payloads", async () => {
    kvMock.get.mockResolvedValueOnce(JSON.stringify({ invalid: true }))

    const res = await googleCallbackGet(makeRequest("/api/auth/callback/google?code=code-123&state=state-123"))

    expect(res.headers.get("location")).toContain("oauth_error=invalid_state")
    expect(saveGoogleTokensMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.google.invalid_state",
      expect.any(Error),
      "user_oauth",
    )
  })

  it("logs and rejects invalid Google token exchange payloads before writing tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ refresh_token: "refresh-only" }), { status: 200 })))

    const res = await googleCallbackGet(makeRequest("/api/auth/callback/google?code=code-123&state=state-123"))

    expect(res.headers.get("location")).toContain("oauth_error=server_error")
    expect(saveGoogleTokensMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.google.callback_error",
      expect.any(Error),
      "user_oauth",
    )
  })

  it("logs Google prefetch failures without failing the OAuth success redirect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "google-access",
      refresh_token: "google-refresh",
      expires_in: 3600,
    }), { status: 200 })))
    fetchCalendarContextMock.mockRejectedValueOnce(new Error("calendar prefetch failed"))

    const res = await googleCallbackGet(makeRequest("/api/auth/callback/google?code=code-123&state=state-123"))
    await Promise.resolve()
    await Promise.resolve()

    expect(res.headers.get("location")).toContain("oauth_success=google")
    expect(saveGoogleTokensMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.google.prefetch_error",
      expect.any(Error),
      "user_oauth",
    )
  })

  it("logs and rejects invalid Notion OAuth state payloads", async () => {
    kvMock.get.mockResolvedValueOnce(JSON.stringify({ invalid: true }))

    const res = await notionCallbackGet(makeRequest("/api/auth/callback/notion?code=code-123&state=state-123"))

    expect(res.headers.get("location")).toContain("oauth_error=invalid_state")
    expect(saveNotionTokensMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.notion.invalid_state",
      expect.any(Error),
      "user_oauth",
    )
  })

  it("logs and rejects invalid Notion token exchange payloads before writing tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ workspace_name: "Workspace" }), { status: 200 })))

    const res = await notionCallbackGet(makeRequest("/api/auth/callback/notion?code=code-123&state=state-123"))

    expect(res.headers.get("location")).toContain("oauth_error=server_error")
    expect(saveNotionTokensMock).not.toHaveBeenCalled()
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.notion.callback_error",
      expect.any(Error),
      "user_oauth",
    )
  })

  it("logs Notion prefetch failures without failing the OAuth success redirect", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      access_token: "notion-access",
      workspace_name: "Workspace",
      bot_id: "bot_123",
    }), { status: 200 })))
    fetchNotionContextMock.mockRejectedValueOnce(new Error("notion prefetch failed"))

    const res = await notionCallbackGet(makeRequest("/api/auth/callback/notion?code=code-123&state=state-123"))
    await Promise.resolve()
    await Promise.resolve()

    expect(res.headers.get("location")).toContain("oauth_success=notion")
    expect(saveNotionTokensMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith(
      "oauth.notion.prefetch_error",
      expect.any(Error),
      "user_oauth",
    )
  })
})
