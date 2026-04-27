// ─── Missi Spaces KV Storage ─────────────────────────────────────────────────
//
// All reads/writes to `space:*` keys go through per-tenant salted encryption
// via `encryptKVValue(_, salt)` / `decryptKVValue(_, salt)`. The salt is the
// spaceId for Space-scoped data, the userId for the per-user space index,
// and the token itself for invite records.
//
// SECURITY INVARIANTS:
// - No function in this file reads `lifegraph:${userId}` (personal graph).
// - `verifyMembership` is the ONLY authorization source for Space access.
// - Decrypt failures return empty values, never throw, never leak raw
//   ciphertext.
// - Invite tokens are single-use: `verifyAndConsumeInvite` deletes the
//   record before returning, so a second consumer always sees null.

import { nanoid } from 'nanoid'
import type { KVStore } from '@/types'
import type { LifeGraph, LifeNode, MemoryCategory } from '@/types/memory'
import type {
  SharedMemoryNode,
  SpaceCategory,
  SpaceInvite,
  SpaceMember,
  SpaceMetadata,
  SpaceRole,
} from '@/types/spaces'
import {
  INVITE_TTL_SECONDS,
  MAX_ACTIVE_INVITES,
  MAX_SPACE_MEMBERS,
  SPACE_CREATE_WEEKLY_LIMIT,
  SPACE_WRITE_DAILY_LIMIT,
} from '@/types/spaces'
import {
  buildSpaceGraphSnapshot,
  buildSpaceMembersSnapshot,
  deleteSpaceInviteRecord,
  deleteSpaceInviteLink,
  deleteSpaceGraphMetaRecord,
  deleteSpaceMemberRecord,
  deleteSpaceMetaRecord,
  deleteSpaceNodeRecord,
  deleteSpaceNodeTitleIndex,
  deleteUserSpaceLink,
  findSpaceNodeByNormalizedTitle,
  getSpaceGraphMetaRecord,
  getSpaceInviteRecord,
  getSpaceMemberRecord,
  getSpaceMetaRecord,
  getSpaceNodeRecord,
  listActiveSpaceInviteTokens,
  listSpaceMemberRecords,
  listSpaceNodeRecords,
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
  type SpaceGraphReadOptions,
  type SpaceGraphMetaRecord,
  type SpaceMetaRecord,
} from '@/lib/spaces/space-record-store'
import { checkAndIncrementAtomicCounter, decrementAtomicCounter } from '@/lib/server/platform/atomic-quota'

// ─── Key builders ────────────────────────────────────────────────────────────

const K = {
  createLimit: (userId: string, week: string) =>
    `ratelimit:space-create:${userId}:${week}`,
  writeLimit: (userId: string, date: string) =>
    `ratelimit:space-write:${userId}:${date}`,
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyGraph(): LifeGraph {
  return { nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }
}

export interface SpaceQuotaReservation {
  allowed: boolean
  remaining: number
  current: number
  unavailable?: boolean
  counterName: string
  limit: number
}

async function bestEffort(...operations: Promise<unknown>[]): Promise<void> {
  await Promise.allSettled(operations)
}

async function bestEffortSequence(
  operations: Array<() => Promise<unknown>>,
): Promise<void> {
  for (const operation of operations) {
    try {
      await operation()
    } catch {
      // best-effort by design
    }
  }
}

function buildSpaceMetaRecord(meta: SpaceMetadata) {
  return {
    spaceId: meta.spaceId,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    emoji: meta.emoji,
    createdAt: meta.createdAt,
    ownerUserId: meta.ownerUserId,
    memberCount: meta.memberCount,
    activeInviteCount: meta.activeInviteTokens.length,
    storageVersion: 2 as const,
    updatedAt: Date.now(),
  }
}

function buildSpaceGraphMetaRecord(spaceId: string, graph: LifeGraph) {
  return {
    spaceId,
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    totalInteractions: graph.totalInteractions || 0,
    lastUpdatedAt: graph.lastUpdatedAt || 0,
    version: Math.max(2, graph.version || 2),
    storageVersion: 2 as const,
  }
}

function compareSpaceMembers(a: SpaceMember, b: SpaceMember): number {
  return a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId)
}

