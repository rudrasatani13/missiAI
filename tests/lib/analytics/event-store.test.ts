import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'
import {
  getAnalyticsAggregationStatus,
  getDailyStats,
  getLifetimeTotals,
  getUniqueUserCount,
  recordAnalyticsUsage,
  recordEvent,
  recordUserSeen,
} from '@/lib/analytics/event-store'
import {
  appendAnalyticsEventRecord,
  buildAnalyticsDayIndexKey,
  buildAnalyticsUserDayRecordKey,
  buildAnalyticsUserIndexKey,
  buildAnalyticsUserLifetimeRecordKey,
  emptyAnalyticsMeta,
  enqueueAnalyticsPendingEvent,
  getAnalyticsUserDayRecord,
  getAnalyticsUserLifetimeRecord,
  listAnalyticsDayUserIds,
  listAnalyticsEventRecordsForDate,
  listAnalyticsUserIds,
  putAnalyticsDaySummary,
  putAnalyticsMeta,
} from '@/lib/analytics/analytics-record-store'
import { logError } from '@/lib/server/observability/logger'

vi.mock('@/lib/server/observability/logger', () => ({
  logError: vi.fn(),
}))

// ─── In-memory KV mock ────────────────────────────────────────────────────────

interface TestKV extends KVStore {
  _store: Map<string, string>
}

function createMockKV(): TestKV {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
    _store: store,
  }
}

