import { getQuests } from '@/lib/quests/quest-store'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  getAuthenticatedQuestsUserId,
  getQuestsKV,
  questsJsonResponse,
} from '@/lib/server/routes/quests/helpers'
import type { Quest, QuestStats } from '@/types/quests'

function getEmptyQuestStats(): QuestStats {
  return {
    totalQuests: 0,
    activeQuests: 0,
    completedQuests: 0,
    abandonedQuests: 0,
    totalMissionsCompleted: 0,
    totalQuestXP: 0,
    bossesDefeated: 0,
  }
}

function buildQuestStats(quests: Quest[]): QuestStats {
  let totalMissionsCompleted = 0
  let totalQuestXP = 0
  let bossesDefeated = 0

  for (const quest of quests) {
    totalMissionsCompleted += quest.completedMissions
    totalQuestXP += quest.totalXPEarned

    for (const chapter of quest.chapters) {
      for (const mission of chapter.missions) {
        if (mission.isBoss && mission.status === 'completed') {
          bossesDefeated += 1
        }
      }
    }
  }

  return {
    totalQuests: quests.length,
    activeQuests: quests.filter((quest) => quest.status === 'active').length,
    completedQuests: quests.filter((quest) => quest.status === 'completed').length,
    abandonedQuests: quests.filter((quest) => quest.status === 'abandoned').length,
    totalMissionsCompleted,
    totalQuestXP,
    bossesDefeated,
  }
}

export async function runQuestStatsGetRoute(): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.stats.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kv = getQuestsKV()
  if (!kv) {
    return questsJsonResponse({ success: true, stats: getEmptyQuestStats() })
  }

  try {
    const quests = await getQuests(kv, auth.userId)
    const stats = buildQuestStats(quests)

    logRequest('quests.stats', auth.userId, startTime)
    return questsJsonResponse({ success: true, stats })
  } catch (error) {
    logError('quests.stats.error', error, auth.userId)
    return questsJsonResponse({ success: false, error: 'Failed to load stats' }, 500)
  }
}
