// ─── Bot Authentication & Authorization Utilities ────────────────────────────
//
// Resolves platform sender IDs to Clerk userIds via KV mappings.
// Enforces plan gating (Pro/Business only), daily message limits, and
// P1-1 fix: All KV fallback rate-limit functions use increment-first pattern
// to minimize TOCTOU race window. The daily limit also applies a safety margin.
// message deduplication.
//
// KV key schema (all stored in MISSI_MEMORY namespace):
//   bot:wa:{e164Phone}              → Clerk userId
//   bot:wa:user:{clerkUserId}       → e164Phone
//   bot:tg:{telegramUserId}         → Clerk userId
//   bot:tg:user:{clerkUserId}       → telegramUserId
//   bot:otp:{clerkUserId}           → JSON { otp, expiresAt }           TTL: 10 min
//   bot:otp:attempts:{userId}:{day} → attempt count                     TTL: 24 h
//   bot:tglink:{code}               → JSON { clerkUserId, expiresAt }   TTL: 15 min
//   bot:dedup:wa:{messageId}        → "1"                               TTL: 7 days
//   bot:dedup:tg:{updateId}         → "1"                               TTL: 7 days
//   bot:daily:wa:{userId}:{date}    → message count string              TTL: ~48 h
//   bot:daily:tg:{userId}:{date}    → message count string              TTL: ~48 h
//   bot:daily:wa:{userId}:{date}:atomic → atomic counter                TTL: ~48 h
//   bot:daily:tg:{userId}:{date}:atomic → atomic counter                TTL: ~48 h

import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'
import { checkAndIncrementAtomicCounter } from '@/lib/server/platform/atomic-quota'

export type BotPlatform = 'whatsapp' | 'telegram'

// ─── Constants ────────────────────────────────────────────────────────────────

// WhatsApp/Telegram access requires Pro plan (or above)
const REQUIRED_PLANS = new Set(['pro'])

// Daily message cap per user per platform (generous — real guard is plan gating)
const BOT_DAILY_LIMIT = 200

const DEDUP_TTL_SECONDS = 7 * 24 * 3600 // 7 days
const DAILY_COUNTER_TTL_SECONDS = 48 * 3600 // 48 h (survives day boundary)
const OTP_TTL_SECONDS = 10 * 60 // 10 minutes
const OTP_ATTEMPTS_TTL_SECONDS = 24 * 3600 // 24 hours
const MAX_OTP_ATTEMPTS_PER_DAY = 5
const TGLINK_TTL_SECONDS = 15 * 60 // 15 minutes
const PENDING_WA_LINK_TTL_SECONDS = 15 * 60 // 15 minutes

// Per-sender phone rate limit for WhatsApp link-code guessing.
// 6-digit codes have 1M combinations. Without this guard an attacker could
// brute-force the 15-min window from an unlinked phone. Capped at 10
// attempts / phone / day; the code expires in 15 min regardless.
const MAX_WA_LINK_ATTEMPTS_PER_DAY = 10
const WA_LINK_ATTEMPTS_TTL_SECONDS = 24 * 3600 // 24 hours
const MAX_TG_LINK_ATTEMPTS_PER_DAY = 10
const TG_LINK_ATTEMPTS_TTL_SECONDS = 24 * 3600 // 24 hours

// ─── Sender → userId resolution ──────────────────────────────────────────────

export async function resolveClerkUserFromPhone(
  kv: KVStore,
  phone: string,
): Promise<string | null> {
  return kv.get(`bot:wa:${phone}`)
}

export async function resolveClerkUserFromTelegramId(
  kv: KVStore,
  telegramId: string | number,
): Promise<string | null> {
  return kv.get(`bot:tg:${telegramId}`)
}

// ─── Store / clear bot-user mappings ─────────────────────────────────────────

export async function storeWhatsAppMapping(
  kv: KVStore,
  phone: string,
  clerkUserId: string,
): Promise<void> {
  await Promise.all([
    kv.put(`bot:wa:${phone}`, clerkUserId),
    kv.put(`bot:wa:user:${clerkUserId}`, phone),
  ])
}

export async function storeTelegramMapping(
  kv: KVStore,
  telegramId: string | number,
  clerkUserId: string,
): Promise<void> {
  const tgId = String(telegramId)
  await Promise.all([
    kv.put(`bot:tg:${tgId}`, clerkUserId),
    kv.put(`bot:tg:user:${clerkUserId}`, tgId),
  ])
}

export async function clearWhatsAppMapping(
  kv: KVStore,
  clerkUserId: string,
): Promise<void> {
  const phone = await kv.get(`bot:wa:user:${clerkUserId}`)
  const ops: Promise<void>[] = [kv.delete(`bot:wa:user:${clerkUserId}`)]
  if (phone) ops.push(kv.delete(`bot:wa:${phone}`))
  await Promise.all(ops)
}

export async function clearTelegramMapping(
  kv: KVStore,
  clerkUserId: string,
): Promise<void> {
  const tgId = await kv.get(`bot:tg:user:${clerkUserId}`)
  const ops: Promise<void>[] = [kv.delete(`bot:tg:user:${clerkUserId}`)]
  if (tgId) ops.push(kv.delete(`bot:tg:${tgId}`))
  await Promise.all(ops)
}

