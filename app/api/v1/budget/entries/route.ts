import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getBudgetKV } from '@/lib/budget/kv'
import {
  getEntries,
  saveEntry,
  checkRateLimit,
  incrementRateLimit,
} from '@/lib/budget/budget-store'
import { validateCurrency } from '@/lib/budget/currency'
import { awardBudgetXP } from '@/lib/gamification/budget-xp'
import type { ExpenseCategory, ExpenseEntry } from '@/types/budget'

const VALID_CATEGORIES: readonly string[] = [
  'food', 'transport', 'groceries', 'entertainment', 'health',
  'shopping', 'utilities', 'education', 'travel', 'housing',
  'subscriptions', 'gifts', 'other',
]

const createEntrySchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(5),
  category: z.string().min(1),
  description: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
})

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

function generateEntryId(): string {
  return `bgt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

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
    const entries = await getEntries(kv, userId, month)
    return new Response(
      JSON.stringify({ success: true, entries }),
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

  const parsed = createEntrySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Validate currency
  const currency = validateCurrency(parsed.data.currency)
  if (!currency) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unsupported currency' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Validate category
  const rawCategory = String(parsed.data.category).toLowerCase()
  const category = VALID_CATEGORIES.includes(rawCategory)
    ? (rawCategory as ExpenseCategory)
    : 'other'

  // Rate limit
  const today = new Date().toISOString().slice(0, 10)
  const rateLimit = await checkRateLimit(kv, userId, today)
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ success: false, error: 'Daily entry limit reached (200/day)' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const now = Date.now()
  const entry: ExpenseEntry = {
    id: generateEntryId(),
    userId,
    amount: parsed.data.amount,
    currency,
    category,
    description: stripHtml(parsed.data.description ?? ''),
    date: parsed.data.date,
    createdAt: now,
    updatedAt: now,
    source: 'manual',
    note: parsed.data.note ? stripHtml(parsed.data.note) : undefined,
  }

  try {
    await saveEntry(kv, userId, entry)
    await incrementRateLimit(kv, userId, today)
    // Fire-and-forget XP
    awardBudgetXP(kv, userId).catch(() => {})

    return new Response(
      JSON.stringify({ success: true, entry }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
