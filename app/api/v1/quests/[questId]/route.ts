// ─── Quest API Routes — Single Quest CRUD ─────────────────────────────────────

import { NextRequest } from 'next/server'
import {
  runQuestDetailDeleteRoute,
  runQuestDetailGetRoute,
  runQuestDetailPatchRoute,
} from '@/lib/server/routes/quests/detail-runner'

// ─── GET — Fetch a single quest ───────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  return runQuestDetailGetRoute(params)
}

// ─── PATCH — Update quest status (start, abandon, resume) ─────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  return runQuestDetailPatchRoute(req, params)
}

// ─── DELETE — Remove a quest permanently ──────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  return runQuestDetailDeleteRoute(params)
}
