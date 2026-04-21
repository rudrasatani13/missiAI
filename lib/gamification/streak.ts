// ─── Life Streak & XP System ──────────────────────────────────────────────────

import type { KVStore } from '@/types'
import type {
  GamificationData,
  HabitStreak,
  CheckInResult,
  AvatarTier,
  Achievement,
  AVATAR_TIERS as AvatarTiersType,
} from '@/types/gamification'
import { AVATAR_TIERS } from '@/types/gamification'
import { checkAchievements } from '@/lib/gamification/achievements'

const XP_PER_CHECKIN = 5

const XP_MILESTONES: Record<number, number> = {
  7: 25,
  30: 100,
  100: 250,
}

const MILESTONE_DAYS = [7, 30, 100]

const CELEBRATION_TEXTS: Record<number, string> = {
  7:   "7-day streak! You're building something real. Keep going!",
  30:  "30 days straight! That's a genuine habit now. Incredible work.",
  100: "100 days! You've proven to yourself you can do anything. Legend.",
}

const DEFAULT_DATA = (userId: string): GamificationData => ({
  userId,
  totalXP: 0,
  level: 1,
  avatarTier: 1,
  habits: [],
  achievements: [],
  xpLog: [],
  xpLogDate: '',
  loginStreak: 0,
  lastLoginDate: '',
  lastUpdatedAt: 0,
})

/**
 * Calculate the avatar tier based on total XP.
 * Walks the AVATAR_TIERS array in reverse to find the highest qualifying tier.
 */
export function calculateAvatarTier(totalXP: number): AvatarTier {
  for (let i = AVATAR_TIERS.length - 1; i >= 0; i--) {
    if (totalXP >= AVATAR_TIERS[i].xpRequired) {
      return AVATAR_TIERS[i].tier
    }
  }
  return 1
}

export function calculateLevel(totalXP: number): number {
  return Math.max(1, Math.floor(totalXP / 100))
}

/**
 * Get the XP required for the next tier, or null if already max tier.
 */
export function getNextTierXP(currentTier: AvatarTier): number | null {
  const idx = AVATAR_TIERS.findIndex(t => t.tier === currentTier)
  if (idx < 0 || idx >= AVATAR_TIERS.length - 1) return null
  return AVATAR_TIERS[idx + 1].xpRequired
}

export async function getGamificationData(
  kv: KVStore,
  userId: string
): Promise<GamificationData> {
  const raw = await kv.get(`gamification:${userId}`)
  if (!raw) return DEFAULT_DATA(userId)

  const parsed = JSON.parse(raw) as Partial<GamificationData>
  const data = { ...DEFAULT_DATA(userId), ...parsed }

  // Auto-migrate: recalculate tier for existing users
  data.avatarTier = calculateAvatarTier(data.totalXP)
  data.level = calculateLevel(data.totalXP)

  // Reset xpLog if it's a new day
  const today = new Date().toISOString().slice(0, 10)
  if (data.xpLogDate !== today) {
    data.xpLog = []
    data.xpLogDate = today
  }

  return data
}

export async function saveGamificationData(
  kv: KVStore,
  userId: string,
  data: GamificationData
): Promise<void> {
  data.lastUpdatedAt = Date.now()
  data.level = calculateLevel(data.totalXP)
  data.avatarTier = calculateAvatarTier(data.totalXP)
  await kv.put(`gamification:${userId}`, JSON.stringify(data))
}

export async function checkInHabit(
  kv: KVStore,
  userId: string,
  nodeId: string,
  habitTitle: string
): Promise<CheckInResult> {
  const data = await getGamificationData(kv, userId)

  // Find or create streak record
  let streak = data.habits.find((h) => h.nodeId === nodeId)
  if (!streak) {
    streak = {
      nodeId,
      title: habitTitle,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckedIn: '',
      totalCheckIns: 0,
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  // Already checked in today
  if (streak.lastCheckedIn === today) {
    return {
      habit: streak,
      xpEarned: 0,
      milestone: null,
      celebrationText: null,
      totalXP: data.totalXP,
      level: data.level,
      avatarTier: data.avatarTier,
      alreadyCheckedIn: true,
      newAchievements: [],
    }
  }

  // Compute yesterday's date via Date arithmetic
  const todayDate = new Date(today)
  const yesterdayDate = new Date(todayDate)
  yesterdayDate.setDate(todayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)

  if (streak.lastCheckedIn === yesterday) {
    streak.currentStreak += 1
  } else {
    streak.currentStreak = 1
  }

  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak)
  streak.lastCheckedIn = today
  streak.totalCheckIns += 1
  streak.title = habitTitle

  // XP calculation
  let xpEarned = XP_PER_CHECKIN
  let milestone: number | null = null
  let celebrationText: string | null = null

  if (MILESTONE_DAYS.includes(streak.currentStreak)) {
    milestone = streak.currentStreak
    xpEarned += XP_MILESTONES[milestone]
    celebrationText = CELEBRATION_TEXTS[milestone] ?? null
  }

  data.totalXP += xpEarned

  // Log XP
  data.xpLog.push({ source: 'checkin', amount: xpEarned, timestamp: Date.now() })

  // Upsert habit in array
  const idx = data.habits.findIndex((h) => h.nodeId === nodeId)
  if (idx >= 0) {
    data.habits[idx] = streak
  } else {
    data.habits.push(streak)
  }

  // Check achievements
  const newAchievements = checkAchievements(data, { justCheckedIn: true })

  await saveGamificationData(kv, userId, data)

  return {
    habit: streak,
    xpEarned,
    milestone,
    celebrationText,
    totalXP: data.totalXP,
    level: data.level,
    avatarTier: data.avatarTier,
    alreadyCheckedIn: false,
    newAchievements,
  }
}

export async function getHabitStreakForNode(
  kv: KVStore,
  userId: string,
  nodeId: string
): Promise<HabitStreak | null> {
  const data = await getGamificationData(kv, userId)
  return data.habits.find((h) => h.nodeId === nodeId) ?? null
}
