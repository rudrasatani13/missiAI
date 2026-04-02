import { describe, it, expect, beforeEach } from 'vitest'
import { getDailyUsage, incrementVoiceUsage, checkVoiceLimit, getTodayDate } from '@/lib/billing/usage-tracker'
import type { KVStore } from '@/types'

// In-memory KV mock
function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
  }
}

describe('usage-tracker', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('getTodayDate', () => {
    it('returns YYYY-MM-DD format', () => {
      const date = getTodayDate()
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getDailyUsage', () => {
    it('returns 0 interactions when KV is empty', async () => {
      const usage = await getDailyUsage(kv, 'user_123')
      expect(usage.voiceInteractions).toBe(0)
      expect(usage.userId).toBe('user_123')
      expect(usage.date).toBe(getTodayDate())
    })
  })

  describe('incrementVoiceUsage', () => {
    it('returns count + 1 after increment', async () => {
      const usage = await incrementVoiceUsage(kv, 'user_123')
      expect(usage.voiceInteractions).toBe(1)
    })

    it('returns count + 2 after two increments', async () => {
      await incrementVoiceUsage(kv, 'user_123')
      const usage = await incrementVoiceUsage(kv, 'user_123')
      expect(usage.voiceInteractions).toBe(2)
    })
  })

  describe('checkVoiceLimit', () => {
    it('free user at 9/10 → allowed: true, remaining: 1', async () => {
      // Seed 9 interactions
      for (let i = 0; i < 9; i++) {
        await incrementVoiceUsage(kv, 'user_free')
      }
      const result = await checkVoiceLimit(kv, 'user_free', 'free')
      expect(result.allowed).toBe(true)
      expect(result.used).toBe(9)
      expect(result.limit).toBe(10)
      expect(result.remaining).toBe(1)
    })

    it('free user at 10/10 → allowed: false, remaining: 0', async () => {
      for (let i = 0; i < 10; i++) {
        await incrementVoiceUsage(kv, 'user_free2')
      }
      const result = await checkVoiceLimit(kv, 'user_free2', 'free')
      expect(result.allowed).toBe(false)
      expect(result.used).toBe(10)
      expect(result.limit).toBe(10)
      expect(result.remaining).toBe(0)
    })

    it('pro user at 1000 → allowed: true, remaining: 999999', async () => {
      // Seed 1000 interactions
      for (let i = 0; i < 1000; i++) {
        await incrementVoiceUsage(kv, 'user_pro')
      }
      const result = await checkVoiceLimit(kv, 'user_pro', 'pro')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(999999)
    })
  })
})
