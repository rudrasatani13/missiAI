import { z } from 'zod'

// VAL-1 FIX: Razorpay ID format validation regexes
const razorpayPaymentIdRegex = /^pay_[A-Za-z0-9]{14,30}$/
const razorpaySubscriptionIdRegex = /^sub_[A-Za-z0-9]{14,30}$/
const razorpaySignatureRegex = /^[a-f0-9]{64}$/ // SHA-256 hex string

// VAL-2 FIX: Added max length limits on all fields
export const billingCheckoutSchema = z.object({
  planId: z.enum(['pro', 'business']),
  email: z.string().email().max(254).optional(),
})

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1).max(50).regex(razorpayPaymentIdRegex, 'Invalid payment ID format'),
  razorpay_subscription_id: z.string().min(1).max(50).regex(razorpaySubscriptionIdRegex, 'Invalid subscription ID format'),
  razorpay_signature: z.string().min(1).max(128).regex(razorpaySignatureRegex, 'Invalid signature format'),
  planId: z.enum(['pro', 'business']),
})

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
