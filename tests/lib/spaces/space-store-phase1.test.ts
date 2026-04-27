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
  createInvite,
  createSpace,
  registerInviteOnSpace,
  removeMemberFromSpace,
  unregisterInviteFromSpace,
  updateLastActive,
  updateSpaceMeta,
} from '@/lib/spaces/space-store'
import {
  getSpaceMetaRecord,
  listActiveSpaceInviteTokens,
  listSpaceMemberRecords,
  listUserSpaceIds,
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

describe('space-store phase 1 dual-write', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('createSpace dual-writes v2 metadata, member records, and user links', async () => {
    const meta = await createSpace(kv, 'user_owner', 'Owner', {
      name: 'Family HQ',
      description: 'Shared space',
      category: 'family',
      emoji: '🏡',
    })

    const v2Meta = await getSpaceMetaRecord(kv, meta.spaceId)
    expect(v2Meta).toEqual(expect.objectContaining({
      spaceId: meta.spaceId,
      ownerUserId: 'user_owner',
      memberCount: 1,
      activeInviteCount: 0,
    }))

    const members = await listSpaceMemberRecords(kv, meta.spaceId)
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe('user_owner')
    expect(members[0].role).toBe('owner')

    const userSpaces = await listUserSpaceIds(kv, 'user_owner')
    expect(userSpaces).toContain(meta.spaceId)
  })

  it('addMemberToSpace and removeMemberFromSpace keep v2 membership and owner state in sync', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Study Space',
      description: '',
      category: 'study',
      emoji: '📚',
    })

    await addMemberToSpace(kv, meta.spaceId, {
      userId: 'second',
      role: 'member',
      displayName: 'Second',
      joinedAt: 200,
      lastActiveAt: 200,
    })

    const removed = await removeMemberFromSpace(kv, meta.spaceId, 'owner', 'owner')
    expect(removed).toEqual({ dissolved: false, removed: true })

    const v2Meta = await getSpaceMetaRecord(kv, meta.spaceId)
    expect(v2Meta).toEqual(expect.objectContaining({
      ownerUserId: 'second',
      memberCount: 1,
    }))

    const members = await listSpaceMemberRecords(kv, meta.spaceId)
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe('second')
    expect(members[0].role).toBe('owner')

    expect(await listUserSpaceIds(kv, 'owner')).not.toContain(meta.spaceId)
    expect(await listUserSpaceIds(kv, 'second')).toContain(meta.spaceId)
  })

  it('updateSpaceMeta, updateLastActive, and invite registration keep v2 state in sync', async () => {
    const meta = await createSpace(kv, 'owner', 'Owner', {
      name: 'Couple Space',
      description: '',
      category: 'couple',
      emoji: '💞',
    })

    const beforeMembers = await listSpaceMemberRecords(kv, meta.spaceId)
    const beforeActiveAt = beforeMembers[0].lastActiveAt

    const invite = await createInvite(
      kv,
      meta.spaceId,
      'owner',
      'test-secret-at-least-16-chars-long',
    )

    await registerInviteOnSpace(kv, meta.spaceId, invite.token)
    await updateSpaceMeta(kv, meta.spaceId, {
      name: 'Renamed Space',
      description: 'Updated',
      emoji: '🌙',
    })
    await updateLastActive(kv, meta.spaceId, 'owner')

    const v2Meta = await getSpaceMetaRecord(kv, meta.spaceId)
    expect(v2Meta).toEqual(expect.objectContaining({
      name: 'Renamed Space',
      description: 'Updated',
      emoji: '🌙',
      activeInviteCount: 1,
    }))

    expect(await listActiveSpaceInviteTokens(kv, meta.spaceId)).toEqual([invite.token])

    const afterMembers = await listSpaceMemberRecords(kv, meta.spaceId)
    expect(afterMembers[0].lastActiveAt).toBeGreaterThanOrEqual(beforeActiveAt)

    await unregisterInviteFromSpace(kv, meta.spaceId, invite.token)
    const afterUnregisterMeta = await getSpaceMetaRecord(kv, meta.spaceId)
    expect(afterUnregisterMeta?.activeInviteCount).toBe(0)
    expect(await listActiveSpaceInviteTokens(kv, meta.spaceId)).toEqual([])
  })

  it('removing the last member dissolves v2 metadata, members, user links, and invite links', async () => {
    const meta = await createSpace(kv, 'solo', 'Solo', {
      name: 'Solo Space',
      description: '',
      category: 'other',
      emoji: '✨',
    })

    const invite = await createInvite(
      kv,
      meta.spaceId,
      'solo',
      'test-secret-at-least-16-chars-long',
    )
    await registerInviteOnSpace(kv, meta.spaceId, invite.token)

    const removed = await removeMemberFromSpace(kv, meta.spaceId, 'solo', 'solo')
    expect(removed).toEqual({ dissolved: true, removed: true })

    expect(await getSpaceMetaRecord(kv, meta.spaceId)).toBeNull()
    expect(await listSpaceMemberRecords(kv, meta.spaceId)).toEqual([])
    expect(await listUserSpaceIds(kv, 'solo')).not.toContain(meta.spaceId)
    expect(await listActiveSpaceInviteTokens(kv, meta.spaceId)).toEqual([])
  })
})
