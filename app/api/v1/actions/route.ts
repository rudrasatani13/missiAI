import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { createTimer, logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { actionSchema, validationErrorResponse } from "@/lib/validation/schemas"
import { detectIntent, isActionable } from "@/lib/actions/intent-detector"
import { executeAction } from "@/lib/actions/action-executor"
import { successResponse, standardErrors } from "@/types/api"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

async function kvGetArray(kv: KVStore, key: string): Promise<unknown[]> {
  try {
    const raw = await kv.get(key)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function kvPushItem(kv: KVStore, key: string, item: unknown, maxItems = 50): Promise<void> {
  const arr = await kvGetArray(kv, key)
  arr.push(item)
  while (arr.length > maxItems) arr.shift()
  await kv.put(key, JSON.stringify(arr))
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
    const appEnv = getEnv()
    const apiKey = appEnv.GEMINI_API_KEY

    const intent = await detectIntent(userMessage, conversationContext ?? "", apiKey)

    if (!isActionable(intent)) {
      logRequest("action.not_actionable", userId, startTime, { type: intent.type, confidence: intent.confidence })
      return successResponse({ actionable: false, intent })
    }

    const result = await executeAction(intent, apiKey)

    // Save reminders and notes to KV
    const kv = getKV()
    if (kv && result.success) {
      if (result.type === "set_reminder" && result.data) {
        await kvPushItem(kv, `actions:reminders:${userId}`, {
          ...result.data,
          id: `rem_${Date.now()}`,
        })
      }
      if (result.type === "take_note" && result.data) {
        await kvPushItem(kv, `actions:notes:${userId}`, {
          ...result.data,
          id: `note_${Date.now()}`,
        })
      }
    }

    const durationMs = elapsed()
    logRequest("action.executed", userId, startTime, {
      type: result.type,
      success: result.success,
      durationMs,
    })

    return successResponse({ actionable: true, intent, result })
  } catch (e) {
    logError("actions.error", e, userId)
    return standardErrors.internalError()
  }
}

export async function GET() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return standardErrors.unauthorized()
    logError("actions.get.auth_error", e)
    return standardErrors.internalError()
  }

  try {
    const kv = getKV()
    if (!kv) {
      return successResponse({ reminders: [], notes: [] })
    }

    const reminders = await kvGetArray(kv, `actions:reminders:${userId}`)
    const notes = await kvGetArray(kv, `actions:notes:${userId}`)

    return successResponse({ reminders, notes })
  } catch (e) {
    logError("actions.get.error", e, userId)
    return standardErrors.internalError()
  }
}
