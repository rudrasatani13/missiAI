import { type NextRequest } from 'next/server'
import {
  runMoodTimelineGetRoute,
  runMoodTimelinePostRoute,
} from '@/lib/server/routes/mood/timeline-runner'

// ─── GET /api/v1/mood/timeline ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return runMoodTimelineGetRoute(req)
}

// ─── POST /api/v1/mood/timeline — manual mood log ─────────────────────────────

export async function POST(req: NextRequest) {
  return runMoodTimelinePostRoute(req)
}