function buildSpaceMetadataSnapshot(
  record: SpaceMetaRecord,
  members: SpaceMember[],
  activeInviteTokens: string[],
): SpaceMetadata {
  return {
    ...toSpaceMetadata(record, activeInviteTokens),
    memberCount: members.length,
    activeInviteTokens,
  }
}

function emptySpaceGraphMetaRecord(spaceId: string): SpaceGraphMetaRecord {
  return {
    spaceId,
    nodeCount: 0,
    totalInteractions: 0,
    lastUpdatedAt: 0,
    version: 2,
    storageVersion: 2,
  }
}

async function refreshSpaceDerivedMeta(
  kv: KVStore,
  spaceId: string,
  overrides?: Partial<Pick<SpaceMetaRecord, 'ownerUserId'>>,
): Promise<SpaceMetaRecord | null> {
  const current = await getSpaceMetaRecord(kv, spaceId)
  if (!current) return null

  const [members, activeInviteTokens] = await Promise.all([
    listSpaceMemberRecords(kv, spaceId),
    listActiveSpaceInviteTokens(kv, spaceId).catch((): string[] => []),
  ])

  return saveSpaceMetaRecord(kv, {
    ...current,
    ...overrides,
    memberCount: members.length,
    activeInviteCount: activeInviteTokens.length,
    updatedAt: Date.now(),
  })
}

async function refreshSpaceGraphMeta(
  kv: KVStore,
  spaceId: string,
  options?: {
    totalInteractions?: number
    lastUpdatedAt?: number
    incrementVersion?: boolean
  },
): Promise<SpaceGraphMetaRecord> {
  const current = await getSpaceGraphMetaRecord(kv, spaceId) ?? emptySpaceGraphMetaRecord(spaceId)
  const nodes = await listSpaceNodeRecords(kv, spaceId)
  const lastNodeUpdatedAt = nodes.reduce(
    (max, node) => Math.max(max, node.updatedAt, node.lastAccessedAt),
    0,
  )

  return saveSpaceGraphMetaRecord(kv, {
    ...current,
    nodeCount: nodes.length,
    totalInteractions: options?.totalInteractions ?? current.totalInteractions,
    lastUpdatedAt: Math.max(
      options?.lastUpdatedAt ?? 0,
      lastNodeUpdatedAt,
      current.lastUpdatedAt,
    ),
    version: options?.incrementVersion === false
      ? current.version
      : Math.max(2, current.version + 1),
    storageVersion: 2,
  })
}

async function upsertSpaceMembership(
  kv: KVStore,
  spaceId: string,
  member: SpaceMember,
): Promise<void> {
  await Promise.all([
    putSpaceMemberRecord(kv, spaceId, member),
    putUserSpaceLink(kv, {
      userId: member.userId,
      spaceId,
      joinedAt: member.joinedAt,
    }),
  ])
}

async function removeSpaceMembership(
  kv: KVStore,
  spaceId: string,
  userId: string,
): Promise<void> {
  await Promise.all([
    deleteSpaceMemberRecord(kv, spaceId, userId),
    deleteUserSpaceLink(kv, userId, spaceId),
  ])
}

function isSharedMemoryNode(node: LifeNode): node is SharedMemoryNode {
  const candidate = node as Partial<SharedMemoryNode>
  return (
    typeof node.id === 'string' &&
    typeof node.title === 'string' &&
    typeof candidate.spaceId === 'string' &&
    typeof candidate.contributorId === 'string'
  )
}

function getSharedNodesForV2(graph: LifeGraph, spaceId: string): SharedMemoryNode[] {
  if (!Array.isArray(graph.nodes)) return []
  return graph.nodes
    .filter(isSharedMemoryNode)
    .map((node) => ({
      ...node,
      spaceId,
      visibility: 'space',
    }))
}

