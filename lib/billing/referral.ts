// ─── Referral System (KV-backed) ─────────────────────────────────────────────

import type { KVStore } from '@/types'

export interface ReferralData {
  code: string
  userId: string
  totalReferred: number
  successfulReferred: number
  rewardDaysEarned: number
  referrals: Array<{
    userId: string
    status: 'pending' | 'converted'
    date: string
  }>
}

const MAX_REFERRALS = 5
const REWARD_DAYS = 7
const DISCOUNT_PERCENT = 20

export { MAX_REFERRALS, REWARD_DAYS, DISCOUNT_PERCENT }

// Generate a short referral code from userId
function generateCode(userId: string): string {
  // Use a simple hash-like approach: take parts of userId and make it readable
  const base = userId.replace(/[^a-zA-Z0-9]/g, '')
  const code = base.slice(-8).toUpperCase()
  return code || Math.random().toString(36).substring(2, 10).toUpperCase()
}

export async function getOrCreateReferral(kv: KVStore, userId: string): Promise<ReferralData> {
  // Check if user already has a referral code
  const existing = await kv.get(`referral:user:${userId}`)
  if (existing) {
    return JSON.parse(existing) as ReferralData
  }

  // Create new referral
  const code = generateCode(userId)
  const data: ReferralData = {
    code,
    userId,
    totalReferred: 0,
    successfulReferred: 0,
    rewardDaysEarned: 0,
    referrals: [],
  }

  // Store both directions: user→data and code→userId
  await kv.put(`referral:user:${userId}`, JSON.stringify(data))
  await kv.put(`referral:code:${code}`, userId)

  return data
}

export async function getReferralByCode(kv: KVStore, code: string): Promise<string | null> {
  return kv.get(`referral:code:${code.toUpperCase()}`)
}

// Track that a new user was referred (called when new user visits with ?ref= and signs up)
export async function trackReferral(
  kv: KVStore,
  referrerUserId: string,
  newUserId: string
): Promise<{ success: boolean; error?: string }> {
  // Get referrer data
  const raw = await kv.get(`referral:user:${referrerUserId}`)
  if (!raw) return { success: false, error: 'Referrer not found' }

  const data = JSON.parse(raw) as ReferralData

  // Check limit
  if (data.totalReferred >= MAX_REFERRALS) {
    return { success: false, error: 'Referral limit reached' }
  }

  // Check if already referred
  if (data.referrals.some(r => r.userId === newUserId)) {
    return { success: true } // Already tracked, idempotent
  }

  // Can't refer yourself
  if (referrerUserId === newUserId) {
    return { success: false, error: 'Cannot refer yourself' }
  }

  // Add pending referral
  data.totalReferred += 1
  data.referrals.push({
    userId: newUserId,
    status: 'pending',
    date: new Date().toISOString(),
  })

  await kv.put(`referral:user:${referrerUserId}`, JSON.stringify(data))

  // Store reverse lookup: newUser → referrer
  await kv.put(`referral:referred-by:${newUserId}`, referrerUserId)

  return { success: true }
}

// Called when a referred user successfully upgrades — rewards the referrer
export async function convertReferral(
  kv: KVStore,
  newUserId: string
): Promise<{ referrerUserId: string; rewardDays: number } | null> {
  // Check if this user was referred
  const referrerUserId = await kv.get(`referral:referred-by:${newUserId}`)
  if (!referrerUserId) return null

  // Get referrer data
  const raw = await kv.get(`referral:user:${referrerUserId}`)
  if (!raw) return null

  const data = JSON.parse(raw) as ReferralData

  // Find and update the referral entry
  const ref = data.referrals.find(r => r.userId === newUserId)
  if (!ref || ref.status === 'converted') return null // Already converted

  ref.status = 'converted'
  data.successfulReferred += 1
  data.rewardDaysEarned += REWARD_DAYS

  await kv.put(`referral:user:${referrerUserId}`, JSON.stringify(data))

  return { referrerUserId, rewardDays: REWARD_DAYS }
}

// Check if a user was referred by someone (for discount eligibility)
export async function getReferrer(kv: KVStore, userId: string): Promise<string | null> {
  return kv.get(`referral:referred-by:${userId}`)
}
