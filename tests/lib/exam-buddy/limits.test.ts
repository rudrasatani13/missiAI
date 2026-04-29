import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkAndIncrementQuizGenerationLimit, getExamBuddyPlanLimits } from '@/lib/exam-buddy/limits'
import type { KVStore } from '@/types'
import type { PlanId } from '@/types/billing'

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  } as KVStore
}

describe('limits', () => {
  let kv: ReturnType<typeof createMockKV>

  beforeEach(() => {
    kv = createMockKV()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getExamBuddyPlanLimits', () => {
    it('returns correct limits for free plan', () => {
      const limits = getExamBuddyPlanLimits('free')
      expect(limits.quizGenerationsPerHour).toBe(3)
      expect(limits.quizGenerationsPerDay).toBe(8)
      expect(limits.quizGenerationsPerMonth).toBe(120)
      expect(limits.maxQuestionsPerQuiz).toBe(5)
    })

    it('returns correct limits for plus plan', () => {
      const limits = getExamBuddyPlanLimits('plus')
      expect(limits.quizGenerationsPerHour).toBe(10)
    })

    it('returns correct limits for pro plan', () => {
      const limits = getExamBuddyPlanLimits('pro')
      expect(limits.quizGenerationsPerHour).toBe(25)
    })
  })

  describe('checkAndIncrementQuizGenerationLimit', () => {
    it('allows generation when below limits and increments usage', async () => {
      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-1', 'free')

      expect(result.allowed).toBe(true)
      expect(result.exceededWindow).toBeUndefined()
      expect(result.usage).toEqual({ hour: 1, day: 1, month: 1 })
      expect(result.remaining).toEqual({
        hour: 2, // 3 - 1
        day: 7, // 8 - 1
        month: 119, // 120 - 1
      })

      // Check that KV was populated
      // Expected keys from getUtcHourBucket (timestamp / 3600000)
      // 2024-01-15T12:00:00Z is 1705320000000 ms -> 473700
      const hourBucket = '473700'
      const dayBucket = '2024-01-15'
      const monthBucket = '2024-01'

      expect(await kv.get(`ratelimit:exam-buddy-quiz:hour:user-1:${hourBucket}`)).toBe('1')
      expect(await kv.get(`ratelimit:exam-buddy-quiz:day:user-1:${dayBucket}`)).toBe('1')
      expect(await kv.get(`ratelimit:exam-buddy-quiz:month:user-1:${monthBucket}`)).toBe('1')
    })

    it('blocks generation when hour limit is reached', async () => {
      // Free plan hour limit is 3
      const hourBucket = '473700'
      await kv.put(`ratelimit:exam-buddy-quiz:hour:user-2:${hourBucket}`, '3')

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-2', 'free')

      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('hour')
      expect(result.usage.hour).toBe(3)
      expect(result.remaining.hour).toBe(0)
    })

    it('blocks generation when day limit is reached', async () => {
      // Free plan day limit is 8
      const dayBucket = '2024-01-15'
      await kv.put(`ratelimit:exam-buddy-quiz:day:user-3:${dayBucket}`, '8')

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-3', 'free')

      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('day')
      expect(result.usage.day).toBe(8)
      expect(result.remaining.day).toBe(0)
    })

    it('blocks generation when month limit is reached', async () => {
      // Free plan month limit is 120
      const monthBucket = '2024-01'
      await kv.put(`ratelimit:exam-buddy-quiz:month:user-4:${monthBucket}`, '120')

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-4', 'free')

      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('month')
      expect(result.usage.month).toBe(120)
      expect(result.remaining.month).toBe(0)
    })

    it('increments correctly from existing usage', async () => {
      const hourBucket = '473700'
      const dayBucket = '2024-01-15'
      const monthBucket = '2024-01'

      await kv.put(`ratelimit:exam-buddy-quiz:hour:user-5:${hourBucket}`, '1')
      await kv.put(`ratelimit:exam-buddy-quiz:day:user-5:${dayBucket}`, '2')
      await kv.put(`ratelimit:exam-buddy-quiz:month:user-5:${monthBucket}`, '5')

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-5', 'free')

      expect(result.allowed).toBe(true)
      expect(result.usage).toEqual({ hour: 2, day: 3, month: 6 })

      expect(await kv.get(`ratelimit:exam-buddy-quiz:hour:user-5:${hourBucket}`)).toBe('2')
      expect(await kv.get(`ratelimit:exam-buddy-quiz:day:user-5:${dayBucket}`)).toBe('3')
      expect(await kv.get(`ratelimit:exam-buddy-quiz:month:user-5:${monthBucket}`)).toBe('6')
    })

    it('handles garbage data in KV by treating it as 0', async () => {
      const hourBucket = '473700'
      await kv.put(`ratelimit:exam-buddy-quiz:hour:user-6:${hourBucket}`, 'invalid')

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-6', 'free')

      expect(result.allowed).toBe(true)
      expect(result.usage.hour).toBe(1)
      expect(await kv.get(`ratelimit:exam-buddy-quiz:hour:user-6:${hourBucket}`)).toBe('1')
    })
  })
})
