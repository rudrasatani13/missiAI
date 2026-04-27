import { stripHtml } from '@/lib/validation/sanitizer'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import { generateQuest } from '@/lib/quests/quest-generator'
import {
  addQuest,
  checkAndIncrementQuestGenRateLimit,
  getActiveQuestCount,
  getQuests,
  updateQuest,
} from '@/lib/quests/quest-store'
import { addOrUpdateNode, searchLifeGraph } from '@/lib/memory/life-graph'
import type { QuestGenerationInput, QuestCategory, QuestDifficulty } from '@/types/quests'
import {
  createQuestSchema,
  getAuthenticatedQuestsUserId,
  getQuestsVectorizeEnv,
  parseQuestsRouteRequestBody,
  parseQuestsStatusFilter,
  questsJsonResponse,
  requireQuestsKV,
  runQuestsRouteRateLimitPreflight,
} from '@/lib/server/routes/quests/helpers'

export async function runQuestsGetRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.list.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const ratePreflight = await runQuestsRouteRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    return ratePreflight.response
  }

  const kvResult = requireQuestsKV(() => questsJsonResponse(
    { success: true, quests: [], activeCount: 0 },
    200,
    rateLimitHeaders(ratePreflight.rateResult),
  ))
  if (!kvResult.ok) return kvResult.response

  try {
    const quests = await getQuests(kvResult.kv, auth.userId)
    const statusFilter = parseQuestsStatusFilter(req)
    let filtered = quests
    if (statusFilter === 'active') {
      filtered = quests.filter((quest) => quest.status === 'active')
    } else if (statusFilter === 'completed') {
      filtered = quests.filter((quest) => quest.status === 'completed')
    }

    const activeCount = quests.filter((quest) => quest.status === 'active').length

    logRequest('quests.list', auth.userId, startTime)
    return questsJsonResponse(
      { success: true, quests: filtered, activeCount },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('quests.list.error', error, auth.userId)
    return questsJsonResponse(
      { success: false, error: 'Failed to load quests' },
      500,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }
}

export async function runQuestsPostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('quests.create.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const ratePreflight = await runQuestsRouteRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    return ratePreflight.response
  }

  const kvResult = requireQuestsKV(() => questsJsonResponse(
    { success: false, error: 'Storage unavailable' },
    503,
  ))
  if (!kvResult.ok) return kvResult.response

  const requestBody = await parseQuestsRouteRequestBody(req, createQuestSchema)
  if (!requestBody.ok) return requestBody.response

  const genRateLimit = await checkAndIncrementQuestGenRateLimit(kvResult.kv, auth.userId, ratePreflight.planId)
  if (!genRateLimit.allowed) {
    return questsJsonResponse(
      {
        success: false,
        error: `Quest generation limit reached. You have ${genRateLimit.remaining} generations remaining this week.`,
      },
      429,
    )
  }

  const activeCount = await getActiveQuestCount(kvResult.kv, auth.userId)
  if (activeCount >= 3) {
    return questsJsonResponse(
      {
        success: false,
        error: 'You can have up to 3 active quests. Complete or abandon one first.',
      },
      400,
    )
  }

  try {
    const sanitizedGoal = stripHtml(requestBody.data.userGoal)
    const vectorizeEnv = getQuestsVectorizeEnv()
    let memoryContext = ''

    try {
      const results = await searchLifeGraph(
        kvResult.kv,
        vectorizeEnv,
        auth.userId,
        sanitizedGoal,
        { topK: 3, category: 'goal' },
      )
      if (results.length > 0) {
        memoryContext = results
          .slice(0, 3)
          .map((result) => result.node.title)
          .join(', ')
          .slice(0, 200)
      }
    } catch {
    }

    const input: QuestGenerationInput = {
      userGoal: sanitizedGoal,
      category: requestBody.data.category as QuestCategory,
      difficulty: requestBody.data.difficulty as QuestDifficulty,
      targetDurationDays: requestBody.data.targetDurationDays,
      existingMemoryContext: memoryContext || undefined,
    }

    const quest = await generateQuest(input)
    quest.userId = auth.userId

    await addQuest(kvResult.kv, auth.userId, quest)

    try {
      const lifeNode = await addOrUpdateNode(kvResult.kv, vectorizeEnv, auth.userId, {
        userId: auth.userId,
        category: 'goal',
        title: quest.title,
        detail: quest.description,
        tags: [quest.category, 'quest'],
        people: [],
        emotionalWeight: 0.7,
        confidence: 0.8,
        source: 'explicit',
      })

      if (lifeNode?.id) {
        quest.goalNodeId = lifeNode.id
        await updateQuest(kvResult.kv, auth.userId, quest.id, { goalNodeId: lifeNode.id })
      }
    } catch {
    }

    logRequest('quests.create', auth.userId, startTime, { questId: quest.id })
    return questsJsonResponse(
      { success: true, quest },
      201,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('quests.create.error', error, auth.userId)
    return questsJsonResponse(
      { success: false, error: 'Failed to generate quest' },
      500,
    )
  }
}
