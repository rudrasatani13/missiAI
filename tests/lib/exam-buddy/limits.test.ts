import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getExamBuddyPlanLimits, checkAndIncrementQuizGenerationLimit } from '@/lib/exam-buddy/limits'
import { PLANS } from '@/types/billing'
import type { KVStore } from '@/types'

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
  } as KVStore
}

describe('exam-buddy limits', () => {
  describe('getExamBuddyPlanLimits', () => {
    it('returns expected limits for free plan', () => {
      const limits = getExamBuddyPlanLimits('free')
      expect(limits).toEqual({
        quizGenerationsPerHour: PLANS.free.examBuddyQuizGenerationsPerHour,
        quizGenerationsPerDay: PLANS.free.examBuddyQuizGenerationsPerDay,
        quizGenerationsPerMonth: PLANS.free.examBuddyQuizGenerationsPerMonth,
        maxQuestionsPerQuiz: PLANS.free.examBuddyMaxQuestionsPerQuiz,
      })
    })

    it('returns expected limits for plus plan', () => {
      const limits = getExamBuddyPlanLimits('plus')
      expect(limits).toEqual({
        quizGenerationsPerHour: PLANS.plus.examBuddyQuizGenerationsPerHour,
        quizGenerationsPerDay: PLANS.plus.examBuddyQuizGenerationsPerDay,
        quizGenerationsPerMonth: PLANS.plus.examBuddyQuizGenerationsPerMonth,
        maxQuestionsPerQuiz: PLANS.plus.examBuddyMaxQuestionsPerQuiz,
      })
    })

    it('returns expected limits for pro plan', () => {
      const limits = getExamBuddyPlanLimits('pro')
      expect(limits).toEqual({
        quizGenerationsPerHour: PLANS.pro.examBuddyQuizGenerationsPerHour,
        quizGenerationsPerDay: PLANS.pro.examBuddyQuizGenerationsPerDay,
        quizGenerationsPerMonth: PLANS.pro.examBuddyQuizGenerationsPerMonth,
        maxQuestionsPerQuiz: PLANS.pro.examBuddyMaxQuestionsPerQuiz,
      })
    })
  })

  describe('checkAndIncrementQuizGenerationLimit', () => {
    let kv: KVStore
    beforeEach(() => {
      kv = makeKV()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-05-01T12:00:00Z'))
    })

    it('allows when under limits', async () => {
      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-1', 'free')
      expect(result.allowed).toBe(true)
      expect(result.usage.hour).toBe(1)
      expect(result.usage.day).toBe(1)
      expect(result.usage.month).toBe(1)
    })

    it('blocks when hour limit exceeded', async () => {
      const limits = getExamBuddyPlanLimits('free')
      for (let i = 0; i < limits.quizGenerationsPerHour; i++) {
        await checkAndIncrementQuizGenerationLimit(kv, 'user-2', 'free')
      }
      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-2', 'free')
      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('hour')
    })

    it('blocks when day limit exceeded', async () => {
      const limits = getExamBuddyPlanLimits('free')
      // Simulate exceeding day limit by fast-forwarding hours
      const baseTime = new Date('2024-05-01T12:00:00Z').getTime()
      for (let i = 0; i < limits.quizGenerationsPerDay; i++) {
        // Reset hour by moving forward one hour each time
        vi.setSystemTime(new Date(baseTime + i * 3600 * 1000))
        await checkAndIncrementQuizGenerationLimit(kv, 'user-3', 'free')
      }
      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-3', 'free')
      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('day')
    })

    it('blocks when month limit exceeded', async () => {
      const limits = getExamBuddyPlanLimits('free')

      // Simulate exceeding month limit by fast-forwarding days
      for (let i = 0; i < limits.quizGenerationsPerMonth; i++) {
        const day = String(1 + i % 28).padStart(2, '0') // stay within May
        const hour = String(i % 24).padStart(2, '0')
        vi.setSystemTime(new Date(`2024-05-${day}T${hour}:00:00Z`))
        const res = await checkAndIncrementQuizGenerationLimit(kv, 'user-4', 'free')
        // We shouldn't hit day/hour limits because we're distributing
      }

      const result = await checkAndIncrementQuizGenerationLimit(kv, 'user-4', 'free')
      expect(result.allowed).toBe(false)
      expect(result.exceededWindow).toBe('month')
    })
  })
})
