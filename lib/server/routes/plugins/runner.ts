import { pluginSchema, executePluginSchema } from "@/lib/validation/schemas"
import { createTimer, logError, logRequest } from "@/lib/server/observability/logger"
import { unauthorizedResponse } from "@/lib/server/security/auth"
import { getEnv } from "@/lib/server/platform/env"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import {
  deleteGoogleTokens,
  deleteNotionTokens,
  fetchCalendarContextResult,
  fetchNotionContextResult,
  getGoogleTokensResult,
  getNotionTokensResult,
} from "@/lib/plugins/data-fetcher"
import {
  disconnectPlugin,
  getConnectedPlugin,
  getUserPlugins,
  stripCredentials,
  upsertPlugin,
} from "@/lib/plugins/plugin-store"
import { buildPluginCommand, executePluginCommand } from "@/lib/plugins/plugin-executor"
import { rateLimitHeaders } from "@/lib/server/security/rate-limiter"
import { standardErrors, successResponse } from "@/types/api"
import {
  getAuthenticatedPluginsUserId,
  parsePluginsDisconnectRequestBody,
  parsePluginsRefreshDeleteQuery,
  parsePluginsRouteRequestBody,
  requirePluginsKV,
  runPluginsRouteRateLimitPreflight,
} from "@/lib/server/routes/plugins/helpers"
import type { PluginConfig, PluginId } from "@/types/plugins"

