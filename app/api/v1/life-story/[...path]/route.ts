// ─── Life Story — Consolidated Catch-All Route ────────────────────────────────
//
// Handles: chapters, timeline, constellation, export, year-review
// This consolidation reduces 5 separate edge function bundles into 1,
// saving ~2 MiB of duplicated dependency overhead.

import { NextResponse } from 'next/server'
import { getAuthenticatedLifeStoryUserId } from '@/lib/server/routes/life-story/helpers'
import {
  runLifeStoryChaptersRoute,
  runLifeStoryConstellationRoute,
  runLifeStoryExportRoute,
  runLifeStoryTimelineRoute,
  runLifeStoryYearReviewRoute,
} from '@/lib/server/routes/life-story/runner'

// ─── Chapters Handler ─────────────────────────────────────────────────────────

async function handleChapters(req: Request, userId: string) {
  return runLifeStoryChaptersRoute(req, userId)
}

// ─── Timeline Handler ─────────────────────────────────────────────────────────

async function handleTimeline(req: Request, userId: string) {
  return runLifeStoryTimelineRoute(req, userId)
}

// ─── Constellation Handler ────────────────────────────────────────────────────

async function handleConstellation(req: Request, userId: string) {
  return runLifeStoryConstellationRoute(req, userId)
}

// ─── Export Handler ───────────────────────────────────────────────────────────

async function handleExport(req: Request, userId: string) {
  return runLifeStoryExportRoute(req, userId)
}

// ─── Year Review Handler ──────────────────────────────────────────────────────

async function handleYearReview(req: Request, userId: string) {
  return runLifeStoryYearReviewRoute(req, userId)
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const authResult = await getAuthenticatedLifeStoryUserId()
  if (!authResult.ok) {
    return authResult.response
  }

  try {
    const { path } = await params
    switch (path[0]) {
      case 'chapters':
        return handleChapters(request, authResult.userId)
      case 'timeline':
        return handleTimeline(request, authResult.userId)
      case 'constellation':
        return handleConstellation(request, authResult.userId)
      case 'export':
        return handleExport(request, authResult.userId)
      case 'year-review':
        return handleYearReview(request, authResult.userId)
      default:
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('Life Story API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
