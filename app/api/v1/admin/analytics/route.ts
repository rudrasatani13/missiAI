import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId, AuthenticationError } from '@/lib/server/auth'
import { buildAnalyticsSnapshot } from '@/lib/analytics/aggregator'
import { getDailyStats } from '@/lib/analytics/event-store'
import { log } from '@/lib/server/logger'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'

// OWASP A03: strict allowlist for the date query param — prevents arbitrary
// KV key injection via the `analytics:daily:{date}` key pattern.
const DATE_PARAM_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
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
  const clerkAuth = await import('@clerk/nextjs/server').then(m => m.auth())
  const role = (clerkAuth.sessionClaims?.metadata as any)?.role
  const isRoleAdmin = role === 'admin'
  const isSuperAdminEnv = process.env.ADMIN_USER_ID ? userId === process.env.ADMIN_USER_ID : false

  if (!isRoleAdmin && !isSuperAdminEnv) {
    return forbiddenResponse()
  }

  // ── 3. Rate limit ───────────────────────────────────────────────────────
  // Even admin endpoints need rate limiting — protects downstream KV + Clerk calls
  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    log({ level: 'warn', event: 'admin.analytics.rate_limited', userId, timestamp: Date.now() })
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. KV ───────────────────────────────────────────────────────────────
  const kv = getKV()
  if (!kv) {
    // Local dev fallback when Cloudflare bindings are missing
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          today: { uniqueUsers: 0, voiceInteractions: 0, newSignups: 0, totalRequests: 0, actionsExecuted: 0, totalCostUsd: 0, errorCount: 0 },
          yesterday: { uniqueUsers: 0, voiceInteractions: 0, newSignups: 0, totalRequests: 0, actionsExecuted: 0, totalCostUsd: 0, errorCount: 0 },
          last7Days: [],
          lifetime: { totalUsers: 0, totalInteractions: 0, planBreakdown: { free: 0, plus: 0, pro: 0 } },
          generatedAt: Date.now(),
          planBreakdown: { free: 0, plus: 0, pro: 0 }
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
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
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
    )
  }

  // ── 5. Full analytics snapshot ──────────────────────────────────────────
  try {
    const snapshot = await buildAnalyticsSnapshot(kv)

    // Fetch plan breakdown from Clerk
    let planBreakdown: Record<string, number> = { free: 0, plus: 0, pro: 0 }
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
      { status: 200, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateResult) } }
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
