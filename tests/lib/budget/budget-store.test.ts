import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'
import type { ExpenseEntry, BudgetSettings } from '@/types/budget'

const { checkAndIncrementAtomicCounterMock } = vi.hoisted(() => ({
  checkAndIncrementAtomicCounterMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: checkAndIncrementAtomicCounterMock,
}))

import {
  getSettings,
  saveSettings,
  getOrCreateSettings,
  getEntries,
  getEntryById,
  saveEntry,
  deleteEntry,
  checkRateLimit,
  checkAndIncrementRateLimit,
  incrementRateLimit,
  buildMonthlyReport,
  getCachedInsight,
  cacheInsight,
  getRecentEntries,
} from '@/lib/budget/budget-store'
import {
  buildBudgetMonthLinkRecord,
  getBudgetEntryRecord,
  getBudgetInsightRecord,
  getBudgetRecentIndex,
  getBudgetSettingsRecord,
  listBudgetMonthEntryIds,
  putBudgetEntryRecord,
  putBudgetInsightRecord,
  putBudgetMonthLink,
  saveBudgetSettingsRecord,
} from '@/lib/budget/budget-record-store'

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: { expirationTtl?: number }) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
  }
}

describe('budget-store', () => {
  let kv: KVStore
  const userId = 'user-test'

  beforeEach(() => {
    kv = makeKV()
    checkAndIncrementAtomicCounterMock.mockReset()
    checkAndIncrementAtomicCounterMock.mockResolvedValue(null)
  })

  it('getOrCreateSettings returns default USD settings for new user', async () => {
    const settings = await getOrCreateSettings(kv, userId)
    expect(settings.userId).toBe(userId)
    expect(settings.preferredCurrency).toBe('USD')
    expect(settings.defaultView).toBe('overview')
    expect(settings.limits).toEqual([])
  })

  it('saveSettings normalizes currency and limits', async () => {
    const saved = await saveSettings(kv, userId, {
      preferredCurrency: 'inr',
      defaultView: 'entries',
      limits: [
        { category: 'food', amount: 500, currency: 'inr' } as const,
        { category: 'invalid', amount: 100, currency: 'xyz' } as any,
      ],
    })
    expect(saved.preferredCurrency).toBe('INR')
    expect(saved.limits).toHaveLength(1)
    expect(saved.limits[0].currency).toBe('INR')
    expect(saved.limits[0].category).toBe('food')
    expect(await getBudgetSettingsRecord(kv, userId)).toEqual(saved)
    expect(await kv.get(`budget:settings:${userId}`)).toBeNull()
  })

  it('saveEntry stores and retrieves entries sorted', async () => {
    const entry: ExpenseEntry = {
      id: 'e1', userId, amount: 100, currency: 'USD',
      category: 'food', description: 'Lunch', date: '2026-04-20',
      createdAt: Date.now(), updatedAt: Date.now(), source: 'manual',
    }
    await saveEntry(kv, userId, entry)
    const entries = await getEntries(kv, userId, '2026-04')
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('e1')
    expect(await getBudgetEntryRecord(kv, userId, 'e1')).toEqual(entry)
    expect(await listBudgetMonthEntryIds(kv, userId, '2026-04')).toEqual(['e1'])
    expect((await getBudgetRecentIndex(kv, userId)).entryIds).toEqual(['e1'])
    expect(await kv.get(`budget:entries:${userId}:2026-04`)).toBeNull()
  })

  it('saveEntry moves the v2 month link when an entry date changes months', async () => {
    const entry: ExpenseEntry = {
      id: 'e1', userId, amount: 100, currency: 'USD',
      category: 'food', description: 'Lunch', date: '2026-04-20',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    await saveEntry(kv, userId, entry)
    await saveEntry(kv, userId, {
      ...entry,
      date: '2026-05-03',
      updatedAt: 2,
    })

    expect(await getBudgetEntryRecord(kv, userId, 'e1')).toEqual(expect.objectContaining({
      date: '2026-05-03',
      updatedAt: 2,
    }))
    expect(await listBudgetMonthEntryIds(kv, userId, '2026-04')).toEqual([])
    expect(await listBudgetMonthEntryIds(kv, userId, '2026-05')).toEqual(['e1'])
  })

  it('deleteEntry removes the correct entry', async () => {
    const e1: ExpenseEntry = {
      id: 'e1', userId, amount: 100, currency: 'USD',
      category: 'food', description: 'Lunch', date: '2026-04-20',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    const e2: ExpenseEntry = {
      id: 'e2', userId, amount: 50, currency: 'USD',
      category: 'transport', description: 'Bus', date: '2026-04-21',
      createdAt: 2, updatedAt: 2, source: 'manual',
    }
    await saveEntry(kv, userId, e1)
    await saveEntry(kv, userId, e2)
    const ok = await deleteEntry(kv, userId, 'e1', '2026-04')
    expect(ok).toBe(true)
    const entries = await getEntries(kv, userId, '2026-04')
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('e2')
    expect(await getBudgetEntryRecord(kv, userId, 'e1')).toBeNull()
    expect(await listBudgetMonthEntryIds(kv, userId, '2026-04')).toEqual(['e2'])
    expect((await getBudgetRecentIndex(kv, userId)).entryIds).toEqual(['e2'])
  })

  it('getRecentEntries reads from the v2 recent index across arbitrary months', async () => {
    const oldEntry: ExpenseEntry = {
      id: 'old-entry', userId, amount: 12, currency: 'USD',
      category: 'food', description: 'Old snack', date: '2025-12-20',
      createdAt: 100, updatedAt: 100, source: 'manual',
    }
    const freshEntry: ExpenseEntry = {
      id: 'fresh-entry', userId, amount: 25, currency: 'USD',
      category: 'transport', description: 'Fresh cab', date: '2026-04-22',
      createdAt: 300, updatedAt: 300, source: 'manual',
    }
    const middleEntry: ExpenseEntry = {
      id: 'middle-entry', userId, amount: 18, currency: 'USD',
      category: 'shopping', description: 'Middle shop', date: '2026-02-14',
      createdAt: 200, updatedAt: 200, source: 'manual',
    }

    await saveEntry(kv, userId, oldEntry)
    await saveEntry(kv, userId, middleEntry)
    await saveEntry(kv, userId, freshEntry)

    const recent = await getRecentEntries(kv, userId, 2)

    expect(recent.map((entry) => entry.id)).toEqual(['fresh-entry', 'middle-entry'])
  })

  it('deleteEntry removes deleted entries from the v2 recent index snapshot', async () => {
    const e1: ExpenseEntry = {
      id: 'recent-delete-1', userId, amount: 100, currency: 'USD',
      category: 'food', description: 'Delete me', date: '2026-04-20',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    const e2: ExpenseEntry = {
      id: 'recent-delete-2', userId, amount: 50, currency: 'USD',
      category: 'transport', description: 'Keep me', date: '2026-04-21',
      createdAt: 2, updatedAt: 2, source: 'manual',
    }
    await saveEntry(kv, userId, e1)
    await saveEntry(kv, userId, e2)

    await deleteEntry(kv, userId, 'recent-delete-2', '2026-04')

    expect((await getRecentEntries(kv, userId)).map((entry) => entry.id)).toEqual(['recent-delete-1'])
  })

  it('checkRateLimit allows up to 200 entries per day', async () => {
    const date = '2026-04-20'
    for (let i = 0; i < 200; i++) {
      await incrementRateLimit(kv, userId, date)
    }
    const rl = await checkRateLimit(kv, userId, date)
    expect(rl.allowed).toBe(false)
    expect(rl.remaining).toBe(0)
    expect(rl.current).toBe(200)
  })

  it('checkAndIncrementRateLimit uses the atomic counter when available', async () => {
    checkAndIncrementAtomicCounterMock.mockResolvedValueOnce({ allowed: true, count: 1, remaining: 199 })

    const rl = await checkAndIncrementRateLimit(kv, userId, '2026-04-20')

    expect(rl).toEqual({ allowed: true, remaining: 199, current: 1 })
    expect(checkAndIncrementAtomicCounterMock).toHaveBeenCalledWith(
      'budget:ratelimit:user-test:2026-04-20',
      200,
      86_460,
    )
  })

  it('checkAndIncrementRateLimit fails closed when the atomic counter is unavailable', async () => {
    checkAndIncrementAtomicCounterMock.mockResolvedValueOnce(null)
    await incrementRateLimit(kv, userId, '2026-04-20')

    const rl = await checkAndIncrementRateLimit(kv, userId, '2026-04-20')

    expect(rl).toEqual({ allowed: false, remaining: 0, current: 0, unavailable: true })
  })

  it('buildMonthlyReport aggregates totals and categories', async () => {
    await saveSettings(kv, userId, {
      preferredCurrency: 'USD',
      defaultView: 'overview',
      limits: [{ category: 'food', amount: 500, currency: 'USD' }],
    })
    const e1: ExpenseEntry = {
      id: 'e1', userId, amount: 100, currency: 'USD',
      category: 'food', description: 'Lunch', date: '2026-04-20',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    const e2: ExpenseEntry = {
      id: 'e2', userId, amount: 50, currency: 'USD',
      category: 'transport', description: 'Bus', date: '2026-04-21',
      createdAt: 2, updatedAt: 2, source: 'manual',
    }
    await saveEntry(kv, userId, e1)
    await saveEntry(kv, userId, e2)
    const report = await buildMonthlyReport(kv, userId, '2026-04')
    expect(report.total).toBe(150)
    expect(report.entryCount).toBe(2)
    expect(report.byCategory.food).toBe(100)
    expect(report.byCategory.transport).toBe(50)
    expect(report.budgetVsActual).toHaveLength(1)
    expect(report.budgetVsActual[0].remaining).toBe(400)
  })

  it('cacheInsight and getCachedInsight round-trip', async () => {
    const insight = {
      month: '2026-04',
      currency: 'USD',
      generatedAt: Date.now(),
      summary: 'Spending is under control.',
      topCategory: 'food' as const,
      topCategoryAmount: 100,
      comparisonText: '+0% vs last month',
      suggestions: ['Cook more at home'],
      aiGenerated: false,
    }
    await cacheInsight(kv, userId, insight)
    const fetched = await getCachedInsight(kv, userId, '2026-04')
    expect(fetched).toEqual(insight)
    expect(await getBudgetInsightRecord(kv, userId, '2026-04')).toEqual(insight)
    expect(await kv.get(`budget:insight:${userId}:2026-04`)).toBeNull()
  })

  it('getSettings prefers the v2 record over stale legacy settings', async () => {
    const legacy: BudgetSettings = {
      userId,
      preferredCurrency: 'USD',
      defaultView: 'overview',
      limits: [],
      updatedAt: 1,
    }
    const v2: BudgetSettings = {
      userId,
      preferredCurrency: 'EUR',
      defaultView: 'entries',
      limits: [{ category: 'food', amount: 300, currency: 'EUR' }],
      updatedAt: 2,
    }

    await kv.put(`budget:settings:${userId}`, JSON.stringify(legacy))
    await saveBudgetSettingsRecord(kv, v2)

    expect(await getSettings(kv, userId)).toEqual(v2)
  })

  it('getEntries prefers v2 records but still includes legacy-only month entries during migration', async () => {
    const legacyOnly: ExpenseEntry = {
      id: 'legacy-only', userId, amount: 25, currency: 'USD',
      category: 'food', description: 'Snack', date: '2026-04-18',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    const staleLegacy: ExpenseEntry = {
      id: 'shared', userId, amount: 40, currency: 'USD',
      category: 'transport', description: 'Old Bus', date: '2026-04-20',
      createdAt: 2, updatedAt: 2, source: 'manual',
    }
    const v2Fresh: ExpenseEntry = {
      id: 'shared', userId, amount: 55, currency: 'USD',
      category: 'transport', description: 'Updated Train', date: '2026-04-22',
      createdAt: 3, updatedAt: 4, source: 'manual',
    }

    await kv.put(`budget:entries:${userId}:2026-04`, JSON.stringify([legacyOnly, staleLegacy]))
    await putBudgetEntryRecord(kv, v2Fresh)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(v2Fresh)!)

    const entries = await getEntries(kv, userId, '2026-04')
    expect(entries.map((entry) => entry.id)).toEqual(['shared'])
    expect(entries.find((entry) => entry.id === 'shared')?.description).toBe('Updated Train')
  })

  it('getSettings ignores legacy-only settings after legacy support removal', async () => {
    const legacySettings: BudgetSettings = {
      userId,
      preferredCurrency: 'INR',
      defaultView: 'entries',
      limits: [{ category: 'food', amount: 400, currency: 'INR' }],
      updatedAt: 5,
    }
    await kv.put(`budget:settings:${userId}`, JSON.stringify(legacySettings))

    expect(await getSettings(kv, userId)).toBeNull()

    const seeded = await getOrCreateSettings(kv, userId)
    expect(seeded.preferredCurrency).toBe('USD')
    expect(seeded.defaultView).toBe('overview')
  })

  it('getEntries does not surface legacy-only month data after legacy support removal', async () => {
    const legacyOnly: ExpenseEntry = {
      id: 'legacy-only-cutover', userId, amount: 80, currency: 'USD',
      category: 'health', description: 'Pharmacy', date: '2026-04-09',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    await kv.put(`budget:entries:${userId}:2026-04`, JSON.stringify([legacyOnly]))

    expect(await getEntries(kv, userId, '2026-04')).toEqual([])
    expect(await getEntryById(kv, userId, 'legacy-only-cutover', '2026-04')).toBeNull()
  })

  it('deleteEntry ignores stale legacy month copies once v2 data is removed', async () => {
    const entry: ExpenseEntry = {
      id: 'deleted-entry', userId, amount: 44, currency: 'USD',
      category: 'food', description: 'Legacy delete', date: '2026-04-14',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }

    await kv.put(`budget:entries:${userId}:2026-04`, JSON.stringify([entry]))
    await putBudgetEntryRecord(kv, entry)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(entry)!)

    expect(await deleteEntry(kv, userId, 'deleted-entry', '2026-04')).toBe(true)
    expect(await getBudgetEntryRecord(kv, userId, 'deleted-entry')).toBeNull()
    expect(await getEntries(kv, userId, '2026-04')).toEqual([])
    expect(await getEntryById(kv, userId, 'deleted-entry', '2026-04')).toBeNull()
    expect(await kv.get(`budget:entries:${userId}:2026-04`)).not.toBeNull()
  })

  it('getCachedInsight ignores legacy-only insight data after legacy support removal', async () => {
    const legacyInsight = {
      month: '2026-04',
      currency: 'USD',
      generatedAt: 3,
      summary: 'Legacy insight.',
      topCategory: 'food' as const,
      topCategoryAmount: 60,
      comparisonText: null,
      suggestions: ['Legacy tip'],
      aiGenerated: false,
    }

    await kv.put(`budget:insight:${userId}:2026-04`, JSON.stringify(legacyInsight))

    expect(await getCachedInsight(kv, userId, '2026-04')).toBeNull()
  })

  it('does not resurrect stale legacy entries when the same v2 entry moved to a different month', async () => {
    const legacyApril: ExpenseEntry = {
      id: 'moving-entry', userId, amount: 70, currency: 'USD',
      category: 'shopping', description: 'Old April Copy', date: '2026-04-12',
      createdAt: 1, updatedAt: 1, source: 'manual',
    }
    const v2May: ExpenseEntry = {
      id: 'moving-entry', userId, amount: 75, currency: 'USD',
      category: 'shopping', description: 'Moved To May', date: '2026-05-02',
      createdAt: 1, updatedAt: 2, source: 'manual',
    }

    await kv.put(`budget:entries:${userId}:2026-04`, JSON.stringify([legacyApril]))
    await putBudgetEntryRecord(kv, v2May)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(v2May)!)

    expect(await getEntries(kv, userId, '2026-04')).toEqual([])
    expect(await getEntryById(kv, userId, 'moving-entry', '2026-04')).toBeNull()
    expect(await getEntryById(kv, userId, 'moving-entry', '2026-05')).toEqual(v2May)
  })

  it('getCachedInsight prefers the v2 cache over stale legacy insight data', async () => {
    const legacyInsight = {
      month: '2026-04',
      currency: 'USD',
      generatedAt: 1,
      summary: 'Old legacy summary.',
      topCategory: 'food' as const,
      topCategoryAmount: 10,
      comparisonText: null,
      suggestions: ['Legacy tip'],
      aiGenerated: false,
    }
    const v2Insight = {
      month: '2026-04',
      currency: 'EUR',
      generatedAt: 2,
      summary: 'Fresh v2 summary.',
      topCategory: 'transport' as const,
      topCategoryAmount: 20,
      comparisonText: '+5% vs last month',
      suggestions: ['New tip'],
      aiGenerated: true,
    }

    await kv.put(`budget:insight:${userId}:2026-04`, JSON.stringify(legacyInsight))
    await putBudgetInsightRecord(kv, userId, v2Insight)

    expect(await getCachedInsight(kv, userId, '2026-04')).toEqual(v2Insight)
  })
})
