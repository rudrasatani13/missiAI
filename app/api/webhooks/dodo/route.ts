// ─── Dodo Payments Webhook Handler ───────────────────────────────────────────
//
// Dodo Payments sends subscription lifecycle events via Standard Webhooks.
// This handler verifies signatures, deduplicates events, and updates user plans.

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { verifyDodoWebhook, determinePlanFromDodoProduct } from '@/lib/billing/dodo-client'
import { setUserPlan } from '@/lib/billing/tier-checker'
import { log, logSecurityEvent } from '@/lib/server/logger'
import type { KVStore } from '@/types'


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

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
    // TTL of 24 hours — Dodo retries within a few hours
    await kv.put(`webhook:event:${eventId}`, '1', { expirationTtl: 86400 })
  } catch {
    // Non-critical
  }
}

// ─── Webhook Handler ─────────────────────────────────────────────────────────

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

  let event: any
  try {
    event = JSON.parse(rawBody)
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

  if (await isEventProcessed(kv, eventKey)) {
    log({ level: 'info', event: 'billing.webhook.duplicate_skipped', metadata: { eventType, eventId }, timestamp: Date.now() })
    return new Response(
      JSON.stringify({ received: true, duplicate: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const data = event.data ?? event

    switch (eventType) {
      // ─── Subscription activated / renewed ────────────────────────────
      case 'subscription.active':
      case 'subscription.renewed': {
        const subscriptionId = data.subscription_id ?? data.id
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
        const subscriptionId = data.subscription_id ?? data.id
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
        const subscriptionId = data.subscription_id ?? data.id
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
        const subscriptionId = data.subscription_id ?? data.id
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
    // Return 200 even on error — Dodo retries on non-200
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
