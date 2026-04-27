import { NextRequest } from 'next/server'
import {
  runWindDownGetRoute,
  runWindDownPostRoute,
} from '@/lib/server/routes/wind-down/runner'

// ─── GET — get today's evening reflection ────────────────────────────────────

export async function GET(_req: NextRequest) {
  return runWindDownGetRoute()
}

// ─── POST — mark reflection as delivered ─────────────────────────────────────

export async function POST(_req: NextRequest) {
  return runWindDownPostRoute()
}
