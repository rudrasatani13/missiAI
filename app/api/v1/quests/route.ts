// ─── Quest API Routes — List & Generate ───────────────────────────────────────

import { NextRequest } from 'next/server'
import { runQuestsGetRoute, runQuestsPostRoute } from '@/lib/server/routes/quests/runner'

// ─── GET — List all quests ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return runQuestsGetRoute(req)
}

// ─── POST — Generate a new quest ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return runQuestsPostRoute(req)
}
