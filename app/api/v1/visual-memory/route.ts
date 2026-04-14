// ─── Visual Memory — Gallery Index Endpoint ───────────────────────────────────
//
// GET  /api/v1/visual-memory?limit=20  — Fetch visual memory gallery records
// DELETE /api/v1/visual-memory         — Remove a record from the gallery index
//
// SECURITY NOTES:
// Rule 1 — userId always from Clerk session only.
// Rule 8 — Only returns records belonging to the authenticated user.
//          The userId used for KV read is always from Clerk — never query params.
// Rule 3 — No image data is stored or returned — only extracted metadata.

import { type NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logError } from '@/lib/server/logger'
import {
  getVisualRecords,
  deleteVisualRecord,
  getVisualRateLimit,
} from '@/lib/visual-memory/visual-store'
import { getUserPlan } from '@/lib/billing/tier-checker'
import type { KVStore } from '@/types'

export const runtime = 'edge'

// ─── Plan limits (for reporting remainingToday) ───────────────────────────────

const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  plus: 50,
  pro:  50,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── GET — Fetch visual memory records ───────────────────────────────────────

const limitSchema = z.coerce.number().int().min(1).max(100).default(20)

export async function GET(req: NextRequest) {
  // Security Rule 1: UserId from Clerk only
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.get.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  // Parse optional limit param
  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit') ?? '20'
  const limitResult = limitSchema.safeParse(limitRaw)
  const limit = limitResult.success ? limitResult.data : 20

  // Security Rule 8: userId from Clerk session — never from query params
  const records = await getVisualRecords(kv, userId, limit)

  // Fetch remaining today for display in the UI
  const planId = await getUserPlan(userId)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kv, userId)
  const remainingToday = Math.max(0, dailyLimit - usedToday)

  return jsonResponse({
    success: true,
    records,
    total: records.length,
    remainingToday,
  })
}

// ─── DELETE — Remove a record from the visual gallery index ──────────────────
//
// Note: this does NOT delete the LifeNode from the life graph.
// The memory continues to exist in Missi's knowledge graph.
// Full memory deletion is handled by DELETE /api/v1/memory/[nodeId].

const deleteBodySchema = z.object({
  nodeId: z.string().min(1).max(20),
})

export async function DELETE(req: NextRequest) {
  // Security Rule 1: UserId from Clerk only
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.delete.auth_error', e)
    throw e
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(
      { success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
      400,
    )
  }

  const parsed = deleteBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { success: false, error: 'Invalid nodeId', code: 'VALIDATION_ERROR' },
      400,
    )
  }

  const { nodeId } = parsed.data

  // Security Rule 8: deleteVisualRecord reads the user's own index using
  // userId from Clerk — the nodeId is matched within the user's own records.
  // Cross-user access is impossible since each user has their own KV key.
  await deleteVisualRecord(kv, userId, nodeId)

  return jsonResponse({ success: true })
}
