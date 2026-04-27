import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { AuthenticationError, getVerifiedUserId } from '@/lib/server/security/auth'
import { isAdminUser } from '@/lib/server/security/admin-auth'
import {
  errorResponse,
} from '@/lib/spaces/space-api-helpers'

export async function POST(req: NextRequest) {
  void req

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse('Unauthorized', 'UNAUTHORIZED', 401)
    }
    throw error
  }

  const clerkAuth = await auth()
  const isAdmin = isAdminUser(clerkAuth, userId)
  if (!isAdmin) {
    return errorResponse('Forbidden', 'FORBIDDEN', 403)
  }

  return errorResponse(
    'Legacy Spaces backfill is no longer available',
    'GONE',
    410,
  )
}
