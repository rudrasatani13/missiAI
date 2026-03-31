import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"
import { memorySchema, validationErrorResponse } from "@/lib/schemas"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserMemoryStore, saveUserMemoryStore } from "@/lib/kv-memory"
import { extractMemoryFacts } from "@/lib/memory-extractor"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError } from "@/lib/logger"
import { getEnv } from "@/lib/env"
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

// ─── GET — Load user memory store ─────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const elapsed = createTimer()

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
      logError("memory.error", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse({ facts: [], lastExtractedAt: 0, interactionCount: 0 })
    }

    const store = await getUserMemoryStore(kv, userId)

    logRequest("memory.read", userId, Date.now() - elapsed(), {
      factCount: store.facts.length,
    })

    return jsonResponse(store)
  } catch (err) {
    logError("memory.error", err, userId)
    return jsonResponse({ facts: [], lastExtractedAt: 0, interactionCount: 0 })
  }
}

// ─── POST — Increment interaction count, conditionally extract, save ─────────

export async function POST(req: NextRequest) {
  const elapsed = createTimer()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

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
    logError("memory.error", "KV binding MISSI_MEMORY not found", userId)
    return jsonResponse({ success: false, error: "Storage unavailable" }, 500)
  }

  try {
    const store = await getUserMemoryStore(kv, userId)

    // Increment interaction count
    store.interactionCount += 1

    // Extract new facts every 5th interaction
    if (store.interactionCount % 5 === 0) {
      const appEnv = getEnv()
      const apiKey = appEnv.GEMINI_API_KEY
      store.facts = await extractMemoryFacts(conversation, store.facts, apiKey)
      store.lastExtractedAt = Date.now()
    }

    await saveUserMemoryStore(kv, userId, store)

    logRequest("memory.write", userId, Date.now() - elapsed(), {
      factCount: store.facts.length,
      interactionCount: store.interactionCount,
    })

    return jsonResponse({ success: true, store })
  } catch (err) {
    logError("memory.error", err, userId)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ success: false, error: message }, 500)
  }
}
