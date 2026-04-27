import { getGamificationData, checkInHabit } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { checkAndIncrementAtomicCounter } from '@/lib/server/platform/atomic-quota'
import {
  getAuthenticatedStreakUserId,
  getStreakKV,
  parseStreakCheckInBody,
  runStreakRateLimitPreflight,
  streakJsonResponse,
} from '@/lib/server/routes/streak/helpers'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'

export async function runStreakGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedStreakUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runStreakRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('streak.get.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  const kv = getStreakKV()
  if (!kv) {
    return streakJsonResponse(
      { success: true, data: null },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }

  try {
    // Award daily login XP (once per day) — triggers loginStreak update
    const loginCooldownKey = `xp-cooldown:login:${auth.userId}`
    try {
      // Prefer atomic counter (limit=1 means "once per day")
      const atomic = await checkAndIncrementAtomicCounter(loginCooldownKey, 1, 86400)
      const shouldAward = atomic ? atomic.allowed : !(await kv.get(loginCooldownKey))

      if (shouldAward) {
        await awardXP(kv, auth.userId, 'login')
        if (!atomic) {
          // KV fallback: set the cooldown key only when atomic was unavailable
          await kv.put(loginCooldownKey, '1', { expirationTtl: 86400 })
        }
      }
    } catch {
      // Login XP award failed — non-critical, continue
    }

    // Fetch gamification data (now includes any login XP just awarded)
    const data = await getGamificationData(kv, auth.userId)
    logRequest('streak.get', auth.userId, startTime)
    return streakJsonResponse(
      { success: true, data },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('streak.get.error', error, auth.userId)
    return streakJsonResponse(
      { success: true, data: null },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }
}

export async function runStreakPostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedStreakUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runStreakRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    logRequest('streak.post.rate_limited', auth.userId, startTime)
    return ratePreflight.response
  }

  const parsedBody = await parseStreakCheckInBody(req)
  if (!parsedBody.ok) return parsedBody.response

  const { nodeId, habitTitle } = parsedBody.data

  const kv = getStreakKV()
  if (!kv) {
    return streakJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      503,
    )
  }

  try {
    const result = await checkInHabit(kv, auth.userId, nodeId, habitTitle)
    logRequest('streak.checkin', auth.userId, startTime, {
      nodeId,
      milestone: result.milestone,
    })
    return streakJsonResponse(
      { success: true, data: result },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('streak.checkin.error', error, auth.userId)
    return streakJsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
