import { z } from 'zod'

export const billingCheckoutSchema = z.object({
  planId: z.enum(['pro', 'business']),
  email: z.string().email().optional(),
})

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>