async function syncSpaceMembersToV2(
  kv: KVStore,
  spaceId: string,
  members: SpaceMember[],
): Promise<void> {
  const existingMembers = await listSpaceMemberRecords(kv, spaceId)
  const nextUserIds = new Set(members.map((member) => member.userId))
  await bestEffortSequence([
    ...existingMembers
      .filter((member) => !nextUserIds.has(member.userId))
      .map((member) => () => deleteSpaceMemberRecord(kv, spaceId, member.userId)),
    ...members.map((member) => () => putSpaceMemberRecord(kv, spaceId, member)),
  ])
}

async function syncSpaceGraphToV2(
  kv: KVStore,
  spaceId: string,
  graph: LifeGraph,
): Promise<void> {
  const existingNodes = await listSpaceNodeRecords(kv, spaceId)
  const nextNodes = getSharedNodesForV2(graph, spaceId)
  const nextNodeIds = new Set(nextNodes.map((node) => node.id))
  const nextTitlesByNodeId = new Map(
    nextNodes.map((node) => [node.id, normalizeSpaceNodeTitle(node.title)]),
  )

  await bestEffort(
    saveSpaceGraphMetaRecord(kv, buildSpaceGraphMetaRecord(spaceId, graph)),
  )
  await bestEffortSequence([
    ...existingNodes.flatMap((node) => {
      const oldTitle = normalizeSpaceNodeTitle(node.title)
      const nextTitle = nextTitlesByNodeId.get(node.id)
      if (!nextNodeIds.has(node.id)) {
        return [
          () => deleteSpaceNodeRecord(kv, spaceId, node.id),
          () => deleteSpaceNodeTitleIndex(kv, spaceId, oldTitle),
        ]
      }
      if (nextTitle && nextTitle !== oldTitle) {
        return [() => deleteSpaceNodeTitleIndex(kv, spaceId, oldTitle)]
      }
      return []
    }),
    ...nextNodes.flatMap((node) => {
      const title = normalizeSpaceNodeTitle(node.title)
      return [
        () => putSpaceNodeRecord(kv, node),
        ...(!title ? [] : [() => setSpaceNodeTitleIndex(kv, spaceId, title, node.id)]),
      ]
    }),
  ])
}

// ─── Space metadata ──────────────────────────────────────────────────────────

export async function getSpace(
  kv: KVStore,
  spaceId: string,
): Promise<SpaceMetadata | null> {
  const v2Meta = await getSpaceMetaRecord(kv, spaceId)
  if (!v2Meta) return null
  const [members, activeInviteTokens] = await Promise.all([
    listSpaceMemberRecords(kv, spaceId),
    listActiveSpaceInviteTokens(kv, spaceId).catch((): string[] => []),
  ])
  return buildSpaceMetadataSnapshot(v2Meta, members, activeInviteTokens)
}

