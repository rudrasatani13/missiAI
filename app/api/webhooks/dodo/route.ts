// ─── Dodo Payments Webhook Handler ───────────────────────────────────────────
//
// Dodo Payments sends subscription lifecycle events via Standard Webhooks.
// This handler verifies signatures, deduplicates events, and updates user plans.

import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { verifyDodoWebhook, determinePlanFromDodoProduct } from '@/lib/billing/dodo-client'
import { setUserPlan } from '@/lib/billing/tier-checker'
import { log, logSecurityEvent } from '@/lib/server/observability/logger'
import { readBodyWithSizeGuard } from '@/lib/server/utils/request-body'
import type { KVStore } from '@/types'

const DODO_MAX_BODY_BYTES = 32 * 1024 // 32 KB — billing webhook events are small structured JSON

// ─── KV helpers for subscription→user mapping & idempotency ──────────────────

async function storeSubscriptionMapping(kv: KVStore | null, subscriptionId: string, userId: string): Promise<void> {
  if (!kv) return
  try {
    await kv.put(`dodo:sub:${subscriptionId}`, userId)
  } catch {
    // Non-critical
  }
}

async function lookupUserBySubscription(kv: KVStore | null, subscriptionId: string): Promise<string | null> {
  if (!kv) return null
  try {
    return await kv.get(`dodo:sub:${subscriptionId}`)
  } catch {
    return null
  }
}

async function isEventProcessed(kv: KVStore | null, eventId: string): Promise<boolean> {
  if (!kv) throw new Error('Dodo webhook idempotency storage unavailable')
  if (!eventId) throw new Error('Dodo webhook event id missing')
  const existing = await kv.get(`webhook:event:${eventId}`)
  return existing !== null
}

async function markEventProcessed(kv: KVStore | null, eventId: string): Promise<void> {
  if (!kv) throw new Error('Dodo webhook idempotency storage unavailable')
  if (!eventId) throw new Error('Dodo webhook event id missing')
  await kv.put(`webhook:event:${eventId}`, '1', { expirationTtl: 86400 })
}

