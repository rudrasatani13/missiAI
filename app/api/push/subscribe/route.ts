import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
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

export async function POST(req: NextRequest) {
  try {
    const userId = await getVerifiedUserId()
    const subscription = await req.json()
    const kv = getKV()

    if (!kv) {
      return new Response(JSON.stringify({ error: "KV store unavailable" }), { status: 500 })
    }

    // Save the subscription object stringified into KV against push:user_id
    await kv.put(`push:${userId}`, JSON.stringify(subscription))

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(JSON.stringify({ error: "Failed to parse subscription" }), { status: 400 })
  }
}
