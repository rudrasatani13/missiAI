import { getUserPlan } from "@/lib/billing/tier-checker"
import { checkAndIncrementVoiceTime } from "@/lib/billing/usage-tracker"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { checkRateLimit, rateLimitExceededResponse, type RateLimitResult } from "@/lib/server/security/rate-limiter"
import { CHAT_REQUEST_MAX_BODY_BYTES, getChatKV, getChatVectorizeEnv } from "@/lib/server/chat/shared"
import { chatSchema, validationErrorResponse, type ChatInput } from "@/lib/validation/schemas"
import { logLatency, createTimer } from "@/lib/server/observability/logger"
import type { KVStore } from "@/types"

function normalizeVoiceDurationMs(input: ChatInput): number | undefined {
  const rawVoiceDurationMs = input.voiceDurationMs
  return rawVoiceDurationMs !== undefined
    ? Math.max(3000, rawVoiceDurationMs)
    : undefined
}

export interface ChatRoutePreflightData {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  rateResult: RateLimitResult
  input: ChatInput
}

export type ChatRoutePreflightResult =
  | { ok: true; data: ChatRoutePreflightData }
  | {
      ok: false
      kind: "payload_too_large" | "kv_unavailable" | "rate_limited" | "invalid_json" | "validation" | "voice_limit" | "voice_quota_unavailable"
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

  const planId = await getUserPlan(userId)
  const kv = getChatKV()
  const vectorizeEnv = getChatVectorizeEnv()

  if (!kv && planId !== "pro") {
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

  const rateResult = await checkRateLimit(userId, planId === "free" ? "free" : "paid", "ai")
  if (!rateResult.allowed) {
    return {
      ok: false,
      kind: "rate_limited",
      response: rateLimitExceededResponse(rateResult),
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

  if (kv && input.voiceDurationMs !== undefined) {
    const voiceLimit = await checkAndIncrementVoiceTime(kv, userId, planId, input.voiceDurationMs)
    if (!voiceLimit.allowed) {
      if (voiceLimit.unavailable) {
        return {
          ok: false,
          kind: "voice_quota_unavailable",
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

      return {
        ok: false,
        kind: "voice_limit",
        response: new Response(
          JSON.stringify({
            success: false,
            error: "Daily voice limit reached",
            code: "USAGE_LIMIT_EXCEEDED",
            upgrade: "/pricing",
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
      kv,
      vectorizeEnv,
      rateResult,
      input,
    },
  }
}
