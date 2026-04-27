import {
  getOrCreateReferral,
  trackReferral,
  getReferralByCode,
  getReferrer,
} from '@/lib/billing/referral'
import { log } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import {
  getAuthenticatedReferralUserId,
  getReferralKV,
  parseReferralTrackBody,
  referralJsonResponse,
  runReferralRateLimitPreflight,
} from '@/lib/server/routes/referral/helpers'

export async function runReferralGetRoute(): Promise<Response> {
  const auth = await getAuthenticatedReferralUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runReferralRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) return ratePreflight.response

  const kv = getReferralKV()
  if (!kv) {
    return referralJsonResponse({ success: false, error: 'Internal server error' }, 500)
  }

  const referral = await getOrCreateReferral(kv, auth.userId)
  const referredBy = await getReferrer(kv, auth.userId)

  return referralJsonResponse(
    {
      success: true,
      referral: {
        code: referral.code,
        totalReferred: referral.totalReferred,
        successfulReferred: referral.successfulReferred,
        rewardDaysEarned: referral.rewardDaysEarned,
        maxReferrals: 5,
        remainingSlots: Math.max(0, 5 - referral.totalReferred),
      },
      isReferred: !!referredBy,
    },
    200,
    rateLimitHeaders(ratePreflight.rateResult),
  )
}

export async function runReferralPostRoute(req: Request): Promise<Response> {
  const auth = await getAuthenticatedReferralUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runReferralRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) return ratePreflight.response

  const requestBody = await parseReferralTrackBody(req)
  if (!requestBody.ok) return requestBody.response

  const kv = getReferralKV()
  if (!kv) {
    return referralJsonResponse({ success: false, error: 'Internal server error' }, 500)
  }

  const referrerUserId = await getReferralByCode(kv, requestBody.data.referralCode)
  if (!referrerUserId) {
    return referralJsonResponse({ success: false, error: 'Invalid referral code' }, 400)
  }

  const result = await trackReferral(kv, referrerUserId, auth.userId)

  log({
    level: 'info',
    event: 'referral.tracked',
    userId: auth.userId,
    metadata: { referrerUserId, code: requestBody.data.referralCode, success: result.success },
    timestamp: Date.now(),
  })

  return referralJsonResponse(
    { success: result.success, error: result.error },
    result.success ? 200 : 400,
    rateLimitHeaders(ratePreflight.rateResult),
  )
}
