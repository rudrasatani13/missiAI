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

// SEC-6 FIX: Idempotency check using KV — prevent duplicate webhook processing
async function isEventProcessed(kv: KVStore | null, eventId: string): Promise<boolean> {
  if (!kv || !eventId) return false
  try {
    const existing = await kv.get(`webhook:event:${eventId}`)
    return existing !== null
  } catch {
    return false
  }
}

async function markEventProcessed(kv: KVStore | null, eventId: string): Promise<void> {
  if (!kv || !eventId) return
  try {
    // TTL of 24 hours — Razorpay retries within a few hours
    await kv.put(`webhook:event:${eventId}`, '1', { expirationTtl: 86400 })
  } catch {
    // Non-critical
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

  // SEC-5 FIX: Log and reject invalid/missing signatures instead of silently accepting
  if (!webhookSecret) {
    log({ level: 'error', event: 'billing.webhook.missing_secret', timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: false, error: 'Webhook not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!signature) {
    log({ level: 'warn', event: 'billing.webhook.missing_signature', timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: false, error: 'Missing signature' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyRazorpayWebhook(rawBody, signature, webhookSecret)
  if (!isValid) {
    log({ level: 'warn', event: 'billing.webhook.invalid_signature', timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: false, error: 'Invalid signature' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
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

  // SEC-6 FIX: Idempotency — skip already-processed events
  const eventId = event?.payload?.payment?.entity?.id ?? event?.payload?.subscription?.entity?.id ?? ''
  const eventKey = `${event.event}:${eventId}`
  if (await isEventProcessed(kv, eventKey)) {
    log({ level: 'info', event: 'billing.webhook.duplicate_skipped', metadata: { eventType: event.event, eventId }, timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: true, duplicate: true }),
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
          cancelAtPeriodEnd: false,
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
          await setUserPlan(userId, 'free', {
            cancelAtPeriodEnd: false,
          })
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
          await setUserPlan(userId, 'free', {
            cancelAtPeriodEnd: false,
          })
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

      // SRV-4 FIX: Handle subscription.halted (payment failures exhaust retries)
      case 'subscription.halted': {
        const entity = event.payload.subscription.entity
        const subscriptionId = entity.id
        const userId = entity.notes?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          // Downgrade to free when subscription is halted due to payment failures
          await setUserPlan(userId, 'free', {
            cancelAtPeriodEnd: false,
          })
        }

        log({
          level: 'warn',
          event: 'billing.subscription.halted',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      // SRV-4 FIX: Handle payment.failed events
      case 'payment.failed': {
        const paymentEntity = event.payload.payment?.entity
        const subscriptionId = paymentEntity?.subscription_id

        if (subscriptionId) {
          const userId = await lookupUserBySubscription(kv, subscriptionId)
          log({
            level: 'warn',
            event: 'billing.payment.failed',
            userId: userId ?? undefined,
            metadata: {
              subscriptionId,
              paymentId: paymentEntity?.id,
              errorCode: paymentEntity?.error_code,
              errorDescription: paymentEntity?.error_description,
            },
            timestamp: Date.now(),
          })
        }
        break
      }

      default:
        // Unhandled event type — acknowledge receipt
        break
    }

    // SEC-6: Mark event as processed after successful handling
    await markEventProcessed(kv, eventKey)
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
