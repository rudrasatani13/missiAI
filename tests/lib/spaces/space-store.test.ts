import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore } from '@/types'

// Passthrough crypto so tests don't depend on MISSI_KV_ENCRYPTION_SECRET or
// Web Crypto HKDF. We still exercise all the JSON round-trip logic.
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

const { checkAndIncrementAtomicCounterMock, decrementAtomicCounterMock } = vi.hoisted(() => ({
  checkAndIncrementAtomicCounterMock: vi.fn(),
  decrementAtomicCounterMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: checkAndIncrementAtomicCounterMock,
  decrementAtomicCounter: decrementAtomicCounterMock,
}))

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
  releaseSpaceQuotaReservation,
  registerInviteOnSpace,
  removeMemberFromSpace,
  reserveSpaceCreateQuota,
  reserveSpaceWriteQuota,
  verifyAndConsumeInvite,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  getSpaceMetaRecord,
  putSpaceInviteRecord,
  saveSpaceMetaRecord,
} from '@/lib/spaces/space-record-store'
import { checkAndIncrementAtomicCounter, decrementAtomicCounter } from '@/lib/server/platform/atomic-quota'
import { MAX_SPACE_MEMBERS, SPACE_CREATE_WEEKLY_LIMIT, SPACE_WRITE_DAILY_LIMIT } from '@/types/spaces'

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
  const mockCheckAndIncrementAtomicCounter = vi.mocked(checkAndIncrementAtomicCounter)
  const mockDecrementAtomicCounter = vi.mocked(decrementAtomicCounter)

  beforeEach(() => {
    kv = makeKV()
    mockCheckAndIncrementAtomicCounter.mockReset()
    mockCheckAndIncrementAtomicCounter.mockResolvedValue(null)
    mockDecrementAtomicCounter.mockReset()
    mockDecrementAtomicCounter.mockResolvedValue({ allowed: true, count: 0, remaining: 1 })
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

    await putSpaceInviteRecord(kv, {
      ...invite,
      expiresAt: Date.now() - 1000,
    }, {
      expirationTtl: 1,
    })

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

  it('getSpace derives member and invite state from record-backed storage', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'friend',
      role: 'member',
      displayName: 'Friend',
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    })
    const invite = await createInvite(
      kv,
      meta.spaceId,
      'owner',
      'test-secret-at-least-16-chars-long',
    )
    await registerInviteOnSpace(kv, meta.spaceId, invite.token)

    const storedMeta = await getSpaceMetaRecord(kv, meta.spaceId)
    expect(storedMeta).toBeTruthy()
    await saveSpaceMetaRecord(kv, {
      ...storedMeta!,
      memberCount: 0,
      activeInviteCount: 0,
    })

    const hydrated = await getSpace(kv, meta.spaceId)
    expect(hydrated?.memberCount).toBe(2)
    expect(hydrated?.activeInviteTokens).toEqual([invite.token])
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

  it('addNodeToSpace collapses same-title contention into one canonical node', async () => {
    vi.useFakeTimers()
    try {
      const meta = await createSpace(kv, 'owner', 'Owner', {
        name: 'S',
        description: '',
        category: 'friends',
        emoji: '🤝',
      })

      let releaseGate = () => {}
      const firstGate = new Promise<{ allowed: boolean; count: number; remaining: number }>((resolve) => {
        releaseGate = () => resolve({ allowed: true, count: 1, remaining: 0 })
      })

      mockCheckAndIncrementAtomicCounter
        .mockImplementationOnce(() => firstGate)
        .mockResolvedValueOnce({ allowed: false, count: 1, remaining: 0 })

      const nodeInput = {
        category: 'event' as const,
        title: 'Anniversary',
        detail: 'First version',
        tags: ['date'],
        people: ['us'],
        emotionalWeight: 0.8,
      }

      const firstAdd = addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', nodeInput)
      await Promise.resolve()
      const secondAdd = addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
        ...nodeInput,
        detail: 'Second version',
      })

      releaseGate()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(25)

      const [firstNode, secondNode] = await Promise.all([firstAdd, secondAdd])
      const graph = await getSpaceGraph(kv, meta.spaceId)

      expect(firstNode.id).toBe(secondNode.id)
      expect(graph.nodes).toHaveLength(1)
      expect(graph.nodes[0].detail).toContain('Second version')
    } finally {
      vi.useRealTimers()
    }
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

  it('reserveSpaceCreateQuota uses the atomic counter', async () => {
    mockCheckAndIncrementAtomicCounter.mockResolvedValueOnce({ allowed: true, count: 1, remaining: 4 })

    const reservation = await reserveSpaceCreateQuota('u', '2026-W17')

    expect(reservation).toEqual({
      allowed: true,
      remaining: 4,
      current: 1,
      counterName: 'ratelimit:space-create:u:2026-W17',
      limit: SPACE_CREATE_WEEKLY_LIMIT,
    })
    expect(mockCheckAndIncrementAtomicCounter).toHaveBeenCalledWith(
      'ratelimit:space-create:u:2026-W17',
      SPACE_CREATE_WEEKLY_LIMIT,
      691_200,
    )
  })

  it('reserveSpaceWriteQuota fails closed when the atomic counter is unavailable', async () => {
    mockCheckAndIncrementAtomicCounter.mockResolvedValueOnce(null)

    const reservation = await reserveSpaceWriteQuota('u')

    expect(reservation).toMatchObject({
      allowed: false,
      remaining: 0,
      current: 0,
      unavailable: true,
      limit: SPACE_WRITE_DAILY_LIMIT,
    })
  })

  it('releaseSpaceQuotaReservation decrements an allowed reservation', async () => {
    const reservation = {
      allowed: true,
      remaining: 49,
      current: 1,
      counterName: 'ratelimit:space-write:u:2026-04-20',
      limit: SPACE_WRITE_DAILY_LIMIT,
    }

    await expect(releaseSpaceQuotaReservation(reservation)).resolves.toBe(true)
    expect(mockDecrementAtomicCounter).toHaveBeenCalledWith(
      'ratelimit:space-write:u:2026-04-20',
      SPACE_WRITE_DAILY_LIMIT,
      1,
    )
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
