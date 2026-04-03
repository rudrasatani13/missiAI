import { getRequestContext } from '@cloudflare/next-on-pages'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getUserPlan, getUserBillingData, setUserPlan } from '@/lib/billing/tier-checker'
import { getDailyUsage } from '@/lib/billing/usage-tracker'
import { createRazorpayCustomer, createRazorpaySubscription, cancelRazorpaySubscription } from '@/lib/billing/razorpay-client'
import { PLANS, getServerRazorpayPlanId } from '@/types/billing'
import { billingCheckoutSchema } from '@/lib/validation/billing-schemas'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import { clerkClient } from '@clerk/nextjs/server'
import { getReferrer, DISCOUNT_PERCENT } from '@/lib/billing/referral'
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

export async function GET() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.get.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  const planId = await getUserPlan(userId)
  const kv = getKV()
  const dailyUsage = kv
    ? await getDailyUsage(kv, userId)
    : { userId, date: new Date().toISOString().split('T')[0], voiceInteractions: 0, lastUpdatedAt: Date.now() }
  const billingData = await getUserBillingData(userId)

  log({
    level: 'info',
    event: 'billing.status.get',
    userId,
    timestamp: Date.now(),
  })

  // SEC-7 FIX: Strip both razorpayCustomerId AND razorpaySubscriptionId from response
  const { razorpayCustomerId: _rpCustId, razorpaySubscriptionId: _rpSubId, ...safeBilling } = billingData

  return new Response(
    JSON.stringify({
      success: true,
      plan: PLANS[planId],
      usage: dailyUsage,
      billing: safeBilling,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

export async function POST(req: Request) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.post.rate_limited', userId, timestamp: Date.now() })
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

  const parsed = billingCheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { planId } = parsed.data

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    return new Response(
      JSON.stringify({ success: false, error: 'Payment not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // BUG-1 FIX: Use server-side helper instead of PLANS constant for razorpayPlanId
  const razorpayPlanId = getServerRazorpayPlanId(planId)
  if (!razorpayPlanId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Plan not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress ?? ''
  const name = ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim()

  const billingData = await getUserBillingData(userId)
  let razorpayCustomerId = billingData.razorpayCustomerId

  if (!razorpayCustomerId) {
    try {
      const customer = await createRazorpayCustomer({ name, email })
      razorpayCustomerId = customer.id
    } catch (err) {
      log({
        level: 'error',
        event: 'billing.customer.error',
        userId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
      })
      // ERR-1 FIX: Return generic error to client
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create customer. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Check if user was referred — apply delayed start for discount
  let hasReferralDiscount = false
  const kv = getKV()
  if (kv) {
    try {
      const referrer = await getReferrer(kv, userId)
      if (referrer) hasReferralDiscount = true
    } catch {
      // Non-critical
    }
  }

  let subscription: { id: string; status: string; short_url: string }
  try {
    // 20% off on monthly = ~6 days free trial via delayed start
    const startAt = hasReferralDiscount
      ? Math.floor(Date.now() / 1000) + (6 * 24 * 60 * 60) // 6 days from now
      : undefined

    subscription = await createRazorpaySubscription({
      planId: razorpayPlanId,
      customerId: razorpayCustomerId,
      totalCount: 120,
      notes: { userId },
      startAt,
    })
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.checkout.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    // ERR-1 FIX: Return generic error, don't leak internal details
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create checkout session. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // SRV-1 FIX: If saving to Clerk fails, cancel the Razorpay subscription to prevent orphans
  try {
    await setUserPlan(userId, billingData.planId, {
      razorpayCustomerId,
      razorpaySubscriptionId: subscription.id,
      currentPeriodEnd: billingData.currentPeriodEnd,
    })
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.checkout.metadata_save_failed',
      userId,
      metadata: { subscriptionId: subscription.id, error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    // Clean up orphaned subscription
    try {
      await cancelRazorpaySubscription(subscription.id, false)
    } catch {
      log({ level: 'error', event: 'billing.checkout.orphan_cleanup_failed', userId, metadata: { subscriptionId: subscription.id }, timestamp: Date.now() })
    }
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to save subscription details. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  log({
    level: 'info',
    event: 'billing.checkout.created',
    userId,
    metadata: { planId },
    timestamp: Date.now(),
  })

  // BUG-3 FIX: Don't leak razorpayCustomerId to client
  return new Response(
    JSON.stringify({
      success: true,
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      referralDiscount: hasReferralDiscount,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

export async function DELETE() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.delete.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  const billingData = await getUserBillingData(userId)
  if (!billingData.razorpaySubscriptionId) {
    return new Response(
      JSON.stringify({ success: false, error: 'No active subscription' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    await cancelRazorpaySubscription(billingData.razorpaySubscriptionId, true)

    // SRV-5 FIX: Update Clerk metadata with cancelAtPeriodEnd flag
    await setUserPlan(userId, billingData.planId, {
      cancelAtPeriodEnd: true,
    })

    log({
      level: 'info',
      event: 'billing.subscription.cancel_requested',
      userId,
      timestamp: Date.now(),
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Subscription will cancel at period end', cancelAtPeriodEnd: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.cancel.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to cancel subscription' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