export async function runPluginsGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedPluginsUserId({
    unexpectedErrorResponseFactory: standardErrors.internalError,
    onUnexpectedError: (error) => {
      logError("plugins.get.auth_error", error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runPluginsRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest("plugins.get.rate_limited", userId, startTime)
    return ratePreflight.response
  }

  const { rateResult } = ratePreflight

  try {
    const kvResult = requirePluginsKV(() => successResponse({ plugins: [] }, 200, rateLimitHeaders(rateResult)))
    if (!kvResult.ok) return kvResult.response

    const userPlugins = await getUserPlugins(kvResult.kv, userId)
    const safe = userPlugins.plugins.map(stripCredentials)
    logRequest("plugins.list", userId, startTime, { count: safe.length })
    return successResponse({ plugins: safe }, 200, rateLimitHeaders(rateResult))
  } catch (error) {
    logError("plugins.get.error", error, userId)
    return standardErrors.internalError()
  }
}

export async function runPluginsPostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedPluginsUserId({
    unexpectedErrorResponseFactory: standardErrors.internalError,
    onUnexpectedError: (error) => {
      logError("plugins.post.auth_error", error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runPluginsRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest("plugins.post.rate_limited", userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parsePluginsRouteRequestBody(req, pluginSchema, "Invalid JSON body")
  if (!requestBody.ok) return requestBody.response

  try {
    const kvResult = requirePluginsKV(() => standardErrors.internalError("Storage unavailable"))
    if (!kvResult.ok) return kvResult.response

    const { id, credentials, settings } = requestBody.data
    const config: PluginConfig = {
      id: id as PluginId,
      name: PLUGIN_METADATA[id as PluginId].name,
      status: "connected",
      credentials,
      settings: settings ?? {},
      connectedAt: Date.now(),
    }

    await upsertPlugin(kvResult.kv, userId, config)
    logRequest("plugins.connected", userId, startTime, { pluginId: id })
    return successResponse({ plugin: stripCredentials(config) }, 200, rateLimitHeaders(ratePreflight.rateResult))
  } catch (error) {
    logError("plugins.post.error", error, userId)
    return standardErrors.internalError()
  }
}

export async function runPluginsDeleteRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedPluginsUserId({
    unexpectedErrorResponseFactory: standardErrors.internalError,
    onUnexpectedError: (error) => {
      logError("plugins.delete.auth_error", error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runPluginsRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    logRequest("plugins.delete.rate_limited", userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parsePluginsDisconnectRequestBody(req)
  if (!requestBody.ok) return requestBody.response

  try {
    const kvResult = requirePluginsKV(() => standardErrors.internalError("Storage unavailable"))
    if (!kvResult.ok) return kvResult.response

    await disconnectPlugin(kvResult.kv, userId, requestBody.pluginId)
    logRequest("plugins.disconnected", userId, startTime, { pluginId: requestBody.pluginId })
    return successResponse({ success: true }, 200, rateLimitHeaders(ratePreflight.rateResult))
  } catch (error) {
    logError("plugins.delete.error", error, userId)
    return standardErrors.internalError()
  }
}

export async function runPluginsPatchRoute(req: Request): Promise<Response> {
  const elapsed = createTimer()
  const startTime = Date.now()

  const auth = await getAuthenticatedPluginsUserId({
    unexpectedErrorResponseFactory: standardErrors.internalError,
    onUnexpectedError: (error) => {
      logError("plugins.patch.auth_error", error)
    },
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runPluginsRouteRateLimitPreflight(userId, "ai")
  if (!ratePreflight.ok) {
    logRequest("plugins.patch.rate_limited", userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parsePluginsRouteRequestBody(req, executePluginSchema, "Invalid JSON body")
  if (!requestBody.ok) return requestBody.response

  const { pluginId, userMessage } = requestBody.data

  try {
    const kvResult = requirePluginsKV(() => standardErrors.internalError("Storage unavailable"))
    if (!kvResult.ok) return kvResult.response

    const pluginConfig = await getConnectedPlugin(kvResult.kv, userId, pluginId as PluginId)
    if (!pluginConfig) {
      return new Response(JSON.stringify({ success: false, error: "Plugin not connected" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const command = await buildPluginCommand(userMessage, pluginId as PluginId)
    const result = await executePluginCommand(command, pluginConfig)

    const updated: PluginConfig = { ...pluginConfig, lastUsedAt: Date.now() }
    await upsertPlugin(kvResult.kv, userId, updated)

    const durationMs = elapsed()
    logRequest("plugin.executed", userId, startTime, {
      pluginId,
      action: command.action,
      success: result.success,
      durationMs,
    })
    return successResponse({ result }, 200, rateLimitHeaders(ratePreflight.rateResult))
  } catch (error) {
    logError("plugins.patch.error", error, userId)
    return standardErrors.internalError()
  }
}

export async function runPluginsRefreshGetRoute(): Promise<Response> {
  const auth = await getAuthenticatedPluginsUserId({
    unauthorizedResponseFactory: unauthorizedResponse,
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const kvResult = requirePluginsKV(() => Response.json({ success: false, error: "KV not available" }, { status: 503 }))
  if (!kvResult.ok) return kvResult.response

  const [googleTokens, notionTokens] = await Promise.all([
    getGoogleTokensResult(kvResult.kv, userId),
    getNotionTokensResult(kvResult.kv, userId),
  ])

  return Response.json({
    kvAvailable: true,
    google: googleTokens.status === "available" && googleTokens.tokens
      ? { connected: true, expiresAt: googleTokens.tokens.expiresAt }
      : googleTokens.status === "error"
        ? { connected: false, errorCode: googleTokens.errorCode }
        : null,
    notion: notionTokens.status === "available" && notionTokens.tokens
      ? { connected: true, workspaceName: notionTokens.tokens.workspaceName }
      : notionTokens.status === "error"
        ? { connected: false, errorCode: notionTokens.errorCode }
        : null,
  })
}

export async function runPluginsRefreshPostRoute(): Promise<Response> {
  const auth = await getAuthenticatedPluginsUserId({
    unauthorizedResponseFactory: unauthorizedResponse,
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const kvResult = requirePluginsKV(() => Response.json({ success: false, error: "KV not available" }, { status: 503 }))
  if (!kvResult.ok) return kvResult.response

  try {
    const env = getEnv()
    const results: Record<string, string> = {}

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      const context = await fetchCalendarContextResult(
        kvResult.kv,
        userId,
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        true,
      )
      results.google = context.status === "available"
        ? "refreshed"
        : context.status === "missing"
          ? "no_token"
          : "error"
    }

    const notionContext = await fetchNotionContextResult(kvResult.kv, userId, true)
    results.notion = notionContext.status === "available"
      ? "refreshed"
      : notionContext.status === "missing"
        ? "no_token"
        : "error"

    return Response.json({ success: true, results })
  } catch (error) {
    logError("plugins.refresh_error", error, userId)
    return Response.json({ success: false, error: "Refresh failed" }, { status: 500 })
  }
}

export async function runPluginsRefreshDeleteRoute(req: Request): Promise<Response> {
  const auth = await getAuthenticatedPluginsUserId({
    unauthorizedResponseFactory: unauthorizedResponse,
  })
  if (!auth.ok) return auth.response

  const { userId } = auth
  const kvResult = requirePluginsKV(() => Response.json({ success: false, error: "KV not available" }, { status: 503 }))
  if (!kvResult.ok) return kvResult.response

  const query = parsePluginsRefreshDeleteQuery(req)
  if (!query.ok) return query.response

  if (query.plugin === "google") {
    await deleteGoogleTokens(kvResult.kv, userId)
  } else {
    await deleteNotionTokens(kvResult.kv, userId)
  }

  return Response.json({ success: true })
}
