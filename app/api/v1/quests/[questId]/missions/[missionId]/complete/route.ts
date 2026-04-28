// ─── Mission Complete API Route ────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from '@/lib/server/platform/bindings'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/security/auth'
import { logRequest, logError } from '@/lib/server/observability/logger'
import {
  getQuest,
  getQuests,
  updateQuest,
  verifyAndConsumeBossToken,
} from '@/lib/quests/quest-store'
import { checkQuestAchievements } from '@/lib/quests/quest-achievements'
import { getGamificationData, saveGamificationData } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import { jsonResponse } from '@/lib/server/api/response'
import type { QuestMission, QuestAchievementContext } from '@/types/quests'

// ─── POST — Mark a mission as complete ────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string; missionId: string }> },
) {
  const startTime = Date.now()
  const { questId, missionId } = await params

  // Validate path params
  if (!questId || questId.length > 20 || !missionId || missionId.length > 20) {
    return jsonResponse({ success: false, error: 'Invalid quest or mission ID' }, 400)
  }

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('missions.complete.auth_error', e)
    throw e
  }

  const kv = getCloudflareKVBinding()
  if (!kv) return jsonResponse({ success: false, error: 'Storage unavailable' }, 503)

  // Parse optional body (bossToken)
  let bossToken: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (body && typeof body === 'object' && 'bossToken' in body) {
      bossToken = String((body as Record<string, unknown>).bossToken)
    }
  } catch {
    // No body is fine for non-boss missions
  }

  try {
    // 1. Get quest and verify ownership
    const quest = await getQuest(kv, userId, questId)
    if (!quest) {
      return jsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    // 2. Verify quest is active
    if (quest.status !== 'active') {
      return jsonResponse(
        { success: false, error: 'Quest is not active' },
        400,
      )
    }

    // 3. Find mission across all chapters
    let targetMission: QuestMission | null = null
    let targetChapterIdx = -1
    let targetMissionIdx = -1

    for (let ci = 0; ci < quest.chapters.length; ci++) {
      for (let mi = 0; mi < quest.chapters[ci].missions.length; mi++) {
        if (quest.chapters[ci].missions[mi].id === missionId) {
          targetMission = quest.chapters[ci].missions[mi]
          targetChapterIdx = ci
          targetMissionIdx = mi
          break
        }
      }
      if (targetMission) break
    }

    if (!targetMission) {
      return jsonResponse({ success: false, error: 'Mission not found' }, 404)
    }

    // 4. Verify mission is available (not locked or already completed)
    if (targetMission.status !== 'available') {
      return jsonResponse(
        {
          success: false,
          error: targetMission.status === 'completed'
            ? 'Mission already completed'
            : 'Mission is locked',
        },
        400,
      )
    }

    // 5. Boss mission requires bossToken verification
    if (targetMission.isBoss) {
      if (!bossToken) {
        return jsonResponse(
          { success: false, error: 'Boss token required for boss missions' },
          400,
        )
      }

      const isValid = await verifyAndConsumeBossToken(kv, bossToken, questId, userId)
      if (!isValid) {
        return jsonResponse(
          { success: false, error: 'Invalid or expired boss token' },
          403,
        )
      }
    }

    // 6. Mark mission as completed
    quest.chapters[targetChapterIdx].missions[targetMissionIdx].status = 'completed'
    quest.chapters[targetChapterIdx].missions[targetMissionIdx].completedAt = Date.now()

    // 7. Unlock next mission
    let nextMission: QuestMission | null = null
    const allMissions: QuestMission[] = []
    for (const chapter of quest.chapters) {
      for (const mission of chapter.missions) {
        allMissions.push(mission)
      }
    }

    const currentIdx = allMissions.findIndex(m => m.id === missionId)
    if (currentIdx >= 0 && currentIdx < allMissions.length - 1) {
      const next = allMissions[currentIdx + 1]
      if (next.status === 'locked') {
        // Find and update the actual mission in chapters
        for (const chapter of quest.chapters) {
          const mIdx = chapter.missions.findIndex(m => m.id === next.id)
          if (mIdx >= 0) {
            chapter.missions[mIdx].status = 'available'
            chapter.missions[mIdx].unlockedAt = Date.now()
            nextMission = chapter.missions[mIdx]
            break
          }
        }
      }
    }

    // 8. Update denormalized counters
    quest.completedMissions += 1

    // 9. Check if quest is completed (boss mission of last chapter)
    let questCompleted = false
    if (targetMission.isBoss) {
      quest.status = 'completed'
      quest.completedAt = Date.now()
      questCompleted = true
    }

    // 10. Award mission XP via awardXP (respects daily caps)
    const xpEarned = await awardXP(kv, userId, 'achievement', targetMission.xpReward)

    // 11. Award additional boss XP if quest just completed
    if (questCompleted) {
      const bossBonus = quest.difficulty === 'hard' ? 50 : quest.difficulty === 'medium' ? 25 : 15
      await awardXP(kv, userId, 'achievement', bossBonus).catch(() => {})
    }

    // 12. Update quest totalXPEarned
    quest.totalXPEarned += targetMission.xpReward

    // 13. Check achievements
    const allQuests = await getQuests(kv, userId)
    // Update the quest in the list (it might be stale)
    const questIdx = allQuests.findIndex(q => q.id === questId)
    if (questIdx >= 0) allQuests[questIdx] = quest

    const gamData = await getGamificationData(kv, userId)

    // Check if chapter just completed
    let chapterJustCompleted: { questId: string; chapterNumber: number } | undefined
    const currentChapter = quest.chapters[targetChapterIdx]
    const allChapterMissionsComplete = currentChapter.missions.every(
      m => m.status === 'completed',
    )
    if (allChapterMissionsComplete) {
      chapterJustCompleted = {
        questId: quest.id,
        chapterNumber: currentChapter.chapterNumber,
      }
    }

    const achievementCtx: QuestAchievementContext = {
      missionJustCompleted: targetMission,
      questJustCompleted: questCompleted ? quest : undefined,
      chapterJustCompleted,
    }

    const newAchievements = checkQuestAchievements(allQuests, gamData, achievementCtx)
    if (newAchievements.length > 0) {
      await saveGamificationData(kv, userId, gamData)
    }

    // 14. Save quest
    await updateQuest(kv, userId, questId, quest)

    // 15. If boss completed, update LifeNode goal
    if (questCompleted && quest.goalNodeId) {
      try {
        const { addOrUpdateNode } = await import('@/lib/memory/life-graph')
        const vectorizeEnv = getCloudflareVectorizeEnv()
        await addOrUpdateNode(
          kv, vectorizeEnv as import('@/lib/memory/vectorize').VectorizeEnv | null, userId,
          {
            userId,
            category: 'goal',
            title: quest.title,
            detail: `${quest.description}\n[${new Date().toISOString()}] Quest completed. All ${quest.totalMissions} missions done.`,
            tags: [quest.category, 'quest', 'completed'],
            people: [],
            emotionalWeight: 0.9,
            confidence: 1.0,
            source: 'explicit',
          },
        )
      } catch {
        // Non-critical
      }
    }

    logRequest('missions.complete', userId, startTime, {
      questId,
      missionId,
      questCompleted,
    })

    return jsonResponse({
      success: true,
      mission: quest.chapters[targetChapterIdx].missions[targetMissionIdx],
      nextMission,
      xpEarned,
      newAchievements,
      questCompleted,
      quest,
    })
  } catch (err) {
    logError('missions.complete.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to complete mission' },
      500,
    )
  }
}
