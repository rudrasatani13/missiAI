// ─── /api/v1/spaces/[spaceId]/invite — POST create  |  DELETE revoke ─────────

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
  createInvite,
  getSpace,
  registerInviteOnSpace,
  unregisterInviteFromSpace,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  errorResponse,
  getKV,
  jsonResponse,
} from '@/lib/spaces/space-api-helpers'
import { getEnv } from '@/lib/server/env'
import { MAX_ACTIVE_INVITES } from '@/types/spaces'

export const runtime = 'edge'

const spaceIdSchema = z.string().min(8).max(32)
const tokenSchema = z.string().min(4).max(32)

function buildInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://missi.space'
  return `${base.replace(/\/+$/, '')}/join/${token}`
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
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

  const planId = await getUserPlan(userId)
  if (!canAccessSpaces(planId)) return proRequiredResponse()

  const member = await verifyMembership(kv, spaceId, userId)
  if (!member) return errorResponse('Not a member of this Space', 'FORBIDDEN', 403)

  const space = await getSpace(kv, spaceId)
  if (!space) return errorResponse('Space not found', 'NOT_FOUND', 404)

  if ((space.activeInviteTokens?.length ?? 0) >= MAX_ACTIVE_INVITES) {
    return errorResponse(
      'This Space already has the maximum number of active invites',
      'INVITE_LIMIT',
      400,
    )
  }

  const env = getEnv()
  const secret = env.MISSI_KV_ENCRYPTION_SECRET
  if (!secret) {
    return errorResponse('Service misconfigured', 'SERVICE_UNAVAILABLE', 503)
  }

  try {
    const invite = await createInvite(kv, spaceId, userId, secret)
    const registered = await registerInviteOnSpace(kv, spaceId, invite.token)
    if (!registered) {
      // Rare race — try to clean up the orphan invite record.
      kv.delete(`space:invite:${invite.token}`).catch(() => {})
      return errorResponse(
        'This Space already has the maximum number of active invites',
        'INVITE_LIMIT',
        400,
      )
    }

    logRequest('spaces.invite.create', userId, startTime, { spaceId })
    return jsonResponse({
      success: true,
      data: {
        token: invite.token,
        inviteUrl: buildInviteUrl(invite.token),
        expiresAt: invite.expiresAt,
      },
    })
  } catch (err) {
    logError('spaces.invite.create.error', err, userId)
    return errorResponse('Failed to create invite', 'INTERNAL_ERROR', 500)
  }
}

// ─── DELETE (owner revokes) ──────────────────────────────────────────────────

const deleteSchema = z.object({ token: tokenSchema })

export async function DELETE(
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
    return errorResponse('Only the owner can revoke invites', 'FORBIDDEN', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 'VALIDATION_ERROR', 400)
  }

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)
  const token = parsed.data.token

  try {
    await Promise.all([
      unregisterInviteFromSpace(kv, spaceId, token),
      kv.delete(`space:invite:${token}`).catch(() => {}),
    ])
    logRequest('spaces.invite.revoke', userId, startTime, { spaceId })
    return jsonResponse({ success: true, data: { revoked: true } })
  } catch (err) {
    logError('spaces.invite.revoke.error', err, userId)
    return errorResponse('Failed to revoke invite', 'INTERNAL_ERROR', 500)
  }
}
