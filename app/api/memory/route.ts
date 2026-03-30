import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"
import { memorySchema, validationErrorResponse } from "@/lib/schemas"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserMemories, saveUserMemories } from "@/lib/kv-memory"
import { extractMemories } from "@/services/memory.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import type { KVStore } from "@/types"

export const runtime = "edge"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

// ─── GET — Load user memories ─────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // userId comes from Clerk session — query params are ignored entirely
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  try {
    const kv = getKV()
    if (!kv) {
      console.error("KV binding MISSI_MEMORY not found")
      return jsonResponse({ memories: "" })
    }

    const memories = await getUserMemories(kv, userId)
    return jsonResponse({ memories })
  } catch (err) {
    console.error("Memory GET error:", err)
    return jsonResponse({ memories: "" })
  }
}

// ─── POST — Extract and save memories from a conversation ────────────────────

export async function POST(req: NextRequest) {
  // userId from Clerk — never accept from request body
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // Rate limit memory writes (they trigger an AI call internally)
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // Parse & validate — only conversation is accepted from the client
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const parsed = memorySchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { conversation } = parsed.data

  const kv = getKV()
  if (!kv) {
    console.error("KV binding MISSI_MEMORY not found")
    return jsonResponse({ success: false, error: "Storage unavailable" }, 500)
  }

  try {
    // Fetch existing memories server-side — never from the client body
    const existingMemories = await getUserMemories(kv, userId)

    // AI extraction: merge conversation facts with existing memories
    const newMemories = await extractMemories(conversation, existingMemories)

    // Persist via the typed KV wrapper (sanitizes + enforces size cap)
    await saveUserMemories(kv, userId, newMemories)

    return jsonResponse({ success: true, memories: newMemories })
  } catch (err) {
    console.error("Memory POST error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ success: false, error: message }, 500)
  }
}
