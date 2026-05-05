import { z } from "zod"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from "@/lib/server/security/auth"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import type { KVStore } from "@/types"
import type { RateLimitResult, UserTier } from "@/lib/server/security/rate-limiter"

export const notificationPrefsSchema = z.object({
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  notifyCheckIn: z.boolean(),
  timezone: z.string().min(1).max(64),
})

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>

export function notificationPrefsJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export type NotificationPrefsAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedNotificationPrefsUserId(): Promise<NotificationPrefsAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }
    throw error
  }
}

export function getNotificationPrefsKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type NotificationPrefsRateLimitResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runNotificationPrefsRateLimitPreflight(
  userId: string,
): Promise<NotificationPrefsRateLimitResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return { ok: true, rateResult }
}

export type NotificationPrefsBodyResult =
  | { ok: true; data: NotificationPrefsInput }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export async function parseNotificationPrefsBody(
  req: Pick<Request, "json">,
): Promise<NotificationPrefsBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: notificationPrefsJsonResponse(
        { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
        400,
      ),
    }
  }

  const parsed = notificationPrefsSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: notificationPrefsJsonResponse(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid payload",
          code: "VALIDATION_ERROR",
        },
        400,
      ),
    }
  }

  return { ok: true, data: parsed.data }
}
