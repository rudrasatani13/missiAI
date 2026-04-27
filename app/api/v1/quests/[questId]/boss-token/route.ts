// ─── Boss Token API Route ─────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { runBossTokenGetRoute } from '@/lib/server/routes/quests/boss-token-runner'

// ─── GET — Issue a boss completion token ──────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  return runBossTokenGetRoute(params)
}
