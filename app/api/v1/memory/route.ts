import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { memorySchema, validationErrorResponse } from "@/lib/validation/schemas"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserMemoryStore, saveUserMemoryStore } from "@/lib/memory/kv-memory"
import { extractMemoryFacts } from "@/lib/ai/memory-extractor"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
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
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("memory.auth_error", e)
    throw e
  }

  try {
    const kv = getKV()
    if (!kv) {
      logError("memory.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
      return jsonResponse({ success: true, data: { facts: [], lastExtractedAt: 0, interactionCount: 0 } })
    }

    const store = await getUserMemoryStore(kv, userId)

    logRequest("memory.read", userId, startTime, {
      factCount: store.facts.length,
    })

    return jsonResponse({ success: true, data: store })
  } catch (err) {
    logError("memory.read_error", err, userId)
    return jsonResponse({ success: true, data: { facts: [], lastExtractedAt: 0, interactionCount: 0 } })
  }
}

// ─── POST — Increment interaction count, conditionally extract, save ─────────

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

  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    logRequest("memory.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    logRequest("memory.invalid_json", userId, startTime)
    return jsonResponse({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }, 400)
  }

  const parsed = memorySchema.safeParse(body)
  if (!parsed.success) {
    logRequest("memory.validation_error", userId, startTime)
    return validationErrorResponse(parsed.error)
  }

  const { conversation } = parsed.data

  const kv = getKV()
  if (!kv) {
    logError("memory.kv_unavailable", "KV binding MISSI_MEMORY not found", userId)
    return jsonResponse({ success: false, error: "Storage unavailable", code: "INTERNAL_ERROR" }, 500)
  }

  try {
    const store = await getUserMemoryStore(kv, userId)

    // Increment interaction count
    store.interactionCount += 1

    // Extract new facts every 5th interaction (not every turn)
    if (store.interactionCount % 5 === 0) {
      let apiKey: string
      try {
        const appEnv = getEnv()
        apiKey = appEnv.GEMINI_API_KEY
      } catch (e) {
        logError("memory.env_error", e, userId)
        // Continue without extraction
        apiKey = ""
      }
      
      if (apiKey) {
        store.facts = await extractMemoryFacts(conversation, store.facts, apiKey)
        store.lastExtractedAt = Date.now()
      }
    }

    await saveUserMemoryStore(kv, userId, store)

    logRequest("memory.write", userId, startTime, {
      factCount: store.facts.length,
      interactionCount: store.interactionCount,
    })

    return jsonResponse({ success: true, data: { store } })
  } catch (err) {
    logError("memory.write_error", err, userId)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ success: false, error: message, code: "INTERNAL_ERROR" }, 500)
  }
}
