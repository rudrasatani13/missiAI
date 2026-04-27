// ─── Visual Memory — Consolidated Catch-All Route ─────────────────────────────
//
// Handles:
//   path=[] (base)   → GET (gallery), DELETE (remove record)
//   path=["analyze"] → POST (analyze image)

import { type NextRequest } from 'next/server'
import { logError } from '@/lib/server/observability/logger'
import {
  getAuthenticatedVisualMemoryUserId,
  visualMemoryJsonResponse,
} from '@/lib/server/routes/visual-memory/helpers'
import {
  runVisualMemoryAnalyzeRoute,
  runVisualMemoryGalleryDeleteRoute,
  runVisualMemoryGalleryGetRoute,
} from '@/lib/server/routes/visual-memory/runner'

// ─── Gallery GET ──────────────────────────────────────────────────────────────

async function handleGalleryGet(req: NextRequest, userId: string) {
  return runVisualMemoryGalleryGetRoute(req, userId)
}

// ─── Gallery DELETE ───────────────────────────────────────────────────────────

async function handleGalleryDelete(req: NextRequest, userId: string) {
  return runVisualMemoryGalleryDeleteRoute(req, userId)
}

// ─── Analyze POST ─────────────────────────────────────────────────────────────

async function handleAnalyze(req: NextRequest, userId: string) {
  return runVisualMemoryAnalyzeRoute(req, userId)
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedVisualMemoryUserId()
  } catch (error) {
    logError('visual-memory.get.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  const segment = path?.[0]

  // Base path: /api/v1/visual-memory → gallery list
  if (!segment) return handleGalleryGet(req, authResult.userId)

  return visualMemoryJsonResponse({ error: 'Not found' }, 404)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedVisualMemoryUserId()
  } catch (error) {
    logError('visual-memory.delete.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handleGalleryDelete(req, authResult.userId)
  return visualMemoryJsonResponse({ error: 'Not found' }, 404)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  let authResult
  try {
    authResult = await getAuthenticatedVisualMemoryUserId()
  } catch (error) {
    logError('visual-memory.analyze.auth_error', error)
    throw error
  }
  if (!authResult.ok) {
    return authResult.response
  }

  const { path } = await params
  const segment = path?.[0]

  if (segment === 'analyze') return handleAnalyze(req, authResult.userId)
  return visualMemoryJsonResponse({ error: 'Not found' }, 404)
}