async function saveSpace(kv: KVStore, meta: SpaceMetadata): Promise<void> {
  await saveSpaceMetaRecord(kv, buildSpaceMetaRecord(meta))
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getSpaceMembers(
  kv: KVStore,
  spaceId: string,
): Promise<SpaceMember[]> {
  const v2Meta = await getSpaceMetaRecord(kv, spaceId)
  if (!v2Meta) return []
  return buildSpaceMembersSnapshot(kv, spaceId)
}

async function saveSpaceMembers(
  kv: KVStore,
  spaceId: string,
  members: SpaceMember[],
): Promise<void> {
  await syncSpaceMembersToV2(kv, spaceId, members)
}

export async function verifyMembership(
  kv: KVStore,
  spaceId: string,
  userId: string,
): Promise<SpaceMember | null> {
  const v2Meta = await getSpaceMetaRecord(kv, spaceId)
  if (!v2Meta) return null
  return getSpaceMemberRecord(kv, spaceId, userId)
}

// ─── Per-user index ──────────────────────────────────────────────────────────

export async function getUserSpaces(
  kv: KVStore,
  userId: string,
): Promise<string[]> {
  return listUserSpaceIds(kv, userId)
}

async function addSpaceToUserIndex(
  kv: KVStore,
  userId: string,
  spaceId: string,
  joinedAt = Date.now(),
): Promise<void> {
  await putUserSpaceLink(kv, { userId, spaceId, joinedAt })
}

async function removeSpaceFromUserIndex(
  kv: KVStore,
  userId: string,
  spaceId: string,
): Promise<void> {
  await deleteUserSpaceLink(kv, userId, spaceId)
}

// ─── Space graph ─────────────────────────────────────────────────────────────

export async function getSpaceGraph(
  kv: KVStore,
  spaceId: string,
  options?: SpaceGraphReadOptions,
): Promise<LifeGraph> {
  const v2Meta = await getSpaceGraphMetaRecord(kv, spaceId)
  if (!v2Meta) return emptyGraph()
  return buildSpaceGraphSnapshot(kv, spaceId, options)
}

export async function saveSpaceGraph(
  kv: KVStore,
  spaceId: string,
  graph: LifeGraph,
): Promise<void> {
  if (!(await getSpaceMetaRecord(kv, spaceId))) return
  graph.version = (graph.version || 0) + 1
  graph.lastUpdatedAt = Date.now()
  await syncSpaceGraphToV2(kv, spaceId, graph)
}

// ─── Create a Space ──────────────────────────────────────────────────────────

export interface CreateSpaceInput {
  name: string
  description: string
  category: SpaceCategory
  emoji: string
}

export async function createSpace(
  kv: KVStore,
  ownerUserId: string,
  ownerDisplayName: string,
  input: CreateSpaceInput,
): Promise<SpaceMetadata> {
  const spaceId = nanoid(16)
  const now = Date.now()

  const meta: SpaceMetadata = {
    spaceId,
    name: input.name,
    description: input.description,
    category: input.category,
    emoji: input.emoji,
    createdAt: now,
    ownerUserId,
    memberCount: 1,
    activeInviteTokens: [],
  }

  const owner: SpaceMember = {
    userId: ownerUserId,
    role: 'owner',
    displayName: ownerDisplayName.slice(0, 50),
    joinedAt: now,
    lastActiveAt: now,
  }

  // Parallel writes — all four keys are independent and use independent salts
  // (meta/members/graph share spaceId, index uses ownerUserId).
  await Promise.all([
    saveSpace(kv, meta),
    saveSpaceMembers(kv, spaceId, [owner]),
    addSpaceToUserIndex(kv, ownerUserId, spaceId, now),
    saveSpaceGraphMetaRecord(kv, {
      spaceId,
      nodeCount: 0,
      totalInteractions: 0,
      lastUpdatedAt: 0,
      version: 2,
      storageVersion: 2,
    }),
  ])

  return meta
}

// ─── Node mutation ───────────────────────────────────────────────────────────

export interface AddNodeInput {
  category: MemoryCategory
  title: string
  detail: string
  tags: string[]
  people: string[]
  emotionalWeight: number
}

function mergeSpaceNode(
  existing: SharedMemoryNode,
  contributorId: string,
  contributorDisplayName: string,
  nodeInput: AddNodeInput,
  now: number,
): SharedMemoryNode {
  return {
    ...existing,
    detail: nodeInput.detail.length > existing.detail.length
      ? nodeInput.detail
      : `${existing.detail} ${nodeInput.detail}`.slice(0, 500),
    tags: [...new Set([...existing.tags, ...nodeInput.tags])].slice(0, 8),
    people: [...new Set([...existing.people, ...nodeInput.people])],
    emotionalWeight: Math.max(existing.emotionalWeight, nodeInput.emotionalWeight),
    confidence: Math.min(1, existing.confidence + 0.1),
    updatedAt: now,
    category: nodeInput.category,
    contributorId,
    contributorDisplayName: contributorDisplayName.slice(0, 50),
  }
}

export async function addNodeToSpace(
  kv: KVStore,
  spaceId: string,
  contributorId: string,
  contributorDisplayName: string,
  nodeInput: AddNodeInput,
): Promise<SharedMemoryNode> {
  const meta = await getSpaceMetaRecord(kv, spaceId)
  if (!meta) throw new Error('space not found')
  const now = Date.now()
  const normalizedTitle = normalizeSpaceNodeTitle(nodeInput.title)

  // Deduplication / merge — mirrors lib/memory/life-graph.ts behaviour but
  // without Vectorize (Space graphs stay KV-only for now).
  let existing = await findSpaceNodeByNormalizedTitle(kv, spaceId, normalizedTitle)
  if (!existing && normalizedTitle) {
    const createGate = await checkAndIncrementAtomicCounter(
      `space-node-create:${spaceId}:${normalizedTitle}`,
      1,
      5,
    )
    if (createGate && !createGate.allowed) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      existing = await findSpaceNodeByNormalizedTitle(kv, spaceId, normalizedTitle)
    }
  }

  if (existing) {
    const merged = mergeSpaceNode(
      existing,
      contributorId,
      contributorDisplayName,
      nodeInput,
      now,
    )
    await Promise.all([
      putSpaceNodeRecord(kv, merged),
      normalizedTitle
        ? setSpaceNodeTitleIndex(kv, spaceId, normalizedTitle, merged.id)
        : Promise.resolve(),
    ])
    await refreshSpaceGraphMeta(kv, spaceId, { lastUpdatedAt: now })
    return merged
  }

  let node: SharedMemoryNode = {
    id: nanoid(12),
    userId: contributorId,
    category: nodeInput.category,
    title: nodeInput.title.slice(0, 80),
    detail: nodeInput.detail.slice(0, 500),
    tags: nodeInput.tags.slice(0, 8),
    people: [...nodeInput.people],
    emotionalWeight: nodeInput.emotionalWeight,
    confidence: 0.8,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: 0,
    source: 'explicit',
    spaceId,
    contributorId,
    contributorDisplayName: contributorDisplayName.slice(0, 50),
    visibility: 'space',
  }

  await putSpaceNodeRecord(kv, node)
  if (normalizedTitle) {
    await setSpaceNodeTitleIndex(kv, spaceId, normalizedTitle, node.id)
    const canonical = await findSpaceNodeByNormalizedTitle(kv, spaceId, normalizedTitle)
    if (canonical && canonical.id !== node.id) {
      const merged = mergeSpaceNode(
        canonical,
        contributorId,
        contributorDisplayName,
        nodeInput,
        now,
      )
      await putSpaceNodeRecord(kv, merged)
      await deleteSpaceNodeRecord(kv, spaceId, node.id)
      node = merged
    }
  }

  await refreshSpaceGraphMeta(kv, spaceId, { lastUpdatedAt: now })
  return node
}

