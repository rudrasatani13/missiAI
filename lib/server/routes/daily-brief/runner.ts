import type { DailyBrief } from '@/types/daily-brief'
import { PLANS } from '@/types/billing'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { awardXP } from '@/lib/gamification/xp-engine'
import {
  getTodaysBrief,
  saveBrief,
  markBriefViewed,
  getRateLimit,
  incrementRateLimit,
  markTaskComplete,
} from '@/lib/daily-brief/brief-store'
import { buildGenerationContext, generateBriefWithGemini } from '@/lib/daily-brief/generator'
import { getGoogleTokens } from '@/lib/plugins/data-fetcher'
import {
  dailyBriefJsonResponse,
  parseDailyBriefGenerationQuery,
  parseDailyBriefTaskId,
  requireDailyBriefKV,
} from '@/lib/server/routes/daily-brief/helpers'

export async function runDailyBriefGetRoute(userId: string): Promise<Response> {
  const startTime = Date.now()
  const kvResult = requireDailyBriefKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  try {
    const brief = await getTodaysBrief(kvResult.kv, userId)
    if (brief) {
      markBriefViewed(kvResult.kv, userId).catch(() => {})
      logRequest('daily-brief.get', userId, startTime)
      const planId = await getUserPlan(userId)
      const maxGenerations = PLANS[planId].briefGenerationsPerDay
      const usedCount = await getRateLimit(kvResult.kv, userId)
      const remaining = Math.max(0, maxGenerations - usedCount)
      return dailyBriefJsonResponse({
        success: true,
        data: { brief, generated: true, regenerationsRemaining: remaining, maxGenerations },
      })
    }

    logRequest('daily-brief.get.no_brief', userId, startTime)
    return dailyBriefJsonResponse({ success: true, data: { brief: null, generated: false } })
  } catch (error) {
    logError('daily-brief.get.error', error, userId)
    return dailyBriefJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

export async function runDailyBriefPostRoute(
  req: Pick<Request, 'url'>,
  userId: string,
): Promise<Response> {
  const startTime = Date.now()
  const kvResult = requireDailyBriefKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  try {
    const planId = await getUserPlan(userId)
    const maxGenerations = PLANS[planId].briefGenerationsPerDay
    const currentCount = await getRateLimit(kvResult.kv, userId)
    if (currentCount >= maxGenerations) {
      logRequest('daily-brief.post.rate_limited', userId, startTime)
      return dailyBriefJsonResponse(
        {
          error:
            planId === 'free'
              ? 'Free plan allows 1 daily brief per day. Upgrade to Plus for more.'
              : 'You\'ve used all your daily regenerations. Come back tomorrow.',
          code: 'RATE_LIMITED',
          regenerationsRemaining: 0,
          maxGenerations,
        },
        429,
      )
    }

    const { forceRefresh, clientTimezone, localHour } = parseDailyBriefGenerationQuery(req)

    if (!forceRefresh) {
      const existingBrief = await getTodaysBrief(kvResult.kv, userId)
      if (existingBrief) {
        const remaining = Math.max(0, maxGenerations - currentCount)
        logRequest('daily-brief.post.existing', userId, startTime)
        return dailyBriefJsonResponse({
          success: true,
          data: { brief: existingBrief, regenerationsRemaining: remaining, maxGenerations },
        })
      }
    }

    const googleTokens = await getGoogleTokens(kvResult.kv, userId)
    const googleClientId = process.env.GOOGLE_CLIENT_ID
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
    const calendarTokens = googleTokens && googleClientId && googleClientSecret
      ? {
          accessToken: googleTokens.accessToken,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }
      : undefined

    const context = await buildGenerationContext(kvResult.kv, userId, calendarTokens)
    if (localHour !== undefined) {
      context.localHour = localHour
    }
    if (clientTimezone) {
      context.timezone = clientTimezone
    }

    const briefContent = await generateBriefWithGemini(context)
    const brief: DailyBrief = {
      ...briefContent,
      date: new Date().toISOString().slice(0, 10),
      userId,
      viewed: false,
      viewedAt: null,
      generatedAt: Date.now(),
    }

    await saveBrief(kvResult.kv, userId, brief)
    await incrementRateLimit(kvResult.kv, userId)
    const remaining = Math.max(0, maxGenerations - (currentCount + 1))

    logRequest('daily-brief.post.generated', userId, startTime)
    return dailyBriefJsonResponse(
      { success: true, data: { brief, regenerationsRemaining: remaining, maxGenerations } },
      201,
    )
  } catch (error) {
    logError('daily-brief.post.error', error, userId)
    return dailyBriefJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

export async function runDailyBriefTaskPatchRoute(
  taskId: string,
  userId: string,
): Promise<Response> {
  const startTime = Date.now()
  const kvResult = requireDailyBriefKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  const taskIdResult = parseDailyBriefTaskId(taskId)
  if (!taskIdResult.ok) {
    return taskIdResult.response
  }

  try {
    const updatedBrief = await markTaskComplete(kvResult.kv, userId, taskIdResult.taskId)
    if (!updatedBrief) {
      logRequest('daily-brief.task.not_found', userId, startTime, { taskId: taskIdResult.taskId })
      return dailyBriefJsonResponse({ success: false, error: 'Task not found in your brief' }, 403)
    }

    awardXP(kvResult.kv, userId, 'checkin', 5).catch(() => {})
    logRequest('daily-brief.task.complete', userId, startTime, { taskId: taskIdResult.taskId })
    return dailyBriefJsonResponse({ success: true, data: { brief: updatedBrief } })
  } catch (error) {
    logError('daily-brief.task.error', error, userId)
    return dailyBriefJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
