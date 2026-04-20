/**
 * GET /api/v1/notification-prefs   — hydrate Settings page from server.
 * POST /api/v1/notification-prefs  — persist Settings page toggles.
 *
 * Storage: KV `notif-prefs:{userId}` via `lib/notifications/prefs.ts`.
 * Consumers: `lib/push/push-sender.ts#notifyUser` reads the same keys so
 * changes here take effect on every subsequent push.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logError, logRequest } from "@/lib/server/logger"
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  setNotificationPrefs,
} from "@/lib/notifications/prefs"
import type { KVStore } from "@/types"

const prefsSchema = z.object({
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  notifyMood: z.boolean(),
  notifyStreak: z.boolean(),
  notifyCheckIn: z.boolean(),
  // IANA TZ names are bounded in length (<= 64 chars comfortably covers them).
  timezone: z.string().min(1).max(64),
})

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
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

export async function GET() {
  const startTime = Date.now()
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) {
    // When KV is unavailable, return defaults so the client still works.
    return jsonResponse({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
  }

  try {
    const prefs = await getNotificationPrefs(kv, userId)
    logRequest("notif_prefs.read", userId, startTime)
    return jsonResponse({ success: true, data: prefs })
  } catch (err) {
    logError("notif_prefs.read_error", err, userId)
    return jsonResponse({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // Write is rate-limited to prevent abusive flipping.
  const planId = await getUserPlan(userId)
  const rateResult = await checkRateLimit(userId, planId === "free" ? "free" : "paid")
  if (!rateResult.allowed) return rateLimitExceededResponse(rateResult)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      400,
    )
  }

  const parsed = prefsSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid payload",
        code: "VALIDATION_ERROR",
      },
      400,
    )
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: "Storage unavailable", code: "SERVICE_UNAVAILABLE" },
      503,
    )
  }

  try {
    await setNotificationPrefs(kv, userId, parsed.data)
    logRequest("notif_prefs.write", userId, startTime)
    return jsonResponse({ success: true, data: parsed.data })
  } catch (err) {
    logError("notif_prefs.write_error", err, userId)
    return jsonResponse(
      { success: false, error: "Failed to save", code: "INTERNAL_ERROR" },
      500,
    )
  }
}
