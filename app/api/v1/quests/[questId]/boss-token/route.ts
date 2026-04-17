// ─── Boss Token API Route ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logRequest, logError } from '@/lib/server/logger'
import {
  getQuest,
  generateBossToken,
  storeBossToken,
} from '@/lib/quests/quest-store'
import type { KVStore } from '@/types'

export const runtime = 'edge'

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function getEncryptionSecret(): string | null {
  try {
    return process.env.MISSI_KV_ENCRYPTION_SECRET ?? null
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

// ─── GET — Issue a boss completion token ──────────────────────────────────────

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
    logError('boss-token.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Storage unavailable' }, 503)

  const secret = getEncryptionSecret()
  if (!secret) {
    logError('boss-token.missing_secret', new Error('MISSI_KV_ENCRYPTION_SECRET not set'), userId)
    return jsonResponse({ success: false, error: 'Boss battle unavailable' }, 503)
  }

  try {
    // Verify quest exists and belongs to user
    const quest = await getQuest(kv, userId, questId)
    if (!quest) {
      return jsonResponse({ success: false, error: 'Quest not found' }, 404)
    }

    // Verify quest is active
    if (quest.status !== 'active') {
      return jsonResponse(
        { success: false, error: 'Quest is not active' },
        400,
      )
    }

    // Verify there is a boss mission and all preceding missions are complete
    const allMissions = quest.chapters.flatMap(c => c.missions)
    const bossMission = allMissions.find(m => m.isBoss)
    if (!bossMission) {
      return jsonResponse(
        { success: false, error: 'Quest has no boss mission' },
        400,
      )
    }

    // All non-boss missions must be completed
    const nonBossComplete = allMissions
      .filter(m => !m.isBoss)
      .every(m => m.status === 'completed')

    if (!nonBossComplete) {
      return jsonResponse(
        { success: false, error: 'Complete all missions before the boss battle' },
        400,
      )
    }

    // Generate and store token
    const token = await generateBossToken(questId, userId, secret)
    await storeBossToken(kv, token, questId, userId)

    logRequest('boss-token.issued', userId, startTime, { questId })
    return jsonResponse({ success: true, bossToken: token })
  } catch (err) {
    logError('boss-token.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to issue boss token' },
      500,
    )
  }
}