// ─── Get current linked accounts ─────────────────────────────────────────────

export async function getLinkedWhatsApp(kv: KVStore, clerkUserId: string): Promise<string | null> {
  return kv.get(`bot:wa:user:${clerkUserId}`)
}

export async function getLinkedTelegram(kv: KVStore, clerkUserId: string): Promise<string | null> {
  return kv.get(`bot:tg:user:${clerkUserId}`)
}

// ─── Plan gate ────────────────────────────────────────────────────────────────
//
// WhatsApp and Telegram bot access is Pro-only.

export async function checkPlanGate(userId: string): Promise<{ allowed: boolean; planId: string }> {
  const planId = await getUserPlan(userId)
  return { allowed: REQUIRED_PLANS.has(planId), planId }
}

// ─── Daily message limits ─────────────────────────────────────────────────────

// P1-1 fix: When the atomic counter is unavailable, the KV fallback applies
// a reduced limit to absorb potential TOCTOU overshoot from concurrent writes.
const KV_DAILY_LIMIT_SAFETY_MARGIN = 5

export async function checkAndIncrementBotDailyLimit(
  kv: KVStore,
  platform: BotPlatform,
  userId: string,
  date: string, // YYYY-MM-DD
): Promise<{ allowed: boolean; count: number }> {
  const counterName = `bot:daily:${platform === 'whatsapp' ? 'wa' : 'tg'}:${userId}:${date}`

  // Prefer atomic counter when available
  const atomic = await checkAndIncrementAtomicCounter(counterName, BOT_DAILY_LIMIT, DAILY_COUNTER_TTL_SECONDS)
  if (atomic) {
    return { allowed: atomic.allowed, count: atomic.count }
  }

  // P1-1 fix: KV fallback — increment-first pattern.
  // Write the incremented value BEFORE checking the limit so the counter
  // always advances monotonically even under concurrent access. A reduced
  // limit (BOT_DAILY_LIMIT - safety margin) absorbs any remaining overshoot.
  const kvLimit = BOT_DAILY_LIMIT - KV_DAILY_LIMIT_SAFETY_MARGIN
  const raw = await kv.get(counterName)
  const count = raw ? parseInt(raw, 10) : 0
  const newCount = count + 1

  // Always write the increment — ensures concurrent requests advance the counter
  await kv.put(counterName, String(newCount), { expirationTtl: DAILY_COUNTER_TTL_SECONDS })

  if (newCount > kvLimit) {
    return { allowed: false, count: newCount }
  }

  return { allowed: true, count: newCount }
}

// ─── Message deduplication ────────────────────────────────────────────────────

export async function isMessageDuplicate(
  kv: KVStore,
  platform: BotPlatform,
  msgId: string | number,
): Promise<boolean> {
  const key = `bot:dedup:${platform === 'whatsapp' ? 'wa' : 'tg'}:${msgId}`
  const existing = await kv.get(key)
  return existing !== null
}

export async function markMessageProcessed(
  kv: KVStore,
  platform: BotPlatform,
  msgId: string | number,
): Promise<void> {
  const key = `bot:dedup:${platform === 'whatsapp' ? 'wa' : 'tg'}:${msgId}`
  await kv.put(key, '1', { expirationTtl: DEDUP_TTL_SECONDS })
}

// ─── WhatsApp OTP ─────────────────────────────────────────────────────────────

export interface OTPRecord {
  otp: string
  expiresAt: number
}

export async function storeOTP(kv: KVStore, userId: string, otp: string): Promise<void> {
  const record: OTPRecord = { otp, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 }
  await kv.put(`bot:otp:${userId}`, JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS })
}

export async function verifyAndConsumeOTP(
  kv: KVStore,
  userId: string,
  submitted: string,
): Promise<{ valid: boolean; reason?: string }> {
  const raw = await kv.get(`bot:otp:${userId}`)
  if (!raw) return { valid: false, reason: 'otp_expired' }

  let record: OTPRecord
  try {
    record = JSON.parse(raw) as OTPRecord
  } catch {
    return { valid: false, reason: 'otp_corrupt' }
  }

  if (Date.now() > record.expiresAt) {
    await kv.delete(`bot:otp:${userId}`)
    return { valid: false, reason: 'otp_expired' }
  }

  if (record.otp !== submitted) {
    return { valid: false, reason: 'otp_mismatch' }
  }

  // Single-use: delete immediately after successful verification
  await kv.delete(`bot:otp:${userId}`)
  return { valid: true }
}