export async function deleteNodeFromSpace(
  kv: KVStore,
  spaceId: string,
  nodeId: string,
  requestingUserId: string,
): Promise<boolean> {
  const [node, meta] = await Promise.all([
    getSpaceNodeRecord(kv, spaceId, nodeId),
    getSpaceMetaRecord(kv, spaceId),
  ])
  if (!meta) return false
  if (!node) return false
  const isContributor = node.contributorId === requestingUserId
  const isOwner = meta.ownerUserId === requestingUserId
  if (!isContributor && !isOwner) return false

  const normalizedTitle = normalizeSpaceNodeTitle(node.title)
  await Promise.all([
    deleteSpaceNodeRecord(kv, spaceId, node.id),
    deleteSpaceNodeTitleIndex(kv, spaceId, normalizedTitle),
  ])
  const replacement = (await listSpaceNodeRecords(kv, spaceId)).find(
    (candidate) => normalizeSpaceNodeTitle(candidate.title) === normalizedTitle,
  )
  if (replacement && normalizedTitle) {
    await setSpaceNodeTitleIndex(kv, spaceId, normalizedTitle, replacement.id)
  }
  await refreshSpaceGraphMeta(kv, spaceId, { lastUpdatedAt: Date.now() })
  return true
}

// ─── Invite tokens ───────────────────────────────────────────────────────────

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key)
  const msgBytes = new TextEncoder().encode(message)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes)
  const bytes = new Uint8Array(sig)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export async function createInvite(
  kv: KVStore,
  spaceId: string,
  inviterUserId: string,
  secret: string,
): Promise<SpaceInvite> {
  if (!secret || secret.length < 16) {
    throw new Error('createInvite: secret is required')
  }
  const now = Date.now()
  // Include a nonce so rapid back-to-back invites from the same inviter
  // produce distinct tokens even at the same ms tick.
  const nonce = nanoid(8)
  const fullHmac = await hmacSha256Hex(
    secret,
    `${spaceId}:${inviterUserId}:${now}:${nonce}`,
  )
  const token = fullHmac.slice(0, 16)

  const invite: SpaceInvite = {
    token,
    spaceId,
    inviterUserId,
    createdAt: now,
    expiresAt: now + INVITE_TTL_SECONDS * 1000,
    used: false,
  }

  await putSpaceInviteRecord(kv, invite, {
    expirationTtl: INVITE_TTL_SECONDS,
  })

  return invite
}

