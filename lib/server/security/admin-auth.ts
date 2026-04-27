interface SessionClaimsShape {
  metadata?: unknown
}

interface MetadataShape {
  role?: unknown
}

interface AdminAuthLike {
  sessionClaims?: unknown
  userId?: string | null
}

function getMetadataRole(sessionClaims: unknown): string | undefined {
  if (!sessionClaims || typeof sessionClaims !== 'object') return undefined

  const claims = sessionClaims as SessionClaimsShape
  const metadata = claims.metadata
  if (!metadata || typeof metadata !== 'object') return undefined

  const role = (metadata as MetadataShape).role
  return typeof role === 'string' ? role : undefined
}

export function getAdminRoleFromAuth(authObject: Pick<AdminAuthLike, 'sessionClaims'>): string | undefined {
  return getMetadataRole(authObject.sessionClaims)
}

export function isAdminUser(
  authObject: Pick<AdminAuthLike, 'sessionClaims' | 'userId'>,
  explicitUserId?: string,
): boolean {
  const role = getAdminRoleFromAuth(authObject)
  if (role === 'admin') return true

  const userId = explicitUserId ?? authObject.userId ?? undefined
  return !!process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID
}
