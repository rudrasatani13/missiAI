// ─── Missi Spaces — Shared API helpers ──────────────────────────────────────

import { clerkClient } from '@clerk/nextjs/server'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import type { KVStore } from '@/types'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(
  error: string,
  code: string,
  status: number,
): Response {
  return jsonResponse({ success: false, error, code }, status)
}

export function getKV(): KVStore | null {
  return getCloudflareKVBinding()
}

/**
 * Best-effort display name fetch from Clerk. Falls back to a generic label so
 * we never block Space writes on an unreachable Clerk API.
 */
export async function fetchDisplayName(userId: string): Promise<string> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const name =
      user.firstName ||
      user.username ||
      (user.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? '')
    return (name || 'Member').slice(0, 50)
  } catch {
    return 'Member'
  }
}

/** ISO week string like "2026-W17". */
export function getIsoWeek(now: Date = new Date()): string {
  // ISO-8601 week number (Thursday-based).
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
