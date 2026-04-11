import { NextRequest } from "next/server"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getLifeGraph, saveLifeGraph } from "@/lib/memory/life-graph"
import { logRequest, logError } from "@/lib/server/logger"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { z } from "zod"
import type { KVStore } from "@/types"

export const runtime = "edge"

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

const nodeIdSchema = z.string().min(1).max(50)

const patchBodySchema = z.object({
  detail: z.string().max(500).optional(),
  tags: z.array(z.string()).max(8).optional(),
})

/**
 * Safely get the user's plan, falling back to "free" if Clerk is unavailable.
 * This prevents the entire handler from crashing if the Clerk backend API
 * is slow or temporarily unreachable on the edge runtime.
 */
async function safeGetUserPlan(userId: string): Promise<string> {
  try {
    return await getUserPlan(userId)
  } catch (e) {
    logError("memory.node.plan_fetch_error", e, userId)
    return "free"
  }
}

// ─── DELETE — Remove a single node by id ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const startTime = Date.now()
  let userId = "unknown"

  try {
    // 1. Auth
    try {
      userId = await getVerifiedUserId()
    } catch (e) {
      if (e instanceof AuthenticationError) return unauthorizedResponse()
      logError("memory.node.auth_error", e)
      return jsonResponse({ success: false, error: "Authentication failed", code: "AUTH_ERROR" }, 401)
    }

    // 2. Rate limit (non-blocking if getUserPlan fails)
    const planId = await safeGetUserPlan(userId)
    const rateTier = planId === "free" ? "free" : "paid"
    const rateResult = await checkRateLimit(userId, rateTier)
    if (!rateResult.allowed) {
      logRequest("memory.node.delete.rate_limited", userId, startTime)
      return rateLimitExceededResponse(rateResult)
    }

    // 3. Validate nodeId
    const { nodeId } = await context.params
    const parsed = nodeIdSchema.safeParse(nodeId)
    if (!parsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid node ID", code: "VALIDATION_ERROR" },
        400,
      )
    }

    // 4. KV
    const kv = getKV()
    if (!kv) {
      logError("memory.node.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse(
        { success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" },
        500,
      )
    }

    // 5. Delete
    const graph = await getLifeGraph(kv, userId)
    const nodeExists = graph.nodes.some((n) => n.id === nodeId)

    if (!nodeExists) {
      // Node already gone — treat as success (idempotent delete)
      return jsonResponse({ success: true, data: { deleted: nodeId } }, 200, rateLimitHeaders(rateResult))
    }

    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId)
    await saveLifeGraph(kv, userId, graph)

    logRequest("memory.node.deleted", userId, startTime, { nodeId })

    return jsonResponse({ success: true, data: { deleted: nodeId } }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError("memory.node.delete_error", err, userId)
    return jsonResponse(
      { success: false, error: "Failed to delete memory. Please try again.", code: "INTERNAL_ERROR" },
      500,
    )
  }
}

// ─── PATCH — Update node detail/tags ──────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ nodeId: string }> },
) {
  const startTime = Date.now()
  let userId = "unknown"

  try {
    // 1. Auth
    try {
      userId = await getVerifiedUserId()
    } catch (e) {
      if (e instanceof AuthenticationError) return unauthorizedResponse()
      logError("memory.node.auth_error", e)
      return jsonResponse({ success: false, error: "Authentication failed", code: "AUTH_ERROR" }, 401)
    }

    // 2. Rate limit (non-blocking if getUserPlan fails)
    const planId = await safeGetUserPlan(userId)
    const rateTier = planId === "free" ? "free" : "paid"
    const rateResult = await checkRateLimit(userId, rateTier)
    if (!rateResult.allowed) {
      logRequest("memory.node.patch.rate_limited", userId, startTime)
      return rateLimitExceededResponse(rateResult)
    }

    // 3. Validate nodeId
    const { nodeId } = await context.params
    const nodeIdParsed = nodeIdSchema.safeParse(nodeId)
    if (!nodeIdParsed.success) {
      return jsonResponse(
        { success: false, error: "Invalid node ID", code: "VALIDATION_ERROR" },
        400,
      )
    }

    // 4. Body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse(
        { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
        400,
      )
    }

    const parsed = patchBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Validation error",
          code: "VALIDATION_ERROR",
        },
        400,
      )
    }

    // 5. KV
    const kv = getKV()
    if (!kv) {
      logError("memory.node.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse(
        { success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" },
        500,
      )
    }

    // 6. Update
    const graph = await getLifeGraph(kv, userId)
    const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId)

    if (nodeIndex === -1) {
      return jsonResponse(
        { success: false, error: "Node not found", code: "NOT_FOUND" },
        404,
      )
    }

    const node = graph.nodes[nodeIndex]
    if (node.userId !== userId) {
      return jsonResponse(
        { success: false, error: "Node not found", code: "NOT_FOUND" },
        404,
      )
    }

    const { detail, tags } = parsed.data
    if (detail !== undefined) node.detail = detail
    if (tags !== undefined) node.tags = tags
    node.updatedAt = Date.now()

    graph.nodes[nodeIndex] = node
    await saveLifeGraph(kv, userId, graph)

    logRequest("memory.node.updated", userId, startTime, { nodeId })

    const { userId: _uid, ...nodeWithoutUserId } = node
    return jsonResponse({ success: true, data: nodeWithoutUserId }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError("memory.node.update_error", err, userId)
    return jsonResponse(
      { success: false, error: "Failed to update memory. Please try again.", code: "INTERNAL_ERROR" },
      500,
    )
  }
}
