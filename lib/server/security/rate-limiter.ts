import { API_ERROR_CODES } from '@/types/api'
import { getCloudflareKVBindingAsync } from '@/lib/server/platform/bindings-async'
import { checkAndIncrementAtomicCounter, checkAtomicCounter } from '@/lib/server/platform/atomic-quota'

// ─── Tier limits (requests per minute, per route type) ────────────────────────
//
// 'api'          — standard data endpoints (billing, memory, plugins, etc.)
// 'ai'           — generative AI endpoints (chat, tts, stt, actions)
// 'oauth'        — OAuth connect initiation (creates KV state tokens; very tight)
// 'export'       — bulk data-export endpoints (CSV download, etc.)
// 'client_error' — client-side error telemetry (prevent log-flooding)
//
// AI limits are deliberately tighter because each call fans out to an expensive
// third-party model API; the lower cap prevents runaway costs from bots or
// misbehaving clients while still giving real users a smooth experience.
// The specialised route types are tighter still to protect sensitive or
// expensive-per-call endpoints even when the generic api budget has headroom.

const RATE_LIMITS = {
  free: { api: 60, ai: 60, oauth: 5, export: 5, client_error: 10 },
  paid: { api: 200, ai: 120, oauth: 10, export: 10, client_error: 20 },
} as const

export type UserTier  = keyof typeof RATE_LIMITS
export type RouteType = 'api' | 'ai' | 'oauth' | 'export' | 'client_error'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number      // the applicable cap for this window
  resetAt: number    // unix timestamp (seconds)
  retryAfter: number // seconds until window resets
  unavailable?: boolean
}

// ─── KV access ────────────────────────────────────────────────────────────────

async function getKV(): Promise<any | null> {
  return getCloudflareKVBindingAsync()
}

function buildRateLimitUnavailableResult(
  limit: number,
  resetAt: number,
): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    limit,
    resetAt,
    retryAfter: 0,
    unavailable: true,
  }
}

function shouldUseFallbackRateLimit(): boolean {
  return process.env.NODE_ENV !== 'production'
}

// ─── Isolate-local fallback counters (M4 fix) ────────────────────────────────
//
// If KV is unavailable we used to "fail open" — every request was allowed and
// only a warning was logged. That meant a KV outage silently removed all
// per-user rate limits, so a single Pro user could drain hundreds of $ of AI
// calls before anyone noticed. We now keep a bounded per-isolate counter map
// as a last-ditch bucket. It is NOT globally consistent (each Cloudflare
// isolate has its own copy) but it still caps a single-instance attacker
// to ~`limit` requests per window, which is enough to keep the blast radius
// small during an outage.

interface FallbackBucket {
  count: number
  windowMinute: number
}

const fallbackBuckets = new Map<string, FallbackBucket>()
const MAX_FALLBACK_ENTRIES = 10_000
const kvRateLimitLocks = new Map<string, Promise<void>>()

function sweepFallback(nowMinute: number) {
  if (fallbackBuckets.size <= MAX_FALLBACK_ENTRIES) {
    // Lazy sweep: only walk the map when we're over capacity
    return
  }
  const toDelete: string[] = []
  for (const [key, bucket] of fallbackBuckets.entries()) {
    if (bucket.windowMinute < nowMinute) {
      toDelete.push(key)
      if (toDelete.length >= 512) break
    }
  }
  for (const key of toDelete) fallbackBuckets.delete(key)
  // If still over, drop oldest (insertion order) to bring us back under the cap.
  while (fallbackBuckets.size > MAX_FALLBACK_ENTRIES) {
    const firstKey = fallbackBuckets.keys().next().value
    if (firstKey === undefined) break
    fallbackBuckets.delete(firstKey)
  }
}

function fallbackRateLimit(
  userId: string,
  route: RouteType,
  limit: number,
  windowMinute: number,
  resetAt: number,
  retryAfter: number,
): RateLimitResult {
  const key = `${userId}:${route}:${windowMinute}`
  sweepFallback(windowMinute)
  let bucket = fallbackBuckets.get(key)
  if (!bucket || bucket.windowMinute !== windowMinute) {
    bucket = { count: 0, windowMinute }
    fallbackBuckets.set(key, bucket)
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, limit, resetAt, retryAfter }
  }
  bucket.count++
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt,
    retryAfter: 0,
  }
}

async function withRateLimitLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = kvRateLimitLocks.get(key) ?? Promise.resolve()
  const ready = previous.catch(() => {})
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const next = ready.then(() => current)
  kvRateLimitLocks.set(key, next)

  await ready
  try {
    return await task()
  } finally {
    release()
    if (kvRateLimitLocks.get(key) === next) {
      kvRateLimitLocks.delete(key)
    }
  }
}

function buildRateLimitResultFromCount(
  currentCount: number,
  weightedPrevious: number,
  limit: number,
  resetAt: number,
): RateLimitResult {
  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(limit - weightedPrevious - currentCount)),
    limit,
    resetAt,
    retryAfter: 0,
  }
}

