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
  SPACE_WRITE_DAILY_LIMIT,
} from '@/types/spaces'
import { encryptKVValue, decryptKVValue } from '@/lib/server/kv-crypto'

// ─── Key builders ────────────────────────────────────────────────────────────

const K = {
  meta: (spaceId: string) => `space:meta:${spaceId}`,
  members: (spaceId: string) => `space:members:${spaceId}`,
  graph: (spaceId: string) => `space:graph:${spaceId}`,
  index: (userId: string) => `space:index:${userId}`,
  invite: (token: string) => `space:invite:${token}`,
  writeLimit: (userId: string, date: string) =>
    `ratelimit:space-write:${userId}:${date}`,
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyGraph(): LifeGraph {
  return { nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }
}

// ─── Low-level encrypted JSON helpers ────────────────────────────────────────

async function putEncryptedJSON(
  kv: KVStore,
  key: string,
  salt: string,
  value: unknown,
  options?: { expirationTtl?: number },
): Promise<void> {
  const ciphertext = await encryptKVValue(JSON.stringify(value), salt)
  await kv.put(key, ciphertext, options)
}

async function getEncryptedJSON<T>(
  kv: KVStore,
  key: string,
  salt: string,
): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  const plaintext = await decryptKVValue(raw, salt)
  if (plaintext === null) {
    // Decrypt failure: treat as "no data" per spec Rule 4. A warn log keeps
    // the signal visible without leaking ciphertext.
    console.warn(`[spaces] decrypt failed for key=${key}`)
    return null
  }
  try {
    return JSON.parse(plaintext) as T
  } catch {
    console.warn(`[spaces] JSON parse failed for key=${key}`)
    return null
  }
}

// ─── Space metadata ──────────────────────────────────────────────────────────

export async function getSpace(
  kv: KVStore,
  spaceId: string,
): Promise<SpaceMetadata | null> {
  return getEncryptedJSON<SpaceMetadata>(kv, K.meta(spaceId), spaceId)
}

