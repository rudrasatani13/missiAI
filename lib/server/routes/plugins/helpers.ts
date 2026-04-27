import { z } from "zod"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"
import { validationErrorResponse } from "@/lib/validation/schemas"
import { standardErrors } from "@/types/api"
import type { RateLimitResult, RouteType, UserTier } from "@/lib/server/security/rate-limiter"
import type { KVStore } from "@/types"
import type { PluginId } from "@/types/plugins"

const pluginIdSchema = z.enum(["notion", "google_calendar", "webhook"])

export type PluginsRouteAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedPluginsUserId(
  options: {
    unauthorizedResponseFactory?: () => Response
    unexpectedErrorResponseFactory?: () => Response
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<PluginsRouteAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        ok: false,
        response: (options.unauthorizedResponseFactory ?? standardErrors.unauthorized)(),
      }
    }

    options.onUnexpectedError?.(error)
    if (options.unexpectedErrorResponseFactory) {
      return {
        ok: false,
        response: options.unexpectedErrorResponseFactory(),
      }
    }

    throw error
  }
}

export function getPluginsKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type PluginsRouteKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requirePluginsKV(unavailableResponseFactory: () => Response): PluginsRouteKvResult {
  const kv = getPluginsKV()
  if (!kv) {
    return {
      ok: false,
      response: unavailableResponseFactory(),
    }
  }

  return { ok: true, kv }
}

export type PluginsRouteRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runPluginsRouteRateLimitPreflight(
  userId: string,
  route: RouteType = "api",
): Promise<PluginsRouteRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, route)

  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return {
    ok: true,
    rateResult,
  }
}

export type PluginsRouteRequestBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export async function parsePluginsRouteRequestBody<T>(
  req: Pick<Request, "json">,
  schema: z.ZodType<T>,
  invalidJsonError: string,
): Promise<PluginsRouteRequestBodyResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: standardErrors.validationError(invalidJsonError),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: validationErrorResponse(parsed.error),
    }
  }

  return {
    ok: true,
    data: parsed.data,
  }
}

export type PluginsDisconnectRequestBodyResult =
  | { ok: true; pluginId: PluginId }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export async function parsePluginsDisconnectRequestBody(
  req: Pick<Request, "json">,
): Promise<PluginsDisconnectRequestBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: standardErrors.validationError("Invalid JSON body"),
    }
  }

  const parsed = z.object({ id: pluginIdSchema }).safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: standardErrors.validationError("Invalid plugin id"),
    }
  }

  return {
    ok: true,
    pluginId: parsed.data.id,
  }
}

export type PluginsRefreshDeleteTarget = "google" | "notion"

export type PluginsRefreshDeleteQueryResult =
  | { ok: true; plugin: PluginsRefreshDeleteTarget }
  | { ok: false; response: Response }

export function parsePluginsRefreshDeleteQuery(
  req: Pick<Request, "url">,
): PluginsRefreshDeleteQueryResult {
  const plugin = new URL(req.url).searchParams.get("plugin")
  if (plugin !== "google" && plugin !== "notion") {
    return {
      ok: false,
      response: Response.json({ success: false, error: "Invalid plugin" }, { status: 400 }),
    }
  }

  return {
    ok: true,
    plugin,
  }
}
