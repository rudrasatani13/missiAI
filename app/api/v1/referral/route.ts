import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getOrCreateReferral, trackReferral, getReferralByCode, getReferrer } from '@/lib/billing/referral'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { sanitizeInput } from '@/lib/validation/sanitizer'
import type { KVStore } from '@/types'
import { z } from 'zod'


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

// GET /api/v1/referral — Get user's referral code and stats
export async function GET() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) return rateLimitExceededResponse(rateResult)

  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const referral = await getOrCreateReferral(kv, userId)

  // Check if current user was referred by someone
  const referredBy = await getReferrer(kv, userId)

  return new Response(
    JSON.stringify({
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
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
  )
}

const trackSchema = z.object({
  referralCode: z.string().min(1).max(20).transform(sanitizeInput),
})

// POST /api/v1/referral — Track a referral (called when user visits with ?ref= and is logged in)
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) return rateLimitExceededResponse(rateResult)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const parsed = trackSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid referral code' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Look up referrer by code
  const referrerUserId = await getReferralByCode(kv, parsed.data.referralCode)
  if (!referrerUserId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid referral code' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const result = await trackReferral(kv, referrerUserId, userId)

  log({
    level: 'info',
    event: 'referral.tracked',
    userId,
    metadata: { referrerUserId, code: parsed.data.referralCode, success: result.success },
    timestamp: Date.now(),
  })

  return new Response(
    JSON.stringify({ success: result.success, error: result.error }),
    { status: result.success ? 200 : 400, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
  )
}
