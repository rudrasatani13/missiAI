import { afterEach, describe, expect, it } from 'vitest'
import { getAdminRoleFromAuth, isAdminUser } from '@/lib/server/security/admin-auth'

describe('admin-auth helper', () => {
  const originalAdminUserId = process.env.ADMIN_USER_ID

  afterEach(() => {
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId
    }
  })

  it('extracts the admin role from Clerk session claims when present', () => {
    expect(getAdminRoleFromAuth({ sessionClaims: { metadata: { role: 'admin' } } })).toBe('admin')
  })

  it('returns undefined for missing or malformed metadata', () => {
    expect(getAdminRoleFromAuth({ sessionClaims: undefined })).toBeUndefined()
    expect(getAdminRoleFromAuth({ sessionClaims: { metadata: 'admin' } })).toBeUndefined()
    expect(getAdminRoleFromAuth({ sessionClaims: { metadata: { role: 123 } } })).toBeUndefined()
  })

  it('treats an admin role as admin access', () => {
    expect(isAdminUser({ sessionClaims: { metadata: { role: 'admin' } }, userId: 'user_1' })).toBe(true)
  })

  it('allows ADMIN_USER_ID fallback when explicit userId matches', () => {
    process.env.ADMIN_USER_ID = 'super_admin'

    expect(isAdminUser({ sessionClaims: { metadata: { role: 'user' } }, userId: 'someone_else' }, 'super_admin')).toBe(true)
  })

  it('does not grant admin access for malformed metadata without fallback', () => {
    delete process.env.ADMIN_USER_ID

    expect(isAdminUser({ sessionClaims: { metadata: { role: ['admin'] } }, userId: 'user_1' })).toBe(false)
  })
})
