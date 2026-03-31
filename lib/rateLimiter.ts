// ─── Tier limits (requests per minute) ───────────────────────────────────────

const RATE_LIMITS = {
  free: 25,
  paid: 60,
} as const

export type UserTier = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  remaining: number
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

/**
 * Fixed-window rate limiter backed by Cloudflare KV.
 *
 * Key: `ratelimit:{userId}:{windowMinute}`
 * TTL:  65 s — auto-expires one window after it closes.
 *
 * Fails open if KV is unavailable (logs a warning, never blocks legitimate traffic
 * due to infrastructure issues).
 */
export async function checkRateLimit(
  userId: string,
  tier: UserTier = "free"
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[tier]
  const nowSec = Math.floor(Date.now() / 1000)
  const windowMinute = Math.floor(nowSec / 60)
  const resetAt = (windowMinute + 1) * 60
  const retryAfter = resetAt - nowSec
  const key = `ratelimit:${userId}:${windowMinute}`

  const kv = await getKV()
  if (!kv) {
    console.warn("[RateLimit] KV unavailable — failing open")
    return { allowed: true, remaining: 1, resetAt, retryAfter: 0 }
  }

  const raw = await kv.get(key)
  const count = raw ? parseInt(raw, 10) : 0

  if (count >= limit) {
    return { allowed: false, remaining: 0, resetAt, retryAfter }
  }

  // Cloudflare KV supports { expirationTtl } — 65 s clears the key one window after it closed
  await kv.put(key, String(count + 1), { expirationTtl: 65 })

  return { allowed: true, remaining: limit - count - 1, resetAt, retryAfter: 0 }
}

// ─── Standard 429 response ────────────────────────────────────────────────────

export function rateLimitExceededResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ success: false, error: "Rate limit exceeded. Please slow down." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  )
}
