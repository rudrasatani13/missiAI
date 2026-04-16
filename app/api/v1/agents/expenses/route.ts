/**
 * GET /api/v1/agents/expenses
 *
 * Returns the user's current month expense snapshot.
 * Reads from:
 *   1. KV monthly total: expense:total:{userId}:{yyyy-mm}
 *   2. LifeGraph expense nodes (tagged 'expense')
 */

import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getLifeGraph } from "@/lib/memory/life-graph"
import type { KVStore } from "@/types"
import type { LifeNode } from "@/types/memory"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface ExpenseTotal {
  total: number
  byCategory: Record<string, number>
}

export async function GET(): Promise<Response> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse({ monthlyTotal: 0, currency: "INR", byCategory: {}, recentEntries: [] })
  }

  const yearMonth = new Date().toISOString().slice(0, 7) // "2026-04"

  // Read monthly totals and LifeGraph in parallel
  const [totalsRaw, graph] = await Promise.all([
    kv.get(`expense:total:${userId}:${yearMonth}`),
    getLifeGraph(kv, userId),
  ])

  let totals: ExpenseTotal = { total: 0, byCategory: {} }
  try {
    if (totalsRaw) totals = JSON.parse(totalsRaw) as ExpenseTotal
  } catch {}

  // Filter expense nodes, most recent first
  const recentEntries: LifeNode[] = graph.nodes
    .filter(n => Array.isArray(n.tags) && n.tags.includes("expense"))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)

  return jsonResponse({
    monthlyTotal: totals.total,
    currency: "INR",
    byCategory: totals.byCategory,
    recentEntries,
  })
}
