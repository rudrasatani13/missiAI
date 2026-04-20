// ─── /api/v1/spaces/[spaceId] — GET details, PATCH meta (owner), DELETE dissolve (owner) ───

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError, logRequest } from '@/lib/server/logger'
import {
  dissolveSpace,
  getSpace,
  getSpaceMembers,
  updateSpaceMeta,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'

const spaceIdSchema = z.string().min(8).max(32)

const patchSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  emoji: z.string().min(1).max(8).optional(),
})

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
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

  try {
    const member = await verifyMembership(kv, spaceId, userId)
    if (!member) return errorResponse('Not a member of this Space', 'FORBIDDEN', 403)

    const [space, members] = await Promise.all([
      getSpace(kv, spaceId),
      getSpaceMembers(kv, spaceId),
    ])
    if (!space) return errorResponse('Space not found', 'NOT_FOUND', 404)

    logRequest('spaces.get', userId, startTime, { spaceId })
    return jsonResponse({
      success: true,
      data: { space, members, userRole: member.role },
    })
  } catch (err) {
    logError('spaces.get.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ─── PATCH (owner only) ──────────────────────────────────────────────────────

export async function PATCH(
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
  if (member.role !== 'owner') {
    return errorResponse('Only the owner can edit this Space', 'FORBIDDEN', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 'VALIDATION_ERROR', 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const updates: {
    name?: string
    description?: string
    emoji?: string
  } = {}
  if (parsed.data.name !== undefined) {
    const n = sanitizeMemories(parsed.data.name).slice(0, 50).trim()
    if (n.length < 2) return errorResponse('Name too short', 'VALIDATION_ERROR', 400)
    updates.name = n
  }
  if (parsed.data.description !== undefined) {
    updates.description = sanitizeMemories(parsed.data.description).slice(0, 200).trim()
  }
  if (parsed.data.emoji !== undefined) updates.emoji = parsed.data.emoji

  try {
    const updated = await updateSpaceMeta(kv, spaceId, updates)
    if (!updated) return errorResponse('Space not found', 'NOT_FOUND', 404)

    logRequest('spaces.patch', userId, startTime, { spaceId })
    return jsonResponse({ success: true, data: updated })
  } catch (err) {
    logError('spaces.patch.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}

// ─── DELETE (owner only — dissolve) ──────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
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
  if (member.role !== 'owner') {
    return errorResponse('Only the owner can dissolve this Space', 'FORBIDDEN', 403)
  }

  try {
    const members = await getSpaceMembers(kv, spaceId)
    await dissolveSpace(kv, spaceId, members.map((m) => m.userId))
    logRequest('spaces.dissolve', userId, startTime, { spaceId })
    return jsonResponse({ success: true, data: { dissolved: true } })
  } catch (err) {
    logError('spaces.dissolve.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}
