import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/security/auth'
import { isAdminUser } from '@/lib/server/security/admin-auth'
import { getUserPlan, setUserPlan } from '@/lib/billing/tier-checker'
import { z } from 'zod'
import type { PlanId } from '@/types/billing'

const planSchema = z.object({
  plan: z.enum(['free', 'plus', 'pro']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
    throw e
  }

  const clerkAuth = await auth()
  const isAdmin = isAdminUser(clerkAuth, userId)

  if (!isAdmin) {
    console.warn(JSON.stringify({ event: 'admin.plan_change.forbidden', userId, targetUserId, timestamp: Date.now() }))
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Invalid JSON', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = planSchema.safeParse(rawBody)
  if (!parsed.success) {
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Invalid plan value', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const previousPlan = await getUserPlan(targetUserId)
    await setUserPlan(targetUserId, parsed.data.plan as PlanId)
    console.info(JSON.stringify({
      event: 'admin.plan_change.success',
      userId,
      targetUserId,
      oldPlan: previousPlan,
      newPlan: parsed.data.plan,
      timestamp: Date.now(),
    }))
    return new NextResponse(
      JSON.stringify({ success: true, data: { userId: targetUserId, plan: parsed.data.plan } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(JSON.stringify({
      event: 'admin.plan_change.error',
      userId,
      targetUserId,
      newPlan: parsed.data.plan,
      error: err instanceof Error ? err.message : String(err),
      timestamp: Date.now(),
    }))
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Failed to update plan', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
