import { logError, logRequest } from '@/lib/server/observability/logger'
import { getGamificationData, saveGamificationData } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import { checkQuestAchievements } from '@/lib/quests/quest-achievements'
import { deleteQuest, getQuest, getQuests, updateQuest } from '@/lib/quests/quest-store'
import type { QuestAchievementContext } from '@/types/quests'
import {
  getAuthenticatedQuestsUserId,
  parseQuestsRouteRequestBody,
  patchQuestSchema,
  questsJsonResponse,
  requireQuestsKV,
} from '@/lib/server/routes/quests/helpers'

type QuestDetailRouteParams = Promise<{ questId: string }>

export async function runQuestDetailGetRoute(
  params: QuestDetailRouteParams,
): Promise<Response> {
  const startTime = Date.now()
  const { questId } = await params

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.get.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kvResult = requireQuestsKV(() =>
    questsJsonResponse({ success: false, error: 'Storage unavailable' }, 503),
  )
  if (!kvResult.ok) return kvResult.response

  try {
    const quest = await getQuest(kvResult.kv, auth.userId, questId)
    if (!quest) {
      return questsJsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    logRequest('quests.get', auth.userId, startTime, { questId })
    return questsJsonResponse({ success: true, quest })
  } catch (error) {
    logError('quests.get.error', error, auth.userId)
    return questsJsonResponse({ success: false, error: 'Failed to load quest' }, 500)
  }
}

export async function runQuestDetailPatchRoute(
  req: Request,
  params: QuestDetailRouteParams,
): Promise<Response> {
  const startTime = Date.now()
  const { questId } = await params

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.patch.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kvResult = requireQuestsKV(() =>
    questsJsonResponse({ success: false, error: 'Storage unavailable' }, 503),
  )
  if (!kvResult.ok) return kvResult.response

  const requestBody = await parseQuestsRouteRequestBody(req, patchQuestSchema)
  if (!requestBody.ok) return requestBody.response

  try {
    const quest = await getQuest(kvResult.kv, auth.userId, questId)
    if (!quest) {
      return questsJsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    const { action } = requestBody.data

    if (action === 'start') {
      if (quest.status !== 'draft') {
        return questsJsonResponse(
          { success: false, error: 'Only draft quests can be started' },
          400,
        )
      }

      const updated = await updateQuest(kvResult.kv, auth.userId, questId, {
        status: 'active',
        startedAt: Date.now(),
      })

      const allQuests = await getQuests(kvResult.kv, auth.userId)
      const gamData = await getGamificationData(kvResult.kv, auth.userId)
      const ctx: QuestAchievementContext = { questJustStarted: updated ?? undefined }
      const newAchievements = checkQuestAchievements(allQuests, gamData, ctx)
      if (newAchievements.length > 0) {
        await saveGamificationData(kvResult.kv, auth.userId, gamData)
      }

      awardXP(kvResult.kv, auth.userId, 'achievement', 10).catch(() => {})

      logRequest('quests.start', auth.userId, startTime, { questId })
      return questsJsonResponse({ success: true, quest: updated, newAchievements })
    }

    if (action === 'abandon') {
      if (quest.status !== 'active' && quest.status !== 'draft') {
        return questsJsonResponse(
          { success: false, error: 'Only active or draft quests can be abandoned' },
          400,
        )
      }

      const updated = await updateQuest(kvResult.kv, auth.userId, questId, {
        status: 'abandoned',
      })

      logRequest('quests.abandon', auth.userId, startTime, { questId })
      return questsJsonResponse({ success: true, quest: updated })
    }

    if (action === 'resume') {
      if (quest.status !== 'abandoned') {
        return questsJsonResponse(
          { success: false, error: 'Only abandoned quests can be resumed' },
          400,
        )
      }

      const updated = await updateQuest(kvResult.kv, auth.userId, questId, {
        status: 'active',
      })

      logRequest('quests.resume', auth.userId, startTime, { questId })
      return questsJsonResponse({ success: true, quest: updated })
    }

    return questsJsonResponse({ success: false, error: 'Invalid action' }, 400)
  } catch (error) {
    logError('quests.patch.error', error, auth.userId)
    return questsJsonResponse({ success: false, error: 'Failed to update quest' }, 500)
  }
}

export async function runQuestDetailDeleteRoute(
  params: QuestDetailRouteParams,
): Promise<Response> {
  const startTime = Date.now()
  const { questId } = await params

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.delete.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kvResult = requireQuestsKV(() =>
    questsJsonResponse({ success: false, error: 'Storage unavailable' }, 503),
  )
  if (!kvResult.ok) return kvResult.response

  try {
    const deleted = await deleteQuest(kvResult.kv, auth.userId, questId)
    if (!deleted) {
      return questsJsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    logRequest('quests.delete', auth.userId, startTime, { questId })
    return questsJsonResponse({ success: true })
  } catch (error) {
    logError('quests.delete.error', error, auth.userId)
    return questsJsonResponse({ success: false, error: 'Failed to delete quest' }, 500)
  }
}
