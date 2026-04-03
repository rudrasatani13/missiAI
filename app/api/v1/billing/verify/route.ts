import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { verifyRazorpayPayment, getRazorpaySubscription, determinePlanFromRazorpayPlan } from '@/lib/billing/razorpay-client'
import { setUserPlan, getUserBillingData } from '@/lib/billing/tier-checker'
import { PLANS } from '@/types/billing'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import { verifyPaymentSchema } from '@/lib/validation/billing-schemas'
import { convertReferral, REWARD_DAYS } from '@/lib/billing/referral'
import { getRequestContext } from '@cloudflare/next-on-pages'
import type { KVStore } from '@/types'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // SEC-3 FIX: Add rate limiting to verify endpoint
  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.verify.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // VAL-1/VAL-2: Use the updated schema with regex + length validation
  const parsed = verifyPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = parsed.data
  // SEC-2 FIX: We accept planId from client but do NOT trust it — we derive plan from subscription

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) {
    return new Response(
      JSON.stringify({ success: false, error: 'Payment not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyRazorpayPayment(
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
    keySecret
  )

  if (!isValid) {
    log({ level: 'warn', event: 'billing.verify.signature_invalid', userId, timestamp: Date.now() })
    return new Response(
      JSON.stringify({ success: false, error: 'Payment verification failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const subscription = await getRazorpaySubscription(razorpay_subscription_id)

    // SRV-3 FIX: Validate subscription status before activating plan
    const validStatuses = ['active', 'authenticated']
    if (!validStatuses.includes(subscription.status)) {
      log({
        level: 'warn',
        event: 'billing.verify.invalid_subscription_status',
        userId,
        metadata: { subscriptionId: razorpay_subscription_id, status: subscription.status },
        timestamp: Date.now(),
      })
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription is not active' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // SEC-2 FIX: Derive plan from Razorpay subscription's plan_id, not from client-sent planId
    const derivedPlanId = determinePlanFromRazorpayPlan(subscription.plan_id)

    if (derivedPlanId === 'free') {
      log({
        level: 'error',
        event: 'billing.verify.unknown_plan',
        userId,
        metadata: { razorpayPlanId: subscription.plan_id },
        timestamp: Date.now(),
      })
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown plan configuration' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    await setUserPlan(userId, derivedPlanId, {
      razorpayCustomerId: subscription.customer_id,
      razorpaySubscriptionId: razorpay_subscription_id,
      currentPeriodEnd: subscription.current_end * 1000,
      cancelAtPeriodEnd: false,
    })

    // Process referral reward — extend referrer's plan by 7 days
    const kv = getKV()
    if (kv) {
      try {
        const referralResult = await convertReferral(kv, userId)
        if (referralResult) {
          // Extend referrer's subscription end date by REWARD_DAYS
          const referrerBilling = await getUserBillingData(referralResult.referrerUserId)
          if (referrerBilling.currentPeriodEnd) {
            const extendedEnd = referrerBilling.currentPeriodEnd + (REWARD_DAYS * 24 * 60 * 60 * 1000)
            await setUserPlan(referralResult.referrerUserId, referrerBilling.planId, {
              currentPeriodEnd: extendedEnd,
            })
            log({
              level: 'info',
              event: 'referral.reward.applied',
              userId: referralResult.referrerUserId,
              metadata: { referredUser: userId, rewardDays: REWARD_DAYS },
              timestamp: Date.now(),
            })
          }
        }
      } catch (err) {
        // Non-critical — don't fail the payment verification
        log({
          level: 'warn',
          event: 'referral.reward.error',
          userId,
          metadata: { error: err instanceof Error ? err.message : String(err) },
          timestamp: Date.now(),
        })
      }
    }

    log({
      level: 'info',
      event: 'billing.payment.verified',
      userId,
      metadata: { planId: derivedPlanId },
      timestamp: Date.now(),
    })

    return new Response(
      JSON.stringify({ success: true, plan: PLANS[derivedPlanId] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.verify.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to verify payment' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
