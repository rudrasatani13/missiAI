import { isRecord } from "@/lib/utils/is-record"
import type { KVStore } from '@/types'
import type { LifeGraph } from '@/types/memory'
import type {
  SharedMemoryNode,
  SpaceCategory,
  SpaceInvite,
  SpaceMember,
  SpaceMetadata,
  SpaceRole,
} from '@/types/spaces'
import { MEMORY_CATEGORIES, SPACE_CATEGORIES } from '@/types/spaces'
import { encryptKVValue, decryptKVValue } from '@/lib/server/security/kv-crypto'

const V2_PREFIX = 'space:v2'
const LIST_PAGE_LIMIT = 1000
const MAX_SPACE_GRAPH_READ_LIMIT = 50
const SPACE_ROLE_SET = new Set<SpaceRole>(['owner', 'member'])
const SPACE_CATEGORY_SET = new Set<SpaceCategory>(SPACE_CATEGORIES)
const MEMORY_CATEGORY_SET = new Set(MEMORY_CATEGORIES)
const SOURCE_SET = new Set<SharedMemoryNode['source']>(['conversation', 'explicit', 'inferred', 'visual'])

export interface SpaceMetaRecord {
  spaceId: string
  name: string
  description: string
  category: SpaceCategory
  emoji: string
  createdAt: number
  ownerUserId: string
  memberCount: number
  activeInviteCount: number
  storageVersion: 2
  updatedAt: number
}

export interface UserSpaceLink {
  userId: string
  spaceId: string
  joinedAt: number
}

export interface SpaceGraphMetaRecord {
  spaceId: string
  nodeCount: number
  totalInteractions: number
  lastUpdatedAt: number
  version: number
  storageVersion: 2
}

export interface SpaceNodeTitleIndex {
  nodeId: string
  updatedAt: number
}

export interface SpaceInviteLink {
  spaceId: string
  token: string
  createdAt: number
  expiresAt: number
}

interface RecordIndex {
  ids: string[]
  updatedAt: number
}

export interface SpaceGraphReadOptions {
  limit?: number
  cursor?: string | null
  newestFirst?: boolean
}

