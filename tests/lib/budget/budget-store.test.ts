import { describe, it, expect, beforeEach } from 'vitest'
import type { KVStore } from '@/types'
import type { ExpenseEntry, BudgetSettings } from '@/types/budget'
import {
  getSettings,
  saveSettings,
  getOrCreateSettings,
  getEntries,
  saveEntry,
  deleteEntry,
  checkRateLimit,
  incrementRateLimit,
  buildMonthlyReport,
  getCachedInsight,
  cacheInsight,
} from '@/lib/budget/budget-store'

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
  })
})
