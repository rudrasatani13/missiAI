import { z } from 'zod'

export const billingCheckoutSchema = z.object({
  planId: z.enum(['pro', 'business']),
  email: z.string().email().optional(),
})

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  planId: z.enum(['pro', 'business']),
})

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