export async function deleteInviteToken(
  kv: KVStore,
  token: string,
): Promise<void> {
  await deleteSpaceInviteRecord(kv, token)
}

/**
 * Single-use, delete-before-return. The KV key is removed on the first valid
 * call regardless of whether the caller subsequently completes the join, so a
 * second consumer always sees null. Expired invites are also deleted.
 */
export async function verifyAndConsumeInvite(
  kv: KVStore,
  token: string,
): Promise<SpaceInvite | null> {
  const v2Invite = await getSpaceInviteRecord(kv, token)
  if (!v2Invite) return null
  await deleteInviteToken(kv, token)
  if (v2Invite.expiresAt < Date.now()) return null
  return v2Invite
}

/**
 * Reveals invite metadata WITHOUT consuming the token. Used only by the
 * public `/join/[token]` preview page to show Space name/category. Callers
 * MUST NOT use this for any authorization-bearing flow.
 */
export async function peekInvite(
  kv: KVStore,
  token: string,
): Promise<SpaceInvite | null> {
  const v2Invite = await getSpaceInviteRecord(kv, token)
  if (!v2Invite) return null
  if (v2Invite.expiresAt < Date.now()) return null
  return v2Invite
}

// ─── Membership mutations ────────────────────────────────────────────────────

export async function addMemberToSpace(
  kv: KVStore,
  spaceId: string,
  newMember: SpaceMember,
): Promise<boolean> {
  const meta = await getSpaceMetaRecord(kv, spaceId)
  if (!meta) return false

  const existingMember = await getSpaceMemberRecord(kv, spaceId, newMember.userId)
  if (existingMember) {
    // Idempotent: already a member → treat as success without duplicating.
    await upsertSpaceMembership(kv, spaceId, existingMember)
    await refreshSpaceDerivedMeta(kv, spaceId)
    return true
  }

  const members = await listSpaceMemberRecords(kv, spaceId)
  if (members.length >= MAX_SPACE_MEMBERS) return false

  await upsertSpaceMembership(kv, spaceId, newMember)
  const nextMembers = await listSpaceMemberRecords(kv, spaceId)
  if (nextMembers.length > MAX_SPACE_MEMBERS) {
    const keepIds = new Set(
      [...nextMembers]
        .sort(compareSpaceMembers)
        .slice(0, MAX_SPACE_MEMBERS)
        .map((member) => member.userId),
    )
    if (!keepIds.has(newMember.userId)) {
      await removeSpaceMembership(kv, spaceId, newMember.userId)
      await refreshSpaceDerivedMeta(kv, spaceId)
      return false
    }
  }

  await refreshSpaceDerivedMeta(kv, spaceId)
  return true
}

export interface RemoveMemberResult {
  dissolved: boolean
  removed: boolean
}

