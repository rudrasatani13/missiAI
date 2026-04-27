import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KVStore } from '@/types'

const { checkAndIncrementAtomicCounterMock } = vi.hoisted(() => ({
  checkAndIncrementAtomicCounterMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: checkAndIncrementAtomicCounterMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn(),
}))

import { checkAndIncrementTgLinkAttempt } from '@/lib/bot/bot-auth'

function makeKV(initial: Record<string, string | null> = {}): KVStore {
  const store = new Map(Object.entries(initial).filter(([, value]) => value !== null) as Array<[string, string]>)
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

describe('bot-auth Telegram link attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkAndIncrementAtomicCounterMock.mockResolvedValue(null)
  })

  it('increments Telegram link attempts with a 24 hour TTL', async () => {
    const kv = makeKV()

    const result = await checkAndIncrementTgLinkAttempt(kv, 12345, '2026-04-27')

    expect(result).toEqual({ allowed: true, attempts: 1 })
    expect(kv.put).toHaveBeenCalledWith(
      'bot:tg:link-attempts:12345:2026-04-27',
      '1',
      { expirationTtl: 24 * 3600 },
    )
  })

  it('blocks Telegram link attempts after the daily limit', async () => {
    const kv = makeKV({ 'bot:tg:link-attempts:12345:2026-04-27': '10' })

    const result = await checkAndIncrementTgLinkAttempt(kv, 12345, '2026-04-27')

    expect(result).toEqual({ allowed: false, attempts: 10 })
    expect(kv.put).not.toHaveBeenCalled()
  })
})
