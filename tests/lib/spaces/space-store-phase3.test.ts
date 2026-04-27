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
  addMemberToSpace,
  addNodeToSpace,
  createSpace,
  getSpace,
  getSpaceGraph,
  getSpaceMembers,
  getUserSpaces,
  peekInvite,
  verifyAndConsumeInvite,
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  deleteSpaceGraphMetaRecord,
  deleteSpaceMemberRecord,
  deleteSpaceMetaRecord,
  deleteSpaceNodeRecord,
  deleteSpaceNodeTitleIndex,
  deleteUserSpaceLink,
  putSpaceInviteRecord,
} from '@/lib/spaces/space-record-store'

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

function enc(value: unknown): string {
  return `ENC:${JSON.stringify(value)}`
}

describe('space-store phase 3 dual-read', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('prefers v2 reads over conflicting legacy blobs', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'V2 Space',
      description: 'Correct value',
      category: 'family',
      emoji: '🏡',
    })
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'second',
      role: 'member',
      displayName: 'Second',
      joinedAt: 200,
      lastActiveAt: 200,
    })
    const node = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Anniversary',
      detail: 'Dinner reservation',
      tags: ['date'],
      people: ['us'],
      emotionalWeight: 0.8,
    })

    await kv.put(
      `space:meta:${meta.spaceId}`,
      enc({
        ...meta,
        name: 'Legacy Wrong',
        description: 'Legacy wrong',
        memberCount: 1,
        activeInviteTokens: ['legacy-token'],
      }),
    )
    await kv.put(
      `space:members:${meta.spaceId}`,
      enc([
        {
          userId: 'owner',
          role: 'owner',
          displayName: 'Owner',
          joinedAt: 100,
          lastActiveAt: 100,
        },
      ]),
    )
    await kv.put(`space:index:owner`, enc([]))
    await kv.put(
      `space:graph:${meta.spaceId}`,
      enc({ nodes: [], totalInteractions: 99, lastUpdatedAt: 1, version: 1 }),
    )

    const readMeta = await getSpace(kv, meta.spaceId)
    expect(readMeta?.name).toBe('V2 Space')
    expect(readMeta?.description).toBe('Correct value')

    const members = await getSpaceMembers(kv, meta.spaceId)
    expect(members.map((member) => member.userId).sort()).toEqual(['owner', 'second'])

    expect(await verifyMembership(kv, meta.spaceId, 'second')).toEqual(
      expect.objectContaining({ userId: 'second' }),
    )
    expect(await getUserSpaces(kv, 'owner')).toContain(meta.spaceId)

    const graph = await getSpaceGraph(kv, meta.spaceId)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].id).toBe(node.id)
  })

  it('does not fall back to legacy members and graph when v2 data is incomplete', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Fallback Space',
      description: '',
      category: 'friends',
      emoji: '🤝',
    })
    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'second',
      role: 'member',
      displayName: 'Second',
      joinedAt: 200,
      lastActiveAt: 200,
    })
    const node = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'goal',
      title: 'Book Club',
      detail: 'Every Thursday',
      tags: ['books'],
      people: ['team'],
      emotionalWeight: 0.6,
    })

    await deleteSpaceMemberRecord(kv, meta.spaceId, 'second')
    await deleteSpaceNodeRecord(kv, meta.spaceId, node.id)
    await deleteSpaceNodeTitleIndex(kv, meta.spaceId, 'book club')

    const members = await getSpaceMembers(kv, meta.spaceId)
    expect(members.map((member) => member.userId)).toEqual(['owner'])
    expect(await verifyMembership(kv, meta.spaceId, 'second')).toBeNull()

    const graph = await getSpaceGraph(kv, meta.spaceId)
    expect(graph.nodes).toEqual([])
  })

  it('does not fall back to legacy metadata, members, user links, or graph when v2 is absent', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Legacy Fallback',
      description: 'Still readable',
      category: 'other',
      emoji: '✨',
    })
    const node = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Trip Plan',
      detail: 'Goa',
      tags: ['trip'],
      people: ['team'],
      emotionalWeight: 0.8,
    })

    await deleteSpaceMetaRecord(kv, meta.spaceId)
    await deleteSpaceMemberRecord(kv, meta.spaceId, 'owner')
    await deleteUserSpaceLink(kv, 'owner', meta.spaceId)
    await deleteSpaceGraphMetaRecord(kv, meta.spaceId)
    await deleteSpaceNodeRecord(kv, meta.spaceId, node.id)
    await deleteSpaceNodeTitleIndex(kv, meta.spaceId, 'trip plan')

    const readMeta = await getSpace(kv, meta.spaceId)
    expect(readMeta).toBeNull()
    expect(await getUserSpaces(kv, 'owner')).toEqual([])
    expect(await getSpaceMembers(kv, meta.spaceId)).toEqual([])
    expect(await verifyMembership(kv, meta.spaceId, 'owner')).toBeNull()

    const graph = await getSpaceGraph(kv, meta.spaceId)
    expect(graph).toEqual({
      nodes: [],
      totalInteractions: 0,
      lastUpdatedAt: 0,
      version: 1,
    })
  })

  it('reads only v2 invite records and preserves single-use semantics', async () => {
    const now = Date.now()
    await putSpaceInviteRecord(kv, {
      token: 'invite_v2',
      spaceId: 'space_v2',
      inviterUserId: 'owner',
      createdAt: now,
      expiresAt: now + 60_000,
      used: false,
    })
    await kv.put(
      'space:invite:invite_v2',
      enc({
        token: 'invite_v2',
        spaceId: 'legacy_space',
        inviterUserId: 'owner',
        createdAt: now,
        expiresAt: now + 60_000,
        used: false,
      }),
    )

    const peeked = await peekInvite(kv, 'invite_v2')
    expect(peeked?.spaceId).toBe('space_v2')

    const consumed = await verifyAndConsumeInvite(kv, 'invite_v2')
    expect(consumed?.spaceId).toBe('space_v2')
    expect(await peekInvite(kv, 'invite_v2')).toBeNull()
    expect(await kv.get('space:invite:invite_v2')).not.toBeNull()

    await kv.put(
      'space:invite:legacy_only',
      enc({
        token: 'legacy_only',
        spaceId: 'legacy_space',
        inviterUserId: 'owner',
        createdAt: now,
        expiresAt: now + 60_000,
        used: false,
      }),
    )
    expect(await peekInvite(kv, 'legacy_only')).toBeNull()
    expect(await verifyAndConsumeInvite(kv, 'legacy_only')).toBeNull()
  })
})
