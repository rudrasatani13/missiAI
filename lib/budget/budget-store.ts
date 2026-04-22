// ─── Budget Buddy KV Store ────────────────────────────────────────────────────

import type { KVStore } from '@/types'
import type {
  BudgetSettings,
  ExpenseEntry,
  ExpenseCategory,
  MonthlyReport,
  SpendingInsight,
  VALID_EXPENSE_CATEGORIES,
} from '@/types/budget'
import { validateCurrency, DEFAULT_CURRENCY } from './currency'

// Re-export for consumption by other modules
export { VALID_EXPENSE_CATEGORIES }
export type { ExpenseCategory }

// ─── Key Schema ───────────────────────────────────────────────────────────────

function settingsKey(userId: string) {
  return `budget:settings:${userId}`
}

function entriesKey(userId: string, yearMonth: string) {
  return `budget:entries:${userId}:${yearMonth}`
}

function rateLimitKey(userId: string, date: string) {
  return `budget:ratelimit:${userId}:${date}`
}

function insightKey(userId: string, yearMonth: string) {
  return `budget:insight:${userId}:${yearMonth}`
}

// ─── TTL ──────────────────────────────────────────────────────────────────────

const ENTRIES_TTL_SECONDS = 395 * 86_400 // 395 days
const INSIGHT_TTL_SECONDS = 395 * 86_400

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(
  kv: KVStore,
  userId: string,
): Promise<BudgetSettings | null> {
  try {
    const raw = await kv.get(settingsKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as BudgetSettings
  } catch {
    return null
  }
}

export async function saveSettings(
  kv: KVStore,
  userId: string,
  settings: Omit<BudgetSettings, 'userId' | 'updatedAt'>,
): Promise<BudgetSettings> {
  const now = Date.now()
  const normalized: BudgetSettings = {
    userId,
    preferredCurrency: validateCurrency(settings.preferredCurrency) ?? DEFAULT_CURRENCY,
    defaultView: settings.defaultView ?? 'overview',
    limits: settings.limits
      ?.filter((l) => l.amount > 0 && validateCurrency(l.currency))
      ?.map((l) => ({
        category: l.category,
        amount: Math.max(0, l.amount),
        currency: validateCurrency(l.currency)!,
      })) ?? [],
    updatedAt: now,
  }
  await kv.put(settingsKey(userId), JSON.stringify(normalized))
  return normalized
}

export async function getOrCreateSettings(
  kv: KVStore,
  userId: string,
): Promise<BudgetSettings> {
  const existing = await getSettings(kv, userId)
  if (existing) return existing
  return saveSettings(kv, userId, {
    preferredCurrency: DEFAULT_CURRENCY,
    defaultView: 'overview',
    limits: [],
  })
}

// ─── Entries ────────────────────────────────────────────────────────────────────

export async function getEntries(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<ExpenseEntry[]> {
  try {
    const raw = await kv.get(entriesKey(userId, yearMonth))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ExpenseEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getEntryById(
  kv: KVStore,
  userId: string,
  entryId: string,
  yearMonth: string,
): Promise<ExpenseEntry | null> {
  const entries = await getEntries(kv, userId, yearMonth)
  return entries.find((e) => e.id === entryId) ?? null
}

export async function saveEntry(
  kv: KVStore,
  userId: string,
  entry: ExpenseEntry,
): Promise<ExpenseEntry> {
  const yearMonth = entry.date.slice(0, 7)
  const entries = await getEntries(kv, userId, yearMonth)
  const idx = entries.findIndex((e) => e.id === entry.id)
  if (idx >= 0) {
    entries[idx] = entry
  } else {
    entries.push(entry)
  }
  // Sort by date descending, then by createdAt descending
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt - a.createdAt
  })
  await kv.put(
    entriesKey(userId, yearMonth),
    JSON.stringify(entries),
    { expirationTtl: ENTRIES_TTL_SECONDS },
  )
  return entry
}

export const addExpenseEntry = saveEntry

export async function deleteEntry(
  kv: KVStore,
  userId: string,
  entryId: string,
  yearMonth: string,
): Promise<boolean> {
  const entries = await getEntries(kv, userId, yearMonth)
  const filtered = entries.filter((e) => e.id !== entryId)
  if (filtered.length === entries.length) return false
  await kv.put(
    entriesKey(userId, yearMonth),
    JSON.stringify(filtered),
    { expirationTtl: ENTRIES_TTL_SECONDS },
  )
  return true
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export async function checkRateLimit(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<{ allowed: boolean; remaining: number; current: number }> {
  const MAX_PER_DAY = 200
  const key = rateLimitKey(userId, date)
  try {
    const raw = await kv.get(key)
    const current = raw ? parseInt(raw, 10) || 0 : 0
    if (current >= MAX_PER_DAY) {
      return { allowed: false, remaining: 0, current }
    }
    return { allowed: true, remaining: MAX_PER_DAY - current, current }
  } catch {
    return { allowed: true, remaining: MAX_PER_DAY, current: 0 }
  }
}

export async function incrementRateLimit(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<void> {
  const key = rateLimitKey(userId, date)
  const raw = await kv.get(key)
  const next = (raw ? parseInt(raw, 10) || 0 : 0) + 1
  const ttl = 24 * 60 * 60 + 60 // 24 hours + 1 minute safety
  await kv.put(key, String(next), { expirationTtl: ttl })
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

export async function buildMonthlyReport(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<MonthlyReport> {
  const settings = await getOrCreateSettings(kv, userId)
  const entries = await getEntries(kv, userId, yearMonth)
  const currency = settings.preferredCurrency

  let total = 0
  const byCategory: Record<string, number> = {}

  for (const entry of entries) {
    const amt = entry.amount || 0
    total += amt
    byCategory[entry.category] = (byCategory[entry.category] || 0) + amt
  }

  // Previous month
  const prevMonth = getPreviousMonth(yearMonth)
  let previousMonthTotal: number | null = null
  if (prevMonth) {
    const prevEntries = await getEntries(kv, userId, prevMonth)
    previousMonthTotal = prevEntries.reduce((sum, e) => sum + (e.amount || 0), 0)
  }

  // Top categories
  const categoryTuples = Object.entries(byCategory) as [string, number][]
  categoryTuples.sort(([, a], [, b]) => b - a)
  const topCategories = categoryTuples
    .slice(0, 5)
    .map(([cat, amount]) => ({
      category: cat as ExpenseCategory,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
    }))

  // Budget vs actual
  const budgetVsActual = settings.limits.map((limit) => {
    const actual = byCategory[limit.category] || 0
    return {
      category: limit.category,
      budget: limit.amount,
      actual,
      remaining: Math.max(0, limit.amount - actual),
    }
  })

  return {
    month: yearMonth,
    currency,
    total,
    previousMonthTotal,
    byCategory: byCategory as Record<ExpenseCategory, number>,
    topCategories,
    entryCount: entries.length,
    averagePerEntry: entries.length > 0 ? total / entries.length : 0,
    budgetVsActual,
  }
}

function getPreviousMonth(yearMonth: string): string | null {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) return null
  const d = new Date(y, m - 2, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

// ─── Insight Cache ────────────────────────────────────────────────────────────

export async function getCachedInsight(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<SpendingInsight | null> {
  try {
    const raw = await kv.get(insightKey(userId, yearMonth))
    if (!raw) return null
    return JSON.parse(raw) as SpendingInsight
  } catch {
    return null
  }
}

export async function cacheInsight(
  kv: KVStore,
  userId: string,
  insight: SpendingInsight,
): Promise<void> {
  await kv.put(
    insightKey(userId, insight.month),
    JSON.stringify(insight),
    { expirationTtl: INSIGHT_TTL_SECONDS },
  )
}

// ─── Convenience: find entries across months ──────────────────────────────────

export async function findEntryAcrossMonths(
  kv: KVStore,
  userId: string,
  entryId: string,
  candidateMonths: string[],
): Promise<{ entry: ExpenseEntry; yearMonth: string } | null> {
  for (const ym of candidateMonths) {
    const entry = await getEntryById(kv, userId, entryId, ym)
    if (entry) return { entry, yearMonth: ym }
  }
  return null
}

// ─── Convenience: get recent entries for overview ───────────────────────────────

export async function getRecentEntries(
  kv: KVStore,
  userId: string,
  count = 10,
): Promise<ExpenseEntry[]> {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevMonth = getPreviousMonth(thisMonth) ?? thisMonth
  const entries = [
    ...(await getEntries(kv, userId, thisMonth)),
    ...(await getEntries(kv, userId, prevMonth)),
  ]
  entries.sort((a, b) => b.createdAt - a.createdAt)
  return entries.slice(0, count)
}
