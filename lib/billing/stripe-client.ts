// ─── Edge-Compatible Stripe Client (fetch only, no Node.js SDK) ──────────────

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return key
}

function stripeHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getStripeKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

export function stripeFormEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

export async function createCheckoutSession(params: {
  customerId?: string
  priceId: string
  successUrl: string
  cancelUrl: string
  clientReferenceId: string
  customerEmail?: string
}): Promise<{ id: string; url: string }> {
  const body: Record<string, string> = {
    'mode': 'subscription',
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    'success_url': params.successUrl,
    'cancel_url': params.cancelUrl,
    'client_reference_id': params.clientReferenceId,
  }

  if (params.customerEmail) {
    body['customer_email'] = params.customerEmail
  }
  if (params.customerId) {
    body['customer'] = params.customerId
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: stripeHeaders(),
      body: stripeFormEncode(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Stripe checkout failed: ${res.status}`)
    }

    const data = await res.json()
    return { id: data.id, url: data.url }
  } finally {
    clearTimeout(timeout)
  }
}

export async function createCustomerPortalSession(params: {
  customerId: string
  returnUrl: string
}): Promise<{ url: string }> {
  const res = await fetch(`${STRIPE_API_BASE}/billing_portal/sessions`, {
    method: 'POST',
    headers: stripeHeaders(),
    body: stripeFormEncode({
      'customer': params.customerId,
      'return_url': params.returnUrl,
    }),
  })

  if (!res.ok) {
    throw new Error(`Stripe portal session failed: ${res.status}`)
  }

  const data = await res.json()
  return { url: data.url }
}

export async function retrieveSubscription(
  subscriptionId: string
): Promise<{
  id: string
  status: string
  current_period_end: number
  cancel_at_period_end: boolean
  customer: string
}> {
  const res = await fetch(`${STRIPE_API_BASE}/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getStripeKey()}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Stripe subscription retrieval failed: ${res.status}`)
  }

  return res.json()
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(',')
    let timestamp = ''
    let sig = ''

    for (const part of parts) {
      const [key, value] = part.split('=')
      if (key === 't') timestamp = value
      if (key === 'v1') sig = value
    }

    if (!timestamp || !sig) return false

    // Check timestamp freshness (within 300 seconds)
    const ts = parseInt(timestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > 300) return false

    // Compute HMAC-SHA256 using Web Crypto API
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(`${timestamp}.${payload}`)

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

    return computedSig === sig
  } catch {
    return false
  }
}
