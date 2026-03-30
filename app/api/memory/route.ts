import { NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getMemory, saveMemory } from "@/services/memory.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { memoryPostSchema, validationErrorResponse } from "@/lib/validation"
import type { KVStore } from "@/types"

export const runtime = "edge"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// ─── GET — Load user memories ─────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // userId comes from Clerk session — the query param is ignored entirely
  const { userId } = await auth()
  if (!userId) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401)
  }

  try {
    const kv = getKV()
    if (!kv) {
      console.error("KV binding MISSI_MEMORY not found")
      return jsonResponse({ memories: "" })
    }

    const memories = await getMemory(userId, kv)
    return jsonResponse({ memories })
  } catch (err) {
    console.error("Memory GET error:", err)
    return jsonResponse({ memories: "" })
  }
}

// ─── POST — Save memories from conversation ───────────────────────────────────

export async function POST(req: NextRequest) {
  // userId from Clerk — never accept from request body
  const { userId } = await auth()
  if (!userId) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401)
  }

  // Rate limit memory writes (they trigger an AI call internally)
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // Parse & validate — userId is NOT part of the schema; we take it from auth
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = memoryPostSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { conversation, existingMemories } = parsed.data

  const kv = getKV()
  if (!kv) {
    console.error("KV binding MISSI_MEMORY not found")
    return jsonResponse({ success: false, error: "Storage unavailable" }, 500)
  }

  try {
    const newMemories = await saveMemory(userId, conversation, existingMemories, kv)
    return jsonResponse({ success: true, memories: newMemories })
  } catch (err) {
    console.error("Memory POST error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ success: false, error: message }, 500)
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
