// ─── POST /api/v1/spaces/join — consume invite and join Space ────────────────

import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/security/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { canAccessSpaces, proRequiredResponse } from '@/lib/spaces/plan-gate'
import {
  addMemberToSpace,
  getSpace,
  getSpaceMembers,
  unregisterInviteFromSpace,
  verifyAndConsumeInvite,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  fetchDisplayName,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { MAX_SPACE_MEMBERS } from '@/types/spaces'
import type { SpaceMember } from '@/types/spaces'

const joinSchema = z.object({ token: z.string().min(1).max(30) })

// Generic client-facing message used for all invalid / expired / consumed
// tokens so we do not leak whether a given Space exists.
const INVITE_ERROR =
  'Invalid or expired invite. Please ask for a new one.'

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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 'VALIDATION_ERROR', 400)
  }

  const parsed = joinSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  let consumedInvite: { spaceId: string; token: string } | null = null
  try {
    // Single-use: token is consumed (KV deleted) before we return.
    const invite = await verifyAndConsumeInvite(kv, parsed.data.token)
    if (!invite) {
      return errorResponse(INVITE_ERROR, 'INVITE_INVALID', 400)
    }
    consumedInvite = { spaceId: invite.spaceId, token: invite.token }

    const spaceId = invite.spaceId
    const [space, members] = await Promise.all([
      getSpace(kv, spaceId),
      getSpaceMembers(kv, spaceId),
    ])
    if (!space) {
      return errorResponse(INVITE_ERROR, 'INVITE_INVALID', 400)
    }

    // Idempotent: already a member → return success without mutating.
    if (members.some((m) => m.userId === userId)) {
      await unregisterInviteFromSpace(kv, spaceId, invite.token).catch(() => {})
      consumedInvite = null
      const updatedSpace = await getSpace(kv, spaceId)
      return jsonResponse({
        success: true,
        data: {
          space: updatedSpace ?? space,
          message: `You're already a member of ${space.name}.`,
        },
      })
    }

    if (members.length >= MAX_SPACE_MEMBERS) {
      return errorResponse('This Space is full', 'SPACE_FULL', 400)
    }

    const now = Date.now()
    const newMember: SpaceMember = {
      userId,
      role: 'member',
      displayName: await fetchDisplayName(userId),
      joinedAt: now,
      lastActiveAt: now,
    }

    const added = await addMemberToSpace(kv, spaceId, newMember)
    if (!added) {
      return errorResponse('This Space is full', 'SPACE_FULL', 400)
    }

    await unregisterInviteFromSpace(kv, spaceId, invite.token).catch(() => {})
    consumedInvite = null
    const updatedSpace = await getSpace(kv, spaceId)

    logRequest('spaces.join', userId, startTime, { spaceId })
    return jsonResponse({
      success: true,
      data: {
        space: updatedSpace ?? space,
        message: `You've joined ${space.name}!`,
      },
    })
  } catch (err) {
    logError('spaces.join.error', err, userId)
    return errorResponse('Failed to join Space', 'INTERNAL_ERROR', 500)
  } finally {
    if (consumedInvite) {
      await unregisterInviteFromSpace(
        kv,
        consumedInvite.spaceId,
        consumedInvite.token,
      ).catch(() => {})
    }
  }
}
