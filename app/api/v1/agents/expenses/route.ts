import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getLifeGraph } from "@/lib/memory/life-graph"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getVerifiedUserId()
    const kv = getKV()

    if (!kv) {
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 500 })
    }

    const currentYearMonth = new Date().toISOString().substring(0, 7)
    const totalKey = `expense:total:${userId}:${currentYearMonth}`

    let monthlyTotal = 0
    let currency = "INR"
    let byCategory: Record<string, number> = {}

    try {
      const raw = await kv.get(totalKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        monthlyTotal = parsed.monthlyTotal || 0
        currency = parsed.currency || "INR"
        byCategory = parsed.byCategory || {}
      }
    } catch {}

    const graph = await getLifeGraph(kv, userId)

    const recentEntries = graph.nodes
      .filter(n => n.tags.includes('expense'))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)

    return new Response(JSON.stringify({
      monthlyTotal,
      currency,
      byCategory,
      recentEntries
    }), { status: 200 })
  } catch (err) {
    if (err instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
}
