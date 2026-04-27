import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { KVStore, KVListResult } from '@/types'

vi.mock('@/lib/server/security/kv-crypto', () => ({
  encryptKVValue: vi.fn(async (plaintext: string) => `ENC:${plaintext}`),
  decryptKVValue: vi.fn(async (stored: string) =>
    stored.startsWith('ENC:') ? stored.slice(4) : null,
  ),
  encryptForKV: vi.fn(async (p: string) => p),
  decryptFromKV: vi.fn(async (s: string) => s),
}))

import {
  buildSpaceGraphSnapshot,
  deleteSpaceInviteLink,
  deleteSpaceNodeRecord,
  findSpaceNodeByNormalizedTitle,
  getSpaceInviteRecord,
  getSpaceNodeTitleIndex,
  getSpaceMetaRecord,
  listActiveSpaceInviteTokens,
  listSpaceMemberRecords,
  listUserSpaceIds,
  normalizeSpaceNodeTitle,
  putSpaceInviteLink,
  putSpaceInviteRecord,
  putSpaceMemberRecord,
  putSpaceNodeRecord,
  putUserSpaceLink,
  saveSpaceGraphMetaRecord,
  saveSpaceMetaRecord,
  setSpaceNodeTitleIndex,
  toSpaceMetadata,
} from '@/lib/spaces/space-record-store'
import type { SharedMemoryNode } from '@/types/spaces'

function makeKV(withList = false): KVStore {
  const store = new Map<string, string>()
  const kv: KVStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }
  if (withList) {
    kv.list = async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? parseInt(cursor, 10) || 0 : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    }
  }
  return kv
}

function makeNode(overrides: Partial<SharedMemoryNode> = {}): SharedMemoryNode {
  return {
    id: 'node_1',
    userId: 'user_owner',
    category: 'event',
    title: 'Anniversary Dinner',
    detail: 'Booked for Friday night',
    tags: ['date'],
    people: ['Taylor'],
    emotionalWeight: 0.8,
    confidence: 0.9,
    createdAt: 100,
    updatedAt: 200,
    accessCount: 0,
    lastAccessedAt: 0,
    source: 'explicit',
    spaceId: 'space_1',
    contributorId: 'user_owner',
    contributorDisplayName: 'Owner',
    visibility: 'space',
    ...overrides,
  }
}

