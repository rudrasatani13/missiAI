// ─── DELETE /api/v1/spaces/[spaceId]/members/[memberId] ──────────────────────

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/security/auth'
import { logError, logRequest } from '@/lib/server/observability/logger'
import {
  removeMemberFromSpace,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'

const spaceIdSchema = z.string().min(8).max(32)
const memberIdSchema = z.string().min(4).max(64)

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; memberId: string }> },
) {
  const startTime = Date.now()
  const { spaceId: rawSpace, memberId: rawMember } = await params

  const idCheck = spaceIdSchema.safeParse(rawSpace)
  if (!idCheck.success) return errorResponse('Invalid spaceId', 'VALIDATION_ERROR', 400)
  const memberCheck = memberIdSchema.safeParse(rawMember)
  if (!memberCheck.success) return errorResponse('Invalid memberId', 'VALIDATION_ERROR', 400)

  const spaceId = idCheck.data
  const memberId = memberCheck.data

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return errorResponse('Storage unavailable', 'SERVICE_UNAVAILABLE', 503)

  const me = await verifyMembership(kv, spaceId, userId)
  if (!me) return errorResponse('Not a member of this Space', 'FORBIDDEN', 403)

  // Non-owners can only remove themselves.
  if (memberId !== userId && me.role !== 'owner') {
    return errorResponse(
      'Only the owner can remove other members',
      'FORBIDDEN',
      403,
    )
  }

  try {
    const result = await removeMemberFromSpace(kv, spaceId, memberId, userId)
    if (!result.removed) {
      return errorResponse('Member not found', 'NOT_FOUND', 404)
    }

    logRequest('spaces.member.remove', userId, startTime, {
      spaceId,
      memberId,
      dissolved: result.dissolved,
    })

    return jsonResponse({
      success: true,
      data: {
        dissolved: result.dissolved,
        message: result.dissolved
          ? 'Space dissolved — you were the last member.'
          : 'Left successfully.',
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') {
      return errorResponse('Unauthorized', 'FORBIDDEN', 403)
    }
    logError('spaces.member.remove.error', err, userId)
    return errorResponse('Failed to remove member', 'INTERNAL_ERROR', 500)
  }
}
