// ─── Edge-Compatible Dodo Payments Client (fetch only, no npm packages) ─────
//
// Uses the Dodo Payments REST API directly via fetch.
// Docs: https://docs.dodopayments.com
// Webhook verification follows the Standard Webhooks spec.

import type { PlanId } from '@/types/billing'

const DODO_API_BASE = 'https://live.dodopayments.com'
// Test mode uses a different base URL
const DODO_TEST_API_BASE = 'https://test.dodopayments.com'

function getApiBase(): string {
  return process.env.DODO_PAYMENTS_MODE === 'test_mode'
    ? DODO_TEST_API_BASE
    : DODO_API_BASE
}

function getDodoAuth(): string {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  if (!apiKey) throw new Error('Missing DODO_PAYMENTS_API_KEY')
  return `Bearer ${apiKey}`
}

// ─── Error Handling ──────────────────────────────────────────────────────────

async function parseDodoError(res: Response, fallbackMessage: string): Promise<Error> {
  try {
    const body = await res.json()
    const description = body?.message ?? body?.error ?? fallbackMessage
    console.error(`[Dodo API Error] status=${res.status} message=${description}`)
    return new Error(`${fallbackMessage} (HTTP ${res.status})`)
  } catch {
    return new Error(`${fallbackMessage} (HTTP ${res.status})`)
  }
}

// ─── Checkout Sessions ───────────────────────────────────────────────────────
//
// Dodo uses hosted checkout pages. We create a session, get a checkout_url,
// and redirect the user to it. After payment, Dodo sends a webhook.

export async function createDodoCheckoutSession(params: {
  productId: string
  customerEmail: string
  customerName?: string
  returnUrl: string
  metadata?: Record<string, string>
}): Promise<{
  session_id: string
  checkout_url: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const body: Record<string, unknown> = {
      product_cart: [
        {
          product_id: params.productId,
          quantity: 1,
        },
      ],
      customer: {
        email: params.customerEmail,
        ...(params.customerName ? { name: params.customerName } : {}),
      },
      return_url: params.returnUrl,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    }

    const res = await fetch(`${getApiBase()}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': getDodoAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw await parseDodoError(res, 'Dodo checkout session creation failed')
    }

    const data = await res.json()
    return {
      session_id: data.session_id ?? data.id,
      checkout_url: data.checkout_url ?? data.url,
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Dodo checkout session')) throw err
    throw new Error('Dodo checkout session creation failed')
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function getDodoSubscription(
  subscriptionId: string
): Promise<{
  subscription_id: string
  status: string
  product_id: string
  customer: { customer_id: string; email: string }
  current_period_end: number | null
  metadata: Record<string, string>
}> {
  const res = await fetch(`${getApiBase()}/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': getDodoAuth(),
    },
  })

  if (!res.ok) {
    throw await parseDodoError(res, 'Dodo subscription fetch failed')
  }

  return res.json()
}

export async function cancelDodoSubscription(
  subscriptionId: string
): Promise<void> {
  const res = await fetch(`${getApiBase()}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': getDodoAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })

  if (!res.ok) {
    throw await parseDodoError(res, 'Dodo subscription cancel failed')
  }
}

// ─── Plan Resolution ─────────────────────────────────────────────────────────

export function determinePlanFromDodoProduct(productId: string): PlanId {
  const businessProductId = process.env.DODO_BUSINESS_PRODUCT_ID
  const proProductId = process.env.DODO_PRO_PRODUCT_ID

  if (productId === businessProductId) return 'business'
  if (productId === proProductId) return 'pro'
  // Unknown product IDs default to 'free' — never silently upgrade a user
  return 'free'
}

// ─── Webhook Verification (Standard Webhooks Spec) ───────────────────────────
//
// Dodo Payments uses the Standard Webhooks specification.
// Headers: webhook-id, webhook-signature, webhook-timestamp
// Signature: HMAC-SHA256 of "{webhook-id}.{webhook-timestamp}.{body}"
// The secret key is Base64-encoded (with optional "whsec_" prefix).

// Constant-time comparison to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// Decode base64 string to Uint8Array
function base64Decode(str: string): Uint8Array {
  const binaryStr = atob(str)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

// Convert Uint8Array to base64 string
function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
}

export async function verifyDodoWebhook(
  rawBody: string,
  headers: {
    'webhook-id': string
    'webhook-signature': string
    'webhook-timestamp': string
  },
  webhookSecret: string
): Promise<boolean> {
  try {
    const webhookId = headers['webhook-id']
    const webhookSignature = headers['webhook-signature']
    const webhookTimestamp = headers['webhook-timestamp']

    if (!webhookId || !webhookSignature || !webhookTimestamp || !webhookSecret) {
      return false
    }

    // Validate timestamp — reject events older than 5 minutes
    const timestampSec = parseInt(webhookTimestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Number.isNaN(timestampSec) || Math.abs(now - timestampSec) > 300) {
      console.warn('[Dodo Webhook] Timestamp invalid or too old/new, rejecting')
      return false
    }

    // Strip "whsec_" prefix from secret if present
    let secretKey = webhookSecret
    if (secretKey.startsWith('whsec_')) {
      secretKey = secretKey.slice(6)
    }

    // Decode the base64-encoded secret
    const keyData = base64Decode(secretKey)

    // Build the signed content: "{webhook-id}.{webhook-timestamp}.{body}"
    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`
    const encoder = new TextEncoder()
    const messageData = encoder.encode(signedContent)

    // Import key and compute HMAC-SHA256
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const computedSig = uint8ArrayToBase64(new Uint8Array(signatureBuffer))

    // The webhook-signature header can contain multiple signatures separated by spaces
    // Each signature is in the format "v1,{base64}" 
    const signatures = webhookSignature.split(' ')
    for (const sig of signatures) {
      const parts = sig.split(',')
      if (parts.length !== 2) continue
      const [version, sigValue] = parts
      if (version !== 'v1') continue
      if (timingSafeCompare(computedSig, sigValue)) {
        return true
      }
    }

    return false
  } catch (err) {
    console.error('[Dodo Webhook] Verification error:', err)
    return false
  }
}
