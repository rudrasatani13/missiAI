import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'
import { buildAnalyticsSnapshot, calculateGrowthRate, formatCostUsd } from '@/lib/analytics/aggregator'
import { appendAnalyticsEventRecord, enqueueAnalyticsPendingEvent, putAnalyticsSnapshotCache } from '@/lib/analytics/analytics-record-store'
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

    it('returns the v2 snapshot cache when it is still fresh', async () => {
      const freshSnapshot = {
        today: {
          date: '2026-04-24',
          totalRequests: 5,
          uniqueUsers: 2,
          voiceInteractions: 1,
          chatRequests: 1,
          ttsRequests: 1,
          memoryReads: 1,
          memoryWrites: 1,
          actionsExecuted: 1,
          totalCostUsd: 0.25,
          errorCount: 0,
          newSignups: 0,
          updatedAt: 100,
        },
        yesterday: {
          date: '2026-04-23',
          totalRequests: 1,
          uniqueUsers: 1,
          voiceInteractions: 0,
          chatRequests: 0,
          ttsRequests: 0,
          memoryReads: 0,
          memoryWrites: 0,
          actionsExecuted: 1,
          totalCostUsd: 0,
          errorCount: 0,
          newSignups: 0,
          updatedAt: 90,
        },
        last7Days: [],
        lifetime: {
          totalUsers: 9,
          totalInteractions: 30,
          totalCostUsd: 4,
          totalRevenue: 7,
          planBreakdown: { free: 6, plus: 2, pro: 1 },
          lastUpdatedAt: 110,
        },
        generatedAt: Date.now(),
      }

      await putAnalyticsSnapshotCache(kv, freshSnapshot)

      expect(await buildAnalyticsSnapshot(kv)).toEqual(freshSnapshot)
    })

    it('bypasses a fresh snapshot cache when append-log aggregation is not caught up', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'))

      try {
        const today = new Date().toISOString().split('T')[0]
        const freshSnapshotGeneratedAt = Date.now()
        const freshSnapshot = {
          today: {
            date: today,
            totalRequests: 99,
            uniqueUsers: 99,
            voiceInteractions: 99,
            chatRequests: 99,
            ttsRequests: 0,
            memoryReads: 0,
            memoryWrites: 0,
            actionsExecuted: 0,
            totalCostUsd: 9.9,
            errorCount: 0,
            newSignups: 0,
            updatedAt: 100,
          },
          yesterday: {
            date: '2026-04-23',
            totalRequests: 0,
            uniqueUsers: 0,
            voiceInteractions: 0,
            chatRequests: 0,
            ttsRequests: 0,
            memoryReads: 0,
            memoryWrites: 0,
            actionsExecuted: 0,
            totalCostUsd: 0,
            errorCount: 0,
            newSignups: 0,
            updatedAt: 90,
          },
          last7Days: [],
          lifetime: {
            totalUsers: 99,
            totalInteractions: 99,
            totalCostUsd: 9.9,
            totalRevenue: 0,
            planBreakdown: { free: 99, plus: 0, pro: 0 },
            lastUpdatedAt: 100,
          },
          generatedAt: freshSnapshotGeneratedAt,
        }

        await putAnalyticsSnapshotCache(kv, freshSnapshot)
        const eventKey = await appendAnalyticsEventRecord(kv, {
          eventId: 'evt_backlog',
          userId: 'user1',
          date: today,
          type: 'chat',
          costUsd: 0.01,
          markSeen: true,
          metadata: {},
          createdAt: Date.now(),
        })
        await enqueueAnalyticsPendingEvent(kv, eventKey, today)

        vi.setSystemTime(new Date(freshSnapshotGeneratedAt + 1))

        const snapshot = await buildAnalyticsSnapshot(kv)

        expect(snapshot.today.totalRequests).toBe(1)
        expect(snapshot.today.chatRequests).toBe(1)
        expect(snapshot.lifetime.totalInteractions).toBe(1)
        expect(snapshot.generatedAt).toBeGreaterThan(freshSnapshot.generatedAt)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
