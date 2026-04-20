// ─── DELETE /api/v1/spaces/[spaceId]/memory/[nodeId] ─────────────────────────

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { logError, logRequest } from '@/lib/server/logger'
import {
  deleteNodeFromSpace,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'

export const runtime = 'edge'

const spaceIdSchema = z.string().min(8).max(32)
const nodeIdSchema = z.string().min(1).max(32)

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; nodeId: string }> },
) {
  const startTime = Date.now()
  const { spaceId: rawSpace, nodeId: rawNode } = await params

  const idCheck = spaceIdSchema.safeParse(rawSpace)
  if (!idCheck.success) return errorResponse('Invalid spaceId', 'VALIDATION_ERROR', 400)
  const nodeCheck = nodeIdSchema.safeParse(rawNode)
  if (!nodeCheck.success) return errorResponse('Invalid nodeId', 'VALIDATION_ERROR', 400)

  const spaceId = idCheck.data
  const nodeId = nodeCheck.data

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

  try {
    const ok = await deleteNodeFromSpace(kv, spaceId, nodeId, userId)
    if (!ok) {
      return errorResponse(
        'Memory not found or not authorized to delete',
        'NOT_FOUND_OR_FORBIDDEN',
        404,
      )
    }
    logRequest('spaces.memory.delete', userId, startTime, { spaceId, nodeId })
    return jsonResponse({ success: true, data: { deleted: nodeId } })
  } catch (err) {
    logError('spaces.memory.delete.error', err, userId)
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500)
  }
}
