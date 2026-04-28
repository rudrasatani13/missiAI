import { NextRequest } from "next/server"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/security/auth"
import {
  parseMemoryReadQuery,
  parseMemoryWriteRequest,
  resolveMemoryDeleteNodeId,
  validateMemoryDeleteNodeId,
} from "@/lib/server/routes/memory/helpers"
import {
  executeMemoryDelete,
  executeMemoryRead,
  executeMemoryWrite,
  scheduleMemoryReadFollowUps,
  scheduleMemoryWriteFollowUps,
} from "@/lib/server/routes/memory/runner"
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import {
  checkRateLimit,
  rateLimitExceededResponse,
  rateLimitHeaders,
} from "@/lib/server/security/rate-limiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logRequest, logError } from "@/lib/server/observability/logger"
import { jsonResponse } from "@/lib/server/api/response"

// ─── GET — Load life graph or search by query ─────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.auth_error", e)
    throw e
  }

  // OWASP API4: rate-limit memory reads — search calls may invoke Gemini embeddings
  const planId = await getUserPlan(userId)
  const rateTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("memory.get.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // OWASP A03: validate query params before passing to downstream functions
  const parsedReadQuery = parseMemoryReadQuery(req.nextUrl.searchParams.get("query"), req.nextUrl.searchParams.get("category"))
  if (!parsedReadQuery.ok) return parsedReadQuery.response

  try {
    const kv = getCloudflareKVBinding()
    const vectorizeEnv = getCloudflareVectorizeEnv()
    const readResult = await executeMemoryRead(kv, vectorizeEnv, userId, parsedReadQuery.data)

    if (readResult.kind === "fallback") {
      logError("memory.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        503,
        rateLimitHeaders(rateResult),
      )
    }

    logRequest("memory.read", userId, startTime, readResult.logContext)
    scheduleMemoryReadFollowUps(kv, userId)

    return jsonResponse({ success: true, data: readResult.data }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError("memory.read_error", err, userId)
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
      rateLimitHeaders(rateResult),
    )
  }
}

// ─── POST — Extract life nodes from conversation, add/update ──────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.auth_error", e)
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, "ai")
  if (!rateResult.allowed) {
    logRequest("memory.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const parsed = await parseMemoryWriteRequest(req)
  if (!parsed.ok) {
    logRequest(
      parsed.kind === "invalid_json" ? "memory.invalid_json" : "memory.validation_error",
      userId,
      startTime,
    )
    return parsed.response
  }

  const { conversation, interactionCount, incognito, analyticsOptOut } = parsed.data

  // Incognito mode is a hard stop — honour the user's request to keep this
  // conversation out of their life graph entirely. We return a benign success
  // so the sendBeacon caller (`saveMemoryBeacon`) doesn't surface an error.
  if (incognito) {
    logRequest("memory.skipped_incognito", userId, startTime, {
      interactionCount,
    })
    return jsonResponse({ success: true, skipped: "incognito" })
  }

  const kv = getCloudflareKVBinding()
  if (!kv) {
    logError(
      "memory.kv_unavailable",
      "KV binding MISSI_MEMORY not found",
      userId,
    )
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }

  try {
    const vectorizeEnv = getCloudflareVectorizeEnv()
    const { added, updated, graph } = await executeMemoryWrite(
      kv,
      vectorizeEnv,
      userId,
      conversation,
      interactionCount,
    )

    logRequest("memory.write", userId, startTime, {
      nodeCount: graph.nodes.length,
      added,
      updated,
      totalInteractions: graph.totalInteractions,
    })

    await scheduleMemoryWriteFollowUps(kv, userId, analyticsOptOut, interactionCount, added)

    return jsonResponse({ success: true, data: { added, updated } }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError("memory.write_error", err, userId)
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }
}

// ─── DELETE — Remove a single memory node ─────────────────────────────────────
// Accepts nodeId from query param (?nodeId=xxx) or JSON body ({ nodeId: "xxx" })
// This lives in the parent route because the [nodeId] dynamic route has
// Cloudflare edge worker compilation issues.

export async function DELETE(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.delete.auth_error", e)
    return jsonResponse({ success: false, error: "Auth error", code: "AUTH_ERROR" }, 401)
  }

  try {
    const parsedNodeId = validateMemoryDeleteNodeId(await resolveMemoryDeleteNodeId(req))
    if (!parsedNodeId.ok) return parsedNodeId.response
    const nodeId = parsedNodeId.data

    const kv = getCloudflareKVBinding()
    if (!kv) {
      logError("memory.delete.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse({ success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" }, 503)
    }
    const vectorizeEnv = getCloudflareVectorizeEnv()

    const deleteResult = await executeMemoryDelete(kv, vectorizeEnv, userId, nodeId)
    if (deleteResult.didDelete) {
      logRequest("memory.node.deleted", userId, startTime, { nodeId })
    }

    return jsonResponse({ success: true, data: { deleted: deleteResult.deleted } })
  } catch (err) {
    logError("memory.delete.error", err, userId)
    return jsonResponse({ success: false, error: "Failed to delete memory", code: "INTERNAL_ERROR" }, 500)
  }
}
