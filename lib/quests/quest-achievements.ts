// ─── Quest Achievements ───────────────────────────────────────────────────────
//
// Separate achievement registry for quest-specific achievements.
// Does NOT modify lib/gamification/achievements.ts (frozen).
// Follows the same AchievementDef pattern for consistency.
//
// SERVER ONLY — never import in client components.

import type { GamificationData, Achievement } from '@/types/gamification'
import type { Quest, QuestAchievementContext } from '@/types/quests'

// ─── Quest Achievement Definitions ───────────────────────────────────────────

interface QuestAchievementDef {
  id: string
  title: string
  description: string
  xpBonus: number
  check: (
    quests: Quest[],
    data: GamificationData,
    ctx: QuestAchievementContext,
  ) => boolean
}

const QUEST_ACHIEVEMENT_REGISTRY: QuestAchievementDef[] = [
  {
    id: 'first_quest_started',
    title: 'Adventurer',
    description: 'Start your first quest',
    xpBonus: 10,
    check: (_quests, _data, ctx) => !!ctx.questJustStarted,
  },
  {
    id: 'first_quest_completed',
    title: 'Quest Complete',
    description: 'Complete your first quest',
    xpBonus: 50,
    check: (_quests, _data, ctx) => !!ctx.questJustCompleted,
  },
  {
    id: 'quest_master',
    title: 'Quest Master',
    description: 'Complete 5 quests total',
    xpBonus: 100,
    check: (quests) => quests.filter(q => q.status === 'completed').length >= 5,
  },
  {
    id: 'boss_slayer',
    title: 'Boss Slayer',
    description: 'Complete a quest\'s boss mission',
    xpBonus: 25,
    check: (_quests, _data, ctx) => !!ctx.missionJustCompleted?.isBoss,
  },
  {
    id: 'speed_runner',
    title: 'Speed Runner',
    description: 'Complete a quest in less than half the target duration',
    xpBonus: 75,
    check: (_quests, _data, ctx) => {
      const q = ctx.questJustCompleted
      if (!q || !q.startedAt || !q.completedAt) return false
      const actualDays = (q.completedAt - q.startedAt) / (1000 * 60 * 60 * 24)
      return actualDays < q.targetDurationDays / 2
    },
  },
  {
    id: 'dedicated_adventurer',
    title: 'Dedicated Adventurer',
    description: 'Complete a mission every day for 7 days across any quests',
    xpBonus: 50,
    check: (quests) => {
      // Gather all mission completion dates
      const completionDates = new Set<string>()
      for (const quest of quests) {
        for (const chapter of quest.chapters) {
          for (const mission of chapter.missions) {
            if (mission.completedAt) {
              const date = new Date(mission.completedAt).toISOString().slice(0, 10)
              completionDates.add(date)
            }
          }
        }
      }

      // Check for 7 consecutive days
      const sortedDates = Array.from(completionDates).sort()
      if (sortedDates.length < 7) return false

      let consecutive = 1
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1])
        const curr = new Date(sortedDates[i])
        const dayDiff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
        if (dayDiff === 1) {
          consecutive++
          if (consecutive >= 7) return true
        } else {
          consecutive = 1
        }
      }
      return false
    },
  },
  {
    id: 'chapter_champion',
    title: 'Chapter Champion',
    description: 'Complete all missions in a chapter in one day',
    xpBonus: 20,
    check: (quests, _data, ctx) => {
      if (!ctx.chapterJustCompleted) return false
      const quest = quests.find(q => q.id === ctx.chapterJustCompleted!.questId)
      if (!quest) return false
      const chapter = quest.chapters.find(
        c => c.chapterNumber === ctx.chapterJustCompleted!.chapterNumber,
      )
      if (!chapter) return false

      // Check all missions completed on the same day
      const completionDates = chapter.missions
        .filter(m => m.completedAt)
        .map(m => new Date(m.completedAt!).toISOString().slice(0, 10))

      if (completionDates.length !== chapter.missions.length) return false
      return new Set(completionDates).size === 1
    },
  },
  {
    id: 'three_quests',
    title: 'Multi-Questor',
    description: 'Have 3 active quests simultaneously',
    xpBonus: 15,
    check: (quests) => quests.filter(q => q.status === 'active').length >= 3,
  },
]

// ─── Check and Unlock Quest Achievements ──────────────────────────────────────

/**
 * Check all quest-specific achievements and unlock any newly qualifying ones.
 * Mutates `data.achievements` in place and returns the newly unlocked list.
 *
 * Follows the same pattern as lib/gamification/achievements.ts:checkAchievements
 */
export function checkQuestAchievements(
  quests: Quest[],
  data: GamificationData,
  ctx: QuestAchievementContext,
): Achievement[] {
  const newlyUnlocked: Achievement[] = []

  for (const def of QUEST_ACHIEVEMENT_REGISTRY) {
    // Skip if already unlocked
    const existing = data.achievements.find(a => a.id === def.id)
    if (existing?.unlockedAt) continue

    // Check condition
    if (!def.check(quests, data, ctx)) continue

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
 * Get all quest achievement definitions for display purposes.
 */
export function getAllQuestAchievements(data: GamificationData): Achievement[] {
  return QUEST_ACHIEVEMENT_REGISTRY.map(def => {
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
