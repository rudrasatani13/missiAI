// ─── Daily Brief Task Complete API — PATCH ────────────────────────────────────
//
// PATCH /api/v1/daily-brief/tasks/[taskId]
// Marks a specific task as complete in today's daily brief.
//
// SECURITY:
// - userId from Clerk session only (Rule 1)
// - taskId validated with Zod (Rule 2)
// - Ownership check: task must exist in the user's brief (Rule 5)
// - XP awarded as fire-and-forget

import { z } from 'zod'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logRequest, logError } from '@/lib/server/logger'
import { markTaskComplete } from '@/lib/daily-brief/brief-store'
import { awardXP } from '@/lib/gamification/xp-engine'
import type { KVStore } from '@/types'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// ─── Validation ───────────────────────────────────────────────────────────────

// SECURITY (Rule 2): Validate taskId from URL param with Zod before any logic.
const taskIdSchema = z.string().min(1, 'Task ID required').max(20, 'Task ID too long')

// ─── KV Helper ────────────────────────────────────────────────────────────────

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

// ─── PATCH — Mark a task complete ─────────────────────────────────────────────

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const startTime = Date.now()

  // SECURITY (Rule 1): Extract userId exclusively from Clerk's server-side auth.
  // Never read userId from request body, query params, or headers.
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('daily-brief.task.auth_error', e)
    throw e
  }

  // SECURITY (Rule 6): KV must be available
  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  // Extract and validate taskId from URL params
  const { taskId } = await params

  // SECURITY (Rule 2): Validate taskId with Zod before any further processing.
  const parsed = taskIdSchema.safeParse(taskId)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    // SECURITY (Rule 5): Ownership check — markTaskComplete reads the brief
    // from KV and verifies that a task with this ID exists in the user's brief.
    // If taskId is not found, it returns null and we return 403.
    const updatedBrief = await markTaskComplete(kv, userId, parsed.data)

    if (!updatedBrief) {
      logRequest('daily-brief.task.not_found', userId, startTime, { taskId: parsed.data })
      return jsonResponse(
        { success: false, error: 'Task not found in your brief' },
        403,
      )
    }

    // Fire-and-forget: Award 5 XP for completing a daily brief task.
    // Uses the same pattern as other routes — .catch(() => {}) ensures
    // XP failure doesn't affect the task completion response.
    awardXP(kv, userId, 'checkin', 5).catch(() => {})

    logRequest('daily-brief.task.complete', userId, startTime, { taskId: parsed.data })
    return jsonResponse({ success: true, data: { brief: updatedBrief } })
  } catch (err) {
    logError('daily-brief.task.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500,
    )
  }
}
