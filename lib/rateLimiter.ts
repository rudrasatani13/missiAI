// ─── Tier limits (requests per minute, per route type) ────────────────────────
//
// 'api'  — standard data endpoints (billing, memory, plugins, etc.)
// 'ai'   — generative AI endpoints that call Gemini or ElevenLabs (chat, tts, stt, actions)
//
// AI limits are deliberately tighter because each call fans out to an expensive
// third-party model API; the lower cap prevents runaway costs from bots or
// misbehaving clients while still giving real users a smooth experience.

const RATE_LIMITS = {
  free: { api: 60, ai: 60 },
  paid: { api: 200, ai: 120 },
} as const

export type UserTier  = keyof typeof RATE_LIMITS
export type RouteType = 'api' | 'ai'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number      // the applicable cap for this window
  resetAt: number    // unix timestamp (seconds)
  retryAfter: number // seconds until window resets
}

// ─── KV access ────────────────────────────────────────────────────────────────

async function getKV(): Promise<any | null> {
  try {
    // Dynamic import so the static module graph doesn't break in Node.js local dev
    const { getRequestContext } = await import("@cloudflare/next-on-pages")
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
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

  const kv = await getKV()
  if (!kv) {
    console.warn("[RateLimit] KV unavailable — failing open")
    return { allowed: true, remaining: 1, limit, resetAt, retryAfter: 0 }
  }

  // Fetch both windows in parallel to minimise KV round-trips
  const [currentRaw, prevRaw] = await Promise.all([
    kv.get(currentKey),
    kv.get(prevKey),
  ])

  const currentCount = currentRaw ? parseInt(currentRaw, 10) : 0
  const prevCount    = prevRaw    ? parseInt(prevRaw,    10) : 0

  // Weighted previous-window contribution (linear decay from 100 % → 0 %)
  const prevWeight     = (60 - elapsedInWindow) / 60
  const effectiveCount = prevCount * prevWeight + currentCount

  if (effectiveCount >= limit) {
    return { allowed: false, remaining: 0, limit, resetAt, retryAfter }
  }

  // 125 s TTL: current window (60 s) + 1 extra window so the next period's
  // "previous key" fetch can still read it.
  await kv.put(currentKey, String(currentCount + 1), { expirationTtl: 125 })

  return {
    allowed:    true,
    remaining:  Math.max(0, Math.floor(limit - effectiveCount - 1)),
    limit,
    resetAt,
    retryAfter: 0,
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
  return new Response(
    JSON.stringify({ success: false, error: "Rate limit exceeded. Please slow down." }),
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
