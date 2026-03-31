const CACHE_ORIGIN = "https://chat-cache.internal"

/**
 * djb2 hash — fast, simple, deterministic string hash.
 */
function djb2(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

/**
 * Build a short, deterministic cache key from message + personality.
 * Only returns a key if the message is short enough to be worth caching
 * (under 120 chars — short factual queries).
 */
export function buildCacheKey(
  message: string,
  personality: string
): string | null {
  const normalized = message.toLowerCase().trim().replace(/\s+/g, " ")
  if (normalized.length > 120) return null
  const hash = djb2(`${personality}:${normalized}`)
  return `chat-cache:${personality}:${hash}`
}

/**
 * Look up a cached response via the Cloudflare Cache API.
 * Returns null if not found, expired, or if Cache API is unavailable.
 */
export async function getCachedResponse(
  cacheKey: string
): Promise<string | null> {
  try {
    const cache = (caches as any).default
    if (!cache) return null
    const url = `${CACHE_ORIGIN}/${cacheKey}`
    const match = await cache.match(new Request(url))
    if (!match) return null
    return match.text()
  } catch {
    return null
  }
}

/**
 * Store a response in the Cloudflare Cache API.
 * Only caches short responses (under 500 chars) that don't contain
 * personal pronouns (those are personalized, non-reusable answers).
 * TTL: 1 hour.
 */
export async function setCachedResponse(
  cacheKey: string,
  response: string
): Promise<void> {
  try {
    if (!isCacheableResponse(response)) return
    const cache = (caches as any).default
    if (!cache) return
    const url = `${CACHE_ORIGIN}/${cacheKey}`
    const res = new Response(response, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=3600",
      },
    })
    await cache.put(new Request(url), res)
  } catch {
    // Cache write failure is non-fatal
  }
}

const PERSONAL_PRONOUNS = /\b(i|me|my|you|your)\b/i

/**
 * Check if a response is suitable for caching:
 * - Under 500 chars
 * - No personal pronouns (I, me, my, you, your)
 */
function isCacheableResponse(response: string): boolean {
  if (response.length > 500) return false
  if (PERSONAL_PRONOUNS.test(response)) return false
  return true
}

/**
 * Full cacheability check for a message+response pair.
 * Message must be under 120 chars AND response must pass isCacheableResponse.
 */
export function isCacheable(message: string, response: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/\s+/g, " ")
  if (normalized.length > 120) return false
  return isCacheableResponse(response)
}
