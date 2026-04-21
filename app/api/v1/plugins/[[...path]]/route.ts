// ─── Plugins — Consolidated Catch-All Route ───────────────────────────────────
//
// Handles:
//   path=[] (base)       → GET (list), POST (connect), DELETE (disconnect), PATCH (execute)
//   path=["refresh"]     → GET (status), POST (refresh), DELETE (disconnect plugin)

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { pluginSchema, executePluginSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import { getUserPlugins, upsertPlugin, disconnectPlugin, getConnectedPlugin, stripCredentials } from "@/lib/plugins/plugin-store"
import { buildPluginCommand, executePluginCommand } from "@/lib/plugins/plugin-executor"
import { fetchCalendarContext, fetchNotionContext, deleteGoogleTokens, deleteNotionTokens, getGoogleTokens, getNotionTokens } from "@/lib/plugins/data-fetcher"
import { successResponse, standardErrors } from "@/types/api"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import type { KVStore } from "@/types"
import type { PluginConfig, PluginId } from "@/types/plugins"


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Base Plugins GET ─────────────────────────────────────────────────────────

async function handlePluginsGet() {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.get.auth_error", e); return standardErrors.internalError()
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.get.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  try {
    const kv = getKV()
    if (!kv) return successResponse({ plugins: [] }, 200, rateLimitHeaders(rateResult))

    const userPlugins = await getUserPlugins(kv, userId)
    const safe = userPlugins.plugins.map(stripCredentials)
    logRequest("plugins.list", userId, startTime, { count: safe.length })
    return successResponse({ plugins: safe }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.get.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── Base Plugins POST ────────────────────────────────────────────────────────

async function handlePluginsPost(req: Request) {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.post.auth_error", e); return standardErrors.internalError()
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.post.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try { body = await req.json() } catch { return standardErrors.validationError("Invalid JSON body") }

  const parsed = pluginSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { id, credentials, settings } = parsed.data
  try {
    const kv = getKV()
    if (!kv) return standardErrors.internalError("Storage unavailable")

    const config: PluginConfig = {
      id: id as PluginId, name: PLUGIN_METADATA[id as PluginId].name,
      status: "connected", credentials, settings: settings ?? {},
      connectedAt: Date.now(),
    }
    await upsertPlugin(kv, userId, config)
    logRequest("plugins.connected", userId, startTime, { pluginId: id })
    return successResponse({ plugin: stripCredentials(config) }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.post.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── Base Plugins DELETE ──────────────────────────────────────────────────────

async function handlePluginsDelete(req: Request) {
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.delete.auth_error", e); return standardErrors.internalError()
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.delete.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try { body = await req.json() } catch { return standardErrors.validationError("Invalid JSON body") }

  const { id } = (body as { id?: unknown })
  if (typeof id !== "string" || !["notion", "google_calendar", "webhook"].includes(id)) {
    return standardErrors.validationError("Invalid plugin id")
  }

  try {
    const kv = getKV()
    if (!kv) return standardErrors.internalError("Storage unavailable")
    await disconnectPlugin(kv, userId, id as PluginId)
    logRequest("plugins.disconnected", userId, startTime, { pluginId: id })
    return successResponse({ success: true }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.delete.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── Base Plugins PATCH ───────────────────────────────────────────────────────

async function handlePluginsPatch(req: Request) {
  const elapsed = createTimer()
  const startTime = Date.now()

  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.patch.auth_error", e); return standardErrors.internalError()
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("plugins.patch.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try { body = await req.json() } catch { return standardErrors.validationError("Invalid JSON body") }

  const parsed = executePluginSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const { pluginId, userMessage } = parsed.data

  try {
    const kv = getKV()
    if (!kv) return standardErrors.internalError("Storage unavailable")

    const pluginConfig = await getConnectedPlugin(kv, userId, pluginId as PluginId)
    if (!pluginConfig) {
      return new Response(JSON.stringify({ success: false, error: "Plugin not connected" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    const command = await buildPluginCommand(userMessage, pluginId as PluginId)
    const result = await executePluginCommand(command, pluginConfig)

    const updated: PluginConfig = { ...pluginConfig, lastUsedAt: Date.now() }
    await upsertPlugin(kv, userId, updated)

    const durationMs = elapsed()
    logRequest("plugin.executed", userId, startTime, { pluginId, action: command.action, success: result.success, durationMs })
    return successResponse({ result }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.patch.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── Refresh GET ──────────────────────────────────────────────────────────────

async function handleRefreshGet() {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return Response.json({ success: false, error: "KV not available" }, { status: 503 })

  const [googleTokens, notionTokens] = await Promise.all([
    getGoogleTokens(kv, userId),
    getNotionTokens(kv, userId),
  ])

  return Response.json({
    kvAvailable: true,
    google: googleTokens ? { connected: true, expiresAt: googleTokens.expiresAt } : null,
    notion: notionTokens ? { connected: true, workspaceName: notionTokens.workspaceName } : null,
  })
}

// ─── Refresh POST ─────────────────────────────────────────────────────────────

async function handleRefreshPost() {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return Response.json({ success: false, error: "KV not available" }, { status: 503 })

  try {
    const env = getEnv()
    const results: Record<string, string> = {}

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      const ctx = await fetchCalendarContext(kv, userId, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, true)
      results.google = ctx ? "refreshed" : "no_token"
    }

    const notionCtx = await fetchNotionContext(kv, userId, true)
    results.notion = notionCtx ? "refreshed" : "no_token"

    return Response.json({ success: true, results })
  } catch (err) {
    logError("plugins.refresh_error", err, userId)
    return Response.json({ success: false, error: "Refresh failed" }, { status: 500 })
  }
}

// ─── Refresh DELETE ───────────────────────────────────────────────────────────

async function handleRefreshDelete(req: Request) {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const { searchParams } = new URL(req.url)
  const plugin = searchParams.get("plugin")

  const kv = getKV()
  if (!kv) return Response.json({ success: false, error: "KV not available" }, { status: 503 })

  if (plugin === "google") await deleteGoogleTokens(kv, userId)
  else if (plugin === "notion") await deleteNotionTokens(kv, userId)
  else return Response.json({ success: false, error: "Invalid plugin" }, { status: 400 })

  return Response.json({ success: true })
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsGet()
  if (segment === 'refresh') return handleRefreshGet()
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsPost(req)
  if (segment === 'refresh') return handleRefreshPost()
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsDelete(req)
  if (segment === 'refresh') return handleRefreshDelete(req)
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handlePluginsPatch(req)
  return Response.json({ error: 'Not found' }, { status: 404 })
}
