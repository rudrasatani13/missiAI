import { getRequestContext } from '@cloudflare/next-on-pages'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getUserPlan, getUserBillingData } from '@/lib/billing/tier-checker'
import { getDailyUsage } from '@/lib/billing/usage-tracker'
import { createDodoCheckout, createDodoCustomerPortal } from '@/lib/billing/dodo-client'
import { PLANS } from '@/types/billing'
import { billingCheckoutSchema } from '@/lib/validation/billing-schemas'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import { clerkClient } from '@clerk/nextjs/server'
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
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // OWASP API4: rate-limit billing status reads — each call hits Clerk + KV
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

  // Strip dodoCustomerId from response
  const { dodoCustomerId: _dodoCustId, ...safeBilling } = billingData

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
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // OWASP API4: rate-limit checkout creation — creates Dodo sessions
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

  const { planId, email: bodyEmail } = parsed.data

  const dodoKey = process.env.DODO_API_KEY
  if (!dodoKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Payment not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Read product IDs at request time — edge runtime may not have env vars at module init
  const productIdMap: Record<string, string | undefined> = {
    pro: process.env.DODO_PRO_PRODUCT_ID,
    business: process.env.DODO_BUSINESS_PRODUCT_ID,
  }
  const productId = productIdMap[planId]
  if (!productId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Plan not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Dodo requires a valid customer email. Prefer the email from the request
  // body; fall back to the verified Clerk email so it is never empty.
  let customerEmail = bodyEmail || ''
  if (!customerEmail) {
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      customerEmail = user.emailAddresses[0]?.emailAddress ?? ''
    } catch {
      // Non-fatal — proceed without email if Clerk lookup fails
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://missi.space'

  try {
    const result = await createDodoCheckout({
      productId,
      successUrl: `${appUrl}/pricing?success=true`,
      cancelUrl: `${appUrl}/pricing?canceled=true`,
      customerUserId: userId,
      customerEmail: customerEmail || undefined,
    })

    log({
      level: 'info',
      event: 'billing.checkout.created',
      userId,
      metadata: { planId },
      timestamp: Date.now(),
    })

    return new Response(
      JSON.stringify({ success: true, checkoutUrl: result.checkoutUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.checkout.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create checkout session' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE() {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // OWASP API4: rate-limit portal session creation
  const rateResult = await checkRateLimit(userId, 'free')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'billing.delete.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  const billingData = await getUserBillingData(userId)
  if (!billingData.dodoCustomerId) {
    return new Response(
      JSON.stringify({ success: false, error: 'No active subscription' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://missi.space'

  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const email = user.emailAddresses[0]?.emailAddress ?? ''

    const session = await createDodoCustomerPortal({
      customerEmail: email,
      returnUrl: `${appUrl}/pricing`,
    })

    return new Response(
      JSON.stringify({ success: true, portalUrl: session.url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.portal.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create portal session' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
