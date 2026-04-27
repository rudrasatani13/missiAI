import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'

vi.mock('@/lib/server/security/kv-crypto', () => ({
  encryptKVValue: vi.fn(async (plaintext: string) => `ENC:${plaintext}`),
  decryptKVValue: vi.fn(async (stored: string) =>
    stored.startsWith('ENC:') ? stored.slice(4) : null,
  ),
  encryptForKV: vi.fn(async (p: string) => p),
  decryptFromKV: vi.fn(async (s: string) => s),
}))

vi.mock('nanoid', () => {
  let counter = 0
  return {
    nanoid: vi.fn((size?: number) => {
      counter++
      const base = `id${counter.toString().padStart(4, '0')}abcdef`
      return base.slice(0, size ?? 12)
    }),
  }
})

import {
  createInvite,
  createSpace,
  peekInvite,
  verifyAndConsumeInvite,
} from '@/lib/spaces/space-store'

type KVBackingStore = Map<string, string>

function makeKV(): KVStore & { __store: KVBackingStore } {
  const store = new Map<string, string>()
  return {
    __store: store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  } as KVStore & { __store: KVBackingStore }
}

describe('space-store phase 7 legacy support removal', () => {
  let kv: KVStore & { __store: KVBackingStore }

  beforeEach(() => {
    kv = makeKV()
  })

  it('creates and consumes invites without writing legacy invite blobs', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Phase 7 Space',
      description: '',
      category: 'other',
      emoji: '✨',
    })

    const invite = await createInvite(
      kv,
      meta.spaceId,
      'owner',
      'test-secret-at-least-16-chars-long',
    )

    expect(await kv.get(`space:invite:${invite.token}`)).toBeNull()
    expect(await peekInvite(kv, invite.token)).toEqual(
      expect.objectContaining({ token: invite.token, spaceId: meta.spaceId }),
    )

    const consumed = await verifyAndConsumeInvite(kv, invite.token)
    expect(consumed?.token).toBe(invite.token)
    expect(await peekInvite(kv, invite.token)).toBeNull()
    expect(await kv.get(`space:invite:${invite.token}`)).toBeNull()
  })
})
