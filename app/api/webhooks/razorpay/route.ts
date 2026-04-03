import { getRequestContext } from '@cloudflare/next-on-pages'
import { verifyRazorpayWebhook, determinePlanFromRazorpayPlan } from '@/lib/billing/razorpay-client'
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

async function storeSubscriptionMapping(kv: KVStore | null, subscriptionId: string, userId: string): Promise<void> {
  if (!kv) return
  try {
    await kv.put(`razorpay:sub:${subscriptionId}`, userId)
  } catch {
    // Non-critical
  }
}

async function lookupUserBySubscription(kv: KVStore | null, subscriptionId: string): Promise<string | null> {
  if (!kv) return null
  try {
    return await kv.get(`razorpay:sub:${subscriptionId}`)
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

  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyRazorpayWebhook(rawBody, signature, webhookSecret)
  if (!isValid) {
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
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
    switch (event.event) {
      case 'subscription.activated': {
        const entity = event.payload.subscription.entity
        const subscriptionId = entity.id
        const userId = entity.notes?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (!userId) {
          log({
            level: 'warn',
            event: 'billing.subscription.activated.no_user',
            metadata: { subscriptionId },
            timestamp: Date.now(),
          })
          break
        }

        const planId = determinePlanFromRazorpayPlan(entity.plan_id)

        await setUserPlan(userId, planId, {
          razorpaySubscriptionId: subscriptionId,
          currentPeriodEnd: entity.current_end * 1000,
        })

        await storeSubscriptionMapping(kv, subscriptionId, userId)

        log({
          level: 'info',
          event: 'billing.subscription.activated',
          userId,
          metadata: { planId },
          timestamp: Date.now(),
        })
        break
      }

      case 'subscription.charged': {
        const entity = event.payload.subscription.entity
        const subscriptionId = entity.id
        const userId = entity.notes?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          await setUserPlan(userId, determinePlanFromRazorpayPlan(entity.plan_id), {
            razorpaySubscriptionId: subscriptionId,
            currentPeriodEnd: entity.current_end * 1000,
          })
        }

        log({
          level: 'info',
          event: 'billing.subscription.charged',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      case 'subscription.cancelled': {
        const entity = event.payload.subscription.entity
        const subscriptionId = entity.id
        const userId = entity.notes?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          await setUserPlan(userId, 'free')
        }

        log({
          level: 'info',
          event: 'billing.subscription.cancelled',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      case 'subscription.completed': {
        const entity = event.payload.subscription.entity
        const subscriptionId = entity.id
        const userId = entity.notes?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          await setUserPlan(userId, 'free')
        }

        log({
          level: 'info',
          event: 'billing.subscription.completed',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
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
        eventType: event.event,
        error: err instanceof Error ? err.message : String(err),
      },
      timestamp: Date.now(),
    })
    // Return 200 even on error — Razorpay retries on non-200
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
