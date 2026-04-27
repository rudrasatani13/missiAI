// ─── Sleep Sessions — Consolidated Catch-All Route ────────────────────────────
//
// Handles: generate, history, library, tts
// Consolidation reduces 4 separate edge function bundles into 1.

import { NextRequest, NextResponse } from 'next/server'
import {
  runSleepSessionsGenerateRoute,
  runSleepSessionsHistoryGetRoute,
  runSleepSessionsHistoryPostRoute,
  runSleepSessionsLibraryRoute,
} from '@/lib/server/routes/sleep-sessions/runner'
import { runSleepSessionsTtsRoute } from '@/lib/server/routes/sleep-sessions/tts'

// ─── Generate Handler (POST /generate) ────────────────────────────────────────

const handleGenerate = runSleepSessionsGenerateRoute

// ─── History Handler (GET/POST /history) ──────────────────────────────────────

const handleHistoryGet = runSleepSessionsHistoryGetRoute

const handleHistoryPost = runSleepSessionsHistoryPostRoute

// ─── Library Handler (GET /library) ───────────────────────────────────────────

const handleLibrary = runSleepSessionsLibraryRoute

// ─── TTS Handler (POST /tts) ──────────────────────────────────────────────────

const handleTts = runSleepSessionsTtsRoute

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'history':
      return handleHistoryGet()
    case 'library':
      return handleLibrary(req)
    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'generate':
      return handleGenerate(req)
    case 'history':
      return handleHistoryPost(req)
    case 'tts':
      return handleTts(req)
    default:
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
