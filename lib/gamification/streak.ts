// ─── Life Streak & XP System ──────────────────────────────────────────────────

import type { KVStore } from '@/types'
import type {
  GamificationData,
  HabitStreak,
  CheckInResult,
  AvatarTier,
} from '@/types/gamification'
import { AVATAR_TIERS } from '@/types/gamification'
import { checkAchievements } from '@/lib/gamification/achievements'
import {
  buildGamificationDataFromRecords,
  deleteAchievementRecord,
  deleteHabitRecord,
  getGamificationStateRecord,
  listAchievementRecords,
  listGrantRecords,
  listHabitRecords,
  saveAchievementRecord,
  saveGamificationStateRecord,
  saveGrantRecord,
  saveHabitRecord,
  supportsGamificationList,
} from '@/lib/gamification/gamification-record-store'
import { checkAndIncrementAtomicCounter } from '@/lib/server/platform/atomic-quota'
import { getTodayUTC } from '@/lib/server/utils/date-utils'

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

async function getLegacyGamificationSnapshot(
  kv: KVStore,
  userId: string,
): Promise<GamificationData | null> {
  const raw = await kv.get(`gamification:${userId}`)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<GamificationData>
    const data = { ...DEFAULT_DATA(userId), ...parsed }
    const today = getTodayUTC()
    data.avatarTier = calculateAvatarTier(data.totalXP)
    data.level = calculateLevel(data.totalXP)
    if (data.xpLogDate !== today) {
      data.xpLog = []
      data.xpLogDate = today
    }
    return data
  } catch {
    return null
  }
}

async function saveLegacyGamificationSnapshot(
  kv: KVStore,
  userId: string,
  data: GamificationData,
): Promise<void> {
  const today = getTodayUTC()
  data.lastUpdatedAt = Date.now()
  data.level = calculateLevel(data.totalXP)
  data.avatarTier = calculateAvatarTier(data.totalXP)
  if (data.xpLogDate !== today) {
    data.xpLog = []
    data.xpLogDate = today
  }
  await kv.put(`gamification:${userId}`, JSON.stringify(data))
}

export async function ensureGamificationRecordBackfill(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const existingState = await getGamificationStateRecord(kv, userId)
  if (existingState) return

  const legacyData = await getLegacyGamificationSnapshot(kv, userId)
  const seedData = legacyData ?? DEFAULT_DATA(userId)
  const today = getTodayUTC()

  await saveGamificationStateRecord(kv, {
    userId,
    totalXPBaseline: seedData.totalXP,
    loginStreak: seedData.loginStreak,
    lastLoginDate: seedData.lastLoginDate,
    legacyTodayXPLogDate: seedData.xpLogDate === today ? seedData.xpLogDate : '',
    legacyTodayXPLog: seedData.xpLogDate === today ? seedData.xpLog : [],
    lastUpdatedAt: seedData.lastUpdatedAt,
  })

  await Promise.all(seedData.habits.map((habit) => saveHabitRecord(kv, userId, habit)))
  await Promise.all(seedData.achievements.map((achievement) => saveAchievementRecord(kv, userId, achievement)))
}

async function readGamificationDataFromRecords(
  kv: KVStore,
  userId: string,
): Promise<GamificationData | null> {
  const state = await getGamificationStateRecord(kv, userId)
  if (!state || !supportsGamificationList(kv)) return null

  const today = getTodayUTC()
  const [habits, achievements, grants] = await Promise.all([
    listHabitRecords(kv, userId),
    listAchievementRecords(kv, userId),
    listGrantRecords(kv, userId),
  ])
  const data = buildGamificationDataFromRecords(state, habits, achievements, grants, today)
  data.avatarTier = calculateAvatarTier(data.totalXP)
  data.level = calculateLevel(data.totalXP)
  return data
}

async function syncHabitRecords(kv: KVStore, userId: string, habits: HabitStreak[]): Promise<void> {
  await Promise.all(habits.map((habit) => saveHabitRecord(kv, userId, habit)))
  if (!supportsGamificationList(kv)) return

  const nextIds = new Set(habits.map((habit) => habit.nodeId))
  const existing = await listHabitRecords(kv, userId)
  await Promise.all(
    existing
      .filter((habit) => !nextIds.has(habit.nodeId))
      .map((habit) => deleteHabitRecord(kv, userId, habit.nodeId)),
  )
}

