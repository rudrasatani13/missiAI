import { NextRequest } from "next/server"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getLifeGraph, saveLifeGraph } from "@/lib/memory/life-graph"
import { z } from "zod"
import { sanitizeInput } from "@/lib/validation/sanitizer"
import { logError } from "@/lib/server/logger"
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
  detail: z.string().max(500).transform(sanitizeInput).optional(),
  tags: z.array(z.string().max(50).transform(sanitizeInput)).max(8).optional(),
})

// ─── DELETE — Remove a single node by id ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    // 1. Auth
    let userId: string
    try {
      userId = await getVerifiedUserId()
    } catch (e) {
      if (e instanceof AuthenticationError) return unauthorizedResponse()
      return jsonResponse({ success: false, error: "Auth error" }, 401)
    }

    // 2. Validate nodeId
    const { nodeId } = await params
    const parsed = nodeIdSchema.safeParse(nodeId)
    if (!parsed.success) {
      return jsonResponse({ success: false, error: "Invalid node ID" }, 400)
    }

    // 3. KV
    const kv = getKV()
    if (!kv) {
      return jsonResponse({ success: false, error: "Storage unavailable" }, 503)
    }

    // 4. Delete
    const graph = await getLifeGraph(kv, userId)
    const before = graph.nodes.length
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId)
    
    if (graph.nodes.length < before) {
      await saveLifeGraph(kv, userId, graph)
    }

    return jsonResponse({ success: true, data: { deleted: nodeId } })
  } catch (err) {
    logError("memory.node.delete_error", err)
    return jsonResponse({ success: false, error: "Delete failed" }, 500)
  }
}

// ─── PATCH — Update node detail/tags ──────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    // 1. Auth
    let userId: string
    try {
      userId = await getVerifiedUserId()
    } catch (e) {
      if (e instanceof AuthenticationError) return unauthorizedResponse()
      return jsonResponse({ success: false, error: "Auth error" }, 401)
    }

    // 2. Validate nodeId
    const { nodeId } = await params
    const nodeIdParsed = nodeIdSchema.safeParse(nodeId)
    if (!nodeIdParsed.success) {
      return jsonResponse({ success: false, error: "Invalid node ID" }, 400)
    }

    // 3. Body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
    }

    const parsed = patchBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse({
        success: false,
        error: parsed.error.issues[0]?.message ?? "Validation error",
      }, 400)
    }

    // 4. KV
    const kv = getKV()
    if (!kv) {
      return jsonResponse({ success: false, error: "Storage unavailable" }, 503)
    }

    // 5. Update
    const graph = await getLifeGraph(kv, userId)
    const nodeIndex = graph.nodes.findIndex((n) => n.id === nodeId)

    if (nodeIndex === -1) {
      return jsonResponse({ success: false, error: "Node not found" }, 404)
    }

    const node = graph.nodes[nodeIndex]
    if (node.userId !== userId) {
      return jsonResponse({ success: false, error: "Node not found" }, 404)
    }

    const { detail, tags } = parsed.data
    if (detail !== undefined) node.detail = detail
    if (tags !== undefined) node.tags = tags
    node.updatedAt = Date.now()

    graph.nodes[nodeIndex] = node
    await saveLifeGraph(kv, userId, graph)

    const { userId: _uid, ...nodeWithoutUserId } = node
    return jsonResponse({ success: true, data: nodeWithoutUserId })
  } catch (err) {
    logError("memory.node.update_error", err)
    return jsonResponse({ success: false, error: "Update failed" }, 500)
  }
}
