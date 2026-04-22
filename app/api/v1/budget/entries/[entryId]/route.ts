import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getBudgetKV } from '@/lib/budget/kv'
import {
  getEntryById,
  saveEntry,
  deleteEntry,
} from '@/lib/budget/budget-store'
import { validateCurrency } from '@/lib/budget/currency'
import type { ExpenseCategory } from '@/types/budget'

const VALID_CATEGORIES: readonly string[] = [
  'food', 'transport', 'groceries', 'entertainment', 'health',
  'shopping', 'utilities', 'education', 'travel', 'housing',
  'subscriptions', 'gifts', 'other',
]

const patchSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(5).optional(),
  category: z.string().min(1).optional(),
  description: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
})

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
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

  const { entryId } = await Promise.resolve(params)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Determine month from date or fall back to current month
  const yearMonth = parsed.data.date
    ? parsed.data.date.slice(0, 7)
    : new Date().toISOString().slice(0, 7)

  const entry = await getEntryById(kv, userId, entryId, yearMonth)
  if (!entry) {
    return new Response(
      JSON.stringify({ success: false, error: 'Entry not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Ownership check
  if (entry.userId !== userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Apply updates
  if (parsed.data.amount !== undefined) entry.amount = parsed.data.amount
  if (parsed.data.currency !== undefined) {
    const curr = validateCurrency(parsed.data.currency)
    if (curr) entry.currency = curr
  }
  if (parsed.data.category !== undefined) {
    const raw = String(parsed.data.category).toLowerCase()
    entry.category = VALID_CATEGORIES.includes(raw)
      ? (raw as ExpenseCategory)
      : 'other'
  }
  if (parsed.data.description !== undefined) {
    entry.description = stripHtml(parsed.data.description)
  }
  if (parsed.data.date !== undefined) entry.date = parsed.data.date
  if (parsed.data.note !== undefined) {
    entry.note = parsed.data.note ? stripHtml(parsed.data.note) : undefined
  }
  entry.updatedAt = Date.now()

  try {
    await saveEntry(kv, userId, entry)
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
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

  const { entryId } = await Promise.resolve(params)

  // Try current and previous month
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  let entry = await getEntryById(kv, userId, entryId, thisMonth)
  let yearMonth = thisMonth
  if (!entry) {
    entry = await getEntryById(kv, userId, entryId, prevMonth)
    yearMonth = prevMonth
  }

  if (!entry) {
    return new Response(
      JSON.stringify({ success: false, error: 'Entry not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Ownership check
  if (entry.userId !== userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    await deleteEntry(kv, userId, entryId, yearMonth)
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
