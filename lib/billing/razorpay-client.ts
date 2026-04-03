// ─── Edge-Compatible Razorpay Client (fetch only, no npm packages) ──────────

import type { PlanId } from '@/types/billing'

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'

export function getRazorpayAuth(): string {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) throw new Error('Missing Razorpay credentials')
  return 'Basic ' + btoa(keyId + ':' + keySecret)
}

// ERR-2 FIX: Parse Razorpay API error responses for detailed logging
async function parseRazorpayError(res: Response, fallbackMessage: string): Promise<Error> {
  try {
    const body = await res.json()
    const description = body?.error?.description ?? body?.error?.reason ?? fallbackMessage
    const code = body?.error?.code ?? res.status
    // Log detailed error server-side but return sanitized message
    console.error(`[Razorpay API Error] code=${code} description=${description} status=${res.status}`)
    return new Error(`${fallbackMessage} (code: ${code})`)
  } catch {
    return new Error(`${fallbackMessage} (HTTP ${res.status})`)
  }
}

export async function createRazorpayCustomer(params: {
  name: string
  email: string
  contact?: string
}): Promise<{ id: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${RAZORPAY_API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Authorization': getRazorpayAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name || 'Customer',
        email: params.email,
        ...(params.contact ? { contact: params.contact } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw await parseRazorpayError(res, 'Razorpay customer creation failed')
    }

    const data = await res.json()
    return { id: data.id }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Razorpay customer creation failed')) throw err
    throw new Error('Razorpay customer creation failed')
  } finally {
    clearTimeout(timeout)
  }
}

export async function createRazorpaySubscription(params: {
  planId: string
  customerId: string
  totalCount?: number
  notes?: Record<string, string>
  startAt?: number // Unix timestamp — delays first charge for referral discount
}): Promise<{
  id: string
  status: string
  short_url: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const body: Record<string, unknown> = {
      plan_id: params.planId,
      customer_id: params.customerId,
      total_count: params.totalCount ?? 120,
      quantity: 1,
      customer_notify: 1,
      notes: params.notes ?? {},
    }
    if (params.startAt) {
      body.start_at = params.startAt
    }

    const res = await fetch(`${RAZORPAY_API_BASE}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': getRazorpayAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw await parseRazorpayError(res, 'Razorpay subscription creation failed')
    }

    const data = await res.json()
    return { id: data.id, status: data.status, short_url: data.short_url }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Razorpay subscription creation failed')) throw err
    throw new Error('Razorpay subscription creation failed')
  } finally {
    clearTimeout(timeout)
  }
}

export async function getRazorpaySubscription(
  subscriptionId: string
): Promise<{
  id: string
  status: string
  plan_id: string
  customer_id: string
  current_end: number
  cancel_at_cycle_end: boolean
  notes: Record<string, string>
}> {
  const res = await fetch(`${RAZORPAY_API_BASE}/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': getRazorpayAuth(),
    },
  })

  if (!res.ok) {
    throw await parseRazorpayError(res, 'Razorpay subscription fetch failed')
  }

  return res.json()
}

export async function cancelRazorpaySubscription(
  subscriptionId: string,
  cancelAtCycleEnd: boolean = true
): Promise<void> {
  const res = await fetch(`${RAZORPAY_API_BASE}/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': getRazorpayAuth(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }),
  })

  if (!res.ok) {
    throw await parseRazorpayError(res, 'Razorpay cancel failed')
  }
}

// SRV-2 FIX: Default to 'free' for unknown plan IDs instead of 'pro'
export function determinePlanFromRazorpayPlan(planId: string): PlanId {
  const businessPlanId = process.env.RAZORPAY_BUSINESS_PLAN_ID
  const proPlanId = process.env.RAZORPAY_PRO_PLAN_ID

  if (planId === businessPlanId) return 'business'
  if (planId === proPlanId) return 'pro'
  // Unknown plan IDs default to 'free' — never silently upgrade a user
  return 'free'
}

// SEC-1 FIX: Constant-time comparison to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function verifyRazorpayWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string
): Promise<boolean> {
  try {
    if (!signature || !webhookSecret) return false

    const encoder = new TextEncoder()
    const keyData = encoder.encode(webhookSecret)
    const messageData = encoder.encode(rawBody)

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

    // SEC-1: Use constant-time comparison instead of ===
    return timingSafeCompare(computedSig, signature)
  } catch {
    return false
  }
}

export async function verifyRazorpayPayment(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string
): Promise<boolean> {
  try {
    if (!signature || !keySecret) return false

    const message = paymentId + '|' + subscriptionId
    const encoder = new TextEncoder()
    const keyData = encoder.encode(keySecret)
    const messageData = encoder.encode(message)

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

    // SEC-1: Use constant-time comparison instead of ===
    return timingSafeCompare(computedSig, signature)
  } catch {
    return false
  }
}
