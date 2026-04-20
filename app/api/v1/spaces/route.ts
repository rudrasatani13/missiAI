// ─── POST /api/v1/spaces — create  |  GET — list user's Spaces ───────────────

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError, logRequest } from '@/lib/server/logger'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { canAccessSpaces, proRequiredResponse } from '@/lib/spaces/plan-gate'
import {
  createSpace,
  getSpace,
  getUserSpaces,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  fetchDisplayName,
  getIsoWeek,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import {
  SPACE_CATEGORIES,
  SPACE_CREATE_WEEKLY_LIMIT,
} from '@/types/spaces'
import type { SpaceSummary } from '@/types/spaces'

export const runtime = 'edge'

const createSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional().default(''),
  category: z.enum([...SPACE_CATEGORIES] as [string, ...string[]]),
  emoji: z.string().min(1).max(8),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return errorResponse('Storage unavailable', 'SERVICE_UNAVAILABLE', 503)

  try {
    const spaceIds = await getUserSpaces(kv, userId)
    const summaries: SpaceSummary[] = []

    for (const spaceId of spaceIds) {
      // Re-verify membership for each — the user index is eventually-consistent
      // with the authoritative member list. We self-heal stale entries here.
      const meta = await getSpace(kv, spaceId)
      if (!meta) continue
      const member = await verifyMembership(kv, spaceId, userId)
      if (!member) continue

      summaries.push({
        spaceId: meta.spaceId,
        name: meta.name,
        emoji: meta.emoji,
        category: meta.category,
        memberCount: meta.memberCount,
        userRole: member.role,
        recentActivity: member.lastActiveAt || meta.createdAt,
      })
    }

    logRequest('spaces.list', userId, startTime, { count: summaries.length })
    return jsonResponse({ success: true, data: summaries })
  } catch (err) {
    logError('spaces.list.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return errorResponse('Storage unavailable', 'SERVICE_UNAVAILABLE', 503)

  const planId = await getUserPlan(userId)
  if (!canAccessSpaces(planId)) return proRequiredResponse()

  // Weekly creation rate limit (5/week).
  const week = getIsoWeek()
  const rlKey = `ratelimit:space-create:${userId}:${week}`
  const rlRaw = await kv.get(rlKey)
  const rlCount = rlRaw ? parseInt(rlRaw, 10) || 0 : 0
  if (rlCount >= SPACE_CREATE_WEEKLY_LIMIT) {
    return errorResponse(
      'Space creation limit reached for this week',
      'RATE_LIMITED',
      429,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 'VALIDATION_ERROR', 400)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const sanitizedName = sanitizeMemories(parsed.data.name).slice(0, 50).trim()
  const sanitizedDesc = sanitizeMemories(parsed.data.description ?? '')
    .slice(0, 200)
    .trim()

  if (sanitizedName.length < 2) {
    return errorResponse('Name is too short', 'VALIDATION_ERROR', 400)
  }

  try {
    const displayName = await fetchDisplayName(userId)
    const meta = await createSpace(kv, userId, displayName, {
      name: sanitizedName,
      description: sanitizedDesc,
      category: parsed.data.category as SpaceSummary['category'],
      emoji: parsed.data.emoji,
    })

    // Bump weekly counter fire-and-forget. Use 8-day TTL so it survives week
    // rollover cleanly.
    kv.put(rlKey, String(rlCount + 1), { expirationTtl: 8 * 86_400 }).catch(
      () => {},
    )

    logRequest('spaces.create', userId, startTime, { spaceId: meta.spaceId })
    return jsonResponse({ success: true, data: meta })
  } catch (err) {
    logError('spaces.create.error', err, userId)
    return errorResponse('Failed to create Space', 'INTERNAL_ERROR', 500)
  }
}

