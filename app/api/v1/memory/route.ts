import { NextRequest } from "next/server"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/auth"
import { memorySchema, validationErrorResponse } from "@/lib/validation/schemas"
import { getRequestContext } from "@cloudflare/next-on-pages"
import {
  getLifeGraph,
  saveLifeGraph,
  addOrUpdateNode,
  searchLifeGraph,
} from "@/lib/memory/life-graph"
import { extractLifeNodes } from "@/lib/memory/graph-extractor"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { awardXP } from "@/lib/gamification/xp-engine"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { MemoryCategory } from "@/types/memory"
import { z } from "zod"

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

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

// Allowlist of valid memory categories (mirrors the MemoryCategory union type)
const VALID_CATEGORIES = new Set([
  'person', 'goal', 'habit', 'preference', 'event',
  'emotion', 'skill', 'place', 'belief', 'relationship',
])

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
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("memory.get.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // OWASP A03: validate query params before passing to downstream functions
  const rawQuery = req.nextUrl.searchParams.get("query")
  const rawCategory = req.nextUrl.searchParams.get("category")

  // Reject oversized query strings to prevent embedding abuse
  if (rawQuery !== null && rawQuery.length > 500) {
    return jsonResponse(
      { success: false, error: "Query too long (max 500 chars)", code: "VALIDATION_ERROR" },
      400,
    )
  }

  // Reject unknown category values to prevent unexpected KV key patterns
  if (rawCategory !== null && !VALID_CATEGORIES.has(rawCategory)) {
    return jsonResponse(
      { success: false, error: "Invalid category", code: "VALIDATION_ERROR" },
      400,
    )
  }

  try {
    const kv = getKV()
    if (!kv) {
      logError(
        "memory.kv_unavailable",
        "KV binding MISSI_MEMORY not found",
        userId,
      )
      return jsonResponse({
        success: true,
        data: { nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 },
      })
    }

    const query = rawQuery
    const category = rawCategory as MemoryCategory | null

    if (query) {
      let apiKey = ""
      try {
        apiKey = getEnv().GEMINI_API_KEY
      } catch {
        apiKey = ""
      }

      const vectorizeEnv = getVectorizeEnv()
      const results = await searchLifeGraph(
        kv,
        vectorizeEnv,
        userId,
        query,
        apiKey,
        { topK: 10, category: category ?? undefined },
      )

      logRequest("memory.read", userId, startTime, {
        resultCount: results.length,
      })

      // Analytics: fire-and-forget
      if (kv) {
        recordEvent(kv, { type: 'memory_read', userId }).catch(() => {})
        recordUserSeen(kv, userId, getTodayDate()).catch(() => {})
      }

      return jsonResponse({ success: true, data: results }, 200, rateLimitHeaders(rateResult))
    }

    const graph = await getLifeGraph(kv, userId)

    logRequest("memory.read", userId, startTime, {
      nodeCount: graph.nodes.length,
    })

    // Analytics: fire-and-forget
    if (kv) {
      recordEvent(kv, { type: 'memory_read', userId }).catch(() => {})
      recordUserSeen(kv, userId, getTodayDate()).catch(() => {})
    }

    return jsonResponse({ success: true, data: graph }, 200, rateLimitHeaders(rateResult))
  } catch (err) {
    logError("memory.read_error", err, userId)
    return jsonResponse({
      success: true,
      data: { nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 },
    })
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
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("memory.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    logRequest("memory.invalid_json", userId, startTime)
    return jsonResponse(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      400,
    )
  }

  const parsed = memorySchema.safeParse(body)
  if (!parsed.success) {
    logRequest("memory.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  const { conversation, interactionCount } = parsed.data

  const kv = getKV()
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
    let graph = await getLifeGraph(kv, userId)
    const vectorizeEnv = getVectorizeEnv()

    let added = 0
    let updated = 0

    // Increment total interactions
    graph.totalInteractions = (graph.totalInteractions || 0) + 1
    await saveLifeGraph(kv, userId, graph)

    // Extract new life nodes when there are at least 2 user interactions
    if (interactionCount >= 2) {
      let apiKey = ""
      try {
        apiKey = getEnv().GEMINI_API_KEY
      } catch {
        apiKey = ""
      }

      if (apiKey) {
        const extractedNodes = await extractLifeNodes(
          conversation,
          graph,
          apiKey,
        )

        const beforeCount = graph.nodes.length

        for (const nodeInput of extractedNodes) {
          await addOrUpdateNode(
            kv,
            vectorizeEnv,
            userId,
            { ...nodeInput, userId },
            apiKey,
          )
        }

        // Reload to count changes
        graph = await getLifeGraph(kv, userId)
        added = Math.max(0, graph.nodes.length - beforeCount)
        updated = Math.max(0, extractedNodes.length - added)
      }
    }

    logRequest("memory.write", userId, startTime, {
      nodeCount: graph.nodes.length,
      added,
      updated,
      totalInteractions: graph.totalInteractions,
    })

    // Analytics & Gamification: fire-and-forget
    if (kv) {
      recordEvent(kv, { type: 'memory_write', userId }).catch(() => {})
      recordUserSeen(kv, userId, getTodayDate()).catch(() => {})

      // Award chat XP only for meaningful conversations (4+ turns)
      // and only once per 5-minute window to prevent duplicate beacon awards
      if (interactionCount >= 4) {
        const cooldownKey = `xp-cooldown:chat:${userId}`
        const cooldownHit = await kv.get(cooldownKey).catch(() => null)
        if (!cooldownHit) {
          awardXP(kv, userId, 'chat', 3).catch(() => {})
          kv.put(cooldownKey, '1', { expirationTtl: 300 }).catch(() => {}) // 5-min cooldown
        }
      }

      // Award XP for each memory node saved
      if (added > 0) {
        for (let i = 0; i < Math.min(added, 10); i++) {
          awardXP(kv, userId, 'memory', 2).catch(() => {})
        }
      }
    }

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

const nodeIdSchema = z.string().min(1).max(50)

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
    // Get nodeId from query param or body
    let nodeId = req.nextUrl.searchParams.get("nodeId")

    if (!nodeId) {
      // Try reading from body
      try {
        const body = await req.json()
        nodeId = body?.nodeId ?? null
      } catch {
        // No body — that's fine, check for null below
      }
    }

    if (!nodeId) {
      return jsonResponse({ success: false, error: "nodeId is required", code: "VALIDATION_ERROR" }, 400)
    }

    const parsed = nodeIdSchema.safeParse(nodeId)
    if (!parsed.success) {
      return jsonResponse({ success: false, error: "Invalid node ID", code: "VALIDATION_ERROR" }, 400)
    }

    const kv = getKV()
    if (!kv) {
      logError("memory.delete.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse({ success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" }, 503)
    }

    const graph = await getLifeGraph(kv, userId)
    const before = graph.nodes.length
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId)

    if (graph.nodes.length < before) {
      await saveLifeGraph(kv, userId, graph)
      logRequest("memory.node.deleted", userId, startTime, { nodeId })
    }

    return jsonResponse({ success: true, data: { deleted: nodeId } })
  } catch (err) {
    logError("memory.delete.error", err, userId)
    return jsonResponse({ success: false, error: "Failed to delete memory", code: "INTERNAL_ERROR" }, 500)
  }
}
