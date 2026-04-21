// ─── Quest Store ──────────────────────────────────────────────────────────────
//
// KV-backed CRUD for quest data with ownership verification,
// rate limiting for quest generation, and boss token management.
//
// SERVER ONLY — never import in client components.

import type { KVStore } from '@/types'
import type { Quest } from '@/types/quests'

// ─── KV Keys ──────────────────────────────────────────────────────────────────

const QUESTS_PREFIX = 'quests:'
const RATE_LIMIT_PREFIX = 'ratelimit:quest-gen:'
const BOSS_TOKEN_PREFIX = 'boss-token:'

const MAX_QUESTS_PER_USER = 20
const BOSS_TOKEN_TTL = 86400 // 24 hours
const RATE_LIMIT_TTL = 604800 // 7 days

// ─── ISO Week Computation ─────────────────────────────────────────────────────

/**
 * Returns the ISO week string in format YYYY-W## for the current date.
 * Uses the ISO 8601 week numbering (Monday-based).
 */
function getISOWeek(): string {
  const now = new Date()
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const dayOfYear = Math.floor(
    (now.getTime() - yearStart.getTime()) / 86400000
  ) + 1
  const weekNumber = Math.ceil(
    (dayOfYear + yearStart.getUTCDay()) / 7
  )
  const paddedWeek = String(weekNumber).padStart(2, '0')
  return `${now.getUTCFullYear()}-W${paddedWeek}`
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

/**
 * Get all quests for a user. Returns empty array if not found.
 */
export async function getQuests(
  kv: KVStore,
  userId: string,
): Promise<Quest[]> {
  try {
    const raw = await kv.get(`${QUESTS_PREFIX}${userId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Quest[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

/**
 * Save all quests for a user. Validates ownership and caps at MAX_QUESTS_PER_USER.
 */
export async function saveQuests(
  kv: KVStore,
  userId: string,
  quests: Quest[],
): Promise<void> {
  // Defense in depth: verify every quest belongs to this user
  for (const quest of quests) {
    if (quest.userId !== userId) {
      throw new Error(`Quest ${quest.id} does not belong to user ${userId}`)
    }
  }

  // Cap at MAX_QUESTS_PER_USER — drop oldest completed/abandoned first
  let capped = quests
  if (capped.length > MAX_QUESTS_PER_USER) {
    // Sort: active/draft first, then by createdAt descending
    const active = capped.filter(q => q.status === 'active' || q.status === 'draft')
    const rest = capped
      .filter(q => q.status !== 'active' && q.status !== 'draft')
      .sort((a, b) => b.createdAt - a.createdAt)

    capped = [...active, ...rest].slice(0, MAX_QUESTS_PER_USER)
  }

  await kv.put(`${QUESTS_PREFIX}${userId}`, JSON.stringify(capped))
}

/**
 * Get a single quest by ID, verified to belong to the user.
 */
export async function getQuest(
  kv: KVStore,
  userId: string,
  questId: string,
): Promise<Quest | null> {
  const quests = await getQuests(kv, userId)
  const quest = quests.find(q => q.id === questId)
  if (!quest) return null
  if (quest.userId !== userId) return null
  return quest
}

/**
 * Add a new quest to the user's quest list.
 * ALWAYS sets quest.userId from the function parameter (never trusts input).
 */
export async function addQuest(
  kv: KVStore,
  userId: string,
  quest: Quest,
): Promise<void> {
  const quests = await getQuests(kv, userId)
  quest.userId = userId // Never trust whatever was passed
  quests.push(quest)
  await saveQuests(kv, userId, quests)
}

/**
 * Update a quest. Verifies ownership and never allows userId to be overridden.
 * Returns the updated quest, or null if not found.
 */
export async function updateQuest(
  kv: KVStore,
  userId: string,
  questId: string,
  updates: Partial<Quest>,
): Promise<Quest | null> {
  const quests = await getQuests(kv, userId)
  const idx = quests.findIndex(q => q.id === questId)
  if (idx < 0) return null
  if (quests[idx].userId !== userId) return null

  // Apply updates but NEVER allow userId to be overridden
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => key !== 'userId'),
  ) as Partial<Quest>
  quests[idx] = { ...quests[idx], ...safeUpdates, userId }

  await saveQuests(kv, userId, quests)
  return quests[idx]
}

/**
 * Delete a quest. Verifies ownership. Returns true on success, false if not found.
 */
export async function deleteQuest(
  kv: KVStore,
  userId: string,
  questId: string,
): Promise<boolean> {
  const quests = await getQuests(kv, userId)
  const idx = quests.findIndex(q => q.id === questId && q.userId === userId)
  if (idx < 0) return false

  quests.splice(idx, 1)
  await saveQuests(kv, userId, quests)
  return true
}

/**
 * Count active quests for a user.
 */
export async function getActiveQuestCount(
  kv: KVStore,
  userId: string,
): Promise<number> {
  const quests = await getQuests(kv, userId)
  return quests.filter(q => q.status === 'active').length
}

// ─── Quest Generation Rate Limiting ───────────────────────────────────────────

/**
 * Check if the user can generate another quest this week.
 * Limits: free 3/week, Pro/Business 20/week.
 */
export async function checkQuestGenRateLimit(
  kv: KVStore,
  userId: string,
  planId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const isoWeek = getISOWeek()
  const key = `${RATE_LIMIT_PREFIX}${userId}:${isoWeek}`

  const limit = planId === 'free' ? 3 : 20

  try {
    const raw = await kv.get(key)
    const count = raw ? parseInt(raw, 10) : 0
    const remaining = Math.max(0, limit - count)
    return { allowed: count < limit, remaining }
  } catch {
    // Fail open — don't block users due to KV errors
    return { allowed: true, remaining: 1 }
  }
}

/**
 * Increment the quest generation counter for the current week.
 */
export async function incrementQuestGenRateLimit(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const isoWeek = getISOWeek()
  const key = `${RATE_LIMIT_PREFIX}${userId}:${isoWeek}`

  try {
    const raw = await kv.get(key)
    const count = raw ? parseInt(raw, 10) : 0
    await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_TTL })
  } catch {
    // Non-critical — continue even if counter update fails
  }
}

// ─── Boss Token Management ────────────────────────────────────────────────────

/**
 * Generate a boss completion token using HMAC-SHA256 via Web Crypto API.
 * Returns the hex signature string.
 */
export async function generateBossToken(
  questId: string,
  userId: string,
  secret: string,
): Promise<string> {
  const data = `${questId}:${userId}:${Date.now()}`
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data),
  )

  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Store a boss token in KV with 24-hour TTL.
 */
export async function storeBossToken(
  kv: KVStore,
  token: string,
  questId: string,
  userId: string,
): Promise<void> {
  const value = JSON.stringify({
    questId,
    userId,
    issuedAt: Date.now(),
  })
  await kv.put(`${BOSS_TOKEN_PREFIX}${token}`, value, {
    expirationTtl: BOSS_TOKEN_TTL,
  })
}

/**
 * Verify and consume a boss token. Single-use — deletes on success.
 * Returns true if valid, false otherwise.
 */
export async function verifyAndConsumeBossToken(
  kv: KVStore,
  token: string,
  questId: string,
  userId: string,
): Promise<boolean> {
  const key = `${BOSS_TOKEN_PREFIX}${token}`

  try {
    const raw = await kv.get(key)
    if (!raw) return false

    const stored = JSON.parse(raw) as {
      questId: string
      userId: string
      issuedAt: number
    }

    // Verify all three fields match
    if (stored.questId !== questId || stored.userId !== userId) {
      return false
    }

    // Delete on success (single-use)
    await kv.delete(key)
    return true
  } catch {
    return false
  }
}
