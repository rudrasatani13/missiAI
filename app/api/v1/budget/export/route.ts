import { NextRequest } from 'next/server'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getBudgetKV } from '@/lib/budget/kv'
import { getEntries, getOrCreateSettings } from '@/lib/budget/budget-store'
import type { ExpenseEntry } from '@/types/budget'

/** Escape CSV field to prevent formula injection */
function escapeCsvCell(value: string): string {
  let str = String(value)
  // Strip leading trigger characters that Excel/formulas interpret
  const dangerousPrefixes = ['+', '-', '=', '@', '\t', '\r', '\n']
  if (str.length > 0 && dangerousPrefixes.includes(str[0])) {
    str = '\'' + str
  }
  // Wrap in quotes if it contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

function buildCsv(entries: ExpenseEntry[], _currency: string): string {
  const headers = ['Date', 'Category', 'Amount', 'Currency', 'Description']
  const rows = entries.map((e) => [
    e.date,
    e.category,
    String(e.amount),
    e.currency,
    e.description,
  ])
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return lines.join('\n')
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
    const settings = await getOrCreateSettings(kv, userId)
    const entries = await getEntries(kv, userId, month)
    const csv = buildCsv(entries, settings.preferredCurrency)

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="budget-export-${month}.csv"`,
      },
    })
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
