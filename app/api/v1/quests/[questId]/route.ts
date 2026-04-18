// ─── Quest API Routes — Single Quest CRUD ─────────────────────────────────────

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logRequest, logError } from '@/lib/server/logger'
import { getQuest, updateQuest, deleteQuest } from '@/lib/quests/quest-store'
import { checkQuestAchievements } from '@/lib/quests/quest-achievements'
import { getQuests } from '@/lib/quests/quest-store'
import { getGamificationData, saveGamificationData } from '@/lib/gamification/streak'
import { awardXP } from '@/lib/gamification/xp-engine'
import type { KVStore } from '@/types'
import type { QuestAchievementContext } from '@/types/quests'


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Validation ───────────────────────────────────────────────────────────────

const patchQuestSchema = z.object({
  action: z.enum(['start', 'abandon', 'resume']),
})

// ─── GET — Fetch a single quest ───────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const startTime = Date.now()
  const { questId } = await params

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.get.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Storage unavailable' }, 503)

  try {
    const quest = await getQuest(kv, userId, questId)
    if (!quest) {
      return jsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    logRequest('quests.get', userId, startTime, { questId })
    return jsonResponse({ success: true, quest })
  } catch (err) {
    logError('quests.get.error', err, userId)
    return jsonResponse({ success: false, error: 'Failed to load quest' }, 500)
  }
}

// ─── PATCH — Update quest status (start, abandon, resume) ─────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const startTime = Date.now()
  const { questId } = await params

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.patch.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Storage unavailable' }, 503)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = patchQuestSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  try {
    const quest = await getQuest(kv, userId, questId)
    if (!quest) {
      return jsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    const { action } = parsed.data

    if (action === 'start') {
      if (quest.status !== 'draft') {
        return jsonResponse(
          { success: false, error: 'Only draft quests can be started' },
          400,
        )
      }

      const updated = await updateQuest(kv, userId, questId, {
        status: 'active',
        startedAt: Date.now(),
      })

      // Check first_quest_started achievement
      const allQuests = await getQuests(kv, userId)
      const gamData = await getGamificationData(kv, userId)
      const ctx: QuestAchievementContext = { questJustStarted: updated ?? undefined }
      const newAchievements = checkQuestAchievements(allQuests, gamData, ctx)
      if (newAchievements.length > 0) {
        await saveGamificationData(kv, userId, gamData)
      }

      // Award start XP (fire-and-forget)
      awardXP(kv, userId, 'achievement', 10).catch(() => {})

      logRequest('quests.start', userId, startTime, { questId })
      return jsonResponse({ success: true, quest: updated, newAchievements })
    }

    if (action === 'abandon') {
      if (quest.status !== 'active' && quest.status !== 'draft') {
        return jsonResponse(
          { success: false, error: 'Only active or draft quests can be abandoned' },
          400,
        )
      }

      const updated = await updateQuest(kv, userId, questId, {
        status: 'abandoned',
      })

      logRequest('quests.abandon', userId, startTime, { questId })
      return jsonResponse({ success: true, quest: updated })
    }

    if (action === 'resume') {
      if (quest.status !== 'abandoned') {
        return jsonResponse(
          { success: false, error: 'Only abandoned quests can be resumed' },
          400,
        )
      }

      const updated = await updateQuest(kv, userId, questId, {
        status: 'active',
      })

      logRequest('quests.resume', userId, startTime, { questId })
      return jsonResponse({ success: true, quest: updated })
    }

    return jsonResponse({ success: false, error: 'Invalid action' }, 400)
  } catch (err) {
    logError('quests.patch.error', err, userId)
    return jsonResponse({ success: false, error: 'Failed to update quest' }, 500)
  }
}

// ─── DELETE — Remove a quest permanently ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const startTime = Date.now()
  const { questId } = await params

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.delete.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Storage unavailable' }, 503)

  try {
    const deleted = await deleteQuest(kv, userId, questId)
    if (!deleted) {
      return jsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    logRequest('quests.delete', userId, startTime, { questId })
    return jsonResponse({ success: true })
  } catch (err) {
    logError('quests.delete.error', err, userId)
    return jsonResponse({ success: false, error: 'Failed to delete quest' }, 500)
  }
}
