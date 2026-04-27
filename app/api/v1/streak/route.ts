import { NextRequest } from 'next/server'
import {
  runStreakGetRoute,
  runStreakPostRoute,
} from '@/lib/server/routes/streak/runner'

// ─── GET — load full GamificationData ────────────────────────────────────────

export async function GET(_req: NextRequest) {
  return runStreakGetRoute()
}

// ─── POST — check in on a habit ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return runStreakPostRoute(req)
}
