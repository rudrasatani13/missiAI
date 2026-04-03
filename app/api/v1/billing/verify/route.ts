import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { verifyRazorpayPayment, getRazorpaySubscription } from '@/lib/billing/razorpay-client'
import { setUserPlan } from '@/lib/billing/tier-checker'
import { PLANS } from '@/types/billing'
import { log } from '@/lib/server/logger'
import { z } from 'zod'

export const runtime = 'edge'

const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  planId: z.enum(['pro', 'business']),
})

export async function POST(req: Request) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const parsed = verifyPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, planId } = parsed.data

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) {
    return new Response(
      JSON.stringify({ success: false, error: 'Payment not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const isValid = await verifyRazorpayPayment(
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature,
    keySecret
  )

  if (!isValid) {
    return new Response(
      JSON.stringify({ success: false, error: 'Payment verification failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const subscription = await getRazorpaySubscription(razorpay_subscription_id)

    await setUserPlan(userId, planId, {
      razorpayCustomerId: subscription.customer_id,
      razorpaySubscriptionId: razorpay_subscription_id,
      currentPeriodEnd: subscription.current_end * 1000,
    })

    log({
      level: 'info',
      event: 'billing.payment.verified',
      userId,
      metadata: { planId },
      timestamp: Date.now(),
    })

    return new Response(
      JSON.stringify({ success: true, plan: PLANS[planId] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'billing.verify.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to verify payment' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