describe('event-store', () => {
  let kv: TestKV

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('recordEvent', () => {
    it("increments chatRequests and totalRequests for 'chat' event", async () => {
      await recordEvent(kv, { type: 'chat', userId: 'user1' })
      await recordEvent(kv, { type: 'chat', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.chatRequests).toBe(2)
      expect(stats.totalRequests).toBe(2)
      expect(stats.voiceInteractions).toBe(2) // chat also increments voice
    })

    it('writes events into v2 user-day and lifetime records without touching retired legacy keys', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })
      await recordEvent(kv, { type: 'tts', userId: 'user1', costUsd: 0.005 })

      expect(await getAnalyticsUserDayRecord(kv, 'user1', today)).toEqual(expect.objectContaining({
        userId: 'user1',
        date: today,
        totalRequests: 2,
        uniqueUsers: 1,
        seenToday: true,
        voiceInteractions: 1,
        chatRequests: 1,
        ttsRequests: 1,
        totalCostUsd: 0.015,
      }))
      expect(await getAnalyticsUserLifetimeRecord(kv, 'user1')).toEqual(expect.objectContaining({
        userId: 'user1',
        totalInteractions: 2,
        totalCostUsd: 0.015,
        countsTowardTotalUsers: true,
      }))
      expect(await listAnalyticsDayUserIds(kv, today)).toEqual(['user1'])
      expect(await listAnalyticsUserIds(kv)).toEqual(['user1'])
      expect(kv._store.has(`analytics:daily:${today}`)).toBe(false)
      expect(kv._store.has(`analytics:users:${today}`)).toBe(false)
      expect(kv._store.has('analytics:totals')).toBe(false)
    })

    it('stores authoritative raw append-log events for analytics usage writes', async () => {
      const today = new Date().toISOString().split('T')[0]

      await recordAnalyticsUsage(kv, { type: 'chat', userId: 'user1', costUsd: 0.01, date: today })

      expect(await listAnalyticsEventRecordsForDate(kv, today)).toEqual([
        expect.objectContaining({
          userId: 'user1',
          date: today,
          type: 'chat',
          markSeen: true,
          costUsd: 0.01,
        }),
      ])
    })

    it('does not create legacy aggregate keys when recording an event directly', async () => {
      const today = new Date().toISOString().split('T')[0]

      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })

      expect(await getDailyStats(kv, today)).toEqual(expect.objectContaining({
        date: today,
        totalRequests: 1,
        uniqueUsers: 0,
        chatRequests: 1,
        voiceInteractions: 1,
        totalCostUsd: 0.01,
      }))
      expect(kv._store.has(`analytics:daily:${today}`)).toBe(false)
      expect(kv._store.has('analytics:totals')).toBe(false)
    })

    it("increments ttsRequests for 'tts' event", async () => {
      await recordEvent(kv, { type: 'tts', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.ttsRequests).toBe(1)
      expect(stats.totalRequests).toBe(1)
    })

    it("increments memoryReads for 'memory_read' event", async () => {
      await recordEvent(kv, { type: 'memory_read', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.memoryReads).toBe(1)
    })

    it("increments memoryWrites for 'memory_write' event", async () => {
      await recordEvent(kv, { type: 'memory_write', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.memoryWrites).toBe(1)
    })

    it("increments actionsExecuted for 'action' event", async () => {
      await recordEvent(kv, { type: 'action', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.actionsExecuted).toBe(1)
    })

    it("increments errorCount for 'error' event", async () => {
      await recordEvent(kv, { type: 'error', userId: 'user1' })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.errorCount).toBe(1)
    })

    it('adds costUsd to totalCostUsd', async () => {
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.005 })
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.003 })

      const today = new Date().toISOString().split('T')[0]
      const stats = await getDailyStats(kv, today)
      expect(stats.totalCostUsd).toBeCloseTo(0.008, 4)
    })

    it('updates lifetime totals', async () => {
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })

      const totals = await getLifetimeTotals(kv)
      expect(totals.totalInteractions).toBe(1)
      expect(totals.totalCostUsd).toBeCloseTo(0.01, 4)
    })

    it('logs and rejects when analytics recording storage fails', async () => {
      const brokenKV: KVStore = {
        get: async () => { throw new Error('KV down') },
        put: async () => { throw new Error('KV down') },
        delete: async () => { throw new Error('KV down') },
      }

      await expect(
        recordEvent(brokenKV, { type: 'chat', userId: 'user1' })
      ).rejects.toThrow('KV down')
      expect(logError).toHaveBeenCalledWith(
        'analytics.record_event.error',
        expect.any(Error),
        'user1',
      )
    })

    it('rebuilds daily and lifetime reads from the append log when derived records are missing', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordAnalyticsUsage(kv, { type: 'chat', userId: 'user1', costUsd: 0.01, date: today })

      await kv.delete(buildAnalyticsUserDayRecordKey('user1', today))
      await kv.delete(buildAnalyticsUserLifetimeRecordKey('user1'))
      await kv.delete(buildAnalyticsDayIndexKey(today))
      await kv.delete(buildAnalyticsUserIndexKey())

      expect(await getDailyStats(kv, today)).toEqual(expect.objectContaining({
        date: today,
        totalRequests: 1,
        uniqueUsers: 1,
        chatRequests: 1,
        voiceInteractions: 1,
        totalCostUsd: 0.01,
      }))
      expect(await getLifetimeTotals(kv)).toEqual(expect.objectContaining({
        totalUsers: 1,
        totalInteractions: 1,
        totalCostUsd: 0.01,
      }))
    })
  })

  describe('recordAnalyticsUsage', () => {
    it('records seen-user and event state together through one shared helper call', async () => {
      const today = new Date().toISOString().split('T')[0]

      await recordAnalyticsUsage(kv, { type: 'chat', userId: 'user1', costUsd: 0.01, date: today })
      await recordAnalyticsUsage(kv, { type: 'tts', userId: 'user1', costUsd: 0.005, date: today })

      expect(await getDailyStats(kv, today)).toEqual(expect.objectContaining({
        date: today,
        totalRequests: 2,
        uniqueUsers: 1,
        chatRequests: 1,
        ttsRequests: 1,
        voiceInteractions: 1,
        totalCostUsd: 0.015,
      }))
      expect(await getUniqueUserCount(kv, today)).toBe(1)
      expect(await getLifetimeTotals(kv)).toEqual(expect.objectContaining({
        totalUsers: 1,
        totalInteractions: 2,
        totalCostUsd: 0.015,
      }))
      expect(await getAnalyticsUserDayRecord(kv, 'user1', today)).toEqual(expect.objectContaining({
        userId: 'user1',
        date: today,
        totalRequests: 2,
        uniqueUsers: 1,
        seenToday: true,
      }))
      expect(kv._store.has(`analytics:daily:${today}`)).toBe(false)
      expect(kv._store.has(`analytics:users:${today}`)).toBe(false)
      expect(kv._store.has('analytics:totals')).toBe(false)
    })
  })

  describe('seeded-v2 compatibility after legacy removal', () => {
    it('still combines a pre-seeded v2 lifetime baseline with live v2 lifetime records', async () => {
      const today = '2026-04-24'

      await putAnalyticsMeta(kv, {
        ...emptyAnalyticsMeta(),
        cutoverDate: today,
        legacyLifetimeBaseline: {
          totalUsers: 40,
          totalInteractions: 400,
          totalCostUsd: 4,
          totalRevenue: 8,
          planBreakdown: { free: 20, plus: 15, pro: 6 },
          lastUpdatedAt: 999,
        },
        migratedAt: 500,
        updatedAt: 600,
      })
      await recordAnalyticsUsage(kv, { type: 'chat', userId: 'user1', costUsd: 0.01, date: today })

      expect(await getLifetimeTotals(kv)).toEqual({
        totalUsers: 41,
        totalInteractions: 401,
        totalCostUsd: 4.01,
        totalRevenue: 8,
        planBreakdown: { free: 20, plus: 15, pro: 6 },
        lastUpdatedAt: expect.any(Number),
      })
    })

    it('still serves pre-seeded v2 day summaries for dates without user-day records', async () => {
      await putAnalyticsDaySummary(kv, {
        date: '2025-01-15',
        totalRequests: 7,
        uniqueUsers: 3,
        voiceInteractions: 2,
        chatRequests: 2,
        ttsRequests: 1,
        memoryReads: 1,
        memoryWrites: 0,
        actionsExecuted: 1,
        totalCostUsd: 0.12,
        errorCount: 0,
        newSignups: 1,
        updatedAt: 123,
      })

      expect(await getDailyStats(kv, '2025-01-15')).toEqual({
        date: '2025-01-15',
        totalRequests: 7,
        uniqueUsers: 3,
        voiceInteractions: 2,
        chatRequests: 2,
        ttsRequests: 1,
        memoryReads: 1,
        memoryWrites: 0,
        actionsExecuted: 1,
        totalCostUsd: 0.12,
        errorCount: 0,
        newSignups: 1,
        updatedAt: 123,
      })
      expect(await getUniqueUserCount(kv, '2025-01-15')).toBe(3)
    })
  })

  describe('getDailyStats', () => {
    it('returns zeroed stats for empty KV', async () => {
      const stats = await getDailyStats(kv, '2025-01-15')
      expect(stats.date).toBe('2025-01-15')
      expect(stats.totalRequests).toBe(0)
      expect(stats.uniqueUsers).toBe(0)
      expect(stats.chatRequests).toBe(0)
      expect(stats.ttsRequests).toBe(0)
      expect(stats.memoryReads).toBe(0)
      expect(stats.memoryWrites).toBe(0)
      expect(stats.actionsExecuted).toBe(0)
      expect(stats.totalCostUsd).toBe(0)
      expect(stats.errorCount).toBe(0)
      expect(stats.newSignups).toBe(0)
    })

    it('prefers v2 day records over stale legacy daily stats once v2 data exists', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })
      await kv.put(`analytics:daily:${today}`, JSON.stringify({
        date: today,
        totalRequests: 99,
        uniqueUsers: 88,
        voiceInteractions: 77,
        chatRequests: 66,
        ttsRequests: 55,
        memoryReads: 44,
        memoryWrites: 33,
        actionsExecuted: 22,
        totalCostUsd: 11,
        errorCount: 9,
        newSignups: 8,
        updatedAt: 999,
      }))

      const stats = await getDailyStats(kv, today)
      expect(stats).toEqual(expect.objectContaining({
        date: today,
        totalRequests: 1,
        uniqueUsers: 1,
        voiceInteractions: 1,
        chatRequests: 1,
        totalCostUsd: 0.01,
      }))
    })

    it('returns empty stats when only retired legacy daily keys exist for the date', async () => {
      await kv.put('analytics:daily:2025-01-15', JSON.stringify({
        date: '2025-01-15',
        totalRequests: 7,
        uniqueUsers: 3,
        voiceInteractions: 2,
        chatRequests: 2,
        ttsRequests: 1,
        memoryReads: 1,
        memoryWrites: 0,
        actionsExecuted: 1,
        totalCostUsd: 0.12,
        errorCount: 0,
        newSignups: 1,
        updatedAt: 123,
      }))

      expect(await getDailyStats(kv, '2025-01-15')).toEqual(expect.objectContaining({
        date: '2025-01-15',
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
      }))
    })
  })

  describe('recordUserSeen', () => {
    it('increments uniqueUsers count for new user', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)

      const count = await getUniqueUserCount(kv, today)
      expect(count).toBe(1)

      const stats = await getDailyStats(kv, today)
      expect(stats.uniqueUsers).toBe(1)
    })

    it('writes seen users into v2 records idempotently without legacy arrays', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordUserSeen(kv, 'user1', today)

      expect(await getAnalyticsUserDayRecord(kv, 'user1', today)).toEqual(expect.objectContaining({
        userId: 'user1',
        date: today,
        totalRequests: 0,
        uniqueUsers: 1,
        seenToday: true,
      }))
      expect(await getAnalyticsUserLifetimeRecord(kv, 'user1')).toEqual(expect.objectContaining({
        userId: 'user1',
        countsTowardTotalUsers: true,
      }))
      expect(await listAnalyticsDayUserIds(kv, today)).toEqual(['user1'])
      expect(await listAnalyticsUserIds(kv)).toEqual(['user1'])
      expect(kv._store.has(`analytics:users:${today}`)).toBe(false)
      expect(kv._store.has(`analytics:daily:${today}`)).toBe(false)
      expect(kv._store.has('analytics:totals')).toBe(false)
    })

    it('does not double-count same userId on same day', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordUserSeen(kv, 'user1', today)

      const count = await getUniqueUserCount(kv, today)
      expect(count).toBe(1)
    })

    it('counts different users separately', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordUserSeen(kv, 'user2', today)
      await recordUserSeen(kv, 'user3', today)

      const count = await getUniqueUserCount(kv, today)
      expect(count).toBe(3)
    })
  })

  describe('getUniqueUserCount', () => {
    it('returns 0 for empty KV', async () => {
      const count = await getUniqueUserCount(kv, '2025-01-15')
      expect(count).toBe(0)
    })

    it('prefers v2 seen-user state over a stale legacy user array', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await kv.put(`analytics:users:${today}`, JSON.stringify(['user1', 'user2', 'user3']))

      expect(await getUniqueUserCount(kv, today)).toBe(1)
    })

    it('returns 0 when only retired legacy unique-user arrays exist for the date', async () => {
      await kv.put('analytics:users:2025-01-15', JSON.stringify(['user1', 'user2', 'user3', 'user4']))

      expect(await getUniqueUserCount(kv, '2025-01-15')).toBe(0)
    })
  })

  describe('getAnalyticsAggregationStatus', () => {
    it('reports backlog while raw events are appended but not yet processed', async () => {
      const today = new Date().toISOString().split('T')[0]
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

      expect(await getAnalyticsAggregationStatus(kv)).toEqual(expect.objectContaining({
        pendingEventCount: 1,
        pendingDates: [today],
        isCaughtUp: false,
      }))
    })
  })

  describe('getLifetimeTotals', () => {
    it('returns zeroed totals for empty KV', async () => {
      const totals = await getLifetimeTotals(kv)
      expect(totals.totalUsers).toBe(0)
      expect(totals.totalInteractions).toBe(0)
      expect(totals.totalCostUsd).toBe(0)
      expect(totals.totalRevenue).toBe(0)
      expect(totals.planBreakdown).toEqual({ free: 0, plus: 0, pro: 0 })
    })

    it('uses v2 lifetime totals directly once live legacy totals writes are retired', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordAnalyticsUsage(kv, { type: 'chat', userId: 'user1', costUsd: 0.01, date: today })
      await kv.put('analytics:totals', JSON.stringify({
        totalUsers: 40,
        totalInteractions: 400,
        totalCostUsd: 4,
        totalRevenue: 8,
        planBreakdown: { free: 20, plus: 15, pro: 5 },
        lastUpdatedAt: 999,
      }))

      expect(await getLifetimeTotals(kv)).toEqual(expect.objectContaining({
        totalUsers: 1,
        totalInteractions: 1,
        totalCostUsd: 0.01,
        totalRevenue: 0,
        planBreakdown: { free: 0, plus: 0, pro: 0 },
      }))
    })

    it('prefers v2 lifetime totals plus meta baseline once migration baseline exists', async () => {
      const today = new Date().toISOString().split('T')[0]
      await recordUserSeen(kv, 'user1', today)
      await recordEvent(kv, { type: 'chat', userId: 'user1', costUsd: 0.01 })
      await kv.put('analytics:totals', JSON.stringify({
        totalUsers: 999,
        totalInteractions: 999,
        totalCostUsd: 999,
        totalRevenue: 999,
        planBreakdown: { free: 999, plus: 0, pro: 0 },
        lastUpdatedAt: 999,
      }))
      await putAnalyticsMeta(kv, {
        ...emptyAnalyticsMeta(),
        legacyLifetimeBaseline: {
          totalUsers: 5,
          totalInteractions: 10,
          totalCostUsd: 1,
          totalRevenue: 2,
          planBreakdown: { free: 3, plus: 1, pro: 1 },
          lastUpdatedAt: 200,
        },
        updatedAt: 300,
      })

      expect(await getLifetimeTotals(kv)).toEqual({
        totalUsers: 6,
        totalInteractions: 11,
        totalCostUsd: 1.01,
        totalRevenue: 2,
        planBreakdown: { free: 3, plus: 1, pro: 1 },
        lastUpdatedAt: expect.any(Number),
      })
    })
  })
})
