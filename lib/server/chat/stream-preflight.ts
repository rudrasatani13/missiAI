import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { getChatKV, CHAT_REQUEST_MAX_BODY_BYTES } from "@/lib/server/chat/shared"
import { chatSchema, validationErrorResponse, type ChatInput } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse, type RateLimitResult } from "@/lib/server/security/rate-limiter"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkAndIncrementVoiceTime } from "@/lib/billing/usage-tracker"
import { awardXP } from "@/lib/gamification/xp-engine"
import { logLatency, createTimer, logError } from "@/lib/server/observability/logger"
import { checkHardBudget } from "@/lib/server/observability/cost-tracker"
import { estimateRequestCost } from "@/lib/ai/providers/model-router"
import type { KVStore } from "@/types"
import type { PlanId } from "@/types/billing"
import { API_ERROR_CODES } from "@/types/api"

function normalizeVoiceDurationMs(input: ChatInput): number | undefined {
  const rawVoiceDurationMs = input.voiceDurationMs
  return rawVoiceDurationMs !== undefined
    ? Math.max(3000, rawVoiceDurationMs)
    : undefined
}

export interface ChatStreamPreflightData {
  userId: string
  planId: PlanId
  kv: KVStore | null
  rateResult: RateLimitResult
  input: ChatInput
}

export type ChatStreamPreflightResult =
  | { ok: true; data: ChatStreamPreflightData }
  | { ok: false; response: Response }

export async function runChatStreamPreflight(
  req: Request,
): Promise<ChatStreamPreflightResult> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }
    throw error
  }

  const preflightTimer = createTimer()

  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > CHAT_REQUEST_MAX_BODY_BYTES) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Payload too large",
          code: API_ERROR_CODES.PAYLOAD_TOO_LARGE,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const planId = await getUserPlan(userId)
  const kv = getChatKV()

  const isDev = process.env.NODE_ENV === "development"
  if (!kv && planId !== "pro" && !isDev) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Service temporarily unavailable",
          code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const rateResult = await checkRateLimit(userId, planId === "free" ? "free" : "paid", "ai")
  if (!rateResult.allowed) {
    return { ok: false, response: rateLimitExceededResponse(rateResult) }
  }

  const estimatedCostUsd = estimateRequestCost("gemini-2.5-pro", 2000, 800)
  const budgetResult = await checkHardBudget(kv, estimatedCostUsd)
  if (!budgetResult.allowed) {
    if (budgetResult.unavailable) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            success: false,
            error: "Service temporarily unavailable",
            code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      }
    }
    logError("chat.budget_exceeded", `Daily AI budget exhausted (spent $${budgetResult.spendUsd.toFixed(4)} of $${budgetResult.budgetUsd})`, userId)
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Daily AI budget exhausted — service will resume tomorrow",
          code: API_ERROR_CODES.USAGE_LIMIT_EXCEEDED,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  if (kv) {
    const loginCooldownKey = `xp-cooldown:login:${userId}`
    waitUntil(
      kv.get(loginCooldownKey).then((existing) => {
        if (!existing) {
          awardXP(kv, userId, "login").catch(() => {})
          kv.put(loginCooldownKey, "1", { expirationTtl: 86400 }).catch(() => {})
        }
      }).catch(() => {}),
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON",
          code: API_ERROR_CODES.VALIDATION_ERROR,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, response: validationErrorResponse(parsed.error) }
  }

  const input: ChatInput = {
    ...parsed.data,
    voiceDurationMs: normalizeVoiceDurationMs(parsed.data),
  }

  if (kv && input.voiceDurationMs !== undefined) {
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, input.voiceDurationMs)
    if (!voiceLimit.allowed) {
      if (voiceLimit.unavailable) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({
              success: false,
              error: "Service temporarily unavailable",
              code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        }
      }

      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            success: false,
            error: "Daily voice limit reached",
            code: API_ERROR_CODES.USAGE_LIMIT_EXCEEDED,
            usedSeconds: voiceLimit.usedSeconds,
            limitSeconds: voiceLimit.limitSeconds,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      }
    }
  }

  logLatency("chat.latency.preflight", userId, preflightTimer(), {
    planId,
    voiceMode: input.voiceMode,
  })

  return {
    ok: true,
    data: {
      userId,
      planId,
      kv,
      rateResult,
      input,
    },
  }
}
