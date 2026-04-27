// Chat context cache — avoid re-computing memories + system prompt + declarations
// for rapid successive turns with the same user state.
//
// Cache key:  hash(userId + personality + lastUserMessage + incognito)
// TTL:       60 seconds
// Store:     KV under `chat:ctx:${hash}`

import type { KVStore, Message } from "@/types"

const CACHE_TTL_SECONDS = 60
const CACHE_KEY_PREFIX = "chat:ctx"

interface CachedContextData {
  memories: string
  systemPrompt: string
  availableDeclarations: unknown[]
  model: string
  maxOutputTokens: number
  /** Messages are NOT cached — client always sends fresh history */
  cachedAt: number
}

function djb2(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

function buildCacheKey(
  userId: string,
  personality: string,
  lastUserMessage: string,
  incognito: boolean | undefined,
): string {
  const normalized = lastUserMessage.toLowerCase().trim().replace(/\s+/g, " ")
  const hash = djb2(`${userId}:${personality}:${normalized}:${incognito ? "1" : "0"}`)
  return `${CACHE_KEY_PREFIX}:${hash}`
}

/**
 * Check if the context is cacheable for this request.
 * Voice mode and exam-buddy mode have dynamic modifiers that change
 * frequently, so skip caching to avoid stale prompts.
 */
export function isContextCacheable(
  voiceMode: boolean | undefined,
  examBuddy: boolean | undefined,
): boolean {
  if (voiceMode) return false
  if (examBuddy) return false
  return true
}

/**
 * Look up a cached context window from KV.
 * Returns null on miss, expired, or kv unavailable.
 */
export async function getCachedChatContext(
  kv: KVStore | null,
  userId: string,
  personality: string,
  messages: Message[],
  incognito: boolean | undefined,
): Promise<Omit<CachedContextData, "cachedAt"> | null> {
  if (!kv) return null

  const lastUserMessage = messages
    .filter((m) => m.role === "user")
    .pop()?.content

  if (!lastUserMessage || lastUserMessage.length > 120) return null

  const key = buildCacheKey(userId, personality, lastUserMessage, incognito)

  try {
    const raw = await kv.get(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedContextData
    const ageMs = Date.now() - (parsed.cachedAt ?? 0)
    if (ageMs > CACHE_TTL_SECONDS * 1000) return null

    const stillValid = await isChatContextValid(kv, userId, parsed.cachedAt)
    if (!stillValid) return null

    const { cachedAt, ...rest } = parsed
    void cachedAt
    return rest
  } catch {
    return null
  }
}

/**
 * Store a built context window in KV for reuse.
 * Silently swallows errors — cache write failure is non-fatal.
 */
export async function setCachedChatContext(
  kv: KVStore,
  userId: string,
  personality: string,
  messages: Message[],
  incognito: boolean | undefined,
  data: Omit<CachedContextData, "cachedAt" | "inputTokens">,
): Promise<void> {
  const lastUserMessage = messages
    .filter((m) => m.role === "user")
    .pop()?.content

  if (!lastUserMessage || lastUserMessage.length > 120) return

  const key = buildCacheKey(userId, personality, lastUserMessage, incognito)
  const payload: CachedContextData = {
    ...data,
    cachedAt: Date.now(),
  }

  try {
    await kv.put(key, JSON.stringify(payload), { expirationTtl: CACHE_TTL_SECONDS })
  } catch {
    // Non-fatal
  }
}

/**
 * Invalidate all context cache keys for a user.
 * Call after any write to life graph nodes, spaces, or plugin connections.
 */
export async function invalidateChatContext(
  kv: KVStore,
  userId: string,
): Promise<void> {
  try {
    // KV list by prefix to find all context keys for this user is not
    // supported cleanly in all environments. Instead we use a user-level
    // version/token key that getCachedChatContext checks.
    const tokenKey = `${CACHE_KEY_PREFIX}:v:${userId}`
    await kv.put(tokenKey, Date.now().toString(), { expirationTtl: 3600 })
  } catch {
    // Non-fatal
  }
}

/**
 * Check whether the cached context is still valid (user version token
 * has not been bumped since the cache entry was written).
 */
export async function isChatContextValid(
  kv: KVStore,
  userId: string,
  cachedAt: number,
): Promise<boolean> {
  try {
    const tokenRaw = await kv.get(`${CACHE_KEY_PREFIX}:v:${userId}`)
    if (!tokenRaw) return true
    const token = parseInt(tokenRaw, 10)
    return Number.isNaN(token) || token <= cachedAt
  } catch {
    return true
  }
}
