import { z } from 'zod'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/security/rate-limiter'
import { validationErrorResponse } from '@/lib/validation/schemas'
import type { KVStore } from '@/types'
import type { MoodLabel, MoodScore, MoodEntry, WeeklyMoodInsight } from '@/types/mood'
import type { RateLimitResult, UserTier } from '@/lib/server/security/rate-limiter'
import { getTodayInTimezone } from '@/lib/server/utils/date-utils'

const VALID_LABELS = [
  'joyful', 'excited', 'calm', 'content', 'neutral',
  'tired', 'anxious', 'stressed', 'sad', 'overwhelmed',
] as const

export const moodLogSchema = z.object({
  score: z.number().int().min(1).max(10) as z.ZodType<MoodScore>,
  label: z.enum(VALID_LABELS) as z.ZodType<MoodLabel>,
  note: z.string().max(60).optional(),
})

export function moodTimelineJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type MoodTimelineAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedMoodTimelineUserId(
  options: {
    onUnexpectedError?: (error: unknown) => void
  } = {},
): Promise<MoodTimelineAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }

    options.onUnexpectedError?.(error)
    throw error
  }
}

export function getMoodTimelineKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export type MoodTimelineKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireMoodTimelineKV(): MoodTimelineKvResult {
  const kv = getMoodTimelineKV()
  if (!kv) {
    return {
      ok: false,
      response: moodTimelineJsonResponse(
        { success: false, error: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' },
        503,
      ),
    }
  }

  return { ok: true, kv }
}

export type MoodTimelineRateLimitPreflightResult =
  | { ok: true; rateResult: RateLimitResult }
  | { ok: false; rateResult: RateLimitResult; response: Response }

export async function runMoodTimelineRateLimitPreflight(
  userId: string,
): Promise<MoodTimelineRateLimitPreflightResult> {
  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return {
      ok: false,
      rateResult,
      response: rateLimitExceededResponse(rateResult),
    }
  }

  return { ok: true, rateResult }
}

export type MoodTimelineRequestBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'invalid_json' | 'validation'; response: Response }

export async function parseMoodTimelineRequestBody<T>(
  req: Pick<Request, 'json'>,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<MoodTimelineRequestBodyResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: 'invalid_json',
      response: moodTimelineJsonResponse(
        { success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      response: validationErrorResponse(parsed.error),
    }
  }

  return { ok: true, data: parsed.data }
}

export function parseMoodTimelineReadQuery(req: Pick<Request, 'url'>): { days: number; clientTz?: string } {
  const url = new URL(req.url)
  const daysParam = url.searchParams.get('days')
  const days = Math.min(Math.max(parseInt(daysParam ?? '30', 10) || 30, 1), 365)
  const clientTz = url.searchParams.get('tz') || undefined
  return { days, clientTz }
}

export function buildMoodTimelineEntry(
  input: { score: MoodScore; label: MoodLabel; note?: string },
  timezone?: string,
): MoodEntry {
  const today = getTodayInTimezone(timezone)
  return {
    date: today,
    score: input.score,
    label: input.label,
    trigger: (input.note?.trim() ?? 'manual entry').slice(0, 60),
    recordedAt: Date.now(),
  }
}

export function computeCurrentMoodStreak(entries: MoodEntry[], timezone?: string): number {
  if (entries.length === 0) return 0

  const todayStr = getTodayInTimezone(timezone)
  const today = new Date(todayStr + 'T12:00:00Z')
  let streak = 0
  const checked = new Date(today)

  for (let i = 0; i < 365; i++) {
    const dateStr = checked.toISOString().slice(0, 10)
    const hasEntry = entries.some((entry) => entry.date === dateStr)
    if (!hasEntry) break
    streak++
    checked.setDate(checked.getDate() - 1)
  }

  return streak
}

export function buildWeeklyInsightObject(
  entries: MoodEntry[],
  insightText: string,
): WeeklyMoodInsight {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 6)

  const fmt = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const weekLabel = `${fmt(weekStart)}–${fmt(now)}, ${now.getFullYear()}`

  const avgScore = entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length

  const labelCounts: Partial<Record<MoodLabel, number>> = {}
  for (const entry of entries) {
    labelCounts[entry.label] = (labelCounts[entry.label] ?? 0) + 1
  }

  const sortedLabels = Object.entries(labelCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  const dominantLabel = (sortedLabels.length > 0 ? sortedLabels[0][0] : 'neutral') as MoodLabel

  const bestEntry = entries.reduce((best, entry) => (entry.score > best.score ? entry : best), entries[0])

  return {
    weekLabel,
    averageScore: Math.round(avgScore * 10) / 10,
    dominantLabel,
    bestDay: bestEntry.date,
    bestDayLabel: bestEntry.label,
    insight: insightText,
    generatedAt: Date.now(),
  }
}
