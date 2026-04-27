import { NextRequest } from 'next/server'
import { logError } from '@/lib/server/observability/logger'
import { getAuthenticatedProfileCardUserId } from '@/lib/server/routes/profile-card/helpers'
import { runProfileCardGetRoute } from '@/lib/server/routes/profile-card/runner'

export async function GET(req: NextRequest) {
  let authResult
  try {
    authResult = await getAuthenticatedProfileCardUserId()
  } catch (error) {
    logError('profile.card.auth_error', error)
    throw error
  }

  if (!authResult.ok) {
    return authResult.response
  }

  return runProfileCardGetRoute(req, authResult.userId)
}
