// ─── Clerk-Based Plan & Billing Management ──────────────────────────────────

import { clerkClient } from '@clerk/nextjs/server'
import type { PlanId, UserBilling } from '@/types/billing'

export async function getUserPlan(userId: string): Promise<PlanId> {
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const plan = (user.publicMetadata as Record<string, unknown>)?.plan as string | undefined

  if (plan === 'pro' || plan === 'business') return plan
  return 'free'
}

export async function setUserPlan(
  userId: string,
  planId: PlanId,
  billingData?: Partial<UserBilling>
): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUser(userId, {
    publicMetadata: {
      plan: planId,
      stripeCustomerId: billingData?.stripeCustomerId,
      stripeSubscriptionId: billingData?.stripeSubscriptionId,
      currentPeriodEnd: billingData?.currentPeriodEnd,
    },
  })
}

export async function getUserBillingData(userId: string): Promise<UserBilling> {
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const meta = user.publicMetadata as Record<string, unknown>

  return {
    userId,
    planId: (meta?.plan as PlanId) ?? 'free',
    stripeCustomerId: meta?.stripeCustomerId as string | undefined,
    stripeSubscriptionId: meta?.stripeSubscriptionId as string | undefined,
    currentPeriodEnd: meta?.currentPeriodEnd as number | undefined,
    cancelAtPeriodEnd: meta?.cancelAtPeriodEnd as boolean | undefined,
    updatedAt: Date.now(),
  }
}
