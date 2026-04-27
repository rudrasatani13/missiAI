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
  verifyMembership,
} from '@/lib/spaces/space-store'
import {
  deleteSpaceGraphMetaRecord,
  deleteSpaceMemberRecord,
  deleteSpaceMetaRecord,
  deleteSpaceNodeRecord,
  deleteSpaceNodeTitleIndex,
  deleteUserSpaceLink,
  putSpaceMemberRecord,
  putSpaceNodeRecord,
  putUserSpaceLink,
  saveSpaceGraphMetaRecord,
  saveSpaceMetaRecord,
} from '@/lib/spaces/space-record-store'
import type { LifeGraph } from '@/types/memory'
import type { SharedMemoryNode, SpaceMember, SpaceMetadata } from '@/types/spaces'

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

async function seedLegacySpace(
  kv: KVStore,
  meta: SpaceMetadata,
  members: SpaceMember[],
  graph: LifeGraph,
): Promise<void> {
  await kv.put(`space:meta:${meta.spaceId}`, enc(meta))
  await kv.put(`space:members:${meta.spaceId}`, enc(members))
  await kv.put(`space:graph:${meta.spaceId}`, enc(graph))
  await Promise.all(
    [...new Set(members.map((member) => member.userId))].map((userId) =>
      kv.put(`space:index:${userId}`, enc([meta.spaceId])),
    ),
  )
}

describe('space-store phase 6 v2-only cutover', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('does not write legacy meta, members, graph, or user-index blobs for live mutations', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Phase 6 Space',
      description: '',
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
    await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Anniversary',
      detail: 'Dinner reservation',
      tags: ['date'],
      people: ['us'],
      emotionalWeight: 0.8,
    })

    expect(await kv.get(`space:meta:${meta.spaceId}`)).toBeNull()
    expect(await kv.get(`space:members:${meta.spaceId}`)).toBeNull()
    expect(await kv.get(`space:graph:${meta.spaceId}`)).toBeNull()
    expect(await kv.get('space:index:owner')).toBeNull()
    expect(await kv.get('space:index:second')).toBeNull()

    expect(await getSpace(kv, meta.spaceId)).toEqual(
      expect.objectContaining({ name: 'Phase 6 Space', ownerUserId: 'owner' }),
    )
    expect((await getSpaceMembers(kv, meta.spaceId)).map((member) => member.userId).sort()).toEqual([
      'owner',
      'second',
    ])
    expect(await getUserSpaces(kv, 'owner')).toEqual([meta.spaceId])
    expect(await getUserSpaces(kv, 'second')).toEqual([meta.spaceId])
    expect((await getSpaceGraph(kv, meta.spaceId)).nodes).toHaveLength(1)
  })

  it('reads a backfilled Space from v2 only after legacy blobs are removed', async () => {
    const now = Date.now()
    const spaceId = 'legacyspace620'
    const meta: SpaceMetadata = {
      spaceId,
      name: 'Backfilled Read',
      description: 'Migrated',
      category: 'other',
      emoji: '✨',
      createdAt: now,
      ownerUserId: 'owner',
      memberCount: 1,
      activeInviteTokens: [],
    }
    const members: SpaceMember[] = [
      {
        userId: 'owner',
        role: 'owner',
        displayName: 'Owner',
        joinedAt: now,
        lastActiveAt: now,
      },
    ]
    const node: SharedMemoryNode = {
      id: 'legacy_node',
      userId: 'owner',
      category: 'goal',
      title: 'Trip Plan',
      detail: 'Goa',
      tags: ['trip'],
      people: ['team'],
      emotionalWeight: 0.8,
      confidence: 0.9,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: 0,
      source: 'explicit',
      spaceId,
      contributorId: 'owner',
      contributorDisplayName: 'Owner',
      visibility: 'space',
    }

    await seedLegacySpace(kv, meta, members, {
      nodes: [node],
      totalInteractions: 4,
      lastUpdatedAt: now,
      version: 1,
    })
    await saveSpaceMetaRecord(kv, {
      spaceId,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      emoji: meta.emoji,
      createdAt: meta.createdAt,
      ownerUserId: meta.ownerUserId,
      memberCount: 1,
      activeInviteCount: 0,
      storageVersion: 2,
      updatedAt: now,
    })
    await putSpaceMemberRecord(kv, spaceId, members[0])
    await putUserSpaceLink(kv, {
      userId: 'owner',
      spaceId,
      joinedAt: now,
    })
    await putSpaceNodeRecord(kv, node)
    await saveSpaceGraphMetaRecord(kv, {
      spaceId,
      nodeCount: 1,
      totalInteractions: 4,
      lastUpdatedAt: now,
      version: 2,
      storageVersion: 2,
    })

    await kv.delete(`space:meta:${spaceId}`)
    await kv.delete(`space:members:${spaceId}`)
    await kv.delete(`space:graph:${spaceId}`)
    await kv.delete('space:index:owner')

    expect(await getSpace(kv, spaceId)).toEqual(
      expect.objectContaining({ spaceId, name: 'Backfilled Read' }),
    )
    expect(await getSpaceMembers(kv, spaceId)).toEqual([
      expect.objectContaining({ userId: 'owner' }),
    ])
    expect(await verifyMembership(kv, spaceId, 'owner')).toEqual(
      expect.objectContaining({ userId: 'owner' }),
    )
    expect(await getUserSpaces(kv, 'owner')).toEqual([spaceId])
    expect((await getSpaceGraph(kv, spaceId)).nodes).toEqual([
      expect.objectContaining({ id: 'legacy_node', title: 'Trip Plan' }),
    ])
  })

  it('ignores leftover legacy blobs once the v2 records are gone', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Cutover Strictness',
      description: '',
      category: 'other',
      emoji: '✨',
    })
    const node = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Birthday',
      detail: 'Cake',
      tags: ['party'],
      people: ['team'],
      emotionalWeight: 0.7,
    })

    await kv.put(`space:meta:${meta.spaceId}`, enc({ ...meta, name: 'Legacy Wrong' }))
    await kv.put(
      `space:members:${meta.spaceId}`,
      enc([
        {
          userId: 'owner',
          role: 'owner',
          displayName: 'Owner',
          joinedAt: 1,
          lastActiveAt: 1,
        },
      ]),
    )
    await kv.put(`space:graph:${meta.spaceId}`, enc({
      nodes: [
        {
          ...node,
          id: 'legacy_only_node',
          title: 'Legacy Only',
        },
      ],
      totalInteractions: 9,
      lastUpdatedAt: 9,
      version: 1,
    }))
    await kv.put('space:index:owner', enc([meta.spaceId, 'legacy_only_space']))

    await deleteSpaceMetaRecord(kv, meta.spaceId)
    await deleteSpaceMemberRecord(kv, meta.spaceId, 'owner')
    await deleteUserSpaceLink(kv, 'owner', meta.spaceId)
    await deleteSpaceGraphMetaRecord(kv, meta.spaceId)
    await deleteSpaceNodeRecord(kv, meta.spaceId, node.id)
    await deleteSpaceNodeTitleIndex(kv, meta.spaceId, 'birthday')

    expect(await getSpace(kv, meta.spaceId)).toBeNull()
    expect(await getSpaceMembers(kv, meta.spaceId)).toEqual([])
    expect(await verifyMembership(kv, meta.spaceId, 'owner')).toBeNull()
    expect(await getUserSpaces(kv, 'owner')).toEqual([])
    expect(await getSpaceGraph(kv, meta.spaceId)).toEqual({
      nodes: [],
      totalInteractions: 0,
      lastUpdatedAt: 0,
      version: 1,
    })
  })
})
