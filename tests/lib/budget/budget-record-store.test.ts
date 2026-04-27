import { beforeEach, describe, expect, it } from 'vitest'
import type { KVListResult, KVStore } from '@/types'
import type { BudgetSettings, ExpenseEntry, SpendingInsight } from '@/types/budget'
import {
  BUDGET_ENTRY_TTL_SECONDS,
  BUDGET_INSIGHT_TTL_SECONDS,
  addBudgetRecentIndexEntryId,
  buildBudgetEntryRecordKey,
  buildBudgetMonthLinkRecord,
  buildBudgetMonthLinkKey,
  buildBudgetRecentIndexKey,
  buildBudgetSettingsRecordKey,
  buildBudgetInsightRecordKey,
  buildBudgetMonthSnapshot,
  buildBudgetRecentEntriesSnapshot,
  deleteBudgetMonthLink,
  getBudgetEntryRecord,
  getBudgetInsightRecord,
  getBudgetMonthIndex,
  getBudgetRecentIndex,
  getBudgetSettingsRecord,
  getYearMonthFromDate,
  listBudgetMonthEntryIds,
  listBudgetMonthLinks,
  putBudgetEntryRecord,
  putBudgetInsightRecord,
  putBudgetMonthLink,
  saveBudgetSettingsRecord,
} from '@/lib/budget/budget-record-store'

interface KVWithStore extends KVStore {
  _store: Map<string, string>
  _ttls: Map<string, number | undefined>
}

function makeKV(withList = false): KVWithStore {
  const store = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  const kv: KVWithStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value)
      ttls.set(key, options?.expirationTtl)
    },
    delete: async (key: string) => {
      store.delete(key)
      ttls.delete(key)
    },
    _store: store,
    _ttls: ttls,
  }
  if (withList) {
    kv.list = async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? parseInt(cursor, 10) || 0 : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    }
  }
  return kv
}

function makeEntry(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 'entry_1',
    userId: 'user_1',
    amount: 42,
    currency: 'usd',
    category: 'food',
    description: 'Lunch',
    date: '2026-04-20',
    createdAt: 100,
    updatedAt: 150,
    source: 'manual',
    ...overrides,
  }
}

