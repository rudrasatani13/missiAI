import { checkRateLimit, rateLimitExceededResponse, type RateLimitResult } from "@/lib/server/security/rate-limiter"
import { CHAT_REQUEST_MAX_BODY_BYTES, getChatKV } from "@/lib/server/chat/shared"
import { chatSchema, validationErrorResponse, type ChatInput } from "@/lib/validation/schemas"
import { logLatency, createTimer, logError } from "@/lib/server/observability/logger"
import { checkHardBudget } from "@/lib/server/observability/cost-tracker"
import { estimateRequestCost } from "@/lib/ai/providers/model-router"
import type { KVStore } from "@/types"

function normalizeVoiceDurationMs(input: ChatInput): number | undefined {
  const rawVoiceDurationMs = input.voiceDurationMs
  return rawVoiceDurationMs !== undefined
    ? Math.max(3000, rawVoiceDurationMs)
    : undefined
}

export interface ChatRoutePreflightData {
  kv: KVStore | null
  rateResult: RateLimitResult
  input: ChatInput
}

export type ChatRoutePreflightResult =
  | { ok: true; data: ChatRoutePreflightData }
  | {
      ok: false
      kind: "payload_too_large" | "kv_unavailable" | "rate_limited" | "invalid_json" | "validation"
      response: Response
    }

export async function runChatRoutePreflight(
  req: Pick<Request, "headers" | "json">,
  userId: string,
): Promise<ChatRoutePreflightResult> {
  const preflightTimer = createTimer()

  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > CHAT_REQUEST_MAX_BODY_BYTES) {
    return {
      ok: false,
      kind: "payload_too_large",
      response: new Response(
        JSON.stringify({ success: false, error: "Payload too large (max 5 MB)", code: "PAYLOAD_TOO_LARGE" }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const kv = getChatKV()

  if (!kv) {
    return {
      ok: false,
      kind: "kv_unavailable",
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Service temporarily unavailable — please try again",
          code: "SERVICE_UNAVAILABLE",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const rateResult = await checkRateLimit(userId, "free", "ai")
  if (!rateResult.allowed) {
    return {
      ok: false,
      kind: "rate_limited",
      response: rateLimitExceededResponse(rateResult),
    }
  }

  const estimatedCostUsd = estimateRequestCost("gemini-2.5-pro", 2000, 800)
  const budgetResult = await checkHardBudget(kv, estimatedCostUsd)
  if (!budgetResult.allowed) {
    if (budgetResult.unavailable) {
      return {
        ok: false,
        kind: "kv_unavailable",
        response: new Response(
          JSON.stringify({
            success: false,
            error: "Service temporarily unavailable — please try again",
            code: "SERVICE_UNAVAILABLE",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      }
    }
    logError("chat.budget_exceeded", `Daily AI budget exhausted (spent $${budgetResult.spendUsd.toFixed(4)} of $${budgetResult.budgetUsd})`, userId)
    return {
      ok: false,
      kind: "rate_limited",
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Daily AI budget exhausted — service will resume tomorrow",
          code: "USAGE_LIMIT_EXCEEDED",
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
      kind: "invalid_json",
      response: new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    }
  }

  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: validationErrorResponse(parsed.error),
    }
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
      kv,
      rateResult,
      input,
    },
  }
}
