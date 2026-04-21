// ─── POST /api/v1/spaces/[spaceId]/memory/share ──────────────────────────────
//
// Copy a personal LifeNode into the Space graph. The personal node is NOT
// modified in any way — this is a one-way copy. After sharing, the two
// records are fully independent.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError, logRequest } from '@/lib/server/logger'
import { getLifeGraph } from '@/lib/memory/life-graph'
import {
  addNodeToSpace,
  getSpaceWriteRateLimit,
  incrementSpaceWriteRateLimit,
  isSpaceWriteLimitExceeded,
  updateLastActive,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'

const spaceIdSchema = z.string().min(8).max(32)
const shareSchema = z.object({
  personalNodeId: z.string().min(1).max(20),
})

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

  const writeCount = await getSpaceWriteRateLimit(kv, userId)
  if (isSpaceWriteLimitExceeded(writeCount)) {
    return errorResponse(
      'Daily Space write limit reached. Try again tomorrow.',
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

  const parsed = shareSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  try {
    // Read the USER's OWN personal graph. Any userId mismatch is impossible
    // here because `getLifeGraph` takes userId from `getVerifiedUserId()`.
    const personalGraph = await getLifeGraph(kv, userId)
    const source = personalGraph.nodes.find((n) => n.id === parsed.data.personalNodeId)
    if (!source) {
      return errorResponse('Personal memory not found', 'NOT_FOUND', 404)
    }

    // Build a sanitized Space-node input from the personal node. We do NOT
    // copy the personal node's id or internal timestamps — addNodeToSpace
    // generates a fresh id so the Space copy is an independent record.
    const shared = await addNodeToSpace(kv, spaceId, userId, member.displayName, {
      category: source.category,
      title: sanitizeMemories(source.title).slice(0, 80),
      detail: sanitizeMemories(source.detail).slice(0, 500),
      tags: source.tags
        .map((t) => sanitizeMemories(t).slice(0, 30))
        .filter((t) => t.length > 0)
        .slice(0, 8),
      people: source.people
        .map((p) => sanitizeMemories(p).slice(0, 50))
        .filter((p) => p.length > 0)
        .slice(0, 10),
      emotionalWeight: source.emotionalWeight,
    })

    incrementSpaceWriteRateLimit(kv, userId).catch(() => {})
    updateLastActive(kv, spaceId, userId).catch(() => {})

    logRequest('spaces.memory.share', userId, startTime, {
      spaceId,
      sourceId: source.id,
      sharedId: shared.id,
    })

    return jsonResponse({ success: true, data: shared })
  } catch (err) {
    logError('spaces.memory.share.error', err, userId)
    return errorResponse('Failed to share memory', 'INTERNAL_ERROR', 500)
  }
}
