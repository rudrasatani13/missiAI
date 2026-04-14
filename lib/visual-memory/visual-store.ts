// ─── Visual Memory Store ──────────────────────────────────────────────────────
//
// Manages a lightweight index of visual memory records in Cloudflare KV.
// The full LifeNodes live in the life graph (lifegraph:${userId}).
// This index exists so the gallery can list visual captures efficiently
// without scanning the entire life graph.
//
// SECURITY NOTES:
// - Raw image bytes are NEVER stored here or anywhere persistent.
// - KV key for the index: visual-memory:index:${userId}
// - Rate limit key: ratelimit:visual-memory:${userId}:${YYYY-MM-DD}
// - userId is always from Clerk session — never from request params.

import type { KVStore } from '@/types'
import type { VisualMemoryRecord } from '@/types/visual-memory'
import { getTodayUTC } from '@/lib/server/date-utils'

// ─── KV Key Helpers ───────────────────────────────────────────────────────────

const INDEX_PREFIX = 'visual-memory:index:'
const RATE_LIMIT_PREFIX = 'ratelimit:visual-memory:'
const MAX_RECORDS = 100
const RATE_LIMIT_TTL_SECONDS = 86400 // 24 hours

function indexKey(userId: string): string {
  return `${INDEX_PREFIX}${userId}`
}

function rateLimitKey(userId: string, today: string): string {
  return `${RATE_LIMIT_PREFIX}${userId}:${today}`
}

// BUGFIX (B3): Use centralized date utility instead of raw UTC slicing.
function getTodayDate(): string {
  return getTodayUTC()
}

// ─── Index Operations ─────────────────────────────────────────────────────────

/**
 * Add a new visual memory record to the user's index.
 * Records are prepended (newest first) and trimmed to MAX_RECORDS.
 */
export async function addVisualRecord(
  kv: KVStore,
  userId: string,
  record: VisualMemoryRecord,
): Promise<void> {
  const key = indexKey(userId)
  const raw = await kv.get(key)

  let records: VisualMemoryRecord[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        records = parsed as VisualMemoryRecord[]
      }
    } catch {
      records = []
    }
  }

  // Remove any existing record with the same nodeId to prevent duplicates
  records = records.filter((r) => r.nodeId !== record.nodeId)

  // Prepend new record (newest first)
  records.unshift(record)

  // Trim to max records — oldest are dropped
  if (records.length > MAX_RECORDS) {
    records = records.slice(0, MAX_RECORDS)
  }

  await kv.put(key, JSON.stringify(records))
}

/**
 * Retrieve visual memory records for a user.
 * Returns up to `limit` records (default 20, max 100).
 *
 * SECURITY: userId must always come from Clerk session — never query params.
 */
export async function getVisualRecords(
  kv: KVStore,
  userId: string,
  limit: number = 20,
): Promise<VisualMemoryRecord[]> {
  const key = indexKey(userId)
  const raw = await kv.get(key)

  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Ensure backward compatibility and fix any existing duplicate records
    const uniqueRecords: VisualMemoryRecord[] = []
    const seen = new Set<string>()
    for (const record of parsed as VisualMemoryRecord[]) {
      if (!seen.has(record.nodeId)) {
        seen.add(record.nodeId)
        uniqueRecords.push(record)
      }
    }

    const clampedLimit = Math.min(limit, MAX_RECORDS)
    return uniqueRecords.slice(0, clampedLimit)
  } catch {
    return []
  }
}

/**
 * Remove a visual memory record from the user's gallery index by nodeId.
 * Note: this does NOT delete from the LifeGraph — the memory persists in
 * Missi's knowledge graph. This is a gallery-only operation. Full memory
 * deletion is handled by the memory management UI (/api/v1/memory/[nodeId]).
 */
export async function deleteVisualRecord(
  kv: KVStore,
  userId: string,
  nodeId: string,
): Promise<void> {
  const key = indexKey(userId)
  const raw = await kv.get(key)

  if (!raw) return // Nothing to delete — no-op

  let records: VisualMemoryRecord[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      records = parsed as VisualMemoryRecord[]
    }
  } catch {
    return // Corrupt data — silently no-op
  }

  const filtered = records.filter((r) => r.nodeId !== nodeId)

  // Only write back if something actually changed
  if (filtered.length !== records.length) {
    await kv.put(key, JSON.stringify(filtered))
  }
}

// ─── Rate Limit Helpers ───────────────────────────────────────────────────────

/**
 * Read how many visual memory analyses the user has performed today.
 * KV key: ratelimit:visual-memory:${userId}:${YYYY-MM-DD}
 * TTL: 86400 seconds (auto-expires at midnight UTC + 24h)
 */
export async function getVisualRateLimit(
  kv: KVStore,
  userId: string,
): Promise<number> {
  const key = rateLimitKey(userId, getTodayDate())
  const raw = await kv.get(key)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return isNaN(n) ? 0 : n
}

/**
 * Increment the daily visual memory rate limit counter.
 * Call fire-and-forget after a successful analysis.
 * TTL ensures the counter auto-expires after 24 hours.
 */
export async function incrementVisualRateLimit(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const today = getTodayDate()
  const key = rateLimitKey(userId, today)
  const current = await getVisualRateLimit(kv, userId)
  // Use { expirationTtl } so the key auto-expires — no manual cleanup needed
  await kv.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_TTL_SECONDS,
  })
}
