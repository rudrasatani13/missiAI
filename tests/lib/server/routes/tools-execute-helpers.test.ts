import { describe, expect, it, vi } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({ env: {}, ctx: {}, cf: {} })),
}))

vi.mock('@/lib/server/platform/env', () => ({
  getEnv: vi.fn(() => ({
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    RESEND_API_KEY: undefined,
  })),
}))

import { validateLiveToolName } from '@/lib/server/routes/tools/execute-helpers'

describe('validateLiveToolName', () => {
  it('blocks destructive tools on the live execute surface', async () => {
    const result = validateLiveToolName('sendEmail')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('blocked')
      expect(result.response.status).toBe(400)
      await expect(result.response.json()).resolves.toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
        error: expect.stringContaining('requires agent confirmation'),
      })
    }
  })

  it('treats tools not allowed on live execute as unknown even if allowlisted by caller', async () => {
    const result = validateLiveToolName('sendEmail', new Set(['sendEmail']))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('blocked')
      expect(result.response.status).toBe(400)
    }
  })
})
