// ─── /api/v1/spaces/[spaceId]/memory — GET list  |  POST add node ────────────

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/security/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  addNodeToSpace,
  getSpaceGraph,
  releaseSpaceQuotaReservation,
  reserveSpaceWriteQuota,
  updateLastActive,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import { MEMORY_CATEGORIES } from '@/types/spaces'
import type { SharedMemoryNode } from '@/types/spaces'
import { waitUntil } from '@/lib/server/platform/wait-until'
import { invalidateChatContext } from '@/lib/server/chat/context-cache'

const spaceIdSchema = z.string().min(8).max(32)

const postSchema = z.object({
  title: z.string().min(1).max(80),
  detail: z.string().max(500).default(''),
  category: z.enum([...MEMORY_CATEGORIES] as [string, ...string[]]),
  tags: z.array(z.string().max(30)).max(8).optional().default([]),
  people: z.array(z.string().max(50)).max(10).optional().default([]),
  emotionalWeight: z.number().min(0).max(1).optional().default(0.5),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const startTime = Date.now()
  const { spaceId: rawId } = await params
  const idCheck = spaceIdSchema.safeParse(rawId)
  if (!idCheck.success) return errorResponse('Invalid spaceId', 'VALIDATION_ERROR', 400)
  const spaceId = idCheck.data

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return errorResponse('Storage unavailable', 'SERVICE_UNAVAILABLE', 503)

  const member = await verifyMembership(kv, spaceId, userId)
  if (!member) return errorResponse('Not a member of this Space', 'FORBIDDEN', 403)

  const category = req.nextUrl.searchParams.get('category')
  const search = req.nextUrl.searchParams.get('search')
  const limitRaw = req.nextUrl.searchParams.get('limit')
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? '50', 10) || 50, 1),
    100,
  )

  try {
    const graph = await getSpaceGraph(kv, spaceId)
    let nodes = graph.nodes as SharedMemoryNode[]

    if (category && (MEMORY_CATEGORIES as readonly string[]).includes(category)) {
      nodes = nodes.filter((n) => n.category === category)
    }
    if (search && search.length > 0) {
      const words = new Set(
        search
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 1),
      )
      nodes = nodes.filter((n) => {
        const hay = (
          `${n.title} ${n.detail} ${n.tags.join(' ')} ${n.people.join(' ')}`
        ).toLowerCase()
        for (const w of words) if (hay.includes(w)) return true
        return false
      })
    }

    nodes = nodes
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)

    logRequest('spaces.memory.get', userId, startTime, {
      spaceId,
      count: nodes.length,
    })

    return jsonResponse({
      success: true,
      data: { nodes, totalNodes: graph.nodes.length },
    })
  } catch (err) {
    logError('spaces.memory.get.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const startTime = Date.now()
  const { spaceId: rawId } = await params
  const idCheck = spaceIdSchema.safeParse(rawId)
  if (!idCheck.success) return errorResponse('Invalid spaceId', 'VALIDATION_ERROR', 400)
  const spaceId = idCheck.data

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return errorResponse('Storage unavailable', 'SERVICE_UNAVAILABLE', 503)

  const member = await verifyMembership(kv, spaceId, userId)
  if (!member) return errorResponse('Not a member of this Space', 'FORBIDDEN', 403)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 'VALIDATION_ERROR', 400)
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const sanitizedTitle = sanitizeMemories(parsed.data.title).slice(0, 80).trim()
  const sanitizedDetail = sanitizeMemories(parsed.data.detail).slice(0, 500).trim()
  const sanitizedTags = parsed.data.tags
    .map((t) => sanitizeMemories(t).slice(0, 30).trim())
    .filter((t) => t.length > 0)
  const sanitizedPeople = parsed.data.people
    .map((p) => sanitizeMemories(p).slice(0, 50).trim())
    .filter((p) => p.length > 0)

  if (sanitizedTitle.length === 0) {
    return errorResponse('Title is required', 'VALIDATION_ERROR', 400)
  }

  const reservation = await reserveSpaceWriteQuota(userId)
  if (!reservation.allowed) {
    if (reservation.unavailable) {
      return errorResponse('Rate limit service unavailable', 'SERVICE_UNAVAILABLE', 503)
    }
    return errorResponse(
      'Daily Space write limit reached. Try again tomorrow.',
      'RATE_LIMITED',
      429,
    )
  }

  try {
    const node = await addNodeToSpace(kv, spaceId, userId, member.displayName, {
      category: parsed.data.category as SharedMemoryNode['category'],
      title: sanitizedTitle,
      detail: sanitizedDetail,
      tags: sanitizedTags,
      people: sanitizedPeople,
      emotionalWeight: parsed.data.emotionalWeight,
    })

    // Background bookkeeping — no need to delay the response.
    waitUntil(Promise.all([
      updateLastActive(kv, spaceId, userId),
      invalidateChatContext(kv, userId),
    ]).catch((err) => logError('spaces.memory.post.background_error', err, userId)))

    logRequest('spaces.memory.post', userId, startTime, {
      spaceId,
      nodeId: node.id,
    })

    return jsonResponse({ success: true, data: node })
  } catch (err) {
    const released = await releaseSpaceQuotaReservation(reservation)
    if (!released) logError('spaces.memory.post.quota_release_error', err, userId)
    logError('spaces.memory.post.error', err, userId)
    return errorResponse('Failed to save memory', 'INTERNAL_ERROR', 500)
  }
}
