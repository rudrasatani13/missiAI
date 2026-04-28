import { isRecord } from "@/lib/utils/is-record"
// ─── Plugin Data Fetcher ──────────────────────────────────────────────────────
// Fetches live data from Google Calendar and Notion using stored OAuth tokens.
// Results are cached in KV with a TTL so chat requests stay fast.

import { decryptFromKV, kvPut } from "@/lib/server/security/kv-crypto"
import { log } from "@/lib/server/observability/logger"
import type { KVStore } from "@/types"

const CONTEXT_TTL_SECONDS = 60 * 15 // 15 min cache
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90

export type PluginIntegrationErrorCode =
  | "TOKEN_LOAD_FAILED"
  | "TOKEN_REFRESH_FAILED"
  | "CONTEXT_FETCH_FAILED"

export interface PluginTokenLoadResult<T> {
  status: "available" | "missing" | "error"
  tokens: T | null
  errorCode?: PluginIntegrationErrorCode
}

export interface PluginContextFetchResult {
  status: "available" | "missing" | "error"
  context: string
  errorCode?: PluginIntegrationErrorCode
}

interface GoogleRefreshResponse {
  access_token: string
  expires_in: number
}

interface GoogleCalendarEvent {
  summary?: string
  start?: {
    dateTime?: string
    date?: string
  }
}

interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[]
}

interface NotionRichTextToken {
  plain_text?: string
}

interface NotionTitleProperty {
  title?: NotionRichTextToken[]
  rich_text?: NotionRichTextToken[]
}

interface NotionPage {
  properties?: {
    title?: NotionTitleProperty
    Name?: NotionTitleProperty
  }
  last_edited_time?: string
}

interface NotionSearchResponse {
  results?: NotionPage[]
}


function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return String(error)
}

function logPluginIssue(
  level: "warn" | "error",
  event: string,
  userId: string | undefined,
  error: unknown,
  metadata?: Record<string, unknown>,
) {
  log({
    level,
    event,
    userId,
    metadata: {
      ...metadata,
      error: getErrorMessage(error),
    },
    timestamp: Date.now(),
  })
}

function isGoogleTokens(value: unknown): value is GoogleTokens {
  return isRecord(value)
    && typeof value.accessToken === "string"
    && typeof value.refreshToken === "string"
    && typeof value.expiresAt === "number"
    && Number.isFinite(value.expiresAt)
}

function isNotionTokens(value: unknown): value is NotionTokens {
  return isRecord(value)
    && typeof value.accessToken === "string"
    && typeof value.workspaceName === "string"
    && typeof value.botId === "string"
}

function isGoogleRefreshResponse(value: unknown): value is GoogleRefreshResponse {
  return isRecord(value)
    && typeof value.access_token === "string"
    && typeof value.expires_in === "number"
    && Number.isFinite(value.expires_in)
}

function isGoogleCalendarEventStart(value: unknown): value is NonNullable<GoogleCalendarEvent["start"]> {
  return isRecord(value)
    && isOptionalString(value.dateTime)
    && isOptionalString(value.date)
}

function isGoogleCalendarEvent(value: unknown): value is GoogleCalendarEvent {
  return isRecord(value)
    && isOptionalString(value.summary)
    && (value.start === undefined || isGoogleCalendarEventStart(value.start))
}

function isGoogleCalendarResponse(value: unknown): value is GoogleCalendarResponse {
  return isRecord(value)
    && (value.items === undefined || (Array.isArray(value.items) && value.items.every(isGoogleCalendarEvent)))
}

function isNotionRichTextToken(value: unknown): value is NotionRichTextToken {
  return isRecord(value) && isOptionalString(value.plain_text)
}

function isNotionRichTextTokenArray(value: unknown): value is NotionRichTextToken[] {
  return Array.isArray(value) && value.every(isNotionRichTextToken)
}

function isNotionTitleProperty(value: unknown): value is NotionTitleProperty {
  return isRecord(value)
    && (value.title === undefined || isNotionRichTextTokenArray(value.title))
    && (value.rich_text === undefined || isNotionRichTextTokenArray(value.rich_text))
}

function isNotionPageProperties(
  value: unknown,
): value is NonNullable<NotionPage["properties"]> {
  return isRecord(value)
    && (value.title === undefined || isNotionTitleProperty(value.title))
    && (value.Name === undefined || isNotionTitleProperty(value.Name))
}

function isNotionPage(value: unknown): value is NotionPage {
  return isRecord(value)
    && (value.properties === undefined || isNotionPageProperties(value.properties))
    && isOptionalString(value.last_edited_time)
}

function isNotionSearchResponse(value: unknown): value is NotionSearchResponse {
  return isRecord(value)
    && (value.results === undefined || (Array.isArray(value.results) && value.results.every(isNotionPage)))
}

