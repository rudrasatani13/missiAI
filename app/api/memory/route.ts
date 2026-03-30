import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getMemory, saveMemory } from "@/services/memory.service"
import type { KVStore, Message } from "@/types"

export const runtime = "edge"

// ─── GET — Load user memories ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")
    if (!userId) {
      return new Response(JSON.stringify({ memories: "" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const kv = getKV()
    if (!kv) {
      console.error("KV binding MISSI_MEMORY not found")
      return new Response(JSON.stringify({ memories: "" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const memories = await getMemory(userId, kv)
    return new Response(JSON.stringify({ memories }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Memory GET error:", err)
    return new Response(JSON.stringify({ memories: "" }), {
      headers: { "Content-Type": "application/json" },
    })
  }
}

// ─── POST — Save memories from conversation ───────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId, conversation, existingMemories } = await req.json()

    if (!userId || !conversation || (conversation as Message[]).length < 2) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const kv = getKV()
    if (!kv) {
      console.error("KV binding MISSI_MEMORY not found")
      return new Response(
        JSON.stringify({ success: false, error: "Storage unavailable" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const newMemories = await saveMemory(
      userId as string,
      conversation as Message[],
      (existingMemories as string) || "",
      kv
    )

    return new Response(JSON.stringify({ success: true, memories: newMemories }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Memory POST error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}
