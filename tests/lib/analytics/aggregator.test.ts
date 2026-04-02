import { describe, it, expect, beforeEach } from 'vitest'
import type { KVStore } from '@/types'
import { buildAnalyticsSnapshot, calculateGrowthRate, formatCostUsd } from '@/lib/analytics/aggregator'
import { recordEvent } from '@/lib/analytics/event-store'

// ─── In-memory KV mock ────────────────────────────────────────────────────────

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
  }
}

describe('aggregator', () => {
  describe('calculateGrowthRate', () => {
    it('returns 100 for doubling (10 from 5)', () => {
      expect(calculateGrowthRate(10, 5)).toBe(100)
    })

    it('returns -50 for halving (5 from 10)', () => {
      expect(calculateGrowthRate(5, 10)).toBe(-50)
    })

    it('returns 0 when previous is 0', () => {
      expect(calculateGrowthRate(5, 0)).toBe(0)
    })

    it('returns 0 when both are 0', () => {
      expect(calculateGrowthRate(0, 0)).toBe(0)
    })

    it('returns negative for decrease', () => {
      expect(calculateGrowthRate(3, 10)).toBe(-70)
    })
  })

  describe('formatCostUsd', () => {
    it('formats small values to 4 decimal places', () => {
      expect(formatCostUsd(0.0015)).toBe('$0.0015')
    })

    it('formats larger values to 2 decimal places', () => {
      expect(formatCostUsd(1.5)).toBe('$1.50')
    })

    it('formats zero', () => {
      expect(formatCostUsd(0)).toBe('$0.0000')
    })

    it('formats exact cents', () => {
      expect(formatCostUsd(0.01)).toBe('$0.01')
    })

    it('formats dollars', () => {
      expect(formatCostUsd(5.0)).toBe('$5.00')
    })
  })

  describe('buildAnalyticsSnapshot', () => {
    let kv: KVStore

    beforeEach(() => {
      kv = createMockKV()
    })

    it('returns correct shape with today/yesterday/last7Days', async () => {
      // Record some events first
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })

      const snapshot = await buildAnalyticsSnapshot(kv)

      expect(snapshot).toHaveProperty('today')
      expect(snapshot).toHaveProperty('yesterday')
      expect(snapshot).toHaveProperty('last7Days')
      expect(snapshot).toHaveProperty('lifetime')
      expect(snapshot).toHaveProperty('generatedAt')

      expect(snapshot.today).toHaveProperty('date')
      expect(snapshot.today).toHaveProperty('totalRequests')
      expect(snapshot.today).toHaveProperty('uniqueUsers')
      expect(snapshot.today).toHaveProperty('voiceInteractions')
      expect(snapshot.today).toHaveProperty('chatRequests')
      expect(snapshot.today).toHaveProperty('ttsRequests')
      expect(snapshot.today).toHaveProperty('totalCostUsd')

      expect(snapshot.last7Days).toHaveLength(7)
      expect(snapshot.generatedAt).toBeGreaterThan(0)
    })

    it('returns today stats with recorded events', async () => {
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.005 })
      await recordEvent(kv, { type: 'tts', userId: 'user1' })

      const snapshot = await buildAnalyticsSnapshot(kv)

      expect(snapshot.today.chatRequests).toBe(1)
      expect(snapshot.today.ttsRequests).toBe(1)
      expect(snapshot.today.totalRequests).toBe(2)
    })

    it('returns empty stats for dates with no data', async () => {
      const snapshot = await buildAnalyticsSnapshot(kv)

      expect(snapshot.yesterday.totalRequests).toBe(0)
      expect(snapshot.yesterday.chatRequests).toBe(0)
    })

    it('caches snapshot and returns cached on subsequent call', async () => {
      await recordEvent(kv, { type: 'chat', userId: 'user1' })

      const snapshot1 = await buildAnalyticsSnapshot(kv)
      const snapshot2 = await buildAnalyticsSnapshot(kv)

      // Should return same generatedAt (cached)
      expect(snapshot2.generatedAt).toBe(snapshot1.generatedAt)
    })
  })
})
