import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getBudgetKV } from '@/lib/budget/kv'
import { getOrCreateSettings, saveSettings } from '@/lib/budget/budget-store'
import { validateCurrency, DEFAULT_CURRENCY } from '@/lib/budget/currency'
import type { BudgetTab, BudgetLimit, ExpenseCategory } from '@/types/budget'

const VALID_CATEGORIES: readonly string[] = [
  'food', 'transport', 'groceries', 'entertainment', 'health',
  'shopping', 'utilities', 'education', 'travel', 'housing',
  'subscriptions', 'gifts', 'other',
]

const BUDGET_MAX_AMOUNT = 1_000_000_000

const updateSettingsSchema = z.object({
  preferredCurrency: z.string().min(3).max(5).optional(),
  defaultView: z.enum(['overview', 'entries', 'budgets', 'insights', 'settings']).optional(),
  limits: z.array(
    z.object({
      category: z.string().min(1),
      amount: z.number().positive().finite().max(BUDGET_MAX_AMOUNT, "Limit amount too large (max 1,000,000,000)"),
      currency: z.string().min(3).max(5),
    }),
  ).optional(),
})

export async function GET() {
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

  try {
    const settings = await getOrCreateSettings(kv, userId)
    return new Response(
      JSON.stringify({ success: true, settings }),
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
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = updateSettingsSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return new Response(
      JSON.stringify({ success: false, error: msg, code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const existing = await getOrCreateSettings(kv, userId)
    const preferredCurrency = parsed.data.preferredCurrency === undefined
      ? existing.preferredCurrency
      : validateCurrency(parsed.data.preferredCurrency)
    if (!preferredCurrency) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unsupported currency', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    for (const limit of parsed.data.limits ?? []) {
      if (!validateCurrency(limit.currency)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unsupported currency', code: 'VALIDATION_ERROR' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
    const mappedLimits: BudgetLimit[] | undefined = parsed.data.limits?.map((l) => ({
      category: (VALID_CATEGORIES.includes(l.category.toLowerCase())
        ? l.category.toLowerCase()
        : 'other') as ExpenseCategory,
      amount: l.amount,
      currency: validateCurrency(l.currency) ?? DEFAULT_CURRENCY,
    }))
    const normalized = await saveSettings(kv, userId, {
      preferredCurrency,
      defaultView: (parsed.data.defaultView as BudgetTab) ?? existing.defaultView,
      limits: mappedLimits ?? existing.limits,
    })
    return new Response(
      JSON.stringify({ success: true, settings: normalized }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
