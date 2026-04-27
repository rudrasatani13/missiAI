import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  unauthorizedResponseMock: vi.fn(
    () => new Response(JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  AuthenticationErrorMock: class extends Error {
    constructor() {
      super("Unauthorized")
      this.name = "AuthenticationError"
    }
  },
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: vi.fn(),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn(),
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(
    () => new Response(JSON.stringify({ success: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  rateLimitHeaders: vi.fn(() => ({
    "X-RateLimit-Limit": "60",
    "X-RateLimit-Remaining": "59",
    "X-RateLimit-Reset": "999999",
  })),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
  createTimer: vi.fn(() => () => 42),
}))

vi.mock("@/lib/server/platform/env", () => ({
  getEnv: vi.fn(() => ({
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  })),
}))

vi.mock("@/lib/plugins/plugin-store", () => ({
  getUserPlugins: vi.fn(),
  upsertPlugin: vi.fn().mockResolvedValue(undefined),
  disconnectPlugin: vi.fn().mockResolvedValue(undefined),
  getConnectedPlugin: vi.fn(),
  stripCredentials: vi.fn((config: { credentials?: Record<string, string>; [key: string]: unknown }) => {
    const { credentials: _credentials, ...safe } = config
    return safe
  }),
}))

vi.mock("@/lib/plugins/plugin-executor", () => ({
  buildPluginCommand: vi.fn(),
  executePluginCommand: vi.fn(),
}))

vi.mock("@/lib/plugins/data-fetcher", () => ({
  fetchCalendarContextResult: vi.fn(),
  fetchNotionContextResult: vi.fn(),
  deleteGoogleTokens: vi.fn().mockResolvedValue(undefined),
  deleteNotionTokens: vi.fn().mockResolvedValue(undefined),
  getGoogleTokensResult: vi.fn(),
  getNotionTokensResult: vi.fn(),
}))

import { DELETE, GET, PATCH, POST } from "@/app/api/v1/plugins/[[...path]]/route"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkRateLimit } from "@/lib/server/security/rate-limiter"
import {
  disconnectPlugin,
  getConnectedPlugin,
  getUserPlugins,
  stripCredentials,
  upsertPlugin,
} from "@/lib/plugins/plugin-store"
import { buildPluginCommand, executePluginCommand } from "@/lib/plugins/plugin-executor"
import {
  deleteGoogleTokens,
  fetchCalendarContextResult,
  fetchNotionContextResult,
  getGoogleTokensResult,
  getNotionTokensResult,
} from "@/lib/plugins/data-fetcher"

const mockGetCloudflareKVBinding = vi.mocked(getCloudflareKVBinding)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetUserPlugins = vi.mocked(getUserPlugins)
const mockUpsertPlugin = vi.mocked(upsertPlugin)
const mockDisconnectPlugin = vi.mocked(disconnectPlugin)
const mockGetConnectedPlugin = vi.mocked(getConnectedPlugin)
const mockStripCredentials = vi.mocked(stripCredentials)
const mockBuildPluginCommand = vi.mocked(buildPluginCommand)
const mockExecutePluginCommand = vi.mocked(executePluginCommand)
const mockFetchCalendarContextResult = vi.mocked(fetchCalendarContextResult)
const mockFetchNotionContextResult = vi.mocked(fetchNotionContextResult)
const mockDeleteGoogleTokens = vi.mocked(deleteGoogleTokens)
const mockGetGoogleTokensResult = vi.mocked(getGoogleTokensResult)
const mockGetNotionTokensResult = vi.mocked(getNotionTokensResult)

const kvMock = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}

const baseGet = () => GET(new Request("http://localhost/api/v1/plugins"), { params: Promise.resolve({ path: [] }) })
const basePost = (body: BodyInit | null, headers?: HeadersInit) => POST(new Request("http://localhost/api/v1/plugins", {
  method: "POST",
  headers,
  body,
}), { params: Promise.resolve({ path: [] }) })
const baseDelete = (body: BodyInit | null, headers?: HeadersInit) => DELETE(new Request("http://localhost/api/v1/plugins", {
  method: "DELETE",
  headers,
  body,
}), { params: Promise.resolve({ path: [] }) })
const basePatch = (body: BodyInit | null, headers?: HeadersInit) => PATCH(new Request("http://localhost/api/v1/plugins", {
  method: "PATCH",
  headers,
  body,
}), { params: Promise.resolve({ path: [] }) })
const refreshGet = () => GET(new Request("http://localhost/api/v1/plugins/refresh"), { params: Promise.resolve({ path: ["refresh"] }) })
const refreshPost = () => POST(new Request("http://localhost/api/v1/plugins/refresh", {
  method: "POST",
}), { params: Promise.resolve({ path: ["refresh"] }) })
const refreshDelete = (plugin?: string) => DELETE(new Request(`http://localhost/api/v1/plugins/refresh${plugin ? `?plugin=${plugin}` : ""}`, {
  method: "DELETE",
}), { params: Promise.resolve({ path: ["refresh"] }) })
const unknownGet = () => GET(new Request("http://localhost/api/v1/plugins/unknown"), { params: Promise.resolve({ path: ["unknown"] }) })
const unknownPost = () => POST(new Request("http://localhost/api/v1/plugins/unknown", { method: "POST" }), { params: Promise.resolve({ path: ["unknown"] }) })
const unknownDelete = () => DELETE(new Request("http://localhost/api/v1/plugins/unknown", { method: "DELETE" }), { params: Promise.resolve({ path: ["unknown"] }) })
const unknownPatch = () => PATCH(new Request("http://localhost/api/v1/plugins/unknown", { method: "PATCH" }), { params: Promise.resolve({ path: ["unknown"] }) })

describe("plugins parent route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_plugins")
    mockGetCloudflareKVBinding.mockReturnValue(kvMock as never)
    mockGetUserPlan.mockResolvedValue("free")
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 59,
      limit: 60,
      resetAt: 999999,
      retryAfter: 0,
    })
    mockGetUserPlugins.mockResolvedValue({
      userId: "user_plugins",
      plugins: [
        {
          id: "notion",
          name: "Notion",
          status: "connected",
          credentials: { apiKey: "secret" },
          settings: { defaultPageId: "page_123" },
          connectedAt: 111,
        },
      ],
      updatedAt: 111,
    })
    mockGetConnectedPlugin.mockResolvedValue({
      id: "notion",
      name: "Notion",
      status: "connected",
      credentials: { apiKey: "secret" },
      settings: { defaultPageId: "page_123" },
      connectedAt: 111,
    })
    mockBuildPluginCommand.mockResolvedValue({
      pluginId: "notion",
      action: "create_page",
      parameters: { title: "New Note", content: "Remember this" },
      rawUserMessage: "Remember this",
    })
    mockExecutePluginCommand.mockResolvedValue({
      success: true,
      pluginId: "notion",
      action: "create_page",
      output: "Created note",
      executedAt: 222,
    })
    mockFetchCalendarContextResult.mockResolvedValue({ status: "available", context: "[GOOGLE CALENDAR]" })
    mockFetchNotionContextResult.mockResolvedValue({ status: "available", context: "[NOTION]" })
    mockGetGoogleTokensResult.mockResolvedValue({ status: "missing", tokens: null })
    mockGetNotionTokensResult.mockResolvedValue({ status: "missing", tokens: null })
  })

  it("lists plugins from the base route with client-safe configs", async () => {
    const res = await baseGet()

    expect(res.status).toBe(200)
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60")
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        plugins: [
          {
            id: "notion",
            name: "Notion",
            status: "connected",
            settings: { defaultPageId: "page_123" },
            connectedAt: 111,
          },
        ],
      },
    })
    expect(mockGetUserPlugins).toHaveBeenCalledWith(kvMock, "user_plugins")
    expect(mockStripCredentials).toHaveBeenCalledTimes(1)
  })

  it("returns 400 for invalid JSON on connect", async () => {
    const res = await basePost("{", { "Content-Type": "application/json" })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid JSON body",
      code: "VALIDATION_ERROR",
    })
  })

  it("returns 500 when storage is unavailable on connect", async () => {
    mockGetCloudflareKVBinding.mockReturnValueOnce(null)

    const res = await basePost(JSON.stringify({
      id: "notion",
      credentials: { apiKey: "secret" },
      settings: { defaultPageId: "page_123" },
    }), { "Content-Type": "application/json" })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Storage unavailable",
      code: "INTERNAL_ERROR",
    })
  })

  it("rejects invalid plugin ids on disconnect", async () => {
    const res = await baseDelete(JSON.stringify({ id: "slack" }), { "Content-Type": "application/json" })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid plugin id",
      code: "VALIDATION_ERROR",
    })
    expect(mockDisconnectPlugin).not.toHaveBeenCalled()
  })

  it("returns 429 when the execute route is rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 60,
      resetAt: 999999,
      retryAfter: 30,
    })

    const res = await basePatch(JSON.stringify({ pluginId: "notion", userMessage: "Remember this" }), {
      "Content-Type": "application/json",
    })

    expect(res.status).toBe(429)
  })

  it("executes a connected plugin from the base patch route", async () => {
    const res = await basePatch(JSON.stringify({ pluginId: "notion", userMessage: "Remember this" }), {
      "Content-Type": "application/json",
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: {
        result: {
          success: true,
          pluginId: "notion",
          action: "create_page",
          output: "Created note",
        },
      },
    })
    expect(mockBuildPluginCommand).toHaveBeenCalledWith("Remember this", "notion")
    expect(mockExecutePluginCommand).toHaveBeenCalledTimes(1)
    expect(mockUpsertPlugin).toHaveBeenCalledTimes(1)
  })

  it("returns 503 on refresh status when kv is unavailable", async () => {
    mockGetCloudflareKVBinding.mockReturnValueOnce(null)

    const res = await refreshGet()

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ success: false, error: "KV not available" })
  })

  it("returns refresh token connection state from the refresh route", async () => {
    mockGetGoogleTokensResult.mockResolvedValueOnce({
      status: "available",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 123456,
      },
    })
    mockGetNotionTokensResult.mockResolvedValueOnce({
      status: "available",
      tokens: {
        accessToken: "notion-token",
        workspaceName: "Workspace",
        botId: "bot_123",
      },
    })

    const res = await refreshGet()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      kvAvailable: true,
      google: { connected: true, expiresAt: 123456 },
      notion: { connected: true, workspaceName: "Workspace" },
    })
  })

  it("surfaces broken integration state from the refresh route", async () => {
    mockGetGoogleTokensResult.mockResolvedValueOnce({
      status: "error",
      tokens: null,
      errorCode: "TOKEN_LOAD_FAILED",
    })

    const res = await refreshGet()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      kvAvailable: true,
      google: { connected: false, errorCode: "TOKEN_LOAD_FAILED" },
      notion: null,
    })
  })

  it("refreshes connected integrations from the refresh post route", async () => {
    const res = await refreshPost()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      results: {
        google: "refreshed",
        notion: "refreshed",
      },
    })
    expect(mockFetchCalendarContextResult).toHaveBeenCalledTimes(1)
    expect(mockFetchNotionContextResult).toHaveBeenCalledTimes(1)
  })

  it("reports refresh helper errors without flattening them to no_token", async () => {
    mockFetchCalendarContextResult.mockResolvedValueOnce({
      status: "error",
      context: "",
      errorCode: "TOKEN_REFRESH_FAILED",
    })
    mockFetchNotionContextResult.mockResolvedValueOnce({
      status: "missing",
      context: "",
    })

    const res = await refreshPost()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      results: {
        google: "error",
        notion: "no_token",
      },
    })
  })

  it("rejects invalid refresh delete query params", async () => {
    const res = await refreshDelete("calendar")

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ success: false, error: "Invalid plugin" })
    expect(mockDeleteGoogleTokens).not.toHaveBeenCalled()
  })

  it("deletes google refresh tokens from the refresh delete route", async () => {
    const res = await refreshDelete("google")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(mockDeleteGoogleTokens).toHaveBeenCalledWith(kvMock, "user_plugins")
  })

  it("maps base-route auth failures to the standard unauthorized response", async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await baseGet()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    })
  })

  it("maps refresh-route auth failures to the shared unauthorized response helper", async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const res = await refreshGet()

    expect(res.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalledTimes(1)
  })

  it("returns 404 for unknown catch-all segments", async () => {
    const [getRes, postRes, deleteRes, patchRes] = await Promise.all([
      unknownGet(),
      unknownPost(),
      unknownDelete(),
      unknownPatch(),
    ])

    expect(getRes.status).toBe(404)
    expect(postRes.status).toBe(404)
    expect(deleteRes.status).toBe(404)
    expect(patchRes.status).toBe(404)
  })
})
