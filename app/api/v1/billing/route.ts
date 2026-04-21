import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getUserPlan, getUserBillingData, setUserPlan } from '@/lib/billing/tier-checker'
import { getDailyUsage } from '@/lib/billing/usage-tracker'
import { createDodoCheckoutSession, cancelDodoSubscription } from '@/lib/billing/dodo-client'
import { PLANS, getServerDodoProductId } from '@/types/billing'
import { billingCheckoutSchema } from '@/lib/validation/billing-schemas'
import { log, logApiError } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { clerkClient } from '@clerk/nextjs/server'
import { getReferrer } from '@/lib/billing/referral'
import type { KVStore } from '@/types'


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
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

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.get.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  const dailyUsage = kv
    ? await getDailyUsage(kv, userId)
    : { userId, date: new Date().toISOString().split('T')[0], voiceInteractions: 0, voiceSecondsUsed: 0, lastUpdatedAt: Date.now() }
  const billingData = await getUserBillingData(userId)

  log({
    level: 'info',
    event: 'billing.status.get',
    userId,
    timestamp: Date.now(),
  })

  // Strip internal IDs from client response
  const { dodoCustomerId: _dodoCustId, dodoSubscriptionId: _dodoSubId, ...safeBilling } = billingData

  return new Response(
    JSON.stringify({
      success: true,
      plan: PLANS[planId],
      usage: dailyUsage,
      billing: safeBilling,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
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

  const currentPlan = await getUserPlan(userId)
  const rateTier = currentPlan === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
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

  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Resolve Dodo product ID for the requested plan
  const dodoProductId = getServerDodoProductId(planId)
  if (!dodoProductId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress ?? ''
  const name = ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim()

  // Check if user was referred — store discount info in metadata for webhook handler
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

  // Build return URL — user comes back here after Dodo checkout
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const returnUrl = `${appUrl}/pricing?success=true&plan=${planId}`

  let checkoutSession: { session_id: string; checkout_url: string }
  try {
    checkoutSession = await createDodoCheckoutSession({
      productId: dodoProductId,
      customerEmail: email,
      customerName: name || undefined,
      returnUrl,
      metadata: {
        userId,
        planId,
        ...(hasReferralDiscount ? { referralDiscount: 'true' } : {}),
      },
    })
  } catch (err) {
    logApiError('billing.checkout.error', err, { userId, httpStatus: 500 })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create checkout session. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  log({
    level: 'info',
    event: 'billing.checkout.created',
    userId,
    metadata: { planId, sessionId: checkoutSession.session_id },
    timestamp: Date.now(),
  })

  // Return checkout URL for client redirect — Dodo handles payment UI
  return new Response(
    JSON.stringify({
      success: true,
      checkout_url: checkoutSession.checkout_url,
      session_id: checkoutSession.session_id,
      referralDiscount: hasReferralDiscount,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
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

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.delete.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  const billingData = await getUserBillingData(userId)
  if (!billingData.dodoSubscriptionId) {
    return new Response(
      JSON.stringify({ success: false, error: 'No active subscription' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    await cancelDodoSubscription(billingData.dodoSubscriptionId)

    // Update Clerk metadata with cancelAtPeriodEnd flag
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
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
    )
  } catch (err) {
    logApiError('billing.cancel.error', err, { userId, httpStatus: 500 })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to cancel subscription' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
