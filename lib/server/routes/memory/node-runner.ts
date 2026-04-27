import { logError } from "@/lib/server/observability/logger"
import { getLifeGraph, syncLifeNodeToV2, syncLifeNodeVector } from "@/lib/memory/life-graph"
import { executeMemoryDelete } from "@/lib/server/routes/memory/runner"
import {
  getAuthenticatedMemoryNodeUserId,
  getMemoryNodeKV,
  getMemoryNodeVectorizeEnv,
  memoryNodeJsonResponse,
  parseMemoryNodePatchRequest,
  parseMemoryNodeRouteNodeId,
} from "@/lib/server/routes/memory/node-helpers"

export async function runMemoryNodeDeleteRoute(
  params: Promise<{ nodeId: string }>,
): Promise<Response> {
  try {
    const auth = await getAuthenticatedMemoryNodeUserId()
    if (!auth.ok) return auth.response

    const { nodeId } = await params
    const parsed = parseMemoryNodeRouteNodeId(nodeId)
    if (!parsed.ok) {
      return parsed.response
    }

    const kv = getMemoryNodeKV()
    if (!kv) {
      return memoryNodeJsonResponse({ success: false, error: "Storage unavailable" }, 503)
    }

    const vectorizeEnv = getMemoryNodeVectorizeEnv()
    const deleteResult = await executeMemoryDelete(kv, vectorizeEnv, auth.userId, parsed.data)

    return memoryNodeJsonResponse({ success: true, data: { deleted: deleteResult.deleted } })
  } catch (error) {
    logError("memory.node.delete_error", error)
    return memoryNodeJsonResponse({ success: false, error: "Delete failed" }, 500)
  }
}

export async function runMemoryNodePatchRoute(
  req: Request,
  params: Promise<{ nodeId: string }>,
): Promise<Response> {
  try {
    const auth = await getAuthenticatedMemoryNodeUserId()
    if (!auth.ok) return auth.response

    const { nodeId } = await params
    const parsedNodeId = parseMemoryNodeRouteNodeId(nodeId)
    if (!parsedNodeId.ok) {
      return parsedNodeId.response
    }

    const parsedBody = await parseMemoryNodePatchRequest(req)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const kv = getMemoryNodeKV()
    if (!kv) {
      return memoryNodeJsonResponse({ success: false, error: "Storage unavailable" }, 503)
    }

    const vectorizeEnv = getMemoryNodeVectorizeEnv()
    const graph = await getLifeGraph(kv, auth.userId)
    const nodeIndex = graph.nodes.findIndex((node) => node.id === parsedNodeId.data)

    if (nodeIndex === -1) {
      return memoryNodeJsonResponse({ success: false, error: "Node not found" }, 404)
    }

    const node = graph.nodes[nodeIndex]
    if (node.userId !== auth.userId) {
      return memoryNodeJsonResponse({ success: false, error: "Node not found" }, 404)
    }

    const { detail, tags } = parsedBody.data
    if (detail !== undefined) node.detail = detail
    if (tags !== undefined) node.tags = tags
    node.updatedAt = Date.now()

    graph.nodes[nodeIndex] = node
    await syncLifeNodeToV2(kv, auth.userId, graph, node)
    await syncLifeNodeVector(vectorizeEnv, node)

    return memoryNodeJsonResponse({ success: true, data: { ...node, userId: undefined } })
  } catch (error) {
    logError("memory.node.update_error", error)
    return memoryNodeJsonResponse({ success: false, error: "Update failed" }, 500)
  }
}
