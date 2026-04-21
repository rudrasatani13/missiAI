import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { waitUntil } from "@/lib/server/wait-until"
import { actionSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { detectIntent, isActionable } from "@/lib/actions/intent-detector"
import { executeAction } from "@/lib/actions/action-executor"
import { addNote, addReminder, getActionCollections } from "@/lib/actions/store"
import { successResponse, standardErrors } from "@/types/api"
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { recordEvent, recordUserSeen } from "@/lib/analytics/event-store"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import type { KVStore } from "@/types"


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const elapsed = createTimer()
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("actions.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit action detection — each call invokes Gemini
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'ai')
  if (!rateResult.allowed) {
    logRequest("actions.post.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return standardErrors.validationError("Invalid JSON body")
  }

  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { userMessage, conversationContext } = parsed.data

  try {
    const intent = await detectIntent(userMessage, conversationContext ?? "")

    if (!isActionable(intent)) {
      logRequest("action.not_actionable", userId, startTime, { type: intent.type, confidence: intent.confidence })
      return successResponse({ actionable: false, intent }, 200, rateLimitHeaders(rateResult))
    }

    const result = await executeAction(intent)

    // Save reminders and notes to KV
    const kv = getKV()
    if (kv && result.success) {
      if (result.type === "set_reminder" && result.data) {
        await addReminder(kv, userId, {
          task: String(result.data.task ?? ""),
          time: String(result.data.time ?? "unspecified"),
        })
      }
      if (result.type === "take_note" && result.data) {
        await addNote(kv, userId, {
          title: String(result.data.title ?? "Quick Note"),
          content: String(result.data.content ?? ""),
        })
      }
    }

    const durationMs = elapsed()
    logRequest("action.executed", userId, startTime, {
      type: result.type,
      success: result.success,
      durationMs,
    })

    // Analytics: fire-and-forget (H1 fix: wrap in waitUntil)
    if (kv) {
      waitUntil(
        recordEvent(kv, {
          type: 'action',
          userId,
          metadata: { actionType: result.type },
        }).catch(() => {}),
      )
      waitUntil(recordUserSeen(kv, userId, getTodayDate()).catch(() => {}))
    }

    return successResponse({ actionable: true, intent, result }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("actions.error", e, userId)
    return standardErrors.internalError()
  }
}

export async function GET() {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("actions.get.auth_error", e)
    return standardErrors.internalError()
  }

  // OWASP API4: rate-limit reads to prevent bulk history scraping
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest("actions.get.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  try {
    const kv = getKV()
    if (!kv) {
      return successResponse({ reminders: [], notes: [] }, 200, rateLimitHeaders(rateResult))
    }

    const { reminders, notes } = await getActionCollections(kv, userId)

    return successResponse({ reminders, notes }, 200, rateLimitHeaders(rateResult))
  } catch (e) {
    logError("actions.get.error", e, userId)
    return standardErrors.internalError()
  }
}
