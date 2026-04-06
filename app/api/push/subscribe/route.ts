import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { z } from "zod"
import { logError } from "@/lib/server/logger"
import type { KVStore } from "@/types"

export const runtime = "edge"

// Max payload size for push subscription objects (16 KB is generous for a PushSubscription)
const MAX_SUBSCRIPTION_BYTES = 16_384

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  expirationTime: z.number().nullable().optional(),
})

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("push.subscribe.auth_error", e)
    throw e
  }

  // ── 2. Rate limit ─────────────────────────────────────────────────────────────
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 3. Size guard ─────────────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_SUBSCRIPTION_BYTES) {
    return jsonResponse(
      { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" },
      413,
    )
  }

  // ── 4. Parse & validate ───────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      400,
    )
  }

  const parsed = pushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { success: false, error: "Invalid push subscription format", code: "VALIDATION_ERROR" },
      400,
    )
  }

  // ── 5. Store ──────────────────────────────────────────────────────────────
  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }

  try {
    await kv.put(`push:${userId}`, JSON.stringify(parsed.data))
    return jsonResponse(
      { success: true, message: "Subscribed successfully" },
      200,
      rateLimitHeaders(rateResult)
    )
  } catch (err) {
    logError("push.subscribe.store_error", err, userId)
    return jsonResponse(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      500,
    )
  }
}
