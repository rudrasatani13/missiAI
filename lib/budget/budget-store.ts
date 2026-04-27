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
import {
  addBudgetRecentIndexEntryId,
  buildBudgetMonthLinkRecord,
  buildBudgetMonthSnapshot,
  buildBudgetRecentEntriesSnapshot,
  deleteBudgetEntryRecord,
  deleteBudgetMonthLink,
  getBudgetEntryRecord,
  getBudgetInsightRecord,
  getBudgetSettingsRecord,
  getYearMonthFromDate,
  putBudgetEntryRecord,
  putBudgetInsightRecord,
  putBudgetMonthLink,
  removeBudgetRecentIndexEntryId,
  saveBudgetSettingsRecord,
} from './budget-record-store'
import { checkAndIncrementAtomicCounter } from '@/lib/server/platform/atomic-quota'

// Re-export for consumption by other modules
export { VALID_EXPENSE_CATEGORIES }
export type { ExpenseCategory }

// ─── Key Schema ───────────────────────────────────────────────────────────────

function rateLimitKey(userId: string, date: string) {
  return `budget:ratelimit:${userId}:${date}`
}

// ─── TTL ──────────────────────────────────────────────────────────────────────

const ENTRIES_TTL_SECONDS = 395 * 86_400 // 395 days
const INSIGHT_TTL_SECONDS = 395 * 86_400

async function saveBudgetEntryRecordSet(kv: KVStore, userId: string, entry: ExpenseEntry): Promise<void> {
  const nextEntry: ExpenseEntry = { ...entry, userId }
  const existingV2Entry = await getBudgetEntryRecord(kv, userId, entry.id)
  const previousYearMonth = existingV2Entry ? getYearMonthFromDate(existingV2Entry.date) : null
  const nextYearMonth = getYearMonthFromDate(nextEntry.date)
  const monthLink = buildBudgetMonthLinkRecord(nextEntry)

  await putBudgetEntryRecord(kv, nextEntry, { expirationTtl: ENTRIES_TTL_SECONDS })
  if (monthLink) {
    await putBudgetMonthLink(kv, monthLink, { expirationTtl: ENTRIES_TTL_SECONDS })
  }
  if (previousYearMonth && nextYearMonth && previousYearMonth !== nextYearMonth) {
    await deleteBudgetMonthLink(kv, userId, previousYearMonth, entry.id)
  }
  await addBudgetRecentIndexEntryId(kv, userId, entry.id)
}

async function deleteBudgetEntryRecordSet(kv: KVStore, userId: string, entry: ExpenseEntry): Promise<void> {
  const deletedYearMonth = getYearMonthFromDate(entry.date) ?? entry.date.slice(0, 7)
  await deleteBudgetMonthLink(kv, userId, deletedYearMonth, entry.id)
  await deleteBudgetEntryRecord(kv, userId, entry.id)
  await removeBudgetRecentIndexEntryId(kv, userId, entry.id)
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(
  kv: KVStore,
  userId: string,
): Promise<BudgetSettings | null> {
  return getBudgetSettingsRecord(kv, userId).catch(() => null)
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
  return saveBudgetSettingsRecord(kv, normalized)
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
  return buildBudgetMonthSnapshot(kv, userId, yearMonth).catch(() => [])
}

export async function getEntryByIdWithMonth(
  kv: KVStore,
  userId: string,
  entryId: string,
): Promise<{ entry: ExpenseEntry; yearMonth: string } | null> {
  try {
    const v2Entry = await getBudgetEntryRecord(kv, userId, entryId)
    const yearMonth = v2Entry ? getYearMonthFromDate(v2Entry.date) : null
    if (v2Entry && yearMonth) {
      return { entry: v2Entry, yearMonth }
    }
  } catch {
    return null
  }

  return null
}

export async function getEntryById(
  kv: KVStore,
  userId: string,
  entryId: string,
  yearMonth: string,
): Promise<ExpenseEntry | null> {
  const locatedEntry = await getEntryByIdWithMonth(kv, userId, entryId)
  if (!locatedEntry) return null
  return locatedEntry.yearMonth === yearMonth ? locatedEntry.entry : null
}

export async function saveEntry(
  kv: KVStore,
  userId: string,
  entry: ExpenseEntry,
): Promise<ExpenseEntry> {
  await saveBudgetEntryRecordSet(kv, userId, entry)
  return entry
}

export const addExpenseEntry = saveEntry

export async function deleteEntry(
  kv: KVStore,
  userId: string,
  entryId: string,
  yearMonth: string,
): Promise<boolean> {
  void yearMonth
  const existingV2Entry = await getBudgetEntryRecord(kv, userId, entryId)
  if (!existingV2Entry) return false

  await deleteBudgetEntryRecordSet(kv, userId, existingV2Entry)
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

/**
 * Atomically check and increment the daily budget entry rate limit.
 *
 * Tries the ATOMIC_COUNTER Durable Object first for race-free check+increment.
 * Falls back to the legacy KV read-modify-write if the DO binding is unavailable.
 *
 * The counter is consumed at the preflight point. If entry saving fails afterward,
 * the consumed quota is NOT rolled back.
 */
export async function checkAndIncrementRateLimit(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<{ allowed: boolean; remaining: number; current: number; unavailable?: boolean }> {
  const MAX_PER_DAY = 200
  const counterName = rateLimitKey(userId, date)
  const ttl = 24 * 60 * 60 + 60 // 24 hours + 1 minute safety

  const atomic = await checkAndIncrementAtomicCounter(counterName, MAX_PER_DAY, ttl)
  if (atomic) {
    return {
      allowed: atomic.allowed,
      remaining: Math.max(0, MAX_PER_DAY - atomic.count),
      current: atomic.count,
    }
  }

  void kv
  return { allowed: false, remaining: 0, current: 0, unavailable: true }
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

export interface BudgetMonthlyTotals {
  month: string
  total: number
  byCategory: Record<ExpenseCategory, number>
  entryCount: number
}

export async function buildMonthlyTotals(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<BudgetMonthlyTotals> {
  const entries = await getEntries(kv, userId, yearMonth)
  let total = 0
  const byCategory: Record<string, number> = {}

  for (const entry of entries) {
    const amount = entry.amount || 0
    total += amount
    byCategory[entry.category] = (byCategory[entry.category] || 0) + amount
  }

  return {
    month: yearMonth,
    total,
    byCategory: byCategory as Record<ExpenseCategory, number>,
    entryCount: entries.length,
  }
}

export async function buildMonthlyReport(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<MonthlyReport> {
  const settings = await getOrCreateSettings(kv, userId)
  const currentTotals = await buildMonthlyTotals(kv, userId, yearMonth)
  const currency = settings.preferredCurrency
  const total = currentTotals.total
  const byCategory = currentTotals.byCategory as Record<string, number>

  // Previous month
  const prevMonth = getPreviousMonth(yearMonth)
  let previousMonthTotal: number | null = null
  if (prevMonth) {
    previousMonthTotal = (await buildMonthlyTotals(kv, userId, prevMonth)).total
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
    entryCount: currentTotals.entryCount,
    averagePerEntry: currentTotals.entryCount > 0 ? total / currentTotals.entryCount : 0,
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
  return getBudgetInsightRecord(kv, userId, yearMonth).catch(() => null)
}

export async function cacheInsight(
  kv: KVStore,
  userId: string,
  insight: SpendingInsight,
): Promise<void> {
  await putBudgetInsightRecord(kv, userId, insight, { expirationTtl: INSIGHT_TTL_SECONDS })
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
  return buildBudgetRecentEntriesSnapshot(kv, userId, count).catch(() => [])
}
