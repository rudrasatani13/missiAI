import { NextRequest } from 'next/server'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getBudgetKV } from '@/lib/budget/kv'
import { generateSpendingInsight } from '@/lib/budget/insight-generator'

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response('Unauthorized', { status: 401 })
  }

  const kv = getBudgetKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid month format (YYYY-MM)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const insight = await generateSpendingInsight(kv, userId, month, false)
    return new Response(
      JSON.stringify({ success: true, insight }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response('Unauthorized', { status: 401 })
  }

  const kv = getBudgetKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const month =
    (body as Record<string, unknown>)?.month ??
    new URL(req.url).searchParams.get('month')

  if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid month format (YYYY-MM)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const insight = await generateSpendingInsight(kv, userId, String(month), true)
    return new Response(
      JSON.stringify({ success: true, insight }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
