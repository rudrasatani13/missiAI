// ─── Quest Stats API Route ────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { runQuestStatsGetRoute } from '@/lib/server/routes/quests/stats-runner'

// ─── GET — Aggregate quest statistics ─────────────────────────────────────────

export async function GET(_req: NextRequest) {
  return runQuestStatsGetRoute()
}
