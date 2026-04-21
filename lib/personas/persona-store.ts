// SERVER ONLY — never import this in client components
//
// KV-backed storage for user persona preferences and rate limiting.

import type { KVStore } from "@/types"
import { isValidPersonaId, type PersonaId } from "./persona-config"

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PERSONA: PersonaId = "default"
const PERSONA_SAVE_RATE_LIMIT = 10

// ─── User Persona Preference ─────────────────────────────────────────────────

/**
 * Reads the user's chosen persona from KV.
 * Returns 'calm' as default if nothing is stored or if the stored value is invalid.
 */
export async function getUserPersona(
  kv: KVStore,
  userId: string,
): Promise<PersonaId> {
  const key = `persona:preference:${userId}`
  const stored = await kv.get(key)

  if (stored === null) {
    return DEFAULT_PERSONA
  }

  if (isValidPersonaId(stored)) {
    return stored
  }

  // Data corruption — stored value is not a valid PersonaId
  console.warn(
    `[persona-store] Invalid persona value "${stored}" stored for user ${userId}, falling back to "${DEFAULT_PERSONA}"`,
  )
  return DEFAULT_PERSONA
}

/**
 * Saves the user's persona preference to KV.
 * Validates the personaId before writing — throws if invalid.
 * No TTL — persona preference is permanent until changed.
 */
export async function saveUserPersona(
  kv: KVStore,
  userId: string,
  personaId: PersonaId,
): Promise<void> {
  if (!isValidPersonaId(personaId)) {
    throw new InvalidPersonaError(String(personaId))
  }

  const key = `persona:preference:${userId}`
  await kv.put(key, personaId)
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

function getRateLimitKey(userId: string): string {
  const currentHour = new Date().toISOString().slice(0, 13) // "2025-04-14T09"
  return `ratelimit:persona-save:${userId}:${currentHour}`
}

/**
 * Returns the current count of persona-save calls for this user in the current hour.
 * Returns 0 if no key exists.
 */
export async function getPersonaRateLimit(
  kv: KVStore,
  userId: string,
): Promise<number> {
  const key = getRateLimitKey(userId)
  const value = await kv.get(key)
  if (value === null) return 0
  const count = parseInt(value, 10)
  return isNaN(count) ? 0 : count
}

/**
 * Increments the persona-save rate limit counter for this user.
 * Sets a 1-hour TTL so the key auto-expires.
 */
export async function incrementPersonaRateLimit(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const key = getRateLimitKey(userId)
  const current = await getPersonaRateLimit(kv, userId)
  await kv.put(key, String(current + 1), { expirationTtl: 3600 })
}

/**
 * Checks whether the user has exceeded the persona-save rate limit.
 */
export function isPersonaRateLimited(count: number): boolean {
  return count >= PERSONA_SAVE_RATE_LIMIT
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InvalidPersonaError extends Error {
  readonly status = 400

  constructor(value: string) {
    super(`Invalid persona ID: "${value}"`)
    this.name = "InvalidPersonaError"
  }
}
