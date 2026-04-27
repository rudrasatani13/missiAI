import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/v1/admin/budget/backfill/route'

describe('POST /api/v1/admin/budget/backfill', () => {
  it('returns 410 after the legacy backfill path is removed', async () => {
    const res = await POST()
    const body = await res.json() as { success: boolean; error: string; code: string }

    expect(res.status).toBe(410)
    expect(body).toEqual({
      success: false,
      error: 'Budget legacy backfill has been removed after the v2 storage cutover',
      code: 'GONE',
    })
  })
})
