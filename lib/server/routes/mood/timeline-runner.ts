import type { NextRequest } from 'next/server'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  addMoodEntry,
  getCachedWeeklyInsight,
  getRecentEntries,
  saveWeeklyInsight,
} from '@/lib/mood/mood-store'
import { generateWeeklyInsight } from '@/lib/mood/mood-analyzer'
import {
  buildMoodTimelineEntry,
  buildWeeklyInsightObject,
  computeCurrentMoodStreak,
  getAuthenticatedMoodTimelineUserId,
  moodLogSchema,
  moodTimelineJsonResponse,
  parseMoodTimelineReadQuery,
  parseMoodTimelineRequestBody,
  requireMoodTimelineKV,
  runMoodTimelineRateLimitPreflight,
} from '@/lib/server/routes/mood/timeline-helpers'

export async function runMoodTimelineGetRoute(req: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedMoodTimelineUserId({
    onUnexpectedError: (error) => {
      logError('mood.timeline.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kvResult = requireMoodTimelineKV()
  if (!kvResult.ok) return kvResult.response

  const ratePreflight = await runMoodTimelineRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('mood.timeline.get.rate_limited', auth.userId, Date.now())
    return ratePreflight.response
  }

  const { days, clientTz } = parseMoodTimelineReadQuery(req)

  try {
    const entries = await getRecentEntries(kvResult.kv, auth.userId, days)
    let weeklyInsight = await getCachedWeeklyInsight(kvResult.kv, auth.userId)

    if (!weeklyInsight) {
      const last7 = await getRecentEntries(kvResult.kv, auth.userId, 7)
      if (last7.length >= 3) {
        try {
          const insightText = await generateWeeklyInsight(last7)
          weeklyInsight = buildWeeklyInsightObject(last7, insightText)
          await saveWeeklyInsight(kvResult.kv, auth.userId, weeklyInsight)
        } catch (error) {
          logError('mood.timeline.insight_error', error, auth.userId)
          weeklyInsight = null
        }
      }
    }

    const allEntries = await getRecentEntries(kvResult.kv, auth.userId, 365)
    const totalDaysTracked = allEntries.length
    const averageScore =
      allEntries.length > 0
        ? Math.round((allEntries.reduce((sum, entry) => sum + entry.score, 0) / allEntries.length) * 10) / 10
        : 0
    const currentStreak = computeCurrentMoodStreak(allEntries, clientTz)

    return moodTimelineJsonResponse({
      success: true,
      data: {
        entries,
        weeklyInsight,
        totalDaysTracked,
        averageScore,
        currentStreak,
      },
    })
  } catch (error) {
    logError('mood.timeline.get_error', error, auth.userId)
    return moodTimelineJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

export async function runMoodTimelinePostRoute(req: NextRequest): Promise<Response> {
  const auth = await getAuthenticatedMoodTimelineUserId({
    onUnexpectedError: (error) => {
      logError('mood.timeline.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kvResult = requireMoodTimelineKV()
  if (!kvResult.ok) return kvResult.response

  const ratePreflight = await runMoodTimelineRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('mood.timeline.post.rate_limited', auth.userId, Date.now())
    return ratePreflight.response
  }

  const requestBody = await parseMoodTimelineRequestBody(req, moodLogSchema)
  if (!requestBody.ok) return requestBody.response

  const { clientTz } = parseMoodTimelineReadQuery(req)
  const entry = buildMoodTimelineEntry(requestBody.data, clientTz)

  try {
    await addMoodEntry(kvResult.kv, auth.userId, entry)
    return moodTimelineJsonResponse({ success: true, data: { entry } })
  } catch (error) {
    logError('mood.timeline.post_error', error, auth.userId)
    return moodTimelineJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
