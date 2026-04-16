/**
 * GET /api/v1/agents/history
 *
 * Returns the user's recent agent executions (last 20).
 */

import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getAgentHistory } from "@/lib/ai/agent-history"
import type { KVStore } from "@/types"

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

export async function GET(): Promise<Response> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ entries: [] })

  const entries = await getAgentHistory(kv, userId)
  return jsonResponse({ entries })
}
