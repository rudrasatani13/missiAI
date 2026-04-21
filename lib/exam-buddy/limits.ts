import type { KVStore } from '@/types'
import { PLANS } from '@/types/billing'
import type { PlanId } from '@/types/billing'

export type ExamBuddyLimitWindow = 'hour' | 'day' | 'month'

export interface ExamBuddyPlanLimits {
  quizGenerationsPerHour: number
  quizGenerationsPerDay: number
  quizGenerationsPerMonth: number
  maxQuestionsPerQuiz: number
}

export interface ExamBuddyQuizGenerationLimitResult {
  allowed: boolean
  planId: PlanId
  limits: ExamBuddyPlanLimits
  usage: Record<ExamBuddyLimitWindow, number>
  remaining: Record<ExamBuddyLimitWindow, number>
  exceededWindow?: ExamBuddyLimitWindow
}

export function getExamBuddyPlanLimits(planId: PlanId): ExamBuddyPlanLimits {
  const plan = PLANS[planId]
  return {
    quizGenerationsPerHour: plan.examBuddyQuizGenerationsPerHour,
    quizGenerationsPerDay: plan.examBuddyQuizGenerationsPerDay,
    quizGenerationsPerMonth: plan.examBuddyQuizGenerationsPerMonth,
    maxQuestionsPerQuiz: plan.examBuddyMaxQuestionsPerQuiz,
  }
}

function parseCounter(raw: string | null): number {
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getUtcHourBucket() {
  return String(Math.floor(Date.now() / 3_600_000))
}

function getUtcDayBucket() {
  return new Date().toISOString().slice(0, 10)
}

function getUtcMonthBucket() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function getSecondsUntilNextUtcHour() {
  const now = new Date()
  const nextHour = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() + 1,
    0,
    0,
    0,
  )
  return Math.max(60, Math.ceil((nextHour - now.getTime()) / 1000))
}

function getSecondsUntilNextUtcDay() {
  const now = new Date()
  const nextDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )
  return Math.max(60, Math.ceil((nextDay - now.getTime()) / 1000))
}

function getSecondsUntilNextUtcMonth() {
  const now = new Date()
  const nextMonth = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  )
  return Math.max(60, Math.ceil((nextMonth - now.getTime()) / 1000))
}

export async function checkAndIncrementQuizGenerationLimit(
  kv: KVStore,
  userId: string,
  planId: PlanId,
): Promise<ExamBuddyQuizGenerationLimitResult> {
  const limits = getExamBuddyPlanLimits(planId)

  const hourKey = `ratelimit:exam-buddy-quiz:hour:${userId}:${getUtcHourBucket()}`
  const dayKey = `ratelimit:exam-buddy-quiz:day:${userId}:${getUtcDayBucket()}`
  const monthKey = `ratelimit:exam-buddy-quiz:month:${userId}:${getUtcMonthBucket()}`

  const [hourRaw, dayRaw, monthRaw] = await Promise.all([
    kv.get(hourKey),
    kv.get(dayKey),
    kv.get(monthKey),
  ])

  const usage = {
    hour: parseCounter(hourRaw),
    day: parseCounter(dayRaw),
    month: parseCounter(monthRaw),
  }

  const remaining = {
    hour: Math.max(0, limits.quizGenerationsPerHour - usage.hour),
    day: Math.max(0, limits.quizGenerationsPerDay - usage.day),
    month: Math.max(0, limits.quizGenerationsPerMonth - usage.month),
  }

  if (usage.hour >= limits.quizGenerationsPerHour) {
    return { allowed: false, planId, limits, usage, remaining, exceededWindow: 'hour' }
  }
  if (usage.day >= limits.quizGenerationsPerDay) {
    return { allowed: false, planId, limits, usage, remaining, exceededWindow: 'day' }
  }
  if (usage.month >= limits.quizGenerationsPerMonth) {
    return { allowed: false, planId, limits, usage, remaining, exceededWindow: 'month' }
  }

  const nextUsage = {
    hour: usage.hour + 1,
    day: usage.day + 1,
    month: usage.month + 1,
  }

  await Promise.all([
    kv.put(hourKey, String(nextUsage.hour), { expirationTtl: getSecondsUntilNextUtcHour() + 300 }),
    kv.put(dayKey, String(nextUsage.day), { expirationTtl: getSecondsUntilNextUtcDay() + 3600 }),
    kv.put(monthKey, String(nextUsage.month), { expirationTtl: getSecondsUntilNextUtcMonth() + 86400 }),
  ])

  return {
    allowed: true,
    planId,
    limits,
    usage: nextUsage,
    remaining: {
      hour: Math.max(0, limits.quizGenerationsPerHour - nextUsage.hour),
      day: Math.max(0, limits.quizGenerationsPerDay - nextUsage.day),
      month: Math.max(0, limits.quizGenerationsPerMonth - nextUsage.month),
    },
  }
}