interface SpaceNodeIdPage {
  nodeIds: string[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

export interface SpaceNodePage {
  nodes: SharedMemoryNode[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

export function buildSpaceMetaRecordKey(spaceId: string): string {
  return `${V2_PREFIX}:meta:${spaceId}`
}

export function buildSpaceMemberRecordPrefix(spaceId: string): string {
  return `${V2_PREFIX}:member:${spaceId}:`
}

export function buildSpaceMemberRecordKey(spaceId: string, userId: string): string {
  return `${buildSpaceMemberRecordPrefix(spaceId)}${userId}`
}

export function buildUserSpaceLinkPrefix(userId: string): string {
  return `${V2_PREFIX}:user-space:${userId}:`
}

export function buildUserSpaceLinkKey(userId: string, spaceId: string): string {
  return `${buildUserSpaceLinkPrefix(userId)}${spaceId}`
}

export function buildSpaceGraphMetaRecordKey(spaceId: string): string {
  return `${V2_PREFIX}:graph-meta:${spaceId}`
}

export function buildSpaceNodeRecordPrefix(spaceId: string): string {
  return `${V2_PREFIX}:node:${spaceId}:`
}

export function buildSpaceNodeRecordKey(spaceId: string, nodeId: string): string {
  return `${buildSpaceNodeRecordPrefix(spaceId)}${nodeId}`
}

export function buildSpaceNodeTitleKey(spaceId: string, normalizedTitle: string): string {
  return `${V2_PREFIX}:title:${spaceId}:${normalizedTitle}`
}

export function buildSpaceInviteRecordKey(token: string): string {
  return `${V2_PREFIX}:invite:${token}`
}

export function buildSpaceInviteLinkPrefix(spaceId: string): string {
  return `${V2_PREFIX}:invite-link:${spaceId}:`
}

export function buildSpaceInviteLinkKey(spaceId: string, token: string): string {
  return `${buildSpaceInviteLinkPrefix(spaceId)}${token}`
}

function buildSpaceMemberIndexKey(spaceId: string): string {
  return `${V2_PREFIX}:member-index:${spaceId}`
}

function buildUserSpaceIndexKey(userId: string): string {
  return `${V2_PREFIX}:user-index:${userId}`
}

function buildSpaceNodeIndexKey(spaceId: string): string {
  return `${V2_PREFIX}:node-index:${spaceId}`
}

function buildSpaceInviteIndexKey(spaceId: string): string {
  return `${V2_PREFIX}:invite-index:${spaceId}`
}

export function normalizeSpaceNodeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}


function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeStringArray(value: unknown, maxItems?: number): string[] {
  if (!Array.isArray(value)) return []
  const items = [...new Set(value.map((item) => normalizeString(item, 200)).filter(Boolean))]
  return typeof maxItems === 'number' ? items.slice(0, maxItems) : items
}

function coerceRole(value: unknown): SpaceRole {
  return typeof value === 'string' && SPACE_ROLE_SET.has(value as SpaceRole) ? value as SpaceRole : 'member'
}

function coerceCategory(value: unknown): SpaceCategory {
  return typeof value === 'string' && SPACE_CATEGORY_SET.has(value as SpaceCategory) ? value as SpaceCategory : 'other'
}

function coerceMemoryCategory(value: unknown): SharedMemoryNode['category'] {
  return typeof value === 'string' && MEMORY_CATEGORY_SET.has(value as SharedMemoryNode['category'])
    ? value as SharedMemoryNode['category']
    : 'preference'
}

function coerceSource(value: unknown): SharedMemoryNode['source'] {
  return typeof value === 'string' && SOURCE_SET.has(value as SharedMemoryNode['source'])
    ? value as SharedMemoryNode['source']
    : 'explicit'
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function normalizeIndex(value: unknown): RecordIndex | null {
  if (!isRecord(value)) return null
  return { ids: dedupeIds(normalizeStringArray(value.ids)), updatedAt: normalizeInteger(value.updatedAt) }
}

function normalizeSpaceMetaRecord(value: unknown): SpaceMetaRecord | null {
  if (!isRecord(value)) return null
  const spaceId = normalizeString(value.spaceId, 64)
  const ownerUserId = normalizeString(value.ownerUserId, 200)
  const name = normalizeString(value.name, 50)
  if (!spaceId || !ownerUserId || !name) return null
  return {
    spaceId,
    name,
    description: normalizeString(value.description, 200),
    category: coerceCategory(value.category),
    emoji: normalizeString(value.emoji, 8),
    createdAt: normalizeInteger(value.createdAt),
    ownerUserId,
    memberCount: normalizeInteger(value.memberCount),
    activeInviteCount: normalizeInteger(value.activeInviteCount),
    storageVersion: 2,
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeSpaceMemberRecord(value: unknown): SpaceMember | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  if (!userId) return null
  return {
    userId,
    role: coerceRole(value.role),
    displayName: normalizeString(value.displayName, 50),
    joinedAt: normalizeInteger(value.joinedAt),
    lastActiveAt: normalizeInteger(value.lastActiveAt),
  }
}

function normalizeUserSpaceLink(value: unknown): UserSpaceLink | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  const spaceId = normalizeString(value.spaceId, 64)
  if (!userId || !spaceId) return null
  return { userId, spaceId, joinedAt: normalizeInteger(value.joinedAt) }
}

function normalizeSpaceGraphMetaRecord(value: unknown, spaceId: string): SpaceGraphMetaRecord | null {
  if (!isRecord(value)) return null
  const storedSpaceId = normalizeString(value.spaceId, 64) || spaceId
  if (!storedSpaceId) return null
  return {
    spaceId: storedSpaceId,
    nodeCount: normalizeInteger(value.nodeCount),
    totalInteractions: normalizeInteger(value.totalInteractions),
    lastUpdatedAt: normalizeInteger(value.lastUpdatedAt),
    version: Math.max(2, normalizeInteger(value.version, 2)),
    storageVersion: 2,
  }
}

function normalizeSpaceNodeRecord(value: unknown): SharedMemoryNode | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, 120)
  const userId = normalizeString(value.userId, 200)
  const title = normalizeString(value.title, 80)
  const spaceId = normalizeString(value.spaceId, 64)
  const contributorId = normalizeString(value.contributorId, 200)
  if (!id || !spaceId || !contributorId || !title) return null
  return {
    id,
    userId: userId || contributorId,
    category: coerceMemoryCategory(value.category),
    title,
    detail: normalizeString(value.detail, 500),
    tags: normalizeStringArray(value.tags, 8),
    people: normalizeStringArray(value.people, 10),
    emotionalWeight: typeof value.emotionalWeight === 'number' ? Math.min(1, Math.max(0, value.emotionalWeight)) : 0.5,
    confidence: typeof value.confidence === 'number' ? Math.min(1, Math.max(0, value.confidence)) : 0.5,
    createdAt: normalizeInteger(value.createdAt),
    updatedAt: normalizeInteger(value.updatedAt),
    accessCount: normalizeInteger(value.accessCount),
    lastAccessedAt: normalizeInteger(value.lastAccessedAt),
    source: coerceSource(value.source),
    spaceId,
    contributorId,
    contributorDisplayName: normalizeString(value.contributorDisplayName, 50),
    visibility: 'space',
  }
}

function normalizeSpaceNodeTitleIndex(value: unknown): SpaceNodeTitleIndex | null {
  if (!isRecord(value)) return null
  const nodeId = normalizeString(value.nodeId, 120)
  if (!nodeId) return null
  return { nodeId, updatedAt: normalizeInteger(value.updatedAt) }
}

function normalizeSpaceInviteRecord(value: unknown): SpaceInvite | null {
  if (!isRecord(value)) return null
  const token = normalizeString(value.token, 64)
  const spaceId = normalizeString(value.spaceId, 64)
  const inviterUserId = normalizeString(value.inviterUserId, 200)
  if (!token || !spaceId || !inviterUserId) return null
  return {
    token,
    spaceId,
    inviterUserId,
    createdAt: normalizeInteger(value.createdAt),
    expiresAt: normalizeInteger(value.expiresAt),
    used: Boolean(value.used),
  }
}

function normalizeSpaceInviteLink(value: unknown): SpaceInviteLink | null {
  if (!isRecord(value)) return null
  const token = normalizeString(value.token, 64)
  const spaceId = normalizeString(value.spaceId, 64)
  if (!token || !spaceId) return null
  return { spaceId, token, createdAt: normalizeInteger(value.createdAt), expiresAt: normalizeInteger(value.expiresAt) }
}

async function putEncryptedJSON(kv: KVStore, key: string, salt: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
  const ciphertext = await encryptKVValue(JSON.stringify(value), salt)
  await kv.put(key, ciphertext, options)
}

async function getEncryptedJSON<T>(kv: KVStore, key: string, salt: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  const plaintext = await decryptKVValue(raw, salt)
  if (plaintext === null) return null
  try {
    return JSON.parse(plaintext) as T
  } catch {
    return null
  }
}

async function listKeysByPrefix(kv: KVStore & { list: NonNullable<KVStore['list']> }, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) keys.push(entry.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

async function getIndex(kv: KVStore, key: string, salt: string): Promise<RecordIndex> {
  const parsed = await getEncryptedJSON<RecordIndex>(kv, key, salt)
  return normalizeIndex(parsed) ?? { ids: [], updatedAt: 0 }
}

async function saveIndex(kv: KVStore, key: string, salt: string, ids: string[]): Promise<void> {
  await putEncryptedJSON(kv, key, salt, { ids: dedupeIds(ids), updatedAt: Date.now() })
}

async function addIdToIndex(kv: KVStore, key: string, salt: string, id: string): Promise<void> {
  const index = await getIndex(kv, key, salt)
  await saveIndex(kv, key, salt, [...index.ids, id])
}

async function removeIdFromIndex(kv: KVStore, key: string, salt: string, id: string): Promise<void> {
  const index = await getIndex(kv, key, salt)
  await saveIndex(kv, key, salt, index.ids.filter((existing) => existing !== id))
}

async function listIdsByPrefix(kv: KVStore, prefix: string, fallbackKey: string, fallbackSalt: string): Promise<string[]> {
  if (supportsList(kv)) {
    try {
      const keys = await listKeysByPrefix(kv, prefix)
      const ids = dedupeIds(keys.map((key) => key.slice(prefix.length)).filter(Boolean))
      if (ids.length > 0) return ids
    } catch {
    }
  }
  const index = await getIndex(kv, fallbackKey, fallbackSalt)
  return index.ids
}

function normalizeSpaceGraphReadLimit(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const normalized = Math.floor(value)
  if (normalized <= 0) return null
  return Math.min(MAX_SPACE_GRAPH_READ_LIMIT, normalized)
}

function parseSpaceGraphReadCursor(cursor: string | null | undefined): number {
  if (typeof cursor !== 'string' || cursor.trim().length === 0) return 0
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function buildSpaceNodeIdPage(
  nodeIds: string[],
  options?: SpaceGraphReadOptions,
): SpaceNodeIdPage {
  const totalCount = nodeIds.length
  const limit = normalizeSpaceGraphReadLimit(options?.limit)

  if (!limit) {
    return {
      nodeIds,
      nextCursor: null,
      hasMore: false,
      totalCount,
    }
  }

  const cursor = parseSpaceGraphReadCursor(options?.cursor)

  if (options?.newestFirst) {
    const end = Math.max(0, totalCount - cursor)
    const start = Math.max(0, end - limit)
    const pageNodeIds = nodeIds.slice(start, end).reverse()
    const hasMore = start > 0

    return {
      nodeIds: pageNodeIds,
      nextCursor: hasMore ? String(totalCount - start) : null,
      hasMore,
      totalCount,
    }
  }

  const start = Math.min(cursor, totalCount)
  const end = Math.min(totalCount, start + limit)
  const pageNodeIds = nodeIds.slice(start, end)
  const hasMore = end < totalCount

  return {
    nodeIds: pageNodeIds,
    nextCursor: hasMore ? String(end) : null,
    hasMore,
    totalCount,
  }
}

export async function getSpaceMetaRecord(kv: KVStore, spaceId: string): Promise<SpaceMetaRecord | null> {
  return normalizeSpaceMetaRecord(await getEncryptedJSON<SpaceMetaRecord>(kv, buildSpaceMetaRecordKey(spaceId), spaceId))
}

export async function saveSpaceMetaRecord(kv: KVStore, meta: SpaceMetaRecord): Promise<SpaceMetaRecord> {
  const normalized = normalizeSpaceMetaRecord(meta)
  if (!normalized) throw new Error('Invalid SpaceMetaRecord payload')
  await putEncryptedJSON(kv, buildSpaceMetaRecordKey(normalized.spaceId), normalized.spaceId, normalized)
  return normalized
}

export async function deleteSpaceMetaRecord(kv: KVStore, spaceId: string): Promise<void> {
  await kv.delete(buildSpaceMetaRecordKey(spaceId))
}

export async function getSpaceMemberRecord(kv: KVStore, spaceId: string, userId: string): Promise<SpaceMember | null> {
  return normalizeSpaceMemberRecord(await getEncryptedJSON<SpaceMember>(kv, buildSpaceMemberRecordKey(spaceId, userId), spaceId))
}

export async function listSpaceMemberRecords(kv: KVStore, spaceId: string): Promise<SpaceMember[]> {
  const userIds = await listIdsByPrefix(kv, buildSpaceMemberRecordPrefix(spaceId), buildSpaceMemberIndexKey(spaceId), spaceId)
  const members = await Promise.all(userIds.map((userId) => getSpaceMemberRecord(kv, spaceId, userId)))
  return members.filter((member): member is SpaceMember => member !== null).sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))
}

export async function putSpaceMemberRecord(kv: KVStore, spaceId: string, member: SpaceMember): Promise<SpaceMember> {
  const normalized = normalizeSpaceMemberRecord(member)
  if (!normalized) throw new Error('Invalid SpaceMember payload')
  await putEncryptedJSON(kv, buildSpaceMemberRecordKey(spaceId, normalized.userId), spaceId, normalized)
  await addIdToIndex(kv, buildSpaceMemberIndexKey(spaceId), spaceId, normalized.userId)
  return normalized
}

export async function deleteSpaceMemberRecord(kv: KVStore, spaceId: string, userId: string): Promise<void> {
  await kv.delete(buildSpaceMemberRecordKey(spaceId, userId))
  await removeIdFromIndex(kv, buildSpaceMemberIndexKey(spaceId), spaceId, userId)
}

export async function getUserSpaceLink(kv: KVStore, userId: string, spaceId: string): Promise<UserSpaceLink | null> {
  return normalizeUserSpaceLink(await getEncryptedJSON<UserSpaceLink>(kv, buildUserSpaceLinkKey(userId, spaceId), userId))
}

export async function listUserSpaceIds(kv: KVStore, userId: string): Promise<string[]> {
  return listIdsByPrefix(kv, buildUserSpaceLinkPrefix(userId), buildUserSpaceIndexKey(userId), userId)
}

export async function putUserSpaceLink(kv: KVStore, link: UserSpaceLink): Promise<UserSpaceLink> {
  const normalized = normalizeUserSpaceLink(link)
  if (!normalized) throw new Error('Invalid UserSpaceLink payload')
  await putEncryptedJSON(kv, buildUserSpaceLinkKey(normalized.userId, normalized.spaceId), normalized.userId, normalized)
  await addIdToIndex(kv, buildUserSpaceIndexKey(normalized.userId), normalized.userId, normalized.spaceId)
  return normalized
}

export async function deleteUserSpaceLink(kv: KVStore, userId: string, spaceId: string): Promise<void> {
  await kv.delete(buildUserSpaceLinkKey(userId, spaceId))
  await removeIdFromIndex(kv, buildUserSpaceIndexKey(userId), userId, spaceId)
}

export async function getSpaceGraphMetaRecord(kv: KVStore, spaceId: string): Promise<SpaceGraphMetaRecord | null> {
  return normalizeSpaceGraphMetaRecord(await getEncryptedJSON<SpaceGraphMetaRecord>(kv, buildSpaceGraphMetaRecordKey(spaceId), spaceId), spaceId)
}

export async function saveSpaceGraphMetaRecord(kv: KVStore, meta: SpaceGraphMetaRecord): Promise<SpaceGraphMetaRecord> {
  const normalized = normalizeSpaceGraphMetaRecord(meta, meta.spaceId)
  if (!normalized) throw new Error('Invalid SpaceGraphMetaRecord payload')
  await putEncryptedJSON(kv, buildSpaceGraphMetaRecordKey(normalized.spaceId), normalized.spaceId, normalized)
  return normalized
}

export async function deleteSpaceGraphMetaRecord(kv: KVStore, spaceId: string): Promise<void> {
  await kv.delete(buildSpaceGraphMetaRecordKey(spaceId))
}

export async function getSpaceNodeRecord(kv: KVStore, spaceId: string, nodeId: string): Promise<SharedMemoryNode | null> {
  return normalizeSpaceNodeRecord(await getEncryptedJSON<SharedMemoryNode>(kv, buildSpaceNodeRecordKey(spaceId, nodeId), spaceId))
}

export async function listSpaceNodeIdsPage(
  kv: KVStore,
  spaceId: string,
  options?: SpaceGraphReadOptions,
): Promise<SpaceNodeIdPage> {
  const index = await getIndex(kv, buildSpaceNodeIndexKey(spaceId), spaceId)
  if (index.ids.length > 0 || !supportsList(kv)) {
    return buildSpaceNodeIdPage(index.ids, options)
  }

  const nodeIds = await listIdsByPrefix(
    kv,
    buildSpaceNodeRecordPrefix(spaceId),
    buildSpaceNodeIndexKey(spaceId),
    spaceId,
  )
  return buildSpaceNodeIdPage(nodeIds, options)
}

export async function listSpaceNodeRecords(kv: KVStore, spaceId: string): Promise<SharedMemoryNode[]> {
  const nodeIds = await listIdsByPrefix(kv, buildSpaceNodeRecordPrefix(spaceId), buildSpaceNodeIndexKey(spaceId), spaceId)
  const nodes = await Promise.all(nodeIds.map((nodeId) => getSpaceNodeRecord(kv, spaceId, nodeId)))
  return nodes.filter((node): node is SharedMemoryNode => node !== null).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export async function listSpaceNodeRecordsPage(
  kv: KVStore,
  spaceId: string,
  options?: SpaceGraphReadOptions,
): Promise<SpaceNodePage> {
  const page = await listSpaceNodeIdsPage(kv, spaceId, options)
  const nodes = await Promise.all(page.nodeIds.map((nodeId) => getSpaceNodeRecord(kv, spaceId, nodeId)))

  return {
    nodes: nodes.filter((node): node is SharedMemoryNode => node !== null),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    totalCount: page.totalCount,
  }
}

export async function putSpaceNodeRecord(kv: KVStore, node: SharedMemoryNode): Promise<SharedMemoryNode> {
  const normalized = normalizeSpaceNodeRecord(node)
  if (!normalized) throw new Error('Invalid SharedMemoryNode payload')
  await putEncryptedJSON(kv, buildSpaceNodeRecordKey(normalized.spaceId, normalized.id), normalized.spaceId, normalized)
  await addIdToIndex(kv, buildSpaceNodeIndexKey(normalized.spaceId), normalized.spaceId, normalized.id)
  return normalized
}

export async function deleteSpaceNodeRecord(kv: KVStore, spaceId: string, nodeId: string): Promise<void> {
  await kv.delete(buildSpaceNodeRecordKey(spaceId, nodeId))
  await removeIdFromIndex(kv, buildSpaceNodeIndexKey(spaceId), spaceId, nodeId)
}

export async function getSpaceNodeTitleIndex(kv: KVStore, spaceId: string, normalizedTitle: string): Promise<SpaceNodeTitleIndex | null> {
  const safeTitle = normalizeSpaceNodeTitle(normalizedTitle)
  if (!safeTitle) return null
  return normalizeSpaceNodeTitleIndex(await getEncryptedJSON<SpaceNodeTitleIndex>(kv, buildSpaceNodeTitleKey(spaceId, safeTitle), spaceId))
}

export async function setSpaceNodeTitleIndex(kv: KVStore, spaceId: string, normalizedTitle: string, nodeId: string): Promise<SpaceNodeTitleIndex | null> {
  const safeTitle = normalizeSpaceNodeTitle(normalizedTitle)
  const safeNodeId = normalizeString(nodeId, 120)
  if (!safeTitle || !safeNodeId) return null
  const value: SpaceNodeTitleIndex = { nodeId: safeNodeId, updatedAt: Date.now() }
  await putEncryptedJSON(kv, buildSpaceNodeTitleKey(spaceId, safeTitle), spaceId, value)
  return value
}

export async function deleteSpaceNodeTitleIndex(kv: KVStore, spaceId: string, normalizedTitle: string): Promise<void> {
  const safeTitle = normalizeSpaceNodeTitle(normalizedTitle)
  if (!safeTitle) return
  await kv.delete(buildSpaceNodeTitleKey(spaceId, safeTitle))
}

export async function findSpaceNodeByNormalizedTitle(kv: KVStore, spaceId: string, normalizedTitle: string): Promise<SharedMemoryNode | null> {
  const titleIndex = await getSpaceNodeTitleIndex(kv, spaceId, normalizedTitle)
  if (!titleIndex) return null
  const node = await getSpaceNodeRecord(kv, spaceId, titleIndex.nodeId)
  if (!node) {
    await deleteSpaceNodeTitleIndex(kv, spaceId, normalizedTitle).catch(() => {})
    return null
  }
  return node
}

export async function getSpaceInviteRecord(kv: KVStore, token: string): Promise<SpaceInvite | null> {
  return normalizeSpaceInviteRecord(await getEncryptedJSON<SpaceInvite>(kv, buildSpaceInviteRecordKey(token), token))
}

export async function putSpaceInviteRecord(kv: KVStore, invite: SpaceInvite, options?: { expirationTtl?: number }): Promise<SpaceInvite> {
  const normalized = normalizeSpaceInviteRecord(invite)
  if (!normalized) throw new Error('Invalid SpaceInvite payload')
  await putEncryptedJSON(kv, buildSpaceInviteRecordKey(normalized.token), normalized.token, normalized, options)
  return normalized
}

export async function deleteSpaceInviteRecord(kv: KVStore, token: string): Promise<void> {
  await kv.delete(buildSpaceInviteRecordKey(token))
}

export async function getSpaceInviteLink(kv: KVStore, spaceId: string, token: string): Promise<SpaceInviteLink | null> {
  return normalizeSpaceInviteLink(await getEncryptedJSON<SpaceInviteLink>(kv, buildSpaceInviteLinkKey(spaceId, token), spaceId))
}

export async function listActiveSpaceInviteTokens(kv: KVStore, spaceId: string): Promise<string[]> {
  return listIdsByPrefix(kv, buildSpaceInviteLinkPrefix(spaceId), buildSpaceInviteIndexKey(spaceId), spaceId)
}

export async function putSpaceInviteLink(kv: KVStore, link: SpaceInviteLink): Promise<SpaceInviteLink> {
  const normalized = normalizeSpaceInviteLink(link)
  if (!normalized) throw new Error('Invalid SpaceInviteLink payload')
  await putEncryptedJSON(kv, buildSpaceInviteLinkKey(normalized.spaceId, normalized.token), normalized.spaceId, normalized)
  await addIdToIndex(kv, buildSpaceInviteIndexKey(normalized.spaceId), normalized.spaceId, normalized.token)
  return normalized
}

export async function deleteSpaceInviteLink(kv: KVStore, spaceId: string, token: string): Promise<void> {
  await kv.delete(buildSpaceInviteLinkKey(spaceId, token))
  await removeIdFromIndex(kv, buildSpaceInviteIndexKey(spaceId), spaceId, token)
}

export async function buildSpaceMembersSnapshot(kv: KVStore, spaceId: string): Promise<SpaceMember[]> {
  return listSpaceMemberRecords(kv, spaceId)
}

export async function buildSpaceGraphSnapshot(
  kv: KVStore,
  spaceId: string,
  options?: SpaceGraphReadOptions,
): Promise<LifeGraph> {
  const [meta, pagedNodes] = await Promise.all([
    getSpaceGraphMetaRecord(kv, spaceId),
    options?.limit ? listSpaceNodeRecordsPage(kv, spaceId, options) : listSpaceNodeRecords(kv, spaceId),
  ])
  const nodes = Array.isArray(pagedNodes) ? pagedNodes : pagedNodes.nodes
  const lastNodeUpdatedAt = nodes.reduce((max, node) => Math.max(max, node.updatedAt, node.lastAccessedAt), 0)
  return {
    nodes,
    totalInteractions: meta?.totalInteractions ?? 0,
    lastUpdatedAt: Math.max(meta?.lastUpdatedAt ?? 0, lastNodeUpdatedAt),
    version: Math.max(meta?.version ?? 2, meta?.storageVersion ?? 2),
  }
}

export function toSpaceMetadata(record: SpaceMetaRecord, activeInviteTokens: string[] = []): SpaceMetadata {
  return {
    spaceId: record.spaceId,
    name: record.name,
    description: record.description,
    category: record.category,
    emoji: record.emoji,
    createdAt: record.createdAt,
    ownerUserId: record.ownerUserId,
    memberCount: record.memberCount,
    activeInviteTokens,
  }
}