// ─── Webhook Handler ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const kv = getCloudflareKVBinding()

  let bodyResult: { body: string } | { error: Response }
  try {
    bodyResult = await readBodyWithSizeGuard(req, DODO_MAX_BODY_BYTES)
  } catch {
    return new Response(
      JSON.stringify({ received: true, error: 'Failed to read body' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if ('error' in bodyResult) {
    return bodyResult.error // 413 for oversized payloads
  }
  const rawBody = bodyResult.body

  // Extract Standard Webhook headers
  const webhookId = req.headers.get('webhook-id') ?? ''
  const webhookSignature = req.headers.get('webhook-signature') ?? ''
  const webhookTimestamp = req.headers.get('webhook-timestamp') ?? ''
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET

  if (!webhookSecret) {
    log({ level: 'error', event: 'billing.webhook.missing_secret', timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!webhookId || !webhookSignature || !webhookTimestamp) {
    logSecurityEvent('security.webhook.missing_headers', {
      path: '/api/webhooks/dodo',
      metadata: { hasId: !!webhookId, hasSig: !!webhookSignature, hasTs: !!webhookTimestamp },
    })
    return new Response(
      JSON.stringify({ received: false, error: 'Missing webhook headers' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyDodoWebhook(
    rawBody,
    {
      'webhook-id': webhookId,
      'webhook-signature': webhookSignature,
      'webhook-timestamp': webhookTimestamp,
    },
    webhookSecret
  )

  if (!isValid) {
    logSecurityEvent('security.webhook.invalid_signature', {
      path: '/api/webhooks/dodo',
      metadata: { webhookId, webhookTimestamp },
    })
    return new Response(
      JSON.stringify({ received: false, error: 'Invalid signature' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // P2-5 fix: typed webhook event replaces previous `any` to catch shape
  // mismatches at compile time and prevent runtime crashes from unexpected payloads.
  interface DodoWebhookEvent {
    type?: string
    event_type?: string
    data?: DodoWebhookEventData
    [key: string]: unknown
  }

  interface DodoWebhookEventData {
    subscription_id?: string
    id?: string
    product_id?: string
    customer_id?: string
    customer?: { customer_id?: string; email?: string }
    metadata?: { userId?: string; [key: string]: unknown }
    items?: Array<{ product_id?: string }>
    current_period_end?: string | number
    [key: string]: unknown
  }

  let event: DodoWebhookEvent
  try {
    event = JSON.parse(rawBody) as DodoWebhookEvent
  } catch {
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Idempotency — skip already-processed events
  const eventId = webhookId
  const eventType = event.type ?? event.event_type ?? ''
  const eventKey = `${eventType}:${eventId}`

  try {
    if (await isEventProcessed(kv, eventKey)) {
      log({ level: 'info', event: 'billing.webhook.duplicate_skipped', metadata: { eventType, eventId }, timestamp: Date.now() })
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data: DodoWebhookEventData = (event.data ?? event) as DodoWebhookEventData

    switch (eventType) {
      // ─── Subscription activated / renewed ────────────────────────────
      case 'subscription.active':
      case 'subscription.renewed': {
        const subscriptionId = data.subscription_id ?? data.id ?? ''
        if (!subscriptionId) break
        const userId = data.metadata?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (!userId) {
          log({
            level: 'warn',
            event: `billing.${eventType}.no_user`,
            metadata: { subscriptionId },
            timestamp: Date.now(),
          })
          break
        }

        const productId = data.product_id ?? data.items?.[0]?.product_id ?? ''
        const planId = determinePlanFromDodoProduct(productId)

        await setUserPlan(userId, planId, {
          dodoSubscriptionId: subscriptionId,
          dodoCustomerId: data.customer?.customer_id ?? data.customer_id,
          currentPeriodEnd: data.current_period_end
            ? new Date(data.current_period_end).getTime()
            : undefined,
          cancelAtPeriodEnd: false,
        })

        await storeSubscriptionMapping(kv, subscriptionId, userId)

        log({
          level: 'info',
          event: `billing.subscription.${eventType === 'subscription.active' ? 'activated' : 'renewed'}`,
          userId,
          metadata: { planId, subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      // ─── Subscription cancelled / failed ─────────────────────────────
      case 'subscription.cancelled':
      case 'subscription.failed': {
        const subscriptionId = data.subscription_id ?? data.id ?? ''
        if (!subscriptionId) break
        const userId = data.metadata?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          await setUserPlan(userId, 'free', {
            cancelAtPeriodEnd: false,
          })
        }

        log({
          level: eventType === 'subscription.failed' ? 'warn' : 'info',
          event: `billing.${eventType}`,
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      // ─── Subscription on hold (payment issue) ────────────────────────
      case 'subscription.on_hold': {
        const subscriptionId = data.subscription_id ?? data.id ?? ''
        if (!subscriptionId) break
        const userId = data.metadata?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          // Downgrade to free when payment fails
          await setUserPlan(userId, 'free', {
            cancelAtPeriodEnd: false,
          })
        }

        log({
          level: 'warn',
          event: 'billing.subscription.on_hold',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      // ─── Plan change ─────────────────────────────────────────────────
      case 'subscription.plan_changed': {
        const subscriptionId = data.subscription_id ?? data.id ?? ''
        if (!subscriptionId) break
        const userId = data.metadata?.userId
          ?? await lookupUserBySubscription(kv, subscriptionId)

        if (userId) {
          const productId = data.product_id ?? data.items?.[0]?.product_id ?? ''
          const planId = determinePlanFromDodoProduct(productId)
          await setUserPlan(userId, planId, {
            dodoSubscriptionId: subscriptionId,
          })
        }

        log({
          level: 'info',
          event: 'billing.subscription.plan_changed',
          userId: userId ?? undefined,
          metadata: { subscriptionId },
          timestamp: Date.now(),
        })
        break
      }

      default:
        // Unhandled event type — acknowledge receipt
        log({
          level: 'info',
          event: 'billing.webhook.unhandled',
          metadata: { eventType },
          timestamp: Date.now(),
        })
        break
    }

    // Mark event as processed after successful handling
    await markEventProcessed(kv, eventKey)
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.webhook.error',
      metadata: {
        eventType,
        error: err instanceof Error ? err.message : String(err),
      },
      timestamp: Date.now(),
    })
    // M6 fix: Return 500 on handler failure so Dodo retries the webhook.
    // Idempotency is enforced by markEventProcessed() — retries are safe.
    // Previously we swallowed errors and returned 200, which meant partial
    // failures (e.g. Clerk plan updated but KV subscription mapping write
    // failed) would be silently dropped with no chance of recovery.
    return new Response(
      JSON.stringify({ received: false, error: 'Handler failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
