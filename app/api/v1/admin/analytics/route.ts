import { getRequestContext } from '@cloudflare/next-on-pages'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/auth'
import { buildAnalyticsSnapshot } from '@/lib/analytics/aggregator'
import { getDailyStats } from '@/lib/analytics/event-store'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimiter'
import type { KVStore } from '@/types'

// OWASP A03: strict allowlist for the date query param — prevents arbitrary
// KV key injection via the `analytics:daily:{date}` key pattern.
const DATE_PARAM_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function forbiddenResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  )
}

export async function GET(req: Request) {
  const startTime = Date.now()

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    throw e
  }

  // ── 2. Admin check ──────────────────────────────────────────────────────
  // Return same 403 for both: missing env var AND wrong userId
  const adminUserId = process.env.ADMIN_USER_ID
  if (!adminUserId || userId !== adminUserId) {
    return forbiddenResponse()
  }

  // ── 3. Rate limit ───────────────────────────────────────────────────────
  // Even admin endpoints need rate limiting — protects downstream KV + Clerk calls
  const rateResult = await checkRateLimit(userId, 'paid')
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'admin.analytics.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. KV ───────────────────────────────────────────────────────────────
  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ error: 'Storage unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 5. Check for specific date query ────────────────────────────────────
  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')

  if (dateParam) {
    // OWASP A03: validate date format before using it as part of a KV key
    if (!DATE_PARAM_RE.test(dateParam)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const stats = await getDailyStats(kv, dateParam)
    log({
      level: 'info',
      event: 'admin.analytics.viewed',
      userId,
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ success: true, data: stats }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 5. Full analytics snapshot ──────────────────────────────────────────
  try {
    const snapshot = await buildAnalyticsSnapshot(kv)

    // Fetch plan breakdown from Clerk
    let planBreakdown: Record<string, number> = { free: 0, pro: 0, business: 0 }
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      const userList = await client.users.getUserList({ limit: 100 })
      for (const user of userList.data) {
        const plan = ((user.publicMetadata as Record<string, unknown>)?.plan as string) ?? 'free'
        if (plan in planBreakdown) {
          planBreakdown[plan] += 1
        } else {
          planBreakdown['free'] += 1
        }
      }
    } catch {
      // Clerk unavailable — use stored breakdown
      planBreakdown = snapshot.lifetime.planBreakdown as Record<string, number>
    }

    log({
      level: 'info',
      event: 'admin.analytics.viewed',
      userId,
      timestamp: Date.now(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...snapshot,
          planBreakdown,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    log({
      level: 'error',
      event: 'admin.analytics.error',
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return new Response(
      JSON.stringify({ error: 'Failed to build analytics snapshot' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
