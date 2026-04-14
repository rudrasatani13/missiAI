// ─── Daily Brief API — GET & POST ─────────────────────────────────────────────
//
// GET  — Fetch today's brief (returns null if not generated yet)
// POST — Generate today's brief (calls Gemini, enforces rate limit)
//
// SECURITY:
// - userId is ALWAYS extracted from Clerk session (Rule 1)
// - Rate limit: tier-based generation cap per day (Rule 4)
//   Free: 1/day, Plus: 3/day, Pro: 10/day
// - No request body parsed on POST — Gemini context is built server-side (Rule 2)
// - All Gemini output is sanitized before storage (Rule 3)

import { type NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logRequest, logError } from '@/lib/server/logger'
import {
  getTodaysBrief,
  saveBrief,
  markBriefViewed,
  getRateLimit,
  incrementRateLimit,
} from '@/lib/daily-brief/brief-store'
import {
  buildGenerationContext,
  generateBriefWithGemini,
} from '@/lib/daily-brief/generator'
import { getGoogleTokens } from '@/lib/plugins/data-fetcher'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { PLANS } from '@/types/billing'
import type { KVStore } from '@/types'
import type { DailyBrief } from '@/types/daily-brief'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// ─── KV Helper ────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── GET — Fetch today's brief ────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const startTime = Date.now()

  // SECURITY (Rule 1): Extract userId exclusively from Clerk's server-side auth.
  // Never read userId from request body, query params, or headers.
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.auth_error', e)
    throw e
  }

  // SECURITY (Rule 6): KV must be available for all operations
  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  try {
    const brief = await getTodaysBrief(kv, userId)

    if (brief) {
      // Fire-and-forget: mark as viewed without blocking the response
      markBriefViewed(kv, userId).catch(() => {})

      logRequest('daily-brief.get', userId, startTime)
      const planId = await getUserPlan(userId)
      const maxGenerations = PLANS[planId].briefGenerationsPerDay
      const usedCount = await getRateLimit(kv, userId)
      const remaining = Math.max(0, maxGenerations - usedCount)
      return jsonResponse({ success: true, data: { brief, generated: true, regenerationsRemaining: remaining, maxGenerations } })
    }

    // No brief for today — tell client to trigger POST
    logRequest('daily-brief.get.no_brief', userId, startTime)
    return jsonResponse({ success: true, data: { brief: null, generated: false } })
  } catch (err) {
    logError('daily-brief.get.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}

// ─── POST — Generate today's brief ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // SECURITY (Rule 1): Extract userId exclusively from Clerk's server-side auth.
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.auth_error', e)
    throw e
  }

  // SECURITY (Rule 6): KV must be available
  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  try {
    // SECURITY (Rule 4): Per-user rate limit — tier-based daily cap.
    // Free: 1/day (no regen), Plus: 3/day (1+2 regens), Pro: 10/day.
    // Enforced via KV counter, NOT middleware. Key: ratelimit:daily-brief:{userId}:{today}
    const planId = await getUserPlan(userId)
    const maxGenerations = PLANS[planId].briefGenerationsPerDay
    const currentCount = await getRateLimit(kv, userId)
    if (currentCount >= maxGenerations) {
      logRequest('daily-brief.post.rate_limited', userId, startTime)
      return jsonResponse(
        {
          error: planId === 'free'
            ? 'Free plan allows 1 daily brief per day. Upgrade to Plus for more.'
            : 'You\'ve used all your daily regenerations. Come back tomorrow.',
          code: 'RATE_LIMITED',
          regenerationsRemaining: 0,
          maxGenerations,
        },
        429,
      )
    }

    // Check for ?refresh=true query param — forces regeneration
    const url = new URL(req.url)
    const forceRefresh = url.searchParams.get('refresh') === 'true'

    // Idempotent: if brief already exists and no refresh requested, return it
    if (!forceRefresh) {
      const existingBrief = await getTodaysBrief(kv, userId)
      if (existingBrief) {
        const remaining = Math.max(0, maxGenerations - currentCount)
        logRequest('daily-brief.post.existing', userId, startTime)
        return jsonResponse({ success: true, data: { brief: existingBrief, regenerationsRemaining: remaining, maxGenerations } })
      }
    }

    // Read client's timezone and local hour from query params.
    // These are display-only hints — never used for auth or security decisions.
    const clientTimezone = url.searchParams.get('tz') || undefined
    const clientHour = parseInt(url.searchParams.get('hour') ?? '', 10)
    const localHour = isNaN(clientHour) ? undefined : Math.max(0, Math.min(23, clientHour))

    // NOTE: This route accepts no request body (Rule 2 — body is ignored).
    // All context is assembled server-side from KV data.

    // Load Google Calendar tokens if available (follows data-fetcher.ts pattern)
    const googleTokens = await getGoogleTokens(kv, userId)
    const googleClientId = process.env.GOOGLE_CLIENT_ID
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
    const calendarTokens = googleTokens && googleClientId && googleClientSecret
      ? {
          accessToken: googleTokens.accessToken,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }
      : undefined

    // Build generation context from all data sources
    const context = await buildGenerationContext(kv, userId, calendarTokens)

    // Inject client-side timezone info into context
    if (localHour !== undefined) context.localHour = localHour
    if (clientTimezone) context.timezone = clientTimezone

    // Call Gemini to generate the brief
    const briefContent = await generateBriefWithGemini(context)

    // Assemble the full DailyBrief object
    const today = new Date().toISOString().slice(0, 10)
    const brief: DailyBrief = {
      ...briefContent,
      date: today,
      // SECURITY (Rule 1): userId is ALWAYS set from Clerk session, never from request data
      userId,
      viewed: false,
      viewedAt: null,
      generatedAt: Date.now(),
    }

    // Save to KV then increment rate limit (awaited so count is always accurate)
    await saveBrief(kv, userId, brief)
    await incrementRateLimit(kv, userId)
    const remaining = Math.max(0, maxGenerations - (currentCount + 1))

    logRequest('daily-brief.post.generated', userId, startTime)
    return jsonResponse({ success: true, data: { brief, regenerationsRemaining: remaining, maxGenerations } }, 201)
  } catch (err) {
    logError('daily-brief.post.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