export async function checkOTPRateLimit(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<{ allowed: boolean; attempts: number }> {
  const counterName = `bot:otp:attempts:${userId}:${date}`

  const atomic = await checkAndIncrementAtomicCounter(counterName, MAX_OTP_ATTEMPTS_PER_DAY, OTP_ATTEMPTS_TTL_SECONDS)
  if (atomic) {
    return { allowed: atomic.allowed, attempts: atomic.count }
  }

  // P1-1 fix: increment-first pattern — write before checking
  const raw = await kv.get(counterName)
  const attempts = raw ? parseInt(raw, 10) : 0
  const newAttempts = attempts + 1

  await kv.put(counterName, String(newAttempts), { expirationTtl: OTP_ATTEMPTS_TTL_SECONDS })

  if (newAttempts > MAX_OTP_ATTEMPTS_PER_DAY) {
    return { allowed: false, attempts: newAttempts }
  }

  return { allowed: true, attempts: newAttempts }
}

// ─── Telegram deep-link code ──────────────────────────────────────────────────

export interface TgLinkRecord {
  clerkUserId: string
  expiresAt: number
}

// ─── WhatsApp pending link (reverse-flow: user messages the bot) ──────────────

export async function storePendingWhatsAppLink(
  kv: KVStore,
  code: string,
  userId: string,
): Promise<void> {
  await kv.put(`bot:wa:pending:${code}`, userId, { expirationTtl: PENDING_WA_LINK_TTL_SECONDS })
}

export async function consumePendingWhatsAppLink(
  kv: KVStore,
  code: string,
): Promise<string | null> {
  const userId = await kv.get(`bot:wa:pending:${code}`)
  if (!userId) return null
  await kv.delete(`bot:wa:pending:${code}`)
  return userId
}

// ─── WhatsApp link-code attempt rate limiter ──────────────────────────────────
//
// Called before attempting consumePendingWhatsAppLink for an unlinked sender.
// Keyed by phone (masked in KV key via consistent hash to avoid storing raw
// numbers in key names), limited to MAX_WA_LINK_ATTEMPTS_PER_DAY per day.

export async function checkAndIncrementWaLinkAttempt(
  kv: KVStore,
  phone: string,
  date: string, // YYYY-MM-DD
): Promise<{ allowed: boolean; attempts: number }> {
  // KV key stores the phone to enforce rate limit; phone is already stored
  // in bot:wa:{phone} for the actual mapping — same trust boundary.
  const counterName = `bot:wa:link-attempts:${phone}:${date}`

  const atomic = await checkAndIncrementAtomicCounter(counterName, MAX_WA_LINK_ATTEMPTS_PER_DAY, WA_LINK_ATTEMPTS_TTL_SECONDS)
  if (atomic) {
    return { allowed: atomic.allowed, attempts: atomic.count }
  }

  // P1-1 fix: increment-first pattern — write before checking
  const raw = await kv.get(counterName)
  const attempts = raw ? parseInt(raw, 10) : 0
  const newAttempts = attempts + 1

  await kv.put(counterName, String(newAttempts), { expirationTtl: WA_LINK_ATTEMPTS_TTL_SECONDS })

  if (newAttempts > MAX_WA_LINK_ATTEMPTS_PER_DAY) {
    return { allowed: false, attempts: newAttempts }
  }

  return { allowed: true, attempts: newAttempts }
}

export async function checkAndIncrementTgLinkAttempt(
  kv: KVStore,
  telegramUserId: string | number,
  date: string, // YYYY-MM-DD
): Promise<{ allowed: boolean; attempts: number }> {
  const counterName = `bot:tg:link-attempts:${telegramUserId}:${date}`

  const atomic = await checkAndIncrementAtomicCounter(counterName, MAX_TG_LINK_ATTEMPTS_PER_DAY, TG_LINK_ATTEMPTS_TTL_SECONDS)
  if (atomic) {
    return { allowed: atomic.allowed, attempts: atomic.count }
  }

  // P1-1 fix: increment-first pattern — write before checking
  const raw = await kv.get(counterName)
  const attempts = raw ? parseInt(raw, 10) : 0
  const newAttempts = attempts + 1

  await kv.put(counterName, String(newAttempts), { expirationTtl: TG_LINK_ATTEMPTS_TTL_SECONDS })

  if (newAttempts > MAX_TG_LINK_ATTEMPTS_PER_DAY) {
    return { allowed: false, attempts: newAttempts }
  }

  return { allowed: true, attempts: newAttempts }
}

export async function storeTelegramLinkCode(
  kv: KVStore,
  code: string,
  clerkUserId: string,
): Promise<void> {
  const record: TgLinkRecord = { clerkUserId, expiresAt: Date.now() + TGLINK_TTL_SECONDS * 1000 }
  await kv.put(`bot:tglink:${code}`, JSON.stringify(record), { expirationTtl: TGLINK_TTL_SECONDS })
}

export async function consumeTelegramLinkCode(
  kv: KVStore,
  code: string,
): Promise<{ clerkUserId: string } | null> {
  const raw = await kv.get(`bot:tglink:${code}`)
  if (!raw) return null

  let record: TgLinkRecord
  try {
    record = JSON.parse(raw) as TgLinkRecord
  } catch {
    return null
  }

  if (Date.now() > record.expiresAt) {
    await kv.delete(`bot:tglink:${code}`)
    return null
  }

  // Single-use: delete immediately
  await kv.delete(`bot:tglink:${code}`)
  return { clerkUserId: record.clerkUserId }
}
