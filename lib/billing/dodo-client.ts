// ─── Edge-Compatible Dodo Payments Client (fetch only, no npm packages) ──────

import type { PlanId } from '@/types/billing'

const DODO_API_BASE = 'https://api.dodopayments.com'

export function getDodoKey(): string {
  const key = process.env.DODO_API_KEY
  if (!key) throw new Error('Missing DODO_API_KEY')
  return key
}

function dodoHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getDodoKey()}`,
    'Content-Type': 'application/json',
  }
}

export async function createDodoCheckout(params: {
  productId: string
  successUrl: string
  cancelUrl: string
  customerUserId: string
  customerEmail?: string
  quantity?: number
}): Promise<{ subscriptionId: string; checkoutUrl: string }> {
  const body = {
    // Dodo's API expects zipcode as an integer; empty strings cause 422 errors.
    // city/state/street are optional strings — omit them when blank.
    billing: { country: 'IN', zipcode: 0 },
    customer: {
      // Dodo rejects empty-string emails — omit the field entirely when absent
      ...(params.customerEmail ? { email: params.customerEmail } : {}),
      create_new_customer: true,
    },
    metadata: { userId: params.customerUserId },
    payment_link: true,
    product_id: params.productId,
    quantity: params.quantity ?? 1,
    return_url: params.successUrl,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${DODO_API_BASE}/subscriptions`, {
      method: 'POST',
      headers: dodoHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      let detail = ''
      try {
        const errBody = await res.json()
        detail = errBody.message ?? errBody.error ?? JSON.stringify(errBody)
      } catch {
        detail = await res.text().catch(() => '')
      }
      throw new Error(`Dodo checkout failed: ${res.status}${detail ? ` — ${detail}` : ''}`)
    }

    const data = await res.json()
    return {
      subscriptionId: data.subscription_id,
      checkoutUrl: data.payment_link,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getDodoSubscription(
  subscriptionId: string
): Promise<{
  subscription_id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
  customer_id: string
  product_id: string
  metadata?: Record<string, string>
}> {
  const res = await fetch(`${DODO_API_BASE}/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getDodoKey()}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Dodo subscription fetch failed: ${res.status}`)
  }

  return res.json()
}

export async function cancelDodoSubscription(
  subscriptionId: string
): Promise<void> {
  const res = await fetch(`${DODO_API_BASE}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: dodoHeaders(),
    body: JSON.stringify({ status: 'cancelled' }),
  })

  if (!res.ok) {
    throw new Error(`Dodo cancel failed: ${res.status}`)
  }
}

export async function createDodoCustomerPortal(params: {
  customerEmail: string
  returnUrl: string
}): Promise<{ url: string }> {
  return {
    url: `https://app.dodopayments.com/customers/portal?email=${encodeURIComponent(params.customerEmail)}&return_url=${encodeURIComponent(params.returnUrl)}`,
  }
}

export async function verifyDodoWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    if (!signature || !secret) return false

    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(payload)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return computedSig === signature
  } catch {
    return false
  }
}

export function determinePlanFromProduct(productId: string): PlanId {
  const businessProductId = process.env.DODO_BUSINESS_PRODUCT_ID
  const proProductId = process.env.DODO_PRO_PRODUCT_ID

  if (productId === businessProductId) return 'business'
  if (productId === proProductId) return 'pro'
  return 'pro'
}
