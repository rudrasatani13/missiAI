import { NextRequest } from "next/server"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getLifeGraph, saveLifeGraph } from "@/lib/memory/life-graph"
import { logRequest, logError } from "@/lib/server/logger"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { z } from "zod"
import type { KVStore } from "@/types"

export const runtime = "edge"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

// ─── DELETE — Remove a single node by id ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.node.auth_error", e)
    throw e
  }

  const { nodeId } = await params
  const parsed = nodeIdSchema.safeParse(nodeId)
  if (!parsed.success) {
    return jsonResponse(
      { success: false, error: "Invalid node ID", code: "VALIDATION_ERROR" },
      400,
    )
  }

  const kv = getKV()
  if (!kv) {
    logError("memory.node.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
    return jsonResponse(
      { success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" },
      500,
    )
  }

  try {
    const graph = await getLifeGraph(kv, userId)
    const nodeExists = graph.nodes.some((n) => n.id === nodeId)

    if (!nodeExists) {
      // Node already gone — treat as success (idempotent delete)
      return jsonResponse({ success: true, data: { deleted: nodeId } })
    }

    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId)
    await saveLifeGraph(kv, userId, graph)

    logRequest("memory.node.deleted", userId, startTime, { nodeId })

    return jsonResponse({ success: true, data: { deleted: nodeId } })
  } catch (err) {
    logError("memory.node.delete_error", err, userId)
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }
}

// ─── PATCH — Update node detail/tags ──────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.node.auth_error", e)
    throw e
  }

  // OWASP API4: rate-limit node updates — each writes the full life graph to KV
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    logRequest("memory.node.patch.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  const { nodeId } = await params
  const nodeIdParsed = nodeIdSchema.safeParse(nodeId)
  if (!nodeIdParsed.success) {
    return jsonResponse(
      { success: false, error: "Invalid node ID", code: "VALIDATION_ERROR" },
      400,
    )
  }

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

  const kv = getKV()
  if (!kv) {
    logError("memory.node.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
    return jsonResponse(
      { success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" },
      500,
    )
  }

  try {
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
    return jsonResponse({ success: true, data: nodeWithoutUserId })
  } catch (err) {
    logError("memory.node.update_error", err, userId)
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }
}
