import { z } from "zod"
import {
  AuthenticationError,
  getVerifiedUserId,
  unauthorizedResponse,
} from "@/lib/server/security/auth"
import { log, logApiError } from "@/lib/server/observability/logger"
import { getUserPlan } from "@/lib/billing/tier-checker"
import {
  checkRateLimit,
  rateLimitExceededResponse,
  type UserTier,
} from "@/lib/server/security/rate-limiter"

const CLIENT_ERRORS_PATH = "/api/v1/client-errors"

const clientErrorSchema = z.object({
  event: z.literal("voice_memory_autosave_error"),
  message: z.string().trim().min(1).max(500),
  metadata: z.object({
    conversationLength: z.number().int().min(0).max(50),
    interactionCount: z.number().int().min(0).max(50),
  }),
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function getClientIp(request: Request): string | undefined {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")
  if (cfConnectingIp) {
    return cfConnectingIp
  }

  const forwardedFor = request.headers.get("x-forwarded-for")
  return forwardedFor?.split(",")[0]?.trim() || undefined
}

function getUserAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") ?? undefined
}

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request)
  let userId: string

  try {
    userId = await getVerifiedUserId()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return unauthorizedResponse()
    }
    return unauthorizedResponse()
  }

  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rateTier, "client_error")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    logApiError("client_errors.invalid_json", error, {
      userId,
      httpStatus: 400,
      path: CLIENT_ERRORS_PATH,
      ip,
    })
    return jsonResponse({ success: false, error: "Invalid JSON", code: "INVALID_JSON" }, 400)
  }

  const parsed = clientErrorSchema.safeParse(body)
  if (!parsed.success) {
    logApiError("client_errors.invalid_payload", parsed.error, {
      userId,
      httpStatus: 400,
      path: CLIENT_ERRORS_PATH,
      ip,
    })
    return jsonResponse({ success: false, error: "Invalid client error payload", code: "VALIDATION_ERROR" }, 400)
  }

  log({
    level: "warn",
    event: "client.voice_memory_autosave_error",
    userId,
    ip,
    userAgent: getUserAgent(request),
    metadata: {
      error: parsed.data.message,
      conversationLength: parsed.data.metadata.conversationLength,
      interactionCount: parsed.data.metadata.interactionCount,
    },
    timestamp: Date.now(),
  })

  return new Response(null, { status: 204 })
}
