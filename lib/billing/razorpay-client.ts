// ─── Edge-Compatible Razorpay Client (fetch only, no npm packages) ──────────

import type { PlanId } from '@/types/billing'

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'

export function getRazorpayAuth(): string {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) throw new Error('Missing Razorpay credentials')
  return 'Basic ' + btoa(keyId + ':' + keySecret)
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
        name: params.name,
        email: params.email,
        contact: params.contact ?? '',
        gstin: '',
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error('Razorpay customer creation failed')
    }

    const data = await res.json()
    return { id: data.id }
  } catch (err) {
    if (err instanceof Error && err.message === 'Razorpay customer creation failed') throw err
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
}): Promise<{
  id: string
  status: string
  short_url: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(`${RAZORPAY_API_BASE}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': getRazorpayAuth(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: params.planId,
        customer_id: params.customerId,
        total_count: params.totalCount ?? 120,
        quantity: 1,
        customer_notify: 1,
        notes: params.notes ?? {},
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error('Razorpay subscription creation failed')
    }

    const data = await res.json()
    return { id: data.id, status: data.status, short_url: data.short_url }
  } catch (err) {
    if (err instanceof Error && err.message === 'Razorpay subscription creation failed') throw err
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
    throw new Error('Razorpay subscription fetch failed')
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
    throw new Error('Razorpay cancel failed')
  }
}

export function determinePlanFromRazorpayPlan(planId: string): PlanId {
  const businessPlanId = process.env.RAZORPAY_BUSINESS_PLAN_ID
  const proPlanId = process.env.RAZORPAY_PRO_PLAN_ID

  if (planId === businessPlanId) return 'business'
  if (planId === proPlanId) return 'pro'
  return 'pro'
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

    return computedSig === signature
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

    return computedSig === signature
  } catch {
    return false
  }
}
