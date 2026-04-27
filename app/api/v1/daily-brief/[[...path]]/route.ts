// ─── Daily Brief — Consolidated Catch-All Route ───────────────────────────────
//
// Handles:
//   path=[] (base)           → GET (fetch brief), POST (generate brief)
//   path=["tasks", taskId]   → PATCH (mark task complete)

import { type NextRequest } from 'next/server'
import { logError } from '@/lib/server/observability/logger'
import {
  dailyBriefJsonResponse,
  getAuthenticatedDailyBriefUserId,
} from '@/lib/server/routes/daily-brief/helpers'
import {
  runDailyBriefGetRoute,
  runDailyBriefPostRoute,
  runDailyBriefTaskPatchRoute,
} from '@/lib/server/routes/daily-brief/runner'

export const dynamic = 'force-dynamic'

// ─── Brief GET ────────────────────────────────────────────────────────────────

async function handleBriefGet(_req: NextRequest, userId: string) {
  return runDailyBriefGetRoute(userId)
}

// ─── Brief POST ───────────────────────────────────────────────────────────────

async function handleBriefPost(req: NextRequest, userId: string) {
  return runDailyBriefPostRoute(req, userId)
}

// ─── Task PATCH ───────────────────────────────────────────────────────────────

async function handleTaskPatch(taskId: string, userId: string) {
  return runDailyBriefTaskPatchRoute(taskId, userId)
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedDailyBriefUserId()
  } catch (error) {
    logError('daily-brief.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  if (!path || path.length === 0) return handleBriefGet(req, authResult.userId)
  return dailyBriefJsonResponse({ error: 'Not found' }, 404)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedDailyBriefUserId()
  } catch (error) {
    logError('daily-brief.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  if (!path || path.length === 0) return handleBriefPost(req, authResult.userId)
  return dailyBriefJsonResponse({ error: 'Not found' }, 404)
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedDailyBriefUserId()
  } catch (error) {
    logError('daily-brief.task.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  // /api/v1/daily-brief/tasks/[taskId]
  if (path && path.length === 2 && path[0] === 'tasks') {
    return handleTaskPatch(path[1], authResult.userId)
  }
  return dailyBriefJsonResponse({ error: 'Not found' }, 404)
}