export async function removeMemberFromSpace(
  kv: KVStore,
  spaceId: string,
  userId: string,
  requestedBy: string,
): Promise<RemoveMemberResult> {
  const [meta, target, members] = await Promise.all([
    getSpaceMetaRecord(kv, spaceId),
    getSpaceMemberRecord(kv, spaceId, userId),
    listSpaceMemberRecords(kv, spaceId),
  ])
  if (!meta) return { dissolved: false, removed: false }
  if (!target) return { dissolved: false, removed: false }

  // Only the user themselves or the owner can remove.
  if (requestedBy !== userId && meta.ownerUserId !== requestedBy) {
    throw new Error('unauthorized')
  }

  const remaining = members.filter((m) => m.userId !== userId)

  // Dissolve if no members left.
  if (remaining.length === 0) {
    await dissolveSpace(kv, spaceId, members.map((member) => member.userId))
    return { dissolved: true, removed: true }
  }

  // Transfer ownership if owner left.
  let nextOwnerUserId = meta.ownerUserId
  let promotedMember: SpaceMember | null = null
  if (meta.ownerUserId === userId) {
    const earliest = [...remaining].sort(compareSpaceMembers)[0]
    nextOwnerUserId = earliest.userId
    promotedMember = earliest.role === 'owner' ? earliest : { ...earliest, role: 'owner' }
  }

  await Promise.all([
    removeSpaceMembership(kv, spaceId, userId),
    promotedMember ? putSpaceMemberRecord(kv, spaceId, promotedMember) : Promise.resolve(),
  ])
  await refreshSpaceDerivedMeta(kv, spaceId, { ownerUserId: nextOwnerUserId })
  return { dissolved: false, removed: true }
}

export async function dissolveSpace(
  kv: KVStore,
  spaceId: string,
  memberUserIds: string[],
): Promise<void> {
  const activeInviteTokens = await listActiveSpaceInviteTokens(kv, spaceId).catch((): string[] => [])
  const v2Members = await listSpaceMemberRecords(kv, spaceId).catch((): SpaceMember[] => [])
  const v2Nodes = await listSpaceNodeRecords(kv, spaceId).catch((): SharedMemoryNode[] => [])
  const allMemberUserIds = [...new Set([...memberUserIds, ...v2Members.map((member) => member.userId)])]
  const tokenDeletes: Promise<void>[] = []
  const inviteLinkDeletes: Promise<void>[] = []
  for (const token of activeInviteTokens) {
    tokenDeletes.push(deleteInviteToken(kv, token).catch(() => {}))
    inviteLinkDeletes.push(deleteSpaceInviteLink(kv, spaceId, token).catch(() => {}))
  }

  await Promise.all([
    deleteSpaceMetaRecord(kv, spaceId).catch(() => {}),
    deleteSpaceGraphMetaRecord(kv, spaceId).catch(() => {}),
    ...v2Members.map((member) =>
      deleteSpaceMemberRecord(kv, spaceId, member.userId).catch(() => {}),
    ),
    ...v2Nodes.flatMap((node) => [
      deleteSpaceNodeRecord(kv, spaceId, node.id).catch(() => {}),
      deleteSpaceNodeTitleIndex(kv, spaceId, normalizeSpaceNodeTitle(node.title)).catch(
        () => {},
      ),
    ]),
    ...tokenDeletes,
    ...inviteLinkDeletes,
    ...allMemberUserIds.map((uid) =>
      removeSpaceFromUserIndex(kv, uid, spaceId).catch(() => {}),
    ),
  ])
}

// ─── Activity & rate limits ──────────────────────────────────────────────────

export async function updateLastActive(
  kv: KVStore,
  spaceId: string,
  userId: string,
): Promise<void> {
  try {
    const member = await getSpaceMemberRecord(kv, spaceId, userId)
    if (!member) return
    member.lastActiveAt = Date.now()
    await putSpaceMemberRecord(kv, spaceId, member)
  } catch {
    /* fire-and-forget */
  }
}

