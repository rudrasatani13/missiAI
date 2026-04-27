import { getQuest, generateBossToken, storeBossToken } from '@/lib/quests/quest-store'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  getAuthenticatedQuestsUserId,
  getQuestsKV,
  questsJsonResponse,
} from '@/lib/server/routes/quests/helpers'
import type { Quest } from '@/types/quests'

function getEncryptionSecret(): string | null {
  try {
    return process.env.MISSI_KV_ENCRYPTION_SECRET ?? null
  } catch {
    return null
  }
}

function getBossTokenJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function validateQuestActive(quest: Quest): Response | null {
  if (quest.status !== 'active') {
    return getBossTokenJsonResponse(
      { success: false, error: 'Quest is not active' },
      400,
    )
  }
  return null
}

function validateBossMission(quest: Quest): Response | null {
  const allMissions = quest.chapters.flatMap((c) => c.missions)
  const bossMission = allMissions.find((m) => m.isBoss)
  if (!bossMission) {
    return getBossTokenJsonResponse(
      { success: false, error: 'Quest has no boss mission' },
      400,
    )
  }
  return null
}

function validateNonBossMissionsComplete(quest: Quest): Response | null {
  const allMissions = quest.chapters.flatMap((c) => c.missions)
  const nonBossComplete = allMissions
    .filter((m) => !m.isBoss)
    .every((m) => m.status === 'completed')
  if (!nonBossComplete) {
    return getBossTokenJsonResponse(
      { success: false, error: 'Complete all missions before the boss battle' },
      400,
    )
  }
  return null
}

export async function runBossTokenGetRoute(
  params: Promise<{ questId: string }>,
): Promise<Response> {
  const startTime = Date.now()
  const { questId } = await params

  const auth = await getAuthenticatedQuestsUserId({
    onUnexpectedError: (error) => {
      logError('boss-token.auth_error', error)
    },
  })
  if (!auth.ok) return auth.response

  const kv = getQuestsKV()
  if (!kv) {
    return questsJsonResponse({ success: false, error: 'Storage unavailable' }, 503)
  }

  const secret = getEncryptionSecret()
  if (!secret) {
    logError(
      'boss-token.missing_secret',
      new Error('MISSI_KV_ENCRYPTION_SECRET not set'),
      auth.userId,
    )
    return questsJsonResponse(
      { success: false, error: 'Boss battle unavailable' },
      503,
    )
  }

  try {
    const quest = await getQuest(kv, auth.userId, questId)
    if (!quest) {
      return questsJsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    const notActive = validateQuestActive(quest)
    if (notActive) return notActive

    const noBoss = validateBossMission(quest)
    if (noBoss) return noBoss

    const incomplete = validateNonBossMissionsComplete(quest)
    if (incomplete) return incomplete

    const token = await generateBossToken(questId, auth.userId, secret)
    await storeBossToken(kv, token, questId, auth.userId)

    logRequest('boss-token.issued', auth.userId, startTime, { questId })
    return questsJsonResponse({ success: true, bossToken: token })
  } catch (error) {
    logError('boss-token.error', error, auth.userId)
    return questsJsonResponse(
      { success: false, error: 'Failed to issue boss token' },
      500,
    )
  }
}
