import type { KVStore } from "@/types"
import { sanitizeMemories } from "@/lib/memory-sanitizer"

// All KV keys are derived server-side from the verified userId — never from
// any client-supplied value.
const kvKey = (userId: string) => `memory:${userId}`

const MAX_SAVE_CHARS = 5000

/**
 * Read a user's memories from KV and sanitize before returning.
 * Always sanitizes on read so injection patterns stored in old entries are
 * stripped before they reach any AI system prompt.
 */
export async function getUserMemories(kv: KVStore, userId: string): Promise<string> {
  const raw = await kv.get(kvKey(userId))
  if (!raw) return ""
  return sanitizeMemories(raw)
}

/**
 * Sanitize and persist memories to KV.
 * Input is sanitized and capped at MAX_SAVE_CHARS before writing so
 * no injection patterns are ever stored at rest.
 */
export async function saveUserMemories(
  kv: KVStore,
  userId: string,
  memories: string,
): Promise<void> {
  const safe = sanitizeMemories(memories).slice(0, MAX_SAVE_CHARS)
  await kv.put(kvKey(userId), safe)
}