describe('space-record-store', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('round-trips meta records and converts them to SpaceMetadata', async () => {
    await saveSpaceMetaRecord(kv, {
      spaceId: 'space_1',
      name: 'Family HQ',
      description: 'Shared family space',
      category: 'family',
      emoji: '🏡',
      createdAt: 100,
      ownerUserId: 'user_owner',
      memberCount: 2,
      activeInviteCount: 1,
      storageVersion: 2,
      updatedAt: 200,
    })

    const meta = await getSpaceMetaRecord(kv, 'space_1')
    expect(meta).toEqual(expect.objectContaining({
      spaceId: 'space_1',
      name: 'Family HQ',
      activeInviteCount: 1,
      memberCount: 2,
    }))

    expect(toSpaceMetadata(meta!, ['invite_a'])).toEqual(expect.objectContaining({
      spaceId: 'space_1',
      activeInviteTokens: ['invite_a'],
      memberCount: 2,
    }))
  })

  it('lists member records and user-space links through fallback indexes', async () => {
    await putSpaceMemberRecord(kv, 'space_1', {
      userId: 'user_owner',
      role: 'owner',
      displayName: 'Owner',
      joinedAt: 100,
      lastActiveAt: 150,
    })
    await putSpaceMemberRecord(kv, 'space_1', {
      userId: 'user_member',
      role: 'member',
      displayName: 'Member',
      joinedAt: 200,
      lastActiveAt: 250,
    })
    await putUserSpaceLink(kv, {
      userId: 'user_owner',
      spaceId: 'space_1',
      joinedAt: 100,
    })
    await putUserSpaceLink(kv, {
      userId: 'user_owner',
      spaceId: 'space_2',
      joinedAt: 300,
    })

    const members = await listSpaceMemberRecords(kv, 'space_1')
    expect(members.map((member) => member.userId)).toEqual(['user_owner', 'user_member'])

    const spaceIds = await listUserSpaceIds(kv, 'user_owner')
    expect(spaceIds).toEqual(['space_1', 'space_2'])
  })

  it('supports prefix listing when KV list() is available', async () => {
    const listedKV = makeKV(true)
    await putSpaceMemberRecord(listedKV, 'space_1', {
      userId: 'user_owner',
      role: 'owner',
      displayName: 'Owner',
      joinedAt: 100,
      lastActiveAt: 150,
    })
    await putSpaceMemberRecord(listedKV, 'space_1', {
      userId: 'user_member',
      role: 'member',
      displayName: 'Member',
      joinedAt: 200,
      lastActiveAt: 250,
    })

    const members = await listSpaceMemberRecords(listedKV, 'space_1')
    expect(members).toHaveLength(2)
  })

  it('round-trips node records, title indexes, and graph snapshots', async () => {
    await saveSpaceGraphMetaRecord(kv, {
      spaceId: 'space_1',
      nodeCount: 2,
      totalInteractions: 7,
      lastUpdatedAt: 500,
      version: 3,
      storageVersion: 2,
    })
    await putSpaceNodeRecord(kv, makeNode())
    await putSpaceNodeRecord(kv, makeNode({
      id: 'node_2',
      title: 'Weekend Plan',
      createdAt: 120,
      updatedAt: 300,
    }))
    await setSpaceNodeTitleIndex(kv, 'space_1', normalizeSpaceNodeTitle('Anniversary Dinner'), 'node_1')

    const found = await findSpaceNodeByNormalizedTitle(kv, 'space_1', 'anniversary dinner')
    expect(found?.id).toBe('node_1')

    const graph = await buildSpaceGraphSnapshot(kv, 'space_1')
    expect(graph.totalInteractions).toBe(7)
    expect(graph.version).toBe(3)
    expect(graph.nodes.map((node) => node.id)).toEqual(['node_1', 'node_2'])
  })

  it('supports bounded newest-first Space graph snapshots without loading all nodes', async () => {
    await saveSpaceGraphMetaRecord(kv, {
      spaceId: 'space_1',
      nodeCount: 3,
      totalInteractions: 4,
      lastUpdatedAt: 700,
      version: 3,
      storageVersion: 2,
    })
    await putSpaceNodeRecord(kv, makeNode({ id: 'node_1', createdAt: 100, updatedAt: 200 }))
    await putSpaceNodeRecord(kv, makeNode({ id: 'node_2', title: 'Second', createdAt: 200, updatedAt: 300 }))
    await putSpaceNodeRecord(kv, makeNode({ id: 'node_3', title: 'Third', createdAt: 300, updatedAt: 400 }))

    const graph = await buildSpaceGraphSnapshot(kv, 'space_1', { limit: 2, newestFirst: true })

    expect(graph.nodes.map((node) => node.id)).toEqual(['node_3', 'node_2'])
    expect(graph.totalInteractions).toBe(4)
    expect(graph.version).toBe(3)
  })

  it('cleans up stale title indexes when the backing node is missing', async () => {
    await putSpaceNodeRecord(kv, makeNode())
    await setSpaceNodeTitleIndex(kv, 'space_1', 'anniversary dinner', 'node_1')
    await deleteSpaceNodeRecord(kv, 'space_1', 'node_1')

    const found = await findSpaceNodeByNormalizedTitle(kv, 'space_1', 'anniversary dinner')
    expect(found).toBeNull()
    expect(await getSpaceNodeTitleIndex(kv, 'space_1', 'anniversary dinner')).toBeNull()
  })

  it('round-trips invite records and active invite links', async () => {
    await putSpaceInviteRecord(kv, {
      token: 'invite_a',
      spaceId: 'space_1',
      inviterUserId: 'user_owner',
      createdAt: 100,
      expiresAt: 200,
      used: false,
    })
    await putSpaceInviteLink(kv, {
      spaceId: 'space_1',
      token: 'invite_a',
      createdAt: 100,
      expiresAt: 200,
    })

    const invite = await getSpaceInviteRecord(kv, 'invite_a')
    expect(invite?.spaceId).toBe('space_1')
    expect(await listActiveSpaceInviteTokens(kv, 'space_1')).toEqual(['invite_a'])

    await deleteSpaceInviteLink(kv, 'space_1', 'invite_a')
    expect(await listActiveSpaceInviteTokens(kv, 'space_1')).toEqual([])
  })
})