export async function getSpaceWriteRateLimit(
  kv: KVStore,
  userId: string,
): Promise<number> {
  const raw = await kv.get(K.writeLimit(userId, todayUTC()))
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

export async function incrementSpaceWriteRateLimit(
  kv: KVStore,
  userId: string,
): Promise<void> {
  const key = K.writeLimit(userId, todayUTC())
  const current = await getSpaceWriteRateLimit(kv, userId)
  await kv.put(key, String(current + 1), { expirationTtl: 86_400 })
}

async function reserveSpaceQuota(
  counterName: string,
  limit: number,
  ttlSeconds: number,
): Promise<SpaceQuotaReservation> {
  const atomic = await checkAndIncrementAtomicCounter(counterName, limit, ttlSeconds)
  if (!atomic) {
    return { allowed: false, remaining: 0, current: 0, unavailable: true, counterName, limit }
  }
  return {
    allowed: atomic.allowed,
    remaining: atomic.remaining,
    current: atomic.count,
    counterName,
    limit,
  }
}

export async function reserveSpaceCreateQuota(
  userId: string,
  week: string,
): Promise<SpaceQuotaReservation> {
  return reserveSpaceQuota(K.createLimit(userId, week), SPACE_CREATE_WEEKLY_LIMIT, 8 * 86_400)
}

export async function reserveSpaceWriteQuota(userId: string): Promise<SpaceQuotaReservation> {
  return reserveSpaceQuota(K.writeLimit(userId, todayUTC()), SPACE_WRITE_DAILY_LIMIT, 86_400)
}

export async function releaseSpaceQuotaReservation(
  reservation: SpaceQuotaReservation,
): Promise<boolean> {
  if (!reservation.allowed || reservation.unavailable) return true
  const released = await decrementAtomicCounter(reservation.counterName, reservation.limit, 1)
  return released !== null
}

export function isSpaceWriteLimitExceeded(count: number): boolean {
  return count >= SPACE_WRITE_DAILY_LIMIT
}

// ─── Invite registry on metadata (max 5 active) ──────────────────────────────

export async function registerInviteOnSpace(
  kv: KVStore,
  spaceId: string,
  token: string,
): Promise<boolean> {
  const meta = await getSpaceMetaRecord(kv, spaceId)
  if (!meta) return false

  const active = await listActiveSpaceInviteTokens(kv, spaceId).catch((): string[] => [])
  if (active.includes(token)) {
    await refreshSpaceDerivedMeta(kv, spaceId)
    return true
  }
  if (active.length >= MAX_ACTIVE_INVITES) return false

  const invite = await getSpaceInviteRecord(kv, token)
  if (!invite || invite.spaceId !== spaceId) return false

  await putSpaceInviteLink(kv, {
    spaceId,
    token,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  })
  const activeAfterWrite = await listActiveSpaceInviteTokens(kv, spaceId).catch((): string[] => [])
  if (activeAfterWrite.length > MAX_ACTIVE_INVITES) {
    const keepTokens = new Set(
      (await Promise.all(
        activeAfterWrite.map(async (activeToken) => ({
          token: activeToken,
          invite: await getSpaceInviteRecord(kv, activeToken),
        })),
      ))
        .sort((a, b) => {
          const createdAtA = a.invite?.createdAt ?? 0
          const createdAtB = b.invite?.createdAt ?? 0
          return createdAtA - createdAtB || a.token.localeCompare(b.token)
        })
        .slice(0, MAX_ACTIVE_INVITES)
        .map((entry) => entry.token),
    )
    if (!keepTokens.has(token)) {
      await deleteSpaceInviteLink(kv, spaceId, token)
      await refreshSpaceDerivedMeta(kv, spaceId)
      return false
    }
  }
  await refreshSpaceDerivedMeta(kv, spaceId)
  return true
}

export async function unregisterInviteFromSpace(
  kv: KVStore,
  spaceId: string,
  token: string,
): Promise<void> {
  await deleteSpaceInviteLink(kv, spaceId, token)
  await refreshSpaceDerivedMeta(kv, spaceId)
}

// ─── Metadata mutations ──────────────────────────────────────────────────────

export interface UpdateSpaceMetaInput {
  name?: string
  description?: string
  emoji?: string
}

export async function updateSpaceMeta(
  kv: KVStore,
  spaceId: string,
  input: UpdateSpaceMetaInput,
): Promise<SpaceMetadata | null> {
  const meta = await getSpace(kv, spaceId)
  if (!meta) return null
  if (input.name !== undefined) meta.name = input.name
  if (input.description !== undefined) meta.description = input.description
  if (input.emoji !== undefined) meta.emoji = input.emoji
  await saveSpace(kv, meta)
  return meta
}

// Exported for callers that need the full member list.
export { saveSpaceMembers, saveSpace }

// Helper for role derivation.
export function roleForUser(
  meta: SpaceMetadata,
  member: SpaceMember,
): SpaceRole {
  return meta.ownerUserId === member.userId ? 'owner' : member.role
}

// Type helpers re-exported for convenience.
export type { LifeGraph, LifeNode }