async function checkAtomicRateLimit(
  userId: string,
  route: RouteType,
  limit: number,
  windowMinute: number,
  prevWeight: number,
  resetAt: number,
  retryAfter: number,
): Promise<RateLimitResult | null> {
  const previous = await checkAtomicCounter(`ratelimit:${userId}:${route}:${windowMinute - 1}`, limit)
  if (!previous) return null

  const weightedPrevious = previous.count * prevWeight
  const currentWindowLimit = Math.max(0, Math.floor(limit - weightedPrevious))
  if (currentWindowLimit <= 0) {
    return { allowed: false, remaining: 0, limit, resetAt, retryAfter }
  }

  const current = await checkAndIncrementAtomicCounter(
    `ratelimit:${userId}:${route}:${windowMinute}`,
    currentWindowLimit,
    125,
  )
  if (!current) return null

  if (!current.allowed) {
    return { allowed: false, remaining: 0, limit, resetAt, retryAfter }
  }

  return buildRateLimitResultFromCount(current.count, weightedPrevious, limit, resetAt)
}

// ─── Core check ───────────────────────────────────────────────────────────────
//
// Sliding-window counter (two-bucket approximation).
//
// The classic fixed-window limiter has a burst vulnerability: a client can
// exhaust a full window's quota in the last second of window N, then exhaust
// the next quota in the first second of window N+1, sending 2× the intended
// limit within a two-second span.
//
// The two-bucket sliding window mitigates this by weighting the previous
// window's count by how much of it still overlaps with the current window:
//
//   effective_count = prev_count × (60 - elapsed_in_window) / 60
//                   + current_count
//
// Example: 50 s into the current minute, only 10/60 of the previous window
// still overlaps, so prev_count contributes just 16 % of its value.
//
// Key format: ratelimit:{userId}:{route}:{windowMinute}
// TTL:        125 s — keeps the key alive for one full extra window so the
//             "previous window" fetch in the next period can still read it.
//
// Fails open if KV is unavailable (never blocks legitimate traffic due to
// infrastructure issues; logs a warning instead).

export async function checkRateLimit(
  userId: string,
  tier: UserTier = "free",
  route: RouteType = "api",
): Promise<RateLimitResult> {
  const limit  = RATE_LIMITS[tier][route]
  const nowSec = Math.floor(Date.now() / 1000)

  const windowMinute    = Math.floor(nowSec / 60)
  const windowStart     = windowMinute * 60
  const elapsedInWindow = nowSec - windowStart
  const resetAt         = windowStart + 60
  const retryAfter      = resetAt - nowSec

  const currentKey = `ratelimit:${userId}:${route}:${windowMinute}`
  const prevKey    = `ratelimit:${userId}:${route}:${windowMinute - 1}`
  const prevWeight = (60 - elapsedInWindow) / 60
  const useFallbackRateLimit = shouldUseFallbackRateLimit()

  const atomicResult = await checkAtomicRateLimit(userId, route, limit, windowMinute, prevWeight, resetAt, retryAfter)
  if (atomicResult) return atomicResult

  const kv = await getKV()
  if (!kv) {
    console.warn(
      useFallbackRateLimit
        ? "[RateLimit] KV unavailable — falling back to isolate-local counter"
        : "[RateLimit] KV unavailable — failing closed",
    )
    return useFallbackRateLimit
      ? fallbackRateLimit(userId, route, limit, windowMinute, resetAt, retryAfter)
      : buildRateLimitUnavailableResult(limit, resetAt)
  }

  try {
    return await withRateLimitLock(`${userId}:${route}`, async () => {
      const [currentRaw, prevRaw] = await Promise.all([
        kv.get(currentKey),
        kv.get(prevKey),
      ])

      const currentCount = currentRaw ? parseInt(currentRaw, 10) : 0
      const prevCount    = prevRaw    ? parseInt(prevRaw,    10) : 0
      const weightedPrevious = prevCount * prevWeight
      const effectiveCount = weightedPrevious + currentCount

      if (effectiveCount >= limit) {
        return { allowed: false, remaining: 0, limit, resetAt, retryAfter }
      }

      await kv.put(currentKey, String(currentCount + 1), { expirationTtl: 125 })
      return buildRateLimitResultFromCount(currentCount + 1, weightedPrevious, limit, resetAt)
    })
  } catch (err) {
    console.warn(
      useFallbackRateLimit
        ? "[RateLimit] KV error — falling back to isolate-local counter"
        : "[RateLimit] KV error — failing closed",
      err,
    )
    return useFallbackRateLimit
      ? fallbackRateLimit(userId, route, limit, windowMinute, resetAt, retryAfter)
      : buildRateLimitUnavailableResult(limit, resetAt)
  }
}

// ─── Standard rate-limit response headers ─────────────────────────────────────
//
// Attach to *every* API response (success or 429) so well-behaved clients can
// self-throttle before they actually hit the wall.

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit":     String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset":     String(result.resetAt),
  }
}

// ─── Standard 429 response ────────────────────────────────────────────────────

export function rateLimitExceededResponse(result: RateLimitResult): Response {
  if (result.unavailable) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Rate limit service unavailable',
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.resetAt),
        },
      },
    )
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "Rate limit exceeded. Please slow down.",
      code: API_ERROR_CODES.RATE_LIMITED,
    }),
    {
      status: 429,
      headers: {
        "Content-Type":        "application/json",
        "Retry-After":         String(result.retryAfter),
        "X-RateLimit-Limit":     String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset":     String(result.resetAt),
      },
    }
  )
}
