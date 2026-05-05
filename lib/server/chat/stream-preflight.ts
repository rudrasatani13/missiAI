import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { getChatKV, CHAT_REQUEST_MAX_BODY_BYTES } from "@/lib/server/chat/shared"
import { chatSchema, validationErrorResponse, type ChatInput } from "@/lib/validation/schemas"
import { checkRateLimit, rateLimitExceededResponse, type RateLimitResult } from "@/lib/server/security/rate-limiter"
import { logLatency, createTimer, logError } from "@/lib/server/observability/logger"
import { checkHardBudget } from "@/lib/server/observability/cost-tracker"
import { estimateRequestCost } from "@/lib/ai/providers/model-router"
import type { KVStore } from "@/types"
import { API_ERROR_CODES } from "@/types/api"

function normalizeVoiceDurationMs(input: ChatInput): number | undefined {
  const rawVoiceDurationMs = input.voiceDurationMs
  return rawVoiceDurationMs !== undefined
    ? Math.max(3000, rawVoiceDurationMs)
    : undefined
}

export interface ChatStreamPreflightData {
  userId: string
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

  const kv = getChatKV()
  const isDev = process.env.NODE_ENV === "development"
  if (!kv && !isDev) {
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

  const rateResult = await checkRateLimit(userId, "free", "ai")
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

  logLatency("chat.latency.preflight", userId, preflightTimer(), {
    voiceMode: input.voiceMode,
  })

  return {
    ok: true,
    data: {
      userId,
      kv,
      rateResult,
      input,
    },
  }
}
