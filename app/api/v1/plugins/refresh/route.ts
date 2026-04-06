import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { fetchCalendarContext, fetchNotionContext, deleteGoogleTokens, deleteNotionTokens, getGoogleTokens, getNotionTokens } from "@/lib/plugins/data-fetcher"
import { logError } from "@/lib/server/logger"

export const runtime = "edge"

function getKV() {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Plugin Context Refresh + Status ─────────────────────────────────────────
// GET: returns current connection status for google + notion
// POST: force-refreshes context cache for connected plugins
// DELETE: disconnects a plugin (deletes tokens)

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()

  // ── Local dev fallback: read tokens from cookies ───────────────────────────
  if (!kv) {
    const cookieHeader = req.headers.get("cookie") ?? ""
    const parseCookie = (name: string) => {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
      if (!match) return null
      try { return JSON.parse(decodeURIComponent(match[1])) } catch { return null }
    }

    const gTokens = parseCookie(`google_tokens_${userId}`)
    const nTokens = parseCookie(`notion_tokens_${userId}`)

    return Response.json({
      kvAvailable: false,
      localDev: true,
      google: gTokens ? { connected: true, expiresAt: gTokens.expiresAt } : null,
      notion: nTokens ? { connected: true, workspaceName: nTokens.workspaceName ?? "Notion" } : null,
    })
  }

  const [googleTokens, notionTokens] = await Promise.all([
    getGoogleTokens(kv, userId),
    getNotionTokens(kv, userId),
  ])

  return Response.json({
    kvAvailable: true,
    google: googleTokens
      ? { connected: true, expiresAt: googleTokens.expiresAt }
      : null,
    notion: notionTokens
      ? { connected: true, workspaceName: notionTokens.workspaceName }
      : null,
  })
}

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return Response.json({ success: false, error: "KV not available" }, { status: 503 })
  }

  try {
    const env = getEnv()
    const results: Record<string, string> = {}

    // Refresh calendar context
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      const ctx = await fetchCalendarContext(kv, userId, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, true)
      results.google = ctx ? "refreshed" : "no_token"
    }

    // Refresh Notion context
    const notionCtx = await fetchNotionContext(kv, userId, true)
    results.notion = notionCtx ? "refreshed" : "no_token"

    return Response.json({ success: true, results })
  } catch (err) {
    logError("plugins.refresh_error", err, userId)
    return Response.json({ success: false, error: "Refresh failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const { searchParams } = new URL(req.url)
  const plugin = searchParams.get("plugin") // "google" | "notion"

  const kv = getKV()
  if (!kv) {
    return Response.json({ success: false, error: "KV not available" }, { status: 503 })
  }

  if (plugin === "google") {
    await deleteGoogleTokens(kv, userId)
  } else if (plugin === "notion") {
    await deleteNotionTokens(kv, userId)
  } else {
    return Response.json({ success: false, error: "Invalid plugin" }, { status: 400 })
  }

  return Response.json({ success: true })
}
