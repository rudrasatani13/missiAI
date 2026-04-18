// ─── Bot Authentication & Authorization Utilities ────────────────────────────
//
// Resolves platform sender IDs to Clerk userIds via KV mappings.
// Enforces plan gating (Pro/Business only), daily message limits, and
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

import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'

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

export async function checkAndIncrementBotDailyLimit(
  kv: KVStore,
  platform: BotPlatform,
  userId: string,
  date: string, // YYYY-MM-DD
): Promise<{ allowed: boolean; count: number }> {
  const key = `bot:daily:${platform === 'whatsapp' ? 'wa' : 'tg'}:${userId}:${date}`
  const raw = await kv.get(key)
  const count = raw ? parseInt(raw, 10) : 0

  if (count >= BOT_DAILY_LIMIT) {
    return { allowed: false, count }
  }

  await kv.put(key, String(count + 1), { expirationTtl: DAILY_COUNTER_TTL_SECONDS })
  return { allowed: true, count: count + 1 }
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
  const key = `bot:otp:attempts:${userId}:${date}`
  const raw = await kv.get(key)
  const attempts = raw ? parseInt(raw, 10) : 0

  if (attempts >= MAX_OTP_ATTEMPTS_PER_DAY) {
    return { allowed: false, attempts }
  }

  await kv.put(key, String(attempts + 1), { expirationTtl: OTP_ATTEMPTS_TTL_SECONDS })
  return { allowed: true, attempts: attempts + 1 }
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
