// ─── Quest Stats API Route ────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logRequest, logError } from '@/lib/server/logger'
import { getQuests } from '@/lib/quests/quest-store'
import type { KVStore } from '@/types'
import type { QuestStats } from '@/types/quests'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
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

// ─── GET — Aggregate quest statistics ─────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.stats.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    const empty: QuestStats = {
      totalQuests: 0,
      activeQuests: 0,
      completedQuests: 0,
      abandonedQuests: 0,
      totalMissionsCompleted: 0,
      totalQuestXP: 0,
      bossesDefeated: 0,
    }
    return jsonResponse({ success: true, stats: empty })
  }

  try {
    const quests = await getQuests(kv, userId)

    let totalMissionsCompleted = 0
    let totalQuestXP = 0
    let bossesDefeated = 0

    for (const quest of quests) {
      totalMissionsCompleted += quest.completedMissions
      totalQuestXP += quest.totalXPEarned

      for (const chapter of quest.chapters) {
        for (const mission of chapter.missions) {
          if (mission.isBoss && mission.status === 'completed') {
            bossesDefeated++
          }
        }
      }
    }

    const stats: QuestStats = {
      totalQuests: quests.length,
      activeQuests: quests.filter(q => q.status === 'active').length,
      completedQuests: quests.filter(q => q.status === 'completed').length,
      abandonedQuests: quests.filter(q => q.status === 'abandoned').length,
      totalMissionsCompleted,
      totalQuestXP,
      bossesDefeated,
    }

    logRequest('quests.stats', userId, startTime)
    return jsonResponse({ success: true, stats })
  } catch (err) {
    logError('quests.stats.error', err, userId)
    return jsonResponse({ success: false, error: 'Failed to load stats' }, 500)
  }
}
