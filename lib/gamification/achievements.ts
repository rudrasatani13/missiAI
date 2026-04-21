/**
 * Achievement System — Unlockable badges with XP bonuses.
 */

import type { GamificationData, Achievement } from '@/types/gamification'

// ─── Achievement Registry ─────────────────────────────────────────────────────

interface AchievementDef {
  id: string
  title: string
  description: string
  xpBonus: number
  check: (data: GamificationData, ctx: AchievementContext) => boolean
}

export interface AchievementContext {
  justCheckedIn?: boolean
  justChatted?: boolean
  justSavedMemory?: boolean
  justUsedAgent?: boolean
  memoryCount?: number
}

const ACHIEVEMENT_REGISTRY: AchievementDef[] = [
  {
    id: 'first_words',
    title: 'First Words',
    description: 'Send your first message to Missi',
    xpBonus: 5,
    check: (data) => {
      const chatXP = data.xpLog.filter(e => e.source === 'chat')
      return chatXP.length > 0 || data.totalXP > 0
    },
  },
  {
    id: 'memory_keeper',
    title: 'Memory Keeper',
    description: 'Have 10 memories saved',
    xpBonus: 10,
    check: (data, ctx) => (ctx.memoryCount ?? 0) >= 10,
  },
  {
    id: 'habit_builder',
    title: 'Habit Builder',
    description: 'Reach a 7-day streak on any habit',
    xpBonus: 25,
    check: (data) => data.habits.some(h => h.longestStreak >= 7),
  },
  {
    id: 'centurion',
    title: 'Centurion',
    description: 'Reach a 100-day streak',
    xpBonus: 100,
    check: (data) => data.habits.some(h => h.longestStreak >= 100),
  },
  {
    id: 'dedicated',
    title: 'Dedicated',
    description: 'Log in 7 days in a row',
    xpBonus: 15,
    check: (data) => data.loginStreak >= 7,
  },
  {
    id: 'power_user',
    title: 'Power User',
    description: 'Reach Level 10',
    xpBonus: 50,
    check: (data) => data.level >= 10,
  },
  {
    id: 'agent_master',
    title: 'Agent Master',
    description: 'Use agent tools 10 times',
    xpBonus: 25,
    check: (data) => {
      const agentEntries = data.xpLog.filter(e => e.source === 'agent')
      return agentEntries.length >= 10 || data.totalXP >= 500
    },
  },
  {
    id: 'ember_unlocked',
    title: 'Rising Ember',
    description: 'Reach the Ember tier',
    xpBonus: 5,
    check: (data) => data.avatarTier >= 2,
  },
  {
    id: 'flame_unlocked',
    title: 'Burning Flame',
    description: 'Reach the Flame tier',
    xpBonus: 15,
    check: (data) => data.avatarTier >= 3,
  },
  {
    id: 'nova_unlocked',
    title: 'Supernova',
    description: 'Reach the Nova tier',
    xpBonus: 50,
    check: (data) => data.avatarTier >= 4,
  },
]

/**
 * Check and unlock new achievements.
 * Mutates `data.achievements` in place and returns the newly unlocked ones.
 */
export function checkAchievements(
  data: GamificationData,
  ctx: AchievementContext = {},
): Achievement[] {
  const newlyUnlocked: Achievement[] = []

  for (const def of ACHIEVEMENT_REGISTRY) {
    // Skip if already unlocked
    const existing = data.achievements.find(a => a.id === def.id)
    if (existing?.unlockedAt) continue

    // Check condition
    if (!def.check(data, ctx)) continue

    // Unlock it
    const achievement: Achievement = {
      id: def.id,
      title: def.title,
      description: def.description,
      xpBonus: def.xpBonus,
      unlockedAt: Date.now(),
    }

    // Add or update in array
    const idx = data.achievements.findIndex(a => a.id === def.id)
    if (idx >= 0) {
      data.achievements[idx] = achievement
    } else {
      data.achievements.push(achievement)
    }

    // Award bonus XP
    data.totalXP += def.xpBonus
    data.xpLog.push({
      source: 'achievement',
      amount: def.xpBonus,
      timestamp: Date.now(),
    })

    newlyUnlocked.push(achievement)
  }

  return newlyUnlocked
}

/**
 * Get all achievement definitions for display purposes.
 * Returns the full list with unlock status from the user's data.
 */
export function getAllAchievements(data: GamificationData): Achievement[] {
  return ACHIEVEMENT_REGISTRY.map(def => {
    const existing = data.achievements.find(a => a.id === def.id)
    return existing ?? {
      id: def.id,
      title: def.title,
      description: def.description,
      xpBonus: def.xpBonus,
      unlockedAt: null,
    }
  })
}
