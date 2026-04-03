import { getRequestContext } from '@cloudflare/next-on-pages'
import { verifyDodoWebhook, determinePlanFromProduct } from '@/lib/billing/dodo-client'
import { setUserPlan } from '@/lib/billing/tier-checker'
import { log } from '@/lib/server/logger'
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

async function storeCustomerMapping(kv: KVStore | null, customerId: string, userId: string): Promise<void> {
  if (!kv) return
  try {
    await kv.put(`dodo:customer:${customerId}`, userId)
  } catch {
    // Non-critical
  }
}

async function lookupUserByCustomer(kv: KVStore | null, customerId: string): Promise<string | null> {
  if (!kv) return null
  try {
    return await kv.get(`dodo:customer:${customerId}`)
  } catch {
    return null
  }
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

  const signature = req.headers.get('webhook-signature') ?? ''
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyDodoWebhook(rawBody, signature, webhookSecret)
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
      case 'subscription.active': {
        const data = event.data
        const userId =
          data.metadata?.userId ??
          (await lookupUserByCustomer(kv, data.customer?.customer_id))

        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.active.no_user',
            metadata: { subscriptionId: data.subscription_id },
            timestamp: Date.now(),
          })
          break
        }

        const productId = data.product_id
        const planId = determinePlanFromProduct(productId)

        await setUserPlan(userId, planId, {
          dodoCustomerId: data.customer?.customer_id,
          dodoSubscriptionId: data.subscription_id,
          currentPeriodEnd: new Date(data.current_period_end).getTime(),
        })

        await storeCustomerMapping(kv, data.customer?.customer_id, userId)

        log({
          level: 'info',
          event: 'billing.subscription.created',
          userId,
          metadata: { planId },
          timestamp: Date.now(),
        })
        break
      }

      case 'subscription.updated': {
        const data = event.data
        const userId =
          data.metadata?.userId ??
          (await lookupUserByCustomer(kv, data.customer?.customer_id))

        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.updated.no_user',
            metadata: { subscriptionId: data.subscription_id },
            timestamp: Date.now(),
          })
          break
        }

        if (data.status === 'active') {
          const productId = data.product_id
          const planId = determinePlanFromProduct(productId)

          await setUserPlan(userId, planId, {
            dodoCustomerId: data.customer?.customer_id,
            dodoSubscriptionId: data.subscription_id,
            currentPeriodEnd: new Date(data.current_period_end).getTime(),
          })
        }

        log({
          level: 'info',
          event: 'billing.subscription.updated',
          userId,
          metadata: { status: data.status },
          timestamp: Date.now(),
        })
        break
      }

      case 'subscription.cancelled': {
        const data = event.data
        const customerId = data.customer?.customer_id

        const userId =
          data.metadata?.userId ??
          (await lookupUserByCustomer(kv, customerId))

        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.cancelled.no_user',
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

      case 'payment.succeeded': {
        const data = event.data
        const userId =
          data.metadata?.userId ??
          (await lookupUserByCustomer(kv, data.customer?.customer_id))

        log({
          level: 'info',
          event: 'billing.payment.succeeded',
          userId: userId ?? undefined,
          metadata: { amount: data.amount },
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
    // Return 200 even on error — Dodo retries on non-200
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
