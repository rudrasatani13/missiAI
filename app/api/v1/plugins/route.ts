import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { pluginSchema, executePluginSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import { getUserPlugins, upsertPlugin, disconnectPlugin, getConnectedPlugin, stripCredentials } from "@/lib/plugins/plugin-store"
import { buildPluginCommand, executePluginCommand } from "@/lib/plugins/plugin-executor"
import { successResponse, standardErrors } from "@/types/api"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import type { KVStore } from "@/types"
import type { PluginConfig, PluginId } from "@/types/plugins"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

// ─── GET — list connected plugins (credentials stripped) ─────────────────────

export async function GET() {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.get.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit per user to prevent enumeration/abuse
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.get.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  try {
    const kv = getKV()
    if (!kv) {
      return successResponse({ plugins: [] }, 200, rateLimitHeaders(rateResult))
    }

    const userPlugins = await getUserPlugins(kv, userId)
    const safe = userPlugins.plugins.map(stripCredentials)

    logRequest("plugins.list", userId, startTime, { count: safe.length })
    return successResponse({ plugins: safe }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.get.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── POST — connect a plugin ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.post.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit plugin connections to prevent credential-stuffing
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.post.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return standardErrors.validationError("Invalid JSON body")
  }

  const parsed = pluginSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { id, credentials, settings } = parsed.data

  try {
    const kv = getKV()
    if (!kv) {
      return standardErrors.internalError("Storage unavailable")
    }

    const config: PluginConfig = {
      id: id as PluginId,
      name: PLUGIN_METADATA[id as PluginId].name,
      status: "connected",
      credentials,
      settings: settings ?? {},
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

// ─── DELETE — disconnect a plugin ────────────────────────────────────────────

export async function DELETE(req: Request) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.delete.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit to prevent bulk disconnection abuse
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("plugins.delete.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return standardErrors.validationError("Invalid JSON body")
  }

  const { id } = (body as { id?: unknown })
  if (typeof id !== "string" || !["notion", "google_calendar", "webhook"].includes(id)) {
    return standardErrors.validationError("Invalid plugin id")
  }

  try {
    const kv = getKV()
    if (!kv) {
      return standardErrors.internalError("Storage unavailable")
    }

    await disconnectPlugin(kv, userId, id as PluginId)

    logRequest("plugins.disconnected", userId, startTime, { pluginId: id })
    return successResponse({ success: true }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.delete.error", e, userId)
    return standardErrors.internalError()
  }
}

// ─── PATCH — execute plugin action from voice command ────────────────────────

export async function PATCH(req: Request) {
  const elapsed = createTimer()
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("plugins.patch.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit plugin execution — each call may trigger external API requests
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("plugins.patch.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return standardErrors.validationError("Invalid JSON body")
  }

  const parsed = executePluginSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { pluginId, userMessage } = parsed.data

  try {
    const kv = getKV()
    if (!kv) {
      return standardErrors.internalError("Storage unavailable")
    }

    const pluginConfig = await getConnectedPlugin(kv, userId, pluginId as PluginId)
    if (!pluginConfig) {
      return new Response(
        JSON.stringify({ success: false, error: "Plugin not connected" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const appEnv = getEnv()

    const command = await buildPluginCommand(userMessage, pluginId as PluginId, apiKey)
    const result = await executePluginCommand(command, pluginConfig, apiKey)

    // Update lastUsedAt
    const updated: PluginConfig = { ...pluginConfig, lastUsedAt: Date.now() }
    await upsertPlugin(kv, userId, updated)

    const durationMs = elapsed()
    logRequest("plugin.executed", userId, startTime, {
      pluginId,
      action: command.action,
      success: result.success,
      durationMs,
    })

    return successResponse({ result }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("plugins.patch.error", e, userId)
    return standardErrors.internalError()
  }
}
