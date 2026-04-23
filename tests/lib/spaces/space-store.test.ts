import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'

// Passthrough crypto so tests don't depend on MISSI_KV_ENCRYPTION_SECRET or
// Web Crypto HKDF. We still exercise all the JSON round-trip logic.
vi.mock('@/lib/server/kv-crypto', () => ({
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
  addMemberToSpace,
  addNodeToSpace,
  createInvite,
  createSpace,
  deleteNodeFromSpace,
  dissolveSpace,
  getSpace,
  getSpaceGraph,
  getSpaceMembers,
  getSpaceWriteRateLimit,
  getUserSpaces,
  incrementSpaceWriteRateLimit,
  isSpaceWriteLimitExceeded,
  removeMemberFromSpace,
  verifyAndConsumeInvite,
  verifyMembership,
} from '@/lib/spaces/space-store'
import { MAX_SPACE_MEMBERS, SPACE_WRITE_DAILY_LIMIT } from '@/types/spaces'

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  } as KVStore
}

describe('space-store', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('createSpace persists metadata, members, empty graph, and indexes owner', async () => {
    const meta = await createSpace(kv, 'user_owner', 'Owner', {
      name: 'Test Space',
      description: 'desc',
      category: 'family',
      emoji: '🏡',
    })

    expect(meta.ownerUserId).toBe('user_owner')
    expect(meta.memberCount).toBe(1)
    expect(meta.activeInviteTokens).toEqual([])

    const fetched = await getSpace(kv, meta.spaceId)
    expect(fetched?.name).toBe('Test Space')

    const members = await getSpaceMembers(kv, meta.spaceId)
    expect(members).toHaveLength(1)
    expect(members[0].role).toBe('owner')

    const graph = await getSpaceGraph(kv, meta.spaceId)
    expect(graph.nodes).toEqual([])

    const index = await getUserSpaces(kv, 'user_owner')
    expect(index).toContain(meta.spaceId)
  })

  it('verifyMembership returns null for non-member', async () => {
    const meta = await createSpace(kv, 'user_a', 'A', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    const m = await verifyMembership(kv, meta.spaceId, 'user_b')
    expect(m).toBeNull()
  })

  it('addMemberToSpace returns false when Space is full (10 members)', async () => {
    const meta = await createSpace(kv, 'owner', 'O', {
      name: 'Full',
      description: '',
      category: 'friends',
      emoji: '🤝',
    })
    // Fill up to the cap (already 1 owner, so add 9 more).
    for (let i = 1; i < MAX_SPACE_MEMBERS; i++) {
      const ok = await addMemberToSpace(kv, meta.spaceId, {
        userId: `user_${i}`,
        role: 'member',
        displayName: `U${i}`,
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
      })
      expect(ok).toBe(true)
    }

    const overflow = await addMemberToSpace(kv, meta.spaceId, {
      userId: 'user_overflow',
      role: 'member',
      displayName: 'X',
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    })
    expect(overflow).toBe(false)
  })

  it('verifyAndConsumeInvite returns null for expired invite', async () => {
    const meta = await createSpace(kv, 'owner', 'O', {
      name: 'S',
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

    // Backdate the invite record to simulate expiry. We overwrite directly
    // through the store to bypass re-encryption time.
    const key = `space:invite:${invite.token}`
    const raw = await kv.get(key)
    expect(raw).not.toBeNull()
    const decoded = JSON.parse(raw!.slice(4)) as {
      expiresAt: number
    }
    decoded.expiresAt = Date.now() - 1000
    await kv.put(key, `ENC:${JSON.stringify(decoded)}`)

    const out = await verifyAndConsumeInvite(kv, invite.token)
    expect(out).toBeNull()
  })

  it('verifyAndConsumeInvite deletes token after consumption (single-use)', async () => {
    const meta = await createSpace(kv, 'owner', 'O', {
      name: 'S',
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

    const first = await verifyAndConsumeInvite(kv, invite.token)
    expect(first?.token).toBe(invite.token)

    const second = await verifyAndConsumeInvite(kv, invite.token)
    expect(second).toBeNull()
  })

  it('removeMemberFromSpace dissolves when last member leaves', async () => {
    const meta = await createSpace(kv, 'solo', 'Solo', {
      name: 'Solo',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    const res = await removeMemberFromSpace(kv, meta.spaceId, 'solo', 'solo')
    expect(res.dissolved).toBe(true)
    expect(await getSpace(kv, meta.spaceId)).toBeNull()
    expect(await getUserSpaces(kv, 'solo')).not.toContain(meta.spaceId)
  })

  it('removeMemberFromSpace transfers ownership when owner leaves', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    // Add a second member with a later joinedAt.
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'second',
      role: 'member',
      displayName: 'Second',
      joinedAt: Date.now() + 1000,
      lastActiveAt: Date.now(),
    })

    const res = await removeMemberFromSpace(kv, meta.spaceId, 'owner', 'owner')
    expect(res.dissolved).toBe(false)

    const meta2 = await getSpace(kv, meta.spaceId)
    expect(meta2?.ownerUserId).toBe('second')

    const members = await getSpaceMembers(kv, meta.spaceId)
    const surviving = members.find((m) => m.userId === 'second')
    expect(surviving?.role).toBe('owner')
  })

  it('addNodeToSpace sets contributorId correctly', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'couple',
      emoji: '💞',
    })
    const node = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Anniversary',
      detail: 'Aug 15',
      tags: ['date'],
      people: ['us'],
      emotionalWeight: 0.9,
    })
    expect(node.contributorId).toBe('owner')
    expect(node.contributorDisplayName).toBe('Owner')
    expect(node.spaceId).toBe(meta.spaceId)
    expect(node.visibility).toBe('space')
  })

  it('deleteNodeFromSpace fails for non-contributor non-owner', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'friends',
      emoji: '🤝',
    })
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'alice',
      role: 'member',
      displayName: 'Alice',
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    })
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'bob',
      role: 'member',
      displayName: 'Bob',
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    })

    const node = await addNodeToSpace(kv, meta.spaceId, 'alice', 'Alice', {
      category: 'goal',
      title: 'Book club',
      detail: 'Every Thursday',
      tags: [],
      people: [],
      emotionalWeight: 0.5,
    })

    const ok = await deleteNodeFromSpace(kv, meta.spaceId, node.id, 'bob')
    expect(ok).toBe(false)

    const graph = await getSpaceGraph(kv, meta.spaceId)
    expect(graph.nodes.find((n) => n.id === node.id)).toBeTruthy()

    // Contributor CAN delete their own.
    const ownOk = await deleteNodeFromSpace(kv, meta.spaceId, node.id, 'alice')
    expect(ownOk).toBe(true)
  })

  it('getSpaceWriteRateLimit enforces 50/day cap', async () => {
    expect(await getSpaceWriteRateLimit(kv, 'u')).toBe(0)
    for (let i = 0; i < SPACE_WRITE_DAILY_LIMIT; i++) {
      await incrementSpaceWriteRateLimit(kv, 'u')
    }
    expect(await getSpaceWriteRateLimit(kv, 'u')).toBe(SPACE_WRITE_DAILY_LIMIT)
  })

  it('isSpaceWriteLimitExceeded returns true when count is at or above the daily limit', () => {
    expect(isSpaceWriteLimitExceeded(0)).toBe(false)
    expect(isSpaceWriteLimitExceeded(SPACE_WRITE_DAILY_LIMIT - 1)).toBe(false)
    expect(isSpaceWriteLimitExceeded(SPACE_WRITE_DAILY_LIMIT)).toBe(true)
    expect(isSpaceWriteLimitExceeded(SPACE_WRITE_DAILY_LIMIT + 1)).toBe(true)
  })

  it('dissolveSpace removes all space keys', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    await dissolveSpace(kv, meta.spaceId, ['owner'])
    expect(await getSpace(kv, meta.spaceId)).toBeNull()
    expect(await getSpaceMembers(kv, meta.spaceId)).toEqual([])
    expect(await getUserSpaces(kv, 'owner')).not.toContain(meta.spaceId)
  })
})
