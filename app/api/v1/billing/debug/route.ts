import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { clerkClient } from '@clerk/nextjs/server'

export const runtime = 'edge'

// Temporary debug endpoint — remove after debugging
export async function GET() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    userId,
  }

  // Check 1: Environment variables
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const proPlanId = process.env.RAZORPAY_PRO_PLAN_ID
  const businessPlanId = process.env.RAZORPAY_BUSINESS_PLAN_ID

  diagnostics.env = {
    RAZORPAY_KEY_ID: keyId ? `${keyId.substring(0, 10)}...` : 'MISSING',
    RAZORPAY_KEY_SECRET: keySecret ? `SET (${keySecret.length} chars)` : 'MISSING',
    RAZORPAY_PRO_PLAN_ID: proPlanId ?? 'MISSING',
    RAZORPAY_BUSINESS_PLAN_ID: businessPlanId ?? 'MISSING',
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ? 'SET' : 'MISSING',
  }

  // Check 2: Clerk user info
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const email = user.emailAddresses[0]?.emailAddress ?? ''
    const name = ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim()
    diagnostics.clerk = {
      email: email || 'EMPTY',
      name: name || 'EMPTY',
      emailCount: user.emailAddresses.length,
    }
  } catch (err) {
    diagnostics.clerk = { error: err instanceof Error ? err.message : String(err) }
  }

  // Check 3: Test Razorpay API connection
  if (keyId && keySecret) {
    try {
      const auth = 'Basic ' + btoa(keyId + ':' + keySecret)
      const res = await fetch('https://api.razorpay.com/v1/plans?count=1', {
        headers: { 'Authorization': auth },
      })
      if (res.ok) {
        const data = await res.json()
        diagnostics.razorpayApi = {
          status: 'CONNECTED',
          httpStatus: res.status,
          plansFound: data.count ?? data.items?.length ?? 0,
        }
      } else {
        const errorBody = await res.text()
        diagnostics.razorpayApi = {
          status: 'FAILED',
          httpStatus: res.status,
          error: errorBody,
        }
      }
    } catch (err) {
      diagnostics.razorpayApi = {
        status: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  } else {
    diagnostics.razorpayApi = { status: 'SKIPPED', reason: 'Missing credentials' }
  }

  return new Response(
    JSON.stringify(diagnostics, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