function parseGoogleRefreshResponse(value: unknown): GoogleRefreshResponse {
  if (!isGoogleRefreshResponse(value)) {
    throw new Error("Invalid Google refresh response")
  }

  return value
}

function parseGoogleCalendarResponse(value: unknown): GoogleCalendarResponse {
  if (!isGoogleCalendarResponse(value)) {
    throw new Error("Invalid Google Calendar response")
  }

  return value
}

function parseNotionSearchResponse(
  value: unknown,
  errorMessage = "Invalid Notion search response",
): NotionSearchResponse {
  if (!isNotionSearchResponse(value)) {
    throw new Error(errorMessage)
  }

  return value
}

function parseGoogleTokens(raw: string): GoogleTokens {
  const parsed: unknown = JSON.parse(raw)
  if (!isGoogleTokens(parsed)) {
    throw new Error("Invalid Google token payload")
  }

  return parsed
}

function parseNotionTokens(raw: string): NotionTokens {
  const parsed: unknown = JSON.parse(raw)
  if (!isNotionTokens(parsed)) {
    throw new Error("Invalid Notion token payload")
  }

  return parsed
}

// ─── KV Key Helpers ───────────────────────────────────────────────────────────
export function googleTokenKey(userId: string) { return `oauth:google:${userId}` }
export function notionTokenKey(userId: string) { return `oauth:notion:${userId}` }
export function calendarContextKey(userId: string) { return `context:calendar:${userId}` }
export function notionContextKey(userId: string) { return `context:notion:${userId}` }

// ─── Google OAuth Token Storage ───────────────────────────────────────────────
export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix ms
}

export async function saveGoogleTokens(kv: KVStore, userId: string, tokens: GoogleTokens) {
  await kvPut(kv, googleTokenKey(userId), JSON.stringify(tokens), {
    expirationTtl: TOKEN_TTL_SECONDS,
  })
}

export async function getGoogleTokensResult(
  kv: KVStore,
  userId: string,
): Promise<PluginTokenLoadResult<GoogleTokens>> {
  const key = googleTokenKey(userId)

  try {
    const raw = await kv.get(key)
    if (!raw) {
      return { status: "missing", tokens: null }
    }

    const decrypted = await decryptFromKV(raw)
    const parsed = parseGoogleTokens(decrypted)

    if (raw === decrypted) {
      try {
        await kvPut(kv, key, JSON.stringify(parsed), {
          expirationTtl: TOKEN_TTL_SECONDS,
        })
      } catch (error) {
        logPluginIssue("warn", "plugins.google_tokens.migrate_error", userId, error, { key })
      }
    }

    return { status: "available", tokens: parsed }
  } catch (error) {
    logPluginIssue("error", "plugins.google_tokens.read_error", userId, error, { key })
    return {
      status: "error",
      tokens: null,
      errorCode: "TOKEN_LOAD_FAILED",
    }
  }
}

export async function getGoogleTokens(kv: KVStore, userId: string): Promise<GoogleTokens | null> {
  const result = await getGoogleTokensResult(kv, userId)
  return result.tokens
}

export async function deleteGoogleTokens(kv: KVStore, userId: string) {
  await kv.delete(googleTokenKey(userId))
  await kv.delete(calendarContextKey(userId))
}

// ─── Notion OAuth Token Storage ───────────────────────────────────────────────
export interface NotionTokens {
  accessToken: string
  workspaceName: string
  botId: string
}

export async function saveNotionTokens(kv: KVStore, userId: string, tokens: NotionTokens) {
  await kvPut(kv, notionTokenKey(userId), JSON.stringify(tokens), {
    expirationTtl: TOKEN_TTL_SECONDS,
  })
}

export async function getNotionTokensResult(
  kv: KVStore,
  userId: string,
): Promise<PluginTokenLoadResult<NotionTokens>> {
  const key = notionTokenKey(userId)

  try {
    const raw = await kv.get(key)
    if (!raw) {
      return { status: "missing", tokens: null }
    }

    const decrypted = await decryptFromKV(raw)
    const parsed = parseNotionTokens(decrypted)

    if (raw === decrypted) {
      try {
        await kvPut(kv, key, JSON.stringify(parsed), {
          expirationTtl: TOKEN_TTL_SECONDS,
        })
      } catch (error) {
        logPluginIssue("warn", "plugins.notion_tokens.migrate_error", userId, error, { key })
      }
    }

    return { status: "available", tokens: parsed }
  } catch (error) {
    logPluginIssue("error", "plugins.notion_tokens.read_error", userId, error, { key })
    return {
      status: "error",
      tokens: null,
      errorCode: "TOKEN_LOAD_FAILED",
    }
  }
}

export async function getNotionTokens(kv: KVStore, userId: string): Promise<NotionTokens | null> {
  const result = await getNotionTokensResult(kv, userId)
  return result.tokens
}