async function saveSpace(kv: KVStore, meta: SpaceMetadata): Promise<void> {
  await putEncryptedJSON(kv, K.meta(meta.spaceId), meta.spaceId, meta)
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getSpaceMembers(
  kv: KVStore,
  spaceId: string,
): Promise<SpaceMember[]> {
  const members = await getEncryptedJSON<SpaceMember[]>(
    kv,
    K.members(spaceId),
    spaceId,
  )
  return Array.isArray(members) ? members : []
}

async function saveSpaceMembers(
  kv: KVStore,
  spaceId: string,
  members: SpaceMember[],
): Promise<void> {
  await putEncryptedJSON(kv, K.members(spaceId), spaceId, members)
}

export async function verifyMembership(
  kv: KVStore,
  spaceId: string,
  userId: string,
): Promise<SpaceMember | null> {
  const members = await getSpaceMembers(kv, spaceId)
  return members.find((m) => m.userId === userId) ?? null
}

// ─── Per-user index ──────────────────────────────────────────────────────────

export async function getUserSpaces(
  kv: KVStore,
  userId: string,
): Promise<string[]> {
  const ids = await getEncryptedJSON<string[]>(kv, K.index(userId), userId)
  return Array.isArray(ids) ? ids : []
}

async function saveUserSpaces(
  kv: KVStore,
  userId: string,
  spaceIds: string[],
): Promise<void> {
  await putEncryptedJSON(kv, K.index(userId), userId, spaceIds)
}

async function addSpaceToUserIndex(
  kv: KVStore,
  userId: string,
  spaceId: string,
): Promise<void> {
  const current = await getUserSpaces(kv, userId)
  if (!current.includes(spaceId)) {
    current.push(spaceId)
    await saveUserSpaces(kv, userId, current)
  }
}

async function removeSpaceFromUserIndex(
  kv: KVStore,
  userId: string,
  spaceId: string,
): Promise<void> {
  const current = await getUserSpaces(kv, userId)
  const next = current.filter((id) => id !== spaceId)
  if (next.length !== current.length) {
    await saveUserSpaces(kv, userId, next)
  }
}

// ─── Space graph ─────────────────────────────────────────────────────────────

export async function getSpaceGraph(
  kv: KVStore,
  spaceId: string,
): Promise<LifeGraph> {
  const graph = await getEncryptedJSON<LifeGraph>(kv, K.graph(spaceId), spaceId)
  if (!graph || !Array.isArray(graph.nodes)) return emptyGraph()
  return graph
}

export async function saveSpaceGraph(
  kv: KVStore,
  spaceId: string,
  graph: LifeGraph,
): Promise<void> {
  graph.version = (graph.version || 0) + 1
  graph.lastUpdatedAt = Date.now()
  await putEncryptedJSON(kv, K.graph(spaceId), spaceId, graph)
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
    putEncryptedJSON(kv, K.graph(spaceId), spaceId, emptyGraph()),
    addSpaceToUserIndex(kv, ownerUserId, spaceId),
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

export async function addNodeToSpace(
  kv: KVStore,
  spaceId: string,
  contributorId: string,
  contributorDisplayName: string,
  nodeInput: AddNodeInput,
): Promise<SharedMemoryNode> {
  const graph = await getSpaceGraph(kv, spaceId)
  const now = Date.now()
  const titleLower = nodeInput.title.toLowerCase().trim()

  // Deduplication / merge — mirrors lib/memory/life-graph.ts behaviour but
  // without Vectorize (Space graphs stay KV-only for now).
  const existing = graph.nodes.find(
    (n) => n.title.toLowerCase().trim() === titleLower,
  ) as SharedMemoryNode | undefined

  let node: SharedMemoryNode
  if (existing) {
    existing.detail =
      nodeInput.detail.length > existing.detail.length
        ? nodeInput.detail
        : `${existing.detail} ${nodeInput.detail}`.slice(0, 500)
    existing.tags = [...new Set([...existing.tags, ...nodeInput.tags])].slice(0, 8)
    existing.people = [...new Set([...existing.people, ...nodeInput.people])]
    existing.emotionalWeight = Math.max(
      existing.emotionalWeight,
      nodeInput.emotionalWeight,
    )
    existing.confidence = Math.min(1, existing.confidence + 0.1)
    existing.updatedAt = now
    existing.category = nodeInput.category
    // Attribution: the person who re-added is now listed as contributor so
    // they can edit/delete. Original author attribution is NOT retained — the
    // Space is a shared record and we don't want phantom access via old ids.
    existing.contributorId = contributorId
    existing.contributorDisplayName = contributorDisplayName.slice(0, 50)
    node = existing
  } else {
    node = {
      id: nanoid(12),
      userId: contributorId, // base LifeNode field — historical compat
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
      // Space fields
      spaceId,
      contributorId,
      contributorDisplayName: contributorDisplayName.slice(0, 50),
      visibility: 'space',
    }
    graph.nodes.push(node)
  }

  await saveSpaceGraph(kv, spaceId, graph)
  return node
}

export async function deleteNodeFromSpace(
  kv: KVStore,
  spaceId: string,
  nodeId: string,
  requestingUserId: string,
): Promise<boolean> {
  const [graph, meta] = await Promise.all([
    getSpaceGraph(kv, spaceId),
    getSpace(kv, spaceId),
  ])
  if (!meta) return false

  const idx = graph.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) return false

  const node = graph.nodes[idx] as SharedMemoryNode
  const isContributor = node.contributorId === requestingUserId
  const isOwner = meta.ownerUserId === requestingUserId
  if (!isContributor && !isOwner) return false

  graph.nodes.splice(idx, 1)
  await saveSpaceGraph(kv, spaceId, graph)
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

  await putEncryptedJSON(kv, K.invite(token), token, invite, {
    expirationTtl: INVITE_TTL_SECONDS,
  })

  return invite
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
  const invite = await getEncryptedJSON<SpaceInvite>(
    kv,
    K.invite(token),
    token,
  )
  if (!invite) return null

  // Delete immediately — single-use contract. Fire-and-forget style but we
  // await to ensure the delete lands before we return the token to the caller.
  await kv.delete(K.invite(token)).catch(() => {})

  if (invite.expiresAt < Date.now()) return null
  return invite
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
  const invite = await getEncryptedJSON<SpaceInvite>(
    kv,
    K.invite(token),
    token,
  )
  if (!invite) return null
  if (invite.expiresAt < Date.now()) return null
  return invite
}

// ─── Membership mutations ────────────────────────────────────────────────────

export async function addMemberToSpace(
  kv: KVStore,
  spaceId: string,
  newMember: SpaceMember,
): Promise<boolean> {
  const [members, meta] = await Promise.all([
    getSpaceMembers(kv, spaceId),
    getSpace(kv, spaceId),
  ])
  if (!meta) return false
  if (members.length >= MAX_SPACE_MEMBERS) return false
  if (members.some((m) => m.userId === newMember.userId)) {
    // Idempotent: already a member → treat as success without duplicating.
    return true
  }

  members.push(newMember)
  meta.memberCount = members.length

  await Promise.all([
    saveSpaceMembers(kv, spaceId, members),
    saveSpace(kv, meta),
    addSpaceToUserIndex(kv, newMember.userId, spaceId),
  ])
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
  const [members, meta] = await Promise.all([
    getSpaceMembers(kv, spaceId),
    getSpace(kv, spaceId),
  ])
  if (!meta) return { dissolved: false, removed: false }

  const target = members.find((m) => m.userId === userId)
  if (!target) return { dissolved: false, removed: false }

  // Only the user themselves or the owner can remove.
  if (requestedBy !== userId && meta.ownerUserId !== requestedBy) {
    throw new Error('unauthorized')
  }

  const remaining = members.filter((m) => m.userId !== userId)

  // Dissolve if no members left.
  if (remaining.length === 0) {
    await dissolveSpace(kv, spaceId, [userId])
    return { dissolved: true, removed: true }
  }

  // Transfer ownership if owner left.
  if (meta.ownerUserId === userId) {
    const earliest = [...remaining].sort((a, b) => a.joinedAt - b.joinedAt)[0]
    earliest.role = 'owner'
    meta.ownerUserId = earliest.userId
  }

  meta.memberCount = remaining.length

  await Promise.all([
    saveSpaceMembers(kv, spaceId, remaining),
    saveSpace(kv, meta),
    removeSpaceFromUserIndex(kv, userId, spaceId),
  ])
  return { dissolved: false, removed: true }
}

export async function dissolveSpace(
  kv: KVStore,
  spaceId: string,
  memberUserIds: string[],
): Promise<void> {
  // Best-effort read metadata to know which invite tokens to clean up.
  const meta = await getSpace(kv, spaceId)
  const tokenDeletes: Promise<void>[] = []
  if (meta?.activeInviteTokens?.length) {
    for (const token of meta.activeInviteTokens) {
      tokenDeletes.push(kv.delete(K.invite(token)).catch(() => {}))
    }
  }

  await Promise.all([
    kv.delete(K.meta(spaceId)).catch(() => {}),
    kv.delete(K.members(spaceId)).catch(() => {}),
    kv.delete(K.graph(spaceId)).catch(() => {}),
    ...tokenDeletes,
    ...memberUserIds.map((uid) =>
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
    const members = await getSpaceMembers(kv, spaceId)
    const member = members.find((m) => m.userId === userId)
    if (!member) return
    member.lastActiveAt = Date.now()
    await saveSpaceMembers(kv, spaceId, members)
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

export function isSpaceWriteLimitExceeded(count: number): boolean {
  return count >= SPACE_WRITE_DAILY_LIMIT
}

// ─── Invite registry on metadata (max 5 active) ──────────────────────────────

export async function registerInviteOnSpace(
  kv: KVStore,
  spaceId: string,
  token: string,
): Promise<boolean> {
  const meta = await getSpace(kv, spaceId)
  if (!meta) return false
  const active = meta.activeInviteTokens ?? []
  if (active.length >= MAX_ACTIVE_INVITES) return false
  active.push(token)
  meta.activeInviteTokens = active
  await saveSpace(kv, meta)
  return true
}

export async function unregisterInviteFromSpace(
  kv: KVStore,
  spaceId: string,
  token: string,
): Promise<void> {
  const meta = await getSpace(kv, spaceId)
  if (!meta) return
  const next = (meta.activeInviteTokens ?? []).filter((t) => t !== token)
  if (next.length !== (meta.activeInviteTokens?.length ?? 0)) {
    meta.activeInviteTokens = next
    await saveSpace(kv, meta)
  }
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
