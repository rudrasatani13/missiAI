import { getRequestContext } from '@cloudflare/next-on-pages'
import { verifyWebhookSignature, retrieveSubscription } from '@/lib/billing/stripe-client'
import { setUserPlan } from '@/lib/billing/tier-checker'
import { log } from '@/lib/server/logger'
import type { KVStore } from '@/types'
import type { PlanId } from '@/types/billing'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

async function storeCustomerMapping(kv: KVStore | null, customerId: string, userId: string): Promise<void> {
  if (!kv) return
  try {
    await kv.put(`stripe:customer:${customerId}`, userId)
  } catch {
    // Non-critical
  }
}

async function lookupUserByCustomer(kv: KVStore | null, customerId: string): Promise<string | null> {
  if (!kv) return null
  try {
    return await kv.get(`stripe:customer:${customerId}`)
  } catch {
    return null
  }
}

function determinePlanFromPrice(priceId: string): PlanId {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID
  const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID

  if (priceId === businessPriceId) return 'business'
  if (priceId === proPriceId) return 'pro'
  return 'pro' // Default to pro for unknown paid subscriptions
}

export async function POST(req: Request) {
  const kv = getKV()

  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return new Response(
      JSON.stringify({ received: true, error: 'Failed to read body' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const signature = req.headers.get('Stripe-Signature') ?? req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret)
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id as string
        const subscriptionId = session.subscription as string
        const customerId = session.customer as string

        if (!userId || !subscriptionId) break

        const subscription = await retrieveSubscription(subscriptionId)

        // Determine plan from the subscription's price
        const items = (subscription as any).items?.data
        const priceId = items?.[0]?.price?.id ?? ''
        const planId = determinePlanFromPrice(priceId)

        await setUserPlan(userId, planId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd: subscription.current_period_end * 1000,
        })

        // Store reverse lookup
        await storeCustomerMapping(kv, customerId, userId)

        log({
          level: 'info',
          event: 'billing.subscription.created',
          userId,
          metadata: { planId },
          timestamp: Date.now(),
        })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer as string
        const subscriptionId = subscription.id as string

        // Try to find userId from metadata or KV lookup
        const userId =
          subscription.metadata?.userId ??
          (await lookupUserByCustomer(kv, customerId))

        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.updated.no_user',
            metadata: { subscriptionId },
            timestamp: Date.now(),
          })
          break
        }

        const items = subscription.items?.data
        const priceId = items?.[0]?.price?.id ?? ''
        const planId = determinePlanFromPrice(priceId)

        if (subscription.status === 'active') {
          await setUserPlan(userId, planId, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            currentPeriodEnd: subscription.current_period_end * 1000,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          })
        }

        log({
          level: 'info',
          event: 'billing.subscription.updated',
          userId,
          metadata: {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
          timestamp: Date.now(),
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer as string

        const userId = await lookupUserByCustomer(kv, customerId)
        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.deleted.no_user',
            metadata: { customerId },
            timestamp: Date.now(),
          })
          break
        }

        await setUserPlan(userId, 'free')

        log({
          level: 'info',
          event: 'billing.subscription.cancelled',
          userId,
          timestamp: Date.now(),
        })
        break
      }

      default:
        // Unhandled event type — acknowledge receipt
        break
    }
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.webhook.error',
      metadata: {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      },
      timestamp: Date.now(),
    })
    // Return 200 even on error — Stripe retries on non-200
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
