import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError } from '@/lib/server/logger'
import { getTodayInTimezone } from '@/lib/server/date-utils'
import {
  getRecentEntries,
  getCachedWeeklyInsight,
  saveWeeklyInsight,
  addMoodEntry,
  getMoodTimeline,
} from '@/lib/mood/mood-store'
import { generateWeeklyInsight } from '@/lib/mood/mood-analyzer'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { logRequest } from '@/lib/server/logger'
import type { KVStore } from '@/types'
import type { MoodEntry, MoodLabel, MoodScore, WeeklyMoodInsight } from '@/types/mood'

export const runtime = 'edge'

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_LABELS = [
  'joyful', 'excited', 'calm', 'content', 'neutral',
  'tired', 'anxious', 'stressed', 'sad', 'overwhelmed',
] as const

// TYPE SAFETY (D1): Score validated as integer 1-10, label from strict enum.
// The schema output types match MoodScore and MoodLabel exactly,
// eliminating the need for unsafe 'as' casts downstream.
const moodLogSchema = z.object({
  score: z.number().int().min(1).max(10) as z.ZodType<MoodScore>,
  label: z.enum(VALID_LABELS) as z.ZodType<MoodLabel>,
  note: z.string().max(60).optional(),
})

// ─── KV Helper ────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

// ─── Stat Helpers ─────────────────────────────────────────────────────────────

// BUGFIX (B6): Accept optional timezone so streak computation uses the same
// date logic as mood entry creation. Prevents streak breaks at UTC midnight.
function computeCurrentStreak(entries: MoodEntry[], timezone?: string): number {
  if (entries.length === 0) return 0

  // Use timezone-aware "today" to match the date used when entries were created
  const todayStr = getTodayInTimezone(timezone)
  const today = new Date(todayStr + 'T12:00:00Z') // noon UTC to avoid DST edge cases
  let streak = 0
  const checked = new Date(today)

  // Walk backwards day-by-day from today
  for (let i = 0; i < 365; i++) {
    const dateStr = checked.toISOString().slice(0, 10)
    const hasEntry = entries.some((e) => e.date === dateStr)
    if (!hasEntry) break
    streak++
    checked.setDate(checked.getDate() - 1)
  }

  return streak
}

function buildWeeklyInsightObject(
  entries: MoodEntry[],
  insightText: string,
): WeeklyMoodInsight {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 6)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const weekLabel = `${fmt(weekStart)}–${fmt(now)}, ${now.getFullYear()}`

  const avgScore =
    entries.reduce((s, e) => s + e.score, 0) / entries.length

  const labelCounts: Partial<Record<MoodLabel, number>> = {}
  for (const e of entries) {
    labelCounts[e.label] = (labelCounts[e.label] ?? 0) + 1
  }
  // BUGFIX (C3): Guard against empty labelCounts (defensive — caller checks
  // entries.length >= 3, but prevents crash if entries are somehow empty).
  const sortedLabels = Object.entries(labelCounts).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
  )
  const dominantLabel = (
    sortedLabels.length > 0 ? sortedLabels[0][0] : 'neutral'
  ) as MoodLabel

  const bestEntry = entries.reduce(
    (best, e) => (e.score > best.score ? e : best),
    entries[0],
  )

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

// ─── GET /api/v1/mood/timeline ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('mood.timeline.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // SECURITY (M1): Rate limit mood reads to prevent timeline scraping
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('mood.timeline.get.rate_limited', userId, Date.now())
    return rateLimitExceededResponse(rateResult)
  }

  const url = new URL(req.url)
  const daysParam = url.searchParams.get('days')
  const days = Math.min(Math.max(parseInt(daysParam ?? '30', 10) || 30, 1), 365)
  // BUGFIX (B6): Accept timezone from client for streak computation
  const clientTz = url.searchParams.get('tz') || undefined

  try {
    // Load requested window of entries
    const entries = await getRecentEntries(kv, userId, days)

    // Try to serve or generate a weekly insight
    let weeklyInsight = await getCachedWeeklyInsight(kv, userId)

    if (!weeklyInsight) {
      const last7 = await getRecentEntries(kv, userId, 7)
      if (last7.length >= 3) {
        try {
          const insightText = await generateWeeklyInsight(last7)
          weeklyInsight = buildWeeklyInsightObject(last7, insightText)
          await saveWeeklyInsight(kv, userId, weeklyInsight)
        } catch (e) {
          logError('mood.timeline.insight_error', e, userId)
          weeklyInsight = null
        }
      }
    }

    // Stats over the last year
    const allEntries = await getRecentEntries(kv, userId, 365)
    const totalDaysTracked = allEntries.length
    const averageScore =
      allEntries.length > 0
        ? Math.round(
            (allEntries.reduce((s, e) => s + e.score, 0) / allEntries.length) * 10,
          ) / 10
        : 0
    const currentStreak = computeCurrentStreak(allEntries, clientTz)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          entries,
          weeklyInsight,
          totalDaysTracked,
          averageScore,
          currentStreak,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    logError('mood.timeline.get_error', e, userId)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

// ─── POST /api/v1/mood/timeline — manual mood log ─────────────────────────────

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('mood.timeline.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // SECURITY (M1): Rate limit mood writes to prevent spam logging
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    logRequest('mood.timeline.post.rate_limited', userId, Date.now())
    return rateLimitExceededResponse(rateResult)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = moodLogSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  // BUGFIX (B2): Use timezone-aware date instead of UTC.
  // Accepts optional 'tz' query param from client (e.g. "Asia/Kolkata").
  const url = new URL(req.url)
  const clientTz = url.searchParams.get('tz') || undefined
  const today = getTodayInTimezone(clientTz)
  const entry: MoodEntry = {
    date: today,
    score: parsed.data.score,
    label: parsed.data.label,
    trigger: (parsed.data.note?.trim() ?? 'manual entry').slice(0, 60),
    recordedAt: Date.now(),
  }

  try {
    await addMoodEntry(kv, userId, entry)
    return new Response(
      JSON.stringify({ success: true, data: { entry } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    logError('mood.timeline.post_error', e, userId)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
