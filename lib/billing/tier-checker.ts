// ─── Clerk-Based Plan & Billing Management ──────────────────────────────────

import { clerkClient } from '@clerk/nextjs/server'
import type { PlanId, UserBilling } from '@/types/billing'

export async function getUserPlan(userId: string): Promise<PlanId> {
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const plan = (user.publicMetadata as Record<string, unknown>)?.plan as string | undefined

  if (plan === 'plus' || plan === 'pro') return plan as PlanId
  return 'free'
}

export async function setUserPlan(
  userId: string,
  planId: PlanId,
  billingData?: Partial<UserBilling>
): Promise<void> {
  const client = await clerkClient()

  // Get existing metadata to preserve fields not being updated
  const user = await client.users.getUser(userId)
  const existingMeta = (user.publicMetadata ?? {}) as Record<string, unknown>

  await client.users.updateUser(userId, {
    publicMetadata: {
      ...existingMeta,
      plan: planId,
      ...(billingData?.dodoCustomerId !== undefined && { dodoCustomerId: billingData.dodoCustomerId }),
      ...(billingData?.dodoSubscriptionId !== undefined && { dodoSubscriptionId: billingData.dodoSubscriptionId }),
      ...(billingData?.currentPeriodEnd !== undefined && { currentPeriodEnd: billingData.currentPeriodEnd }),
      ...(billingData?.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: billingData.cancelAtPeriodEnd }),
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
    dodoCustomerId: meta?.dodoCustomerId as string | undefined,
    dodoSubscriptionId: meta?.dodoSubscriptionId as string | undefined,
    currentPeriodEnd: meta?.currentPeriodEnd as number | undefined,
    cancelAtPeriodEnd: meta?.cancelAtPeriodEnd as boolean | undefined,
    updatedAt: Date.now(),
  }
}
