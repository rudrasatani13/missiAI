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
  deleteNodeFromSpace,
  getSpaceGraph,
  removeMemberFromSpace,
  saveSpaceGraph,
} from '@/lib/spaces/space-store'
import {
  buildSpaceGraphSnapshot,
  findSpaceNodeByNormalizedTitle,
  getSpaceGraphMetaRecord,
  getSpaceNodeTitleIndex,
  listSpaceNodeRecords,
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

describe('space-store phase 2 graph dual-write', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('createSpace seeds v2 graph metadata with an empty graph', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })

    const graphMeta = await getSpaceGraphMetaRecord(kv, meta.spaceId)
    expect(graphMeta).toEqual(expect.objectContaining({
      spaceId: meta.spaceId,
      nodeCount: 0,
      totalInteractions: 0,
      version: 2,
    }))

    const snapshot = await buildSpaceGraphSnapshot(kv, meta.spaceId)
    expect(snapshot.nodes).toEqual([])
  })

  it('addNodeToSpace dual-writes v2 nodes, title indexes, and merge updates', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'couple',
      emoji: '💞',
    })

    const first = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Anniversary',
      detail: 'Dinner reservation',
      tags: ['date'],
      people: ['us'],
      emotionalWeight: 0.7,
    })

    const afterFirstMeta = await getSpaceGraphMetaRecord(kv, meta.spaceId)
    expect(afterFirstMeta).toEqual(expect.objectContaining({ nodeCount: 1 }))
    expect(await findSpaceNodeByNormalizedTitle(kv, meta.spaceId, 'anniversary')).toEqual(
      expect.objectContaining({ id: first.id }),
    )

    const merged = await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: '  anniversary  ',
      detail: 'Flowers too',
      tags: ['celebration'],
      people: ['us'],
      emotionalWeight: 0.9,
    })

    expect(merged.id).toBe(first.id)

    const nodes = await listSpaceNodeRecords(kv, meta.spaceId)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].tags).toEqual(expect.arrayContaining(['date', 'celebration']))
    expect(nodes[0].detail).toContain('Flowers too')
    expect(await getSpaceNodeTitleIndex(kv, meta.spaceId, 'anniversary')).toEqual(
      expect.objectContaining({ nodeId: first.id }),
    )
  })

  it('saveSpaceGraph mirrors full graph snapshots into v2 graph metadata', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'other',
      emoji: '✨',
    })

    await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'goal',
      title: 'Read More',
      detail: '20 pages a day',
      tags: ['books'],
      people: [],
      emotionalWeight: 0.5,
    })

    const graph = await getSpaceGraph(kv, meta.spaceId)
    graph.totalInteractions = 7
    await saveSpaceGraph(kv, meta.spaceId, graph)

    const snapshot = await buildSpaceGraphSnapshot(kv, meta.spaceId)
    const graphMeta = await getSpaceGraphMetaRecord(kv, meta.spaceId)
    expect(snapshot.totalInteractions).toBe(7)
    expect(graphMeta?.totalInteractions).toBe(7)
    expect(snapshot.nodes).toHaveLength(1)
  })

  it('deleteNodeFromSpace and dissolve cleanup keep v2 graph state in sync', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'S',
      description: '',
      category: 'friends',
      emoji: '🤝',
    })

    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'bob',
      role: 'member',
      displayName: 'Bob',
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

    const blocked = await deleteNodeFromSpace(kv, meta.spaceId, node.id, 'bob')
    expect(blocked).toBe(false)
    expect(await listSpaceNodeRecords(kv, meta.spaceId)).toHaveLength(1)

    const deleted = await deleteNodeFromSpace(kv, meta.spaceId, node.id, 'owner')
    expect(deleted).toBe(true)
    expect(await listSpaceNodeRecords(kv, meta.spaceId)).toEqual([])
    expect(await getSpaceNodeTitleIndex(kv, meta.spaceId, 'book club')).toBeNull()
    expect(await getSpaceGraphMetaRecord(kv, meta.spaceId)).toEqual(
      expect.objectContaining({ nodeCount: 0 }),
    )

    await addNodeToSpace(kv, meta.spaceId, 'owner', 'Owner', {
      category: 'event',
      title: 'Trip Plan',
      detail: 'Goa',
      tags: ['trip'],
      people: ['team'],
      emotionalWeight: 0.8,
    })

    const dissolved = await removeMemberFromSpace(kv, meta.spaceId, 'bob', 'owner')
    expect(dissolved).toEqual({ dissolved: false, removed: true })
    const final = await removeMemberFromSpace(kv, meta.spaceId, 'owner', 'owner')
    expect(final).toEqual({ dissolved: true, removed: true })

    expect(await getSpaceGraphMetaRecord(kv, meta.spaceId)).toBeNull()
    expect(await listSpaceNodeRecords(kv, meta.spaceId)).toEqual([])
  })
})
