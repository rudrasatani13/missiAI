import { describe, it, expect, beforeEach } from 'vitest'
import type { KVStore } from '@/types'
import { recordEvent, getDailyStats, recordUserSeen, getUniqueUserCount, getLifetimeTotals } from '@/lib/analytics/event-store'

// ─── In-memory KV mock ────────────────────────────────────────────────────────

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
  }
}

describe('event-store', () => {
  let kv: KVStore

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

    it('never throws even with a broken KV', async () => {
      const brokenKV: KVStore = {
        get: async () => { throw new Error('KV down') },
        put: async () => { throw new Error('KV down') },
        delete: async () => { throw new Error('KV down') },
      }

      // Should not throw
      await expect(
        recordEvent(brokenKV, { type: 'chat', userId: 'user1' })
      ).resolves.toBeUndefined()
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
  })

  describe('getLifetimeTotals', () => {
    it('returns zeroed totals for empty KV', async () => {
      const totals = await getLifetimeTotals(kv)
      expect(totals.totalUsers).toBe(0)
      expect(totals.totalInteractions).toBe(0)
      expect(totals.totalCostUsd).toBe(0)
      expect(totals.totalRevenue).toBe(0)
      expect(totals.planBreakdown).toEqual({ free: 0, pro: 0, business: 0 })
    })
  })
})
