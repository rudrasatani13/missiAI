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

/**
 * Returns whether the caller holds admin access and **which mechanism** granted
 * it.  Use this in privileged mutation handlers to emit a structured audit log
 * so that break-glass `id_fallback` grants are always visible in Cloudflare
 * Logs.
 *
 * - `'role'`        — `publicMetadata.role === 'admin'` on the Clerk session.
 *                     This is the **production-stable path** and should be the
 *                     only grant reason seen in normal operation.
 * - `'id_fallback'` — `userId === process.env.ADMIN_USER_ID`.
 *                     This is the **bootstrap / break-glass path** for initial
 *                     deployment or account recovery.  A persistent stream of
 *                     `id_fallback` grants in production logs indicates that
 *                     the Clerk role metadata has not been configured.
 * - `null`          — access is denied.
 */
export type AdminGrantReason = 'role' | 'id_fallback' | null

export function getAdminGrantReason(
  authObject: Pick<AdminAuthLike, 'sessionClaims' | 'userId'>,
  explicitUserId?: string,
): AdminGrantReason {
  const role = getAdminRoleFromAuth(authObject)
  if (role === 'admin') return 'role'

  const userId = explicitUserId ?? authObject.userId ?? undefined
  if (!!process.env.ADMIN_USER_ID && userId === process.env.ADMIN_USER_ID) {
    return 'id_fallback'
  }

  return null
}

export function isAdminUser(
  authObject: Pick<AdminAuthLike, 'sessionClaims' | 'userId'>,
  explicitUserId?: string,
): boolean {
  return getAdminGrantReason(authObject, explicitUserId) !== null
}
