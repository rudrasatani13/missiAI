import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getAgentHistory } from "@/lib/ai/agent-history"
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

    const history = await getAgentHistory(kv, userId)

    return new Response(JSON.stringify(history.slice(0, 20)), { status: 200 })
  } catch (err) {
    if (err instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
}
