import { addNote, addReminder, getActionCollections } from '@/lib/actions/store'
import { executeAction } from '@/lib/actions/action-executor'
import { detectIntent, isActionable } from '@/lib/actions/intent-detector'
import { recordAnalyticsUsage } from '@/lib/analytics/event-store'
import { getActionsKV, getAuthenticatedActionsUserId, parseActionsRequestBody, runActionsRouteRateLimitPreflight } from '@/lib/server/routes/actions/helpers'
import { createTimer, logError, logRequest } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import { waitUntil } from '@/lib/server/platform/wait-until'
import { standardErrors, successResponse } from '@/types/api'
import type { ActionResult } from '@/types/actions'
import type { KVStore } from '@/types'

async function persistActionResult(
  kv: KVStore,
  userId: string,
  result: ActionResult,
): Promise<void> {
  if (!result.success) return

  if (result.type === 'set_reminder' && result.data) {
    await addReminder(kv, userId, {
      task: String(result.data.task ?? ''),
      time: String(result.data.time ?? 'unspecified'),
    })
  }

  if (result.type === 'take_note' && result.data) {
    await addNote(kv, userId, {
      title: String(result.data.title ?? 'Quick Note'),
      content: String(result.data.content ?? ''),
    })
  }
}

export async function runActionsPostRoute(req: Request): Promise<Response> {
  const elapsed = createTimer()
  const startTime = Date.now()

  const auth = await getAuthenticatedActionsUserId({
    onUnexpectedError: (error) => {
      logError('actions.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const ratePreflight = await runActionsRouteRateLimitPreflight(auth.userId, 'ai')
  if (!ratePreflight.ok) {
    logRequest('actions.post.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  const requestBody = await parseActionsRequestBody(req)
  if (!requestBody.ok) return requestBody.response

  const { userMessage, conversationContext } = requestBody.data

  try {
    const intent = await detectIntent(userMessage, conversationContext ?? '')

    if (!isActionable(intent)) {
      logRequest('action.not_actionable', auth.userId, startTime, {
        type: intent.type,
        confidence: intent.confidence,
      })
      return successResponse(
        { actionable: false, intent },
        200,
        rateLimitHeaders(ratePreflight.rateResult),
      )
    }

    const result = await executeAction(intent)
    const kv = getActionsKV()
    if (kv) {
      await persistActionResult(kv, auth.userId, result)
    }

    const durationMs = elapsed()
    logRequest('action.executed', auth.userId, startTime, {
      type: result.type,
      success: result.success,
      durationMs,
    })

    if (kv) {
      waitUntil(
        recordAnalyticsUsage(kv, {
          type: 'action',
          userId: auth.userId,
          metadata: { actionType: result.type },
        }).catch((err) => logError('actions.analytics_error', err, auth.userId)),
      )
    }

    return successResponse(
      { actionable: true, intent, result },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('actions.error', error, auth.userId)
    return standardErrors.internalError()
  }
}

export async function runActionsGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedActionsUserId({
    onUnexpectedError: (error) => {
      logError('actions.get.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const ratePreflight = await runActionsRouteRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('actions.get.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  try {
    const kv = getActionsKV()
    if (!kv) {
      return successResponse(
        { reminders: [], notes: [] },
        200,
        rateLimitHeaders(ratePreflight.rateResult),
      )
    }

    const { reminders, notes } = await getActionCollections(kv, auth.userId)

    return successResponse(
      { reminders, notes },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('actions.get.error', error, auth.userId)
    return standardErrors.internalError()
  }
}
