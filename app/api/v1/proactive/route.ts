import { NextRequest } from 'next/server'
import {
  runProactiveDeleteRoute,
  runProactiveGetRoute,
  runProactivePatchRoute,
  runProactivePostRoute,
} from '@/lib/server/routes/proactive/runner'

// ─── GET — get today's briefing ───────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  return runProactiveGetRoute()
}

// ─── POST — trigger nudge check ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return runProactivePostRoute(req)
}

// ─── PATCH — update proactive config ─────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  return runProactivePatchRoute(req)
}

// ─── DELETE — dismiss a briefing item ────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  return runProactiveDeleteRoute(req)
}