export async function deleteNotionTokens(kv: KVStore, userId: string) {
  await kv.delete(notionTokenKey(userId))
  await kv.delete(notionContextKey(userId))
}

// ─── Refresh Google Access Token ──────────────────────────────────────────────
async function refreshGoogleToken(
  tokens: GoogleTokens,
  clientId: string,
  clientSecret: string,
  userId: string,
): Promise<PluginTokenLoadResult<GoogleTokens>> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!res.ok) {
      logPluginIssue("error", "plugins.google.refresh_error", userId, `HTTP ${res.status}`, {
        httpStatus: res.status,
      })
      return {
        status: "error",
        tokens: null,
        errorCode: "TOKEN_REFRESH_FAILED",
      }
    }

    const data = parseGoogleRefreshResponse(await res.json())

    return {
      status: "available",
      tokens: {
        ...tokens,
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      },
    }
  } catch (error) {
    logPluginIssue("error", "plugins.google.refresh_error", userId, error)
    return {
      status: "error",
      tokens: null,
      errorCode: "TOKEN_REFRESH_FAILED",
    }
  }
}

// ─── Fetch Google Calendar Context ────────────────────────────────────────────
export async function fetchCalendarContextResult(
  kv: KVStore,
  userId: string,
  clientId: string,
  clientSecret: string,
  forceRefresh = false,
): Promise<PluginContextFetchResult> {
  if (!forceRefresh) {
    try {
      const cached = await kv.get(calendarContextKey(userId))
      if (cached) return { status: "available", context: cached }
    } catch (error) {
      logPluginIssue("warn", "plugins.google.context_cache_read_error", userId, error)
    }
  }

  const tokenResult = await getGoogleTokensResult(kv, userId)
  if (tokenResult.status !== "available" || !tokenResult.tokens) {
    return {
      status: tokenResult.status,
      context: "",
      errorCode: tokenResult.errorCode,
    }
  }

  let activeTokens = tokenResult.tokens
  if (Date.now() > activeTokens.expiresAt - 60_000) {
    const refreshed = await refreshGoogleToken(activeTokens, clientId, clientSecret, userId)
    if (refreshed.status !== "available" || !refreshed.tokens) {
      return {
        status: "error",
        context: "",
        errorCode: refreshed.errorCode ?? "TOKEN_REFRESH_FAILED",
      }
    }

    activeTokens = refreshed.tokens
    try {
      await saveGoogleTokens(kv, userId, refreshed.tokens)
    } catch (error) {
      logPluginIssue("warn", "plugins.google_tokens.write_error", userId, error)
    }
  }

  try {
    const now = new Date()
    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("timeMin", now.toISOString())
    url.searchParams.set("timeMax", end.toISOString())
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("maxResults", "10")

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${activeTokens.accessToken}` },
    })

    if (!res.ok) {
      logPluginIssue("error", "plugins.google.context_fetch_error", userId, `HTTP ${res.status}`, {
        httpStatus: res.status,
      })
      return { status: "error", context: "", errorCode: "CONTEXT_FETCH_FAILED" }
    }

    const data = parseGoogleCalendarResponse(await res.json())

    const events = data.items ?? []

    if (!events.length) {
      const summary = "[GOOGLE CALENDAR]\nNo upcoming events in the next 48 hours."
      try {
        await kv.put(calendarContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
      } catch (error) {
        logPluginIssue("warn", "plugins.google.context_cache_write_error", userId, error)
      }
      return { status: "available", context: summary }
    }

    const lines = events.map((ev) => {
      const start = ev.start?.dateTime ?? ev.start?.date ?? ""
      const startDate = start ? new Date(start) : null
      const timeStr = startDate
        ? startDate.toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true })
        : "All day"
      return `- ${timeStr}: ${ev.summary ?? "Busy"}`
    })

    const summary = `[GOOGLE CALENDAR — Next 48 hours]\n${lines.join("\n")}`
    try {
      await kv.put(calendarContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
    } catch (error) {
      logPluginIssue("warn", "plugins.google.context_cache_write_error", userId, error)
    }

    return { status: "available", context: summary }
  } catch (error) {
    logPluginIssue("error", "plugins.google.context_fetch_error", userId, error)
    return { status: "error", context: "", errorCode: "CONTEXT_FETCH_FAILED" }
  }
}

export async function fetchCalendarContext(
  kv: KVStore,
  userId: string,
  clientId: string,
  clientSecret: string,
  forceRefresh = false,
): Promise<string> {
  const result = await fetchCalendarContextResult(kv, userId, clientId, clientSecret, forceRefresh)
  return result.context
}

// ─── Fetch Notion Context ─────────────────────────────────────────────────────
export async function fetchNotionContextResult(
  kv: KVStore,
  userId: string,
  forceRefresh = false,
): Promise<PluginContextFetchResult> {
  if (!forceRefresh) {
    try {
      const cached = await kv.get(notionContextKey(userId))
      if (cached) return { status: "available", context: cached }
    } catch (error) {
      logPluginIssue("warn", "plugins.notion.context_cache_read_error", userId, error)
    }
  }

  const tokenResult = await getNotionTokensResult(kv, userId)
  if (tokenResult.status !== "available" || !tokenResult.tokens) {
    return {
      status: tokenResult.status,
      context: "",
      errorCode: tokenResult.errorCode,
    }
  }

  const tokens = tokenResult.tokens

  try {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sort: { direction: "descending", timestamp: "last_edited_time" },
        filter: { value: "page", property: "object" },
        page_size: 10,
      }),
    })

    if (!res.ok) {
      logPluginIssue("error", "plugins.notion.context_fetch_error", userId, `HTTP ${res.status}`, {
        httpStatus: res.status,
      })
      return { status: "error", context: "", errorCode: "CONTEXT_FETCH_FAILED" }
    }

    const data = parseNotionSearchResponse(await res.json())

    const pages = data.results ?? []

    if (!pages.length) {
      const summary = `[NOTION — ${tokens.workspaceName}]\nNo recent pages found.`
      try {
        await kv.put(notionContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
      } catch (error) {
        logPluginIssue("warn", "plugins.notion.context_cache_write_error", userId, error)
      }
      return { status: "available", context: summary }
    }

    const lines = pages.map((page) => {
      const titleProp = page.properties?.title ?? page.properties?.Name
      const titleArr = titleProp?.title ?? titleProp?.rich_text ?? []
      const title = titleArr.map((t) => t.plain_text ?? "").join("") || "Untitled"
      const edited = page.last_edited_time
        ? new Date(page.last_edited_time).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        : ""
      return `- "${title}"${edited ? ` (edited ${edited})` : ""}`
    })

    const summary = `[NOTION — ${tokens.workspaceName}]\nRecent pages:\n${lines.join("\n")}`
    try {
      await kv.put(notionContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
    } catch (error) {
      logPluginIssue("warn", "plugins.notion.context_cache_write_error", userId, error)
    }

    return { status: "available", context: summary }
  } catch (error) {
    logPluginIssue("error", "plugins.notion.context_fetch_error", userId, error)
    return { status: "error", context: "", errorCode: "CONTEXT_FETCH_FAILED" }
  }
}

export async function fetchNotionContext(
  kv: KVStore,
  userId: string,
  forceRefresh = false,
): Promise<string> {
  const result = await fetchNotionContextResult(kv, userId, forceRefresh)
  return result.context
}

// ─── Combined Context Loader ──────────────────────────────────────────────────
export async function loadPluginContext(
  kv: KVStore,
  userId: string,
  googleClientId?: string,
  googleClientSecret?: string,
  notionApiKey?: string,
): Promise<string> {
  const parts: string[] = []

  if (googleClientId && googleClientSecret) {
    const googleResult = await fetchCalendarContextResult(kv, userId, googleClientId, googleClientSecret)
    if (googleResult.context) parts.push(googleResult.context)
  }

  const notionResult = await fetchNotionContextResult(kv, userId)
  if (notionResult.context) {
    parts.push(notionResult.context)
  } else if (notionResult.status === "missing" && notionApiKey) {
    const directCtx = await fetchNotionWithApiKey(notionApiKey)
    if (directCtx) parts.push(directCtx)
  }

  return parts.join("\n\n")
}

// ─── Notion Direct API Key Fetch (Internal Integration) ───────────────────────
export async function fetchNotionWithApiKey(apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sort: { direction: "descending", timestamp: "last_edited_time" },
        filter: { value: "page", property: "object" },
        page_size: 10,
      }),
    })

    if (!res.ok) {
      logPluginIssue("error", "plugins.notion_api.context_fetch_error", undefined, `HTTP ${res.status}`, {
        httpStatus: res.status,
      })
      return ""
    }

    const data = parseNotionSearchResponse(await res.json(), "Invalid Notion API-key search response")

    const pages = data.results ?? []

    if (!pages.length) return "[NOTION]\nNo pages found."

    const lines = pages.map((page) => {
      const titleProp = page.properties?.title ?? page.properties?.Name
      const titleArr = titleProp?.title ?? titleProp?.rich_text ?? []
      const title = titleArr.map((t) => t.plain_text ?? "").join("") || "Untitled"
      const edited = page.last_edited_time
        ? new Date(page.last_edited_time).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        : ""
      return `- "${title}"${edited ? ` (edited ${edited})` : ""}`
    })

    return `[NOTION — Recent Pages]\n${lines.join("\n")}`
  } catch (error) {
    logPluginIssue("error", "plugins.notion_api.context_fetch_error", undefined, error)
    return ""
  }
}
