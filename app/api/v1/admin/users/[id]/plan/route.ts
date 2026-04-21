import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/auth'
import { setUserPlan } from '@/lib/billing/tier-checker'
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
  const role = (clerkAuth.sessionClaims?.metadata as any)?.role
  const isAdmin = role === 'admin' || (process.env.ADMIN_USER_ID ? userId === process.env.ADMIN_USER_ID : false)

  if (!isAdmin) {
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
    await setUserPlan(targetUserId, parsed.data.plan as PlanId)
    return new NextResponse(
      JSON.stringify({ success: true, data: { userId: targetUserId, plan: parsed.data.plan } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Failed to update plan', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
