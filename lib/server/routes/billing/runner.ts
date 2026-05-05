import { clerkClient } from '@clerk/nextjs/server'
import { getUserBillingData, setUserPlan } from '@/lib/billing/tier-checker'
import { getDailyUsage } from '@/lib/billing/usage-tracker'
import { createDodoCheckoutSession, cancelDodoSubscription } from '@/lib/billing/dodo-client'
import { log, logApiError } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import { PLANS, getServerDodoProductId } from '@/types/billing'
import {
  billingJsonResponse,
  buildFallbackDailyUsage,
  getAuthenticatedBillingUserId,
  getBillingKV,
  parseBillingCheckoutRequestBody,
  runBillingRouteRateLimitPreflight,
  stripInternalBillingIds,
} from '@/lib/server/routes/billing/helpers'

export async function runBillingGetRoute(): Promise<Response> {
  const auth = await getAuthenticatedBillingUserId()
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runBillingRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    log({ level: 'warn', event: 'billing.get.rate_limited', userId, timestamp: Date.now() })
    return ratePreflight.response
  }

  const kv = getBillingKV()
  const dailyUsage = kv
    ? await getDailyUsage(kv, userId)
    : buildFallbackDailyUsage(userId)
  const billingData = await getUserBillingData(userId)

  log({
    level: 'info',
    event: 'billing.status.get',
    userId,
    timestamp: Date.now(),
  })

  return billingJsonResponse(
    {
      success: true,
      plan: PLANS[ratePreflight.planId as keyof typeof PLANS],
      usage: dailyUsage,
      billing: stripInternalBillingIds(billingData),
    },
    200,
    rateLimitHeaders(ratePreflight.rateResult),
  )
}

export async function runBillingPostRoute(req: Request): Promise<Response> {
  const auth = await getAuthenticatedBillingUserId()
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runBillingRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    log({ level: 'warn', event: 'billing.post.rate_limited', userId, timestamp: Date.now() })
    return ratePreflight.response
  }

  const requestBody = await parseBillingCheckoutRequestBody(req)
  if (!requestBody.ok) return requestBody.response

  if (!process.env.DODO_PAYMENTS_API_KEY) {
    return billingJsonResponse({ success: false, error: 'Internal server error' }, 500)
  }

  const { planId } = requestBody.data
  const dodoProductId = getServerDodoProductId(planId)
  if (!dodoProductId) {
    return billingJsonResponse({ success: false, error: 'Internal server error' }, 400)
  }

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress ?? ''
  const name = ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://missi.space'
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
      },
    })
  } catch (error) {
    logApiError('billing.checkout.error', error, { userId, httpStatus: 500 })
    return billingJsonResponse(
      { success: false, error: 'Failed to create checkout session. Please try again.' },
      500,
    )
  }

  log({
    level: 'info',
    event: 'billing.checkout.created',
    userId,
    metadata: { planId, sessionId: checkoutSession.session_id },
    timestamp: Date.now(),
  })

  return billingJsonResponse(
    {
      success: true,
      checkout_url: checkoutSession.checkout_url,
      session_id: checkoutSession.session_id,
    },
    200,
    rateLimitHeaders(ratePreflight.rateResult),
  )
}

export async function runBillingDeleteRoute(): Promise<Response> {
  const auth = await getAuthenticatedBillingUserId()
  if (!auth.ok) return auth.response

  const { userId } = auth
  const ratePreflight = await runBillingRouteRateLimitPreflight(userId)
  if (!ratePreflight.ok) {
    log({ level: 'warn', event: 'billing.delete.rate_limited', userId, timestamp: Date.now() })
    return ratePreflight.response
  }

  const billingData = await getUserBillingData(userId)
  if (!billingData.dodoSubscriptionId) {
    return billingJsonResponse({ success: false, error: 'No active subscription' }, 400)
  }

  try {
    await cancelDodoSubscription(billingData.dodoSubscriptionId)
    await setUserPlan(userId, billingData.planId, {
      cancelAtPeriodEnd: true,
    })

    log({
      level: 'info',
      event: 'billing.subscription.cancel_requested',
      userId,
      timestamp: Date.now(),
    })

    return billingJsonResponse(
      { success: true, message: 'Subscription will cancel at period end', cancelAtPeriodEnd: true },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logApiError('billing.cancel.error', error, { userId, httpStatus: 500 })
    return billingJsonResponse({ success: false, error: 'Failed to cancel subscription' }, 500)
  }
}
