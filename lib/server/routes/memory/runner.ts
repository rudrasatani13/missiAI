import type { ConversationEntry } from "@/types/chat"
import type { LifeGraph, MemorySearchResult } from "@/types/memory"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { recordAnalyticsUsage } from "@/lib/analytics/event-store"
import { awardXP } from "@/lib/gamification/xp-engine"
import { extractLifeNodes } from "@/lib/memory/graph-extractor"
import {
  addOrUpdateNodes,
  deleteLifeNodeFromV2,
  getLifeGraph,
  getLifeGraphReadSnapshot,
  searchLifeGraph,
  syncLifeGraphMetaToV2,
} from "@/lib/memory/life-graph"
import { deleteUserVectors } from "@/lib/memory/vectorize"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { invalidateChatContext } from "@/lib/server/chat/context-cache"
import type { ParsedMemoryReadQuery } from "@/lib/server/routes/memory/helpers"
import { logError } from "@/lib/server/observability/logger"

export function getEmptyMemoryGraph(): LifeGraph {
  return {
    nodes: [],
    totalInteractions: 0,
    lastUpdatedAt: 0,
    version: 1,
  }
}

function scheduleLoggedBackgroundTask(event: string, userId: string, task: Promise<unknown>): void {
  waitUntil(task.catch((err) => logError(event, err, userId)))
}

export type MemoryReadExecutionResult =
  | { kind: "fallback"; data: LifeGraph }
  | { kind: "search"; data: MemorySearchResult[]; logContext: { resultCount: number } }
  | { kind: "graph"; data: LifeGraph; logContext: { nodeCount: number } }

export async function executeMemoryRead(
  kv: KVStore | null,
  vectorizeEnv: VectorizeEnv | null,
  userId: string,
  parsedReadQuery: ParsedMemoryReadQuery,
): Promise<MemoryReadExecutionResult> {
  if (!kv) {
    return { kind: "fallback", data: getEmptyMemoryGraph() }
  }

  const { query, category } = parsedReadQuery

  if (query) {
    const results = await searchLifeGraph(kv, vectorizeEnv, userId, query, {
      topK: 10,
      category: category ?? undefined,
    })

    return {
      kind: "search",
      data: results,
      logContext: { resultCount: results.length },
    }
  }

  const graph = await getLifeGraphReadSnapshot(kv, userId)
  return {
    kind: "graph",
    data: graph,
    logContext: { nodeCount: graph.nodes.length },
  }
}

export function scheduleMemoryReadFollowUps(kv: KVStore | null, userId: string): void {
  if (!kv) return
  scheduleLoggedBackgroundTask(
    "memory.read.analytics_error",
    userId,
    recordAnalyticsUsage(kv, { type: "memory_read", userId }),
  )
}

export interface MemoryWriteExecutionResult {
  added: number
  updated: number
  graph: LifeGraph
}

export async function executeMemoryWrite(
  kv: KVStore,
  vectorizeEnv: VectorizeEnv | null,
  userId: string,
  conversation: ConversationEntry[],
  interactionCount: number,
): Promise<MemoryWriteExecutionResult> {
  let graph = await getLifeGraph(kv, userId)

  let added = 0
  let updated = 0

  graph.totalInteractions = (graph.totalInteractions || 0) + 1
  await syncLifeGraphMetaToV2(kv, userId, graph)

  if (interactionCount >= 2) {
    const extractedNodes = await extractLifeNodes(conversation, graph)
    const beforeCount = graph.nodes.length

    await addOrUpdateNodes(
      kv,
      vectorizeEnv,
      userId,
      extractedNodes.map((nodeInput) => ({ ...nodeInput, userId })),
    )

    graph = await getLifeGraph(kv, userId)
    added = Math.max(0, graph.nodes.length - beforeCount)
    updated = Math.max(0, extractedNodes.length - added)
  }

  // Invalidate chat context cache — memories changed, next turn must rebuild
  scheduleLoggedBackgroundTask("memory.write.invalidate_error", userId, invalidateChatContext(kv, userId))

  return { added, updated, graph }
}

export async function scheduleMemoryWriteFollowUps(
  kv: KVStore,
  userId: string,
  analyticsOptOut: boolean | undefined,
  interactionCount: number,
  added: number,
): Promise<void> {
  if (!analyticsOptOut) {
    scheduleLoggedBackgroundTask(
      "memory.write.analytics_error",
      userId,
      recordAnalyticsUsage(kv, { type: "memory_write", userId }),
    )
  }

  if (interactionCount >= 4) {
    const cooldownKey = `xp-cooldown:chat:${userId}`
    scheduleLoggedBackgroundTask(
      "memory.write.chat_xp_error",
      userId,
      (async () => {
        const cooldownHit = await kv.get(cooldownKey)
        if (cooldownHit) return
        await awardXP(kv, userId, "chat", 3)
        await kv.put(cooldownKey, "1", { expirationTtl: 300 })
      })(),
    )
  }

  if (added > 0) {
    for (let i = 0; i < Math.min(added, 10); i++) {
      scheduleLoggedBackgroundTask(
        "memory.write.memory_xp_error",
        userId,
        awardXP(kv, userId, "memory", 2),
      )
    }
  }
}

export interface MemoryDeleteExecutionResult {
  deleted: string
  didDelete: boolean
}

export async function executeMemoryDelete(
  kv: KVStore,
  vectorizeEnv: VectorizeEnv | null,
  userId: string,
  nodeId: string,
): Promise<MemoryDeleteExecutionResult> {
  const graph = await getLifeGraph(kv, userId)
  const before = graph.nodes.length
  const nodeToDelete = graph.nodes.find((n) => n.id === nodeId) ?? null
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId)

  if (graph.nodes.length < before && nodeToDelete) {
    await deleteLifeNodeFromV2(kv, userId, graph, nodeToDelete)
    if (vectorizeEnv) {
      await deleteUserVectors(vectorizeEnv, [nodeId])
    }
    scheduleLoggedBackgroundTask("memory.delete.invalidate_error", userId, invalidateChatContext(kv, userId))
    return { deleted: nodeId, didDelete: true }
  }

  return { deleted: nodeId, didDelete: false }
}