describe('budget-record-store', () => {
  let kv: KVWithStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('round-trips settings records through the v2 settings key', async () => {
    const settings: BudgetSettings = {
      userId: 'user_1',
      preferredCurrency: 'inr',
      defaultView: 'entries',
      limits: [
        { category: 'food', amount: 500, currency: 'inr' },
        { category: 'transport', amount: 250, currency: 'usd' },
      ],
      updatedAt: 123,
    }

    await saveBudgetSettingsRecord(kv, settings)

    expect(kv._store.has(buildBudgetSettingsRecordKey('user_1'))).toBe(true)
    expect(await getBudgetSettingsRecord(kv, 'user_1')).toEqual({
      userId: 'user_1',
      preferredCurrency: 'INR',
      defaultView: 'entries',
      limits: [
        { category: 'food', amount: 500, currency: 'INR' },
        { category: 'transport', amount: 250, currency: 'USD' },
      ],
      updatedAt: 123,
    })
  })

  it('round-trips entry records, month links, and month snapshots through fallback indexes', async () => {
    const older = makeEntry({ id: 'entry_1', amount: 12, date: '2026-04-18', createdAt: 100, updatedAt: 100 })
    const newer = makeEntry({ id: 'entry_2', amount: 55, date: '2026-04-21', createdAt: 200, updatedAt: 210, category: 'transport' })

    await putBudgetEntryRecord(kv, older)
    await putBudgetEntryRecord(kv, newer)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(older)!)
    await putBudgetMonthLink(kv, buildBudgetMonthLinkRecord(newer)!)

    expect(kv._ttls.get(buildBudgetEntryRecordKey('user_1', 'entry_1'))).toBe(BUDGET_ENTRY_TTL_SECONDS)
    expect(await getBudgetEntryRecord(kv, 'user_1', 'entry_2')).toEqual(expect.objectContaining({
      id: 'entry_2',
      currency: 'USD',
      category: 'transport',
    }))

    expect(await listBudgetMonthEntryIds(kv, 'user_1', '2026-04')).toEqual(['entry_1', 'entry_2'])
    expect((await getBudgetMonthIndex(kv, 'user_1', '2026-04')).entryIds).toEqual(['entry_1', 'entry_2'])
    expect((await listBudgetMonthLinks(kv, 'user_1', '2026-04')).map((link) => link.entryId)).toEqual(['entry_2', 'entry_1'])
    expect((await buildBudgetMonthSnapshot(kv, 'user_1', '2026-04')).map((entry) => entry.id)).toEqual(['entry_2', 'entry_1'])

    await deleteBudgetMonthLink(kv, 'user_1', '2026-04', 'entry_1')
    expect(await listBudgetMonthEntryIds(kv, 'user_1', '2026-04')).toEqual(['entry_2'])
    expect(kv._store.has(buildBudgetMonthLinkKey('user_1', '2026-04', 'entry_1'))).toBe(false)
  })

  it('supports prefix listing for month links when kv.list is available', async () => {
    const listedKV = makeKV(true)
    const aprilOne = makeEntry({ id: 'entry_a', date: '2026-04-05', createdAt: 10 })
    const aprilTwo = makeEntry({ id: 'entry_b', date: '2026-04-25', createdAt: 20 })
    const mayEntry = makeEntry({ id: 'entry_c', date: '2026-05-01', createdAt: 30 })

    await putBudgetEntryRecord(listedKV, aprilOne)
    await putBudgetEntryRecord(listedKV, aprilTwo)
    await putBudgetEntryRecord(listedKV, mayEntry)
    await putBudgetMonthLink(listedKV, buildBudgetMonthLinkRecord(aprilOne)!)
    await putBudgetMonthLink(listedKV, buildBudgetMonthLinkRecord(aprilTwo)!)
    await putBudgetMonthLink(listedKV, buildBudgetMonthLinkRecord(mayEntry)!)

    expect(await listBudgetMonthEntryIds(listedKV, 'user_1', '2026-04')).toEqual(['entry_a', 'entry_b'])
    expect((await buildBudgetMonthSnapshot(listedKV, 'user_1', '2026-04')).map((entry) => entry.id)).toEqual(['entry_b', 'entry_a'])
  })

  it('uses recent indexes first and falls back to entry-prefix scans when needed', async () => {
    const early = makeEntry({ id: 'entry_1', createdAt: 100, updatedAt: 101, date: '2026-04-01' })
    const middle = makeEntry({ id: 'entry_2', createdAt: 200, updatedAt: 201, date: '2026-04-10' })
    const latest = makeEntry({ id: 'entry_3', createdAt: 300, updatedAt: 301, date: '2026-04-15' })

    await putBudgetEntryRecord(kv, early)
    await putBudgetEntryRecord(kv, middle)
    await putBudgetEntryRecord(kv, latest)

    await addBudgetRecentIndexEntryId(kv, 'user_1', 'entry_1')
    await addBudgetRecentIndexEntryId(kv, 'user_1', 'entry_2')
    await addBudgetRecentIndexEntryId(kv, 'user_1', 'entry_3')

    expect(kv._store.has(buildBudgetRecentIndexKey('user_1'))).toBe(true)
    expect((await getBudgetRecentIndex(kv, 'user_1')).entryIds).toEqual(['entry_3', 'entry_2', 'entry_1'])
    expect((await buildBudgetRecentEntriesSnapshot(kv, 'user_1', 2)).map((entry) => entry.id)).toEqual(['entry_3', 'entry_2'])

    const listedKV = makeKV(true)
    await putBudgetEntryRecord(listedKV, early)
    await putBudgetEntryRecord(listedKV, middle)
    await putBudgetEntryRecord(listedKV, latest)

    expect((await buildBudgetRecentEntriesSnapshot(listedKV, 'user_1', 2)).map((entry) => entry.id)).toEqual(['entry_3', 'entry_2'])
  })

  it('round-trips insight records with the v2 insight ttl', async () => {
    const insight: SpendingInsight = {
      month: '2026-04',
      currency: 'usd',
      generatedAt: 999,
      summary: 'Food was your top category.',
      topCategory: 'food',
      topCategoryAmount: 100,
      comparisonText: '+10% vs last month',
      suggestions: ['Cook at home more often'],
      aiGenerated: false,
    }

    await putBudgetInsightRecord(kv, 'user_1', insight)

    expect(kv._ttls.get(buildBudgetInsightRecordKey('user_1', '2026-04'))).toBe(BUDGET_INSIGHT_TTL_SECONDS)
    expect(await getBudgetInsightRecord(kv, 'user_1', '2026-04')).toEqual({
      month: '2026-04',
      currency: 'USD',
      generatedAt: 999,
      summary: 'Food was your top category.',
      topCategory: 'food',
      topCategoryAmount: 100,
      comparisonText: '+10% vs last month',
      suggestions: ['Cook at home more often'],
      aiGenerated: false,
    })
  })

  it('builds month links and extracts year-month safely from valid dates', () => {
    const entry = makeEntry({ id: 'entry_x', date: '2026-04-22' })

    expect(getYearMonthFromDate('2026-04-22')).toBe('2026-04')
    expect(getYearMonthFromDate('2026-4-22')).toBeNull()
    expect(buildBudgetMonthLinkRecord(entry)).toEqual({
      userId: 'user_1',
      yearMonth: '2026-04',
      entryId: 'entry_x',
      date: '2026-04-22',
      createdAt: 100,
      updatedAt: 150,
    })
  })
})
