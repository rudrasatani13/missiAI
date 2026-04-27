import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const {
  checkVoiceUsageAtomicMock,
  checkAndIncrementVoiceUsageAtomicMock,
} = vi.hoisted(() => ({
  checkVoiceUsageAtomicMock: vi.fn(),
  checkAndIncrementVoiceUsageAtomicMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkVoiceUsageAtomic: checkVoiceUsageAtomicMock,
  checkAndIncrementVoiceUsageAtomic: checkAndIncrementVoiceUsageAtomicMock,
}))

import { getDailyUsage, checkVoiceLimit, checkAndIncrementVoiceTime, sanitizeDuration, getTodayDate } from '@/lib/billing/usage-tracker'
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

describe('usage-tracker (time-based)', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = createMockKV()
    vi.unstubAllEnvs()
    checkVoiceUsageAtomicMock.mockReset()
    checkAndIncrementVoiceUsageAtomicMock.mockReset()
    checkVoiceUsageAtomicMock.mockResolvedValue(null)
    checkAndIncrementVoiceUsageAtomicMock.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getTodayDate', () => {
    it('returns YYYY-MM-DD format', () => {
      const date = getTodayDate()
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('sanitizeDuration', () => {
    it('returns min 3s for undefined/zero', () => {
      expect(sanitizeDuration(undefined)).toBe(3)
      expect(sanitizeDuration(0)).toBe(3)
      expect(sanitizeDuration(-100)).toBe(3)
    })

    it('clamps to 3s minimum', () => {
      expect(sanitizeDuration(1000)).toBe(3) // 1s → clamped to 3
      expect(sanitizeDuration(2000)).toBe(3) // 2s → clamped to 3
    })

    it('passes through valid durations', () => {
      expect(sanitizeDuration(5000)).toBe(5)
      expect(sanitizeDuration(30000)).toBe(30)
      expect(sanitizeDuration(60000)).toBe(60)
    })

    it('caps at 120s max', () => {
      expect(sanitizeDuration(200000)).toBe(120)
      expect(sanitizeDuration(300000)).toBe(120)
    })

    it('rounds up partial seconds', () => {
      expect(sanitizeDuration(5500)).toBe(6) // 5.5s → 6
      expect(sanitizeDuration(10100)).toBe(11) // 10.1s → 11
    })
  })

  describe('getDailyUsage', () => {
    it('returns 0 seconds when KV is empty', async () => {
      const usage = await getDailyUsage(kv, 'user_123')
      expect(usage.voiceSecondsUsed).toBe(0)
      expect(usage.voiceInteractions).toBe(0)
      expect(usage.userId).toBe('user_123')
      expect(usage.date).toBe(getTodayDate())
    })
  })

  describe('checkVoiceLimit', () => {
    it('free user with 500s used (< 600s limit) → allowed', async () => {
      // Seed 500 seconds of usage
      const key = `usage:user_free:${getTodayDate()}`
      await kv.put(key, JSON.stringify({
        userId: 'user_free', date: getTodayDate(),
        voiceInteractions: 10, voiceSecondsUsed: 500, lastUpdatedAt: Date.now(),
      }))

      const result = await checkVoiceLimit(kv, 'user_free', 'free')
      expect(result.allowed).toBe(true)
      expect(result.usedSeconds).toBe(500)
      expect(result.limitSeconds).toBe(600) // 10 min = 600s
      expect(result.remainingSeconds).toBe(100)
    })

    it('free user with 600s used (= 600s limit) → blocked', async () => {
      const key = `usage:user_free2:${getTodayDate()}`
      await kv.put(key, JSON.stringify({
        userId: 'user_free2', date: getTodayDate(),
        voiceInteractions: 20, voiceSecondsUsed: 600, lastUpdatedAt: Date.now(),
      }))

      const result = await checkVoiceLimit(kv, 'user_free2', 'free')
      expect(result.allowed).toBe(false)
      expect(result.usedSeconds).toBe(600)
      expect(result.remainingSeconds).toBe(0)
    })

    it('pro user always allowed', async () => {
      const key = `usage:user_pro:${getTodayDate()}`
      await kv.put(key, JSON.stringify({
        userId: 'user_pro', date: getTodayDate(),
        voiceInteractions: 9999, voiceSecondsUsed: 99999, lastUpdatedAt: Date.now(),
      }))

      const result = await checkVoiceLimit(kv, 'user_pro', 'pro')
      expect(result.allowed).toBe(true)
      expect(result.remainingSeconds).toBe(999999)
    })

    it('free user fails closed in production when the atomic voice quota service is unavailable', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const result = await checkVoiceLimit(kv, 'user_voice_unavailable', 'free')

      expect(result).toMatchObject({
        allowed: false,
        usedSeconds: 0,
        limitSeconds: 600,
        remainingSeconds: 0,
        unavailable: true,
      })
    })
  })

  describe('checkAndIncrementVoiceTime', () => {
    it('increments seconds for a 10s recording', async () => {
      const result = await checkAndIncrementVoiceTime(kv, 'user_new', 'free', 10000) // 10s
      expect(result.allowed).toBe(true)
      expect(result.usedSeconds).toBe(10)
      expect(result.limitSeconds).toBe(600)
      expect(result.remainingSeconds).toBe(590)
    })

    it('blocks when cumulative seconds exceed limit', async () => {
      // Seed 598 seconds
      const key = `usage:user_limit:${getTodayDate()}`
      await kv.put(key, JSON.stringify({
        userId: 'user_limit', date: getTodayDate(),
        voiceInteractions: 50, voiceSecondsUsed: 598, lastUpdatedAt: Date.now(),
      }))

      // Under increment-first, adding 5s brings us to 603.
      // Since 603 > 600 limit, the call is blocked immediately, bounding the overshoot.
      const r1 = await checkAndIncrementVoiceTime(kv, 'user_limit', 'free', 5000)
      expect(r1.allowed).toBe(false)
      expect(r1.usedSeconds).toBe(603) // 598 + 5

      // Next call should also be blocked (603 + 5 = 608)
      const r2 = await checkAndIncrementVoiceTime(kv, 'user_limit', 'free', 5000)
      expect(r2.allowed).toBe(false)
      expect(r2.usedSeconds).toBe(608)
    })

    it('enforces minimum 3s even if client sends 0', async () => {
      const result = await checkAndIncrementVoiceTime(kv, 'user_cheat', 'free', 0)
      expect(result.allowed).toBe(true)
      expect(result.usedSeconds).toBe(3) // min 3s enforced
    })

    it('caps at 120s even if client sends 300s', async () => {
      const result = await checkAndIncrementVoiceTime(kv, 'user_long', 'free', 300000)
      expect(result.allowed).toBe(true)
      expect(result.usedSeconds).toBe(120) // max 120s enforced
    })

    it('pro user always allowed and still tracks', async () => {
      const result = await checkAndIncrementVoiceTime(kv, 'user_pro', 'pro', 60000)
      expect(result.allowed).toBe(true)
      expect(result.usedSeconds).toBe(60)
      expect(result.remainingSeconds).toBe(999999)
    })

    it('free user fails closed in production when the atomic voice quota service is unavailable', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const result = await checkAndIncrementVoiceTime(kv, 'user_voice_unavailable', 'free', 10000)

      expect(result).toMatchObject({
        allowed: false,
        usedSeconds: 0,
        limitSeconds: 600,
        remainingSeconds: 0,
        unavailable: true,
      })

      const usage = await getDailyUsage(kv, 'user_voice_unavailable')
      expect(usage.voiceSecondsUsed).toBe(0)
      expect(usage.voiceInteractions).toBe(0)
    })
  })
})