async function syncAchievementRecords(
  kv: KVStore,
  userId: string,
  achievements: GamificationData['achievements'],
): Promise<void> {
  await Promise.all(achievements.map((achievement) => saveAchievementRecord(kv, userId, achievement)))
  if (!supportsGamificationList(kv)) return

  const nextIds = new Set(achievements.map((achievement) => achievement.id))
  const existing = await listAchievementRecords(kv, userId)
  await Promise.all(
    existing
      .filter((achievement) => !nextIds.has(achievement.id))
      .map((achievement) => deleteAchievementRecord(kv, userId, achievement.id)),
  )
}

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
  const recordData = await readGamificationDataFromRecords(kv, userId)
  if (recordData) return recordData

  const legacyData = await getLegacyGamificationSnapshot(kv, userId)
  return legacyData ?? DEFAULT_DATA(userId)
}

export async function saveGamificationData(
  kv: KVStore,
  userId: string,
  data: GamificationData
): Promise<void> {
  await ensureGamificationRecordBackfill(kv, userId)
  const today = getTodayUTC()
  const recordData = await readGamificationDataFromRecords(kv, userId)
  if (recordData && data.xpLogDate === today && data.xpLog.length > recordData.xpLog.length) {
    const missingEntries = data.xpLog.slice(recordData.xpLog.length)
    await Promise.all(
      missingEntries.map((entry, index) => saveGrantRecord(kv, {
        userId,
        date: today,
        source: entry.source,
        amount: entry.amount,
        timestamp: entry.timestamp,
      }, `sync:${entry.source}:${entry.timestamp}:${index}`)),
    )
  }
  const existingState = await getGamificationStateRecord(kv, userId)
  const nextState = {
    ...(existingState ?? {
      userId,
      totalXPBaseline: 0,
      loginStreak: 0,
      lastLoginDate: '',
      legacyTodayXPLogDate: '',
      legacyTodayXPLog: [],
      lastUpdatedAt: 0,
    }),
    userId,
    loginStreak: data.loginStreak,
    lastLoginDate: data.lastLoginDate,
    lastUpdatedAt: Date.now(),
  }

  await saveGamificationStateRecord(kv, nextState)
  await syncHabitRecords(kv, userId, data.habits)
  await syncAchievementRecords(kv, userId, data.achievements)
  if (!supportsGamificationList(kv)) {
    await saveLegacyGamificationSnapshot(kv, userId, data)
  }
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

  const today = getTodayUTC()

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

  const atomicCheckIn = await checkAndIncrementAtomicCounter(`habit-checkin:${userId}:${nodeId}:${today}`, 1, 86_400)
  if (atomicCheckIn && !atomicCheckIn.allowed) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    const freshData = await getGamificationData(kv, userId)
    const freshHabit = freshData.habits.find((habit) => habit.nodeId === nodeId) ?? streak
    return {
      habit: freshHabit,
      xpEarned: 0,
      milestone: null,
      celebrationText: null,
      totalXP: freshData.totalXP,
      level: freshData.level,
      avatarTier: freshData.avatarTier,
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

  const checkInTimestamp = Date.now()
  data.totalXP += xpEarned

  // Log XP
  data.xpLog.push({ source: 'checkin', amount: xpEarned, timestamp: checkInTimestamp })

  // Upsert habit in array
  const idx = data.habits.findIndex((h) => h.nodeId === nodeId)
  if (idx >= 0) {
    data.habits[idx] = streak
  } else {
    data.habits.push(streak)
  }

  data.level = calculateLevel(data.totalXP)
  data.avatarTier = calculateAvatarTier(data.totalXP)

  // Check achievements
  const newAchievements = checkAchievements(data, { justCheckedIn: true })

  data.level = calculateLevel(data.totalXP)
  data.avatarTier = calculateAvatarTier(data.totalXP)

  await saveGrantRecord(kv, {
    userId,
    date: today,
    source: 'checkin',
    amount: xpEarned,
    timestamp: checkInTimestamp,
  }, `checkin:${encodeURIComponent(nodeId)}`)
  await Promise.all(
    newAchievements.map((achievement) => saveGrantRecord(kv, {
      userId,
      date: today,
      source: 'achievement',
      amount: achievement.xpBonus,
      timestamp: achievement.unlockedAt ?? Date.now(),
    }, `achievement:${encodeURIComponent(achievement.id)}`)),
  )

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
