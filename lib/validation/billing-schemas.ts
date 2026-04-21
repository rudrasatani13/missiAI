import { z } from 'zod'

export const billingCheckoutSchema = z.object({
  planId: z.enum(['plus', 'pro']),
  email: z.string().email().max(254).optional(),
})

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>
