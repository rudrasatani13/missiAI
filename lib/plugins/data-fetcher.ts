// ─── Plugin Data Fetcher ──────────────────────────────────────────────────────
// Fetches live data from Google Calendar and Notion using stored OAuth tokens.
// Results are cached in KV with a TTL so chat requests stay fast.

import { decryptFromKV, kvPut } from "@/lib/server/kv-crypto"
import type { KVStore } from "@/types"

const CONTEXT_TTL_SECONDS = 60 * 15 // 15 min cache
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90

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

export async function getGoogleTokens(kv: KVStore, userId: string): Promise<GoogleTokens | null> {
  try {
    const key = googleTokenKey(userId)
    const raw = await kv.get(key)
    if (!raw) return null
    const decrypted = await decryptFromKV(raw)
    const parsed = JSON.parse(decrypted) as GoogleTokens
    if (raw === decrypted) {
      try {
        await kvPut(kv, key, JSON.stringify(parsed), {
          expirationTtl: TOKEN_TTL_SECONDS,
        })
      } catch {}
    }
    return parsed
  } catch { return null }
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

export async function getNotionTokens(kv: KVStore, userId: string): Promise<NotionTokens | null> {
  try {
    const key = notionTokenKey(userId)
    const raw = await kv.get(key)
    if (!raw) return null
    const decrypted = await decryptFromKV(raw)
    const parsed = JSON.parse(decrypted) as NotionTokens
    if (raw === decrypted) {
      try {
        await kvPut(kv, key, JSON.stringify(parsed), {
          expirationTtl: TOKEN_TTL_SECONDS,
        })
      } catch {}
    }
    return parsed
  } catch { return null }
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
): Promise<GoogleTokens | null> {
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
    if (!res.ok) return null
    const data = await res.json() as any
    return {
      ...tokens,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
  } catch { return null }
}

// ─── Fetch Google Calendar Context ────────────────────────────────────────────
export async function fetchCalendarContext(
  kv: KVStore,
  userId: string,
  clientId: string,
  clientSecret: string,
  forceRefresh = false,
): Promise<string> {
  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = await kv.get(calendarContextKey(userId))
      if (cached) return cached
    } catch {}
  }

  const tokens = await getGoogleTokens(kv, userId)
  if (!tokens) return ""

  // Refresh access token if expired
  let activeTokens = tokens
  if (Date.now() > tokens.expiresAt - 60_000) {
    const refreshed = await refreshGoogleToken(tokens, clientId, clientSecret)
    if (refreshed) {
      activeTokens = refreshed
      await saveGoogleTokens(kv, userId, refreshed)
    } else {
      return ""
    }
  }

  try {
    // Fetch events for next 48 hours
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

    if (!res.ok) return ""

    const data = await res.json() as any
    const events = (data.items ?? []) as any[]

    if (!events.length) {
      const summary = "[GOOGLE CALENDAR]\nNo upcoming events in the next 48 hours."
      await kv.put(calendarContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
      return summary
    }

    const lines = events.map((ev: any) => {
      const start = ev.start?.dateTime ?? ev.start?.date ?? ""
      const startDate = start ? new Date(start) : null
      const timeStr = startDate
        ? startDate.toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true })
        : "All day"
      return `- ${timeStr}: ${ev.summary ?? "Busy"}`
    })

    const summary = `[GOOGLE CALENDAR — Next 48 hours]\n${lines.join("\n")}`
    await kv.put(calendarContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
    return summary
  } catch { return "" }
}

// ─── Fetch Notion Context ─────────────────────────────────────────────────────
export async function fetchNotionContext(
  kv: KVStore,
  userId: string,
  forceRefresh = false,
): Promise<string> {
  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = await kv.get(notionContextKey(userId))
      if (cached) return cached
    } catch {}
  }

  const tokens = await getNotionTokens(kv, userId)
  if (!tokens) return ""

  try {
    // Search for recently edited pages
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

    if (!res.ok) return ""

    const data = await res.json() as any
    const pages = (data.results ?? []) as any[]

    if (!pages.length) {
      const summary = `[NOTION — ${tokens.workspaceName}]\nNo recent pages found.`
      await kv.put(notionContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
      return summary
    }

    const lines = pages.map((page: any) => {
      const titleProp = page.properties?.title ?? page.properties?.Name
      const titleArr = titleProp?.title ?? titleProp?.rich_text ?? []
      const title = titleArr.map((t: any) => t.plain_text ?? "").join("") || "Untitled"
      const edited = page.last_edited_time
        ? new Date(page.last_edited_time).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        : ""
      return `- "${title}"${edited ? ` (edited ${edited})` : ""}`
    })

    const summary = `[NOTION — ${tokens.workspaceName}]\nRecent pages:\n${lines.join("\n")}`
    await kv.put(notionContextKey(userId), summary, { expirationTtl: CONTEXT_TTL_SECONDS })
    return summary
  } catch { return "" }
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
    const calCtx = await fetchCalendarContext(kv, userId, googleClientId, googleClientSecret)
    if (calCtx) parts.push(calCtx)
  }

  // Try OAuth token first, then fall back to server-side API key
  const notionOAuthCtx = await fetchNotionContext(kv, userId)
  if (notionOAuthCtx) {
    parts.push(notionOAuthCtx)
  } else if (notionApiKey) {
    // Direct API key (internal integration) — fetch without OAuth
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

    if (!res.ok) return ""

    const data = await res.json() as any
    const pages = (data.results ?? []) as any[]

    if (!pages.length) return "[NOTION]\nNo pages found."

    const lines = pages.map((page: any) => {
      const titleProp = page.properties?.title ?? page.properties?.Name
      const titleArr = titleProp?.title ?? titleProp?.rich_text ?? []
      const title = titleArr.map((t: any) => t.plain_text ?? "").join("") || "Untitled"
      const edited = page.last_edited_time
        ? new Date(page.last_edited_time).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        : ""
      return `- "${title}"${edited ? ` (edited ${edited})` : ""}`
    })

    return `[NOTION — Recent Pages]\n${lines.join("\n")}`
  } catch { return "" }
}
