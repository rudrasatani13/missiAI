import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KVStore } from '@/types'
import { generateSpendingInsight } from '@/lib/budget/insight-generator'
import { saveSettings, saveEntry } from '@/lib/budget/budget-store'

vi.mock('@/lib/ai/services/ai-service', () => ({ callGeminiDirect: vi.fn() }))
import { callGeminiDirect as callAIDirect } from '@/lib/ai/services/ai-service'
const mockCallAIDirect = vi.mocked(callAIDirect)

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: { expirationTtl?: number }) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
  }
}

describe('insight-generator', () => {
  let kv: KVStore
  const userId = 'user-insight'
  beforeEach(() => { kv = makeKV(); vi.clearAllMocks() })

  it('returns mechanical fallback when Gemini fails', async () => {
    mockCallAIDirect.mockRejectedValueOnce(new Error('Gemini down'))
    await saveSettings(kv, userId, { preferredCurrency: 'USD', defaultView: 'overview', limits: [] })
    await saveEntry(kv, userId, { id: 'e1', userId, amount: 200, currency: 'USD', category: 'food', description: 'Dinner', date: '2026-04-20', createdAt: 1, updatedAt: 1, source: 'manual' })
    const insight = await generateSpendingInsight(kv, userId, '2026-04', true)
    expect(insight.aiGenerated).toBe(false)
    expect(insight.summary.length).toBeGreaterThan(10)
    expect(insight.topCategory).toBe('food')
    expect(insight.topCategoryAmount).toBe(200)
  })

  it('uses Gemini response when available and safe', async () => {
    mockCallAIDirect.mockResolvedValueOnce('Great job staying within budget this month.')
    await saveSettings(kv, userId, { preferredCurrency: 'USD', defaultView: 'overview', limits: [] })
    await saveEntry(kv, userId, { id: 'e1', userId, amount: 100, currency: 'USD', category: 'groceries', description: 'Milk', date: '2026-04-01', createdAt: 1, updatedAt: 1, source: 'manual' })
    const insight = await generateSpendingInsight(kv, userId, '2026-04', true)
    expect(insight.aiGenerated).toBe(true)
    expect(insight.summary).toContain('Great job')
  })

  it('falls back when AI returns empty string', async () => {
    mockCallAIDirect.mockResolvedValueOnce('')
    await saveSettings(kv, userId, { preferredCurrency: 'USD', defaultView: 'overview', limits: [] })
    await saveEntry(kv, userId, { id: 'e1', userId, amount: 50, currency: 'USD', category: 'transport', description: 'Bus', date: '2026-04-01', createdAt: 1, updatedAt: 1, source: 'manual' })
    const insight = await generateSpendingInsight(kv, userId, '2026-04', true)
    expect(insight.aiGenerated).toBe(false)
  })

  it('returns cached insight without calling Gemini when not forced', async () => {
    await saveSettings(kv, userId, { preferredCurrency: 'USD', defaultView: 'overview', limits: [] })
    await saveEntry(kv, userId, { id: 'e1', userId, amount: 50, currency: 'USD', category: 'transport', description: 'Bus', date: '2026-04-01', createdAt: 1, updatedAt: 1, source: 'manual' })
    const first = await generateSpendingInsight(kv, userId, '2026-04', true)
    mockCallAIDirect.mockResolvedValueOnce('Should not be called')
    const second = await generateSpendingInsight(kv, userId, '2026-04', false)
    expect(second.summary).toBe(first.summary)
    expect(mockCallAIDirect).toHaveBeenCalledTimes(1)
  })
})
