import { normalizeString, normalizeInteger, normalizeStringArray } from "@/lib/validation"
import type { KVStore } from '@/types'
import type { LifeGraph, LifeNode, MemoryCategory } from '@/types/memory'

const V2_PREFIX = 'lifegraph:v2'
const LIST_PAGE_LIMIT = 1000

const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  'person',
  'goal',
  'habit',
  'preference',
  'event',
  'emotion',
  'skill',
  'place',
  'belief',
  'relationship',
])

const MEMORY_SOURCES = new Set<LifeNode['source']>([
  'conversation',
  'explicit',
  'inferred',
  'visual',
])

const MAX_LIFE_GRAPH_READ_LIMIT = 500

export interface LifeGraphMeta {
  userId: string
  storageVersion: 2
  totalInteractions: number
  nodeCount: number
  lastUpdatedAt: number
  version: number
  migratedAt?: number
}

export interface LifeNodeTitleIndex {
  nodeId: string
  updatedAt: number
}

export interface LifeGraphIndex {
  nodeIds: string[]
  updatedAt: number
}

export interface LifeGraphReadOptions {
  limit?: number
  cursor?: string | null
  newestFirst?: boolean
}

interface LifeNodeIdPage {
  nodeIds: string[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

export interface LifeNodePage {
  nodes: LifeNode[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

export function buildLifeGraphNodePrefix(userId: string): string {
  return `${V2_PREFIX}:node:${userId}:`
}

export function buildLifeGraphNodeKey(userId: string, nodeId: string): string {
  return `${buildLifeGraphNodePrefix(userId)}${nodeId}`
}

export function buildLifeGraphMetaKey(userId: string): string {
  return `${V2_PREFIX}:meta:${userId}`
}

export function buildLifeGraphTitleKey(userId: string, normalizedTitle: string): string {
  return `${V2_PREFIX}:title:${userId}:${normalizedTitle}`
}

export function buildLifeGraphIndexKey(userId: string): string {
  return `${V2_PREFIX}:index:${userId}`
}

export function normalizeLifeGraphTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
}

export function emptyLifeGraphMeta(userId: string): LifeGraphMeta {
  return {
    userId,
    storageVersion: 2,
    totalInteractions: 0,
    nodeCount: 0,
    lastUpdatedAt: 0,
    version: 2,
  }
}

export function emptyLifeGraphIndex(): LifeGraphIndex {
  return {
    nodeIds: [],
    updatedAt: 0,
  }
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}




function normalizeUnitInterval(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function coerceCategory(value: unknown): MemoryCategory {
  return typeof value === 'string' && MEMORY_CATEGORIES.has(value as MemoryCategory)
    ? value as MemoryCategory
    : 'preference'
}

function coerceSource(value: unknown): LifeNode['source'] {
  return typeof value === 'string' && MEMORY_SOURCES.has(value as LifeNode['source'])
    ? value as LifeNode['source']
    : 'conversation'
}

function normalizeLifeNodeValue(value: unknown): LifeNode | null {
  if (!isRecord(value)) return null

  const id = normalizeString(value.id, 120)
  const userId = normalizeString(value.userId, 200)
  const title = normalizeString(value.title, 80)
  const detail = normalizeString(value.detail, 2500)

  if (!id || !userId || !title) {
    return null
  }

  return {
    id,
    userId,
    category: coerceCategory(value.category),
    title,
    detail,
    tags: normalizeStringArray(value.tags, 8),
    people: normalizeStringArray(value.people),
    emotionalWeight: normalizeUnitInterval(value.emotionalWeight, 0.5),
    confidence: normalizeUnitInterval(value.confidence, 0.5),
    createdAt: normalizeInteger(value.createdAt),
    updatedAt: normalizeInteger(value.updatedAt),
    accessCount: normalizeInteger(value.accessCount),
    lastAccessedAt: normalizeInteger(value.lastAccessedAt),
    source: coerceSource(value.source),
  }
}

function normalizeLifeGraphMetaValue(value: unknown, userId: string): LifeGraphMeta | null {
  if (!isRecord(value)) return null

  const storedUserId = normalizeString(value.userId, 200) || userId
  if (!storedUserId) return null

  return {
    userId: storedUserId,
    storageVersion: 2,
    totalInteractions: normalizeInteger(value.totalInteractions),
    nodeCount: normalizeInteger(value.nodeCount),
    lastUpdatedAt: normalizeInteger(value.lastUpdatedAt),
    version: Math.max(2, normalizeInteger(value.version, 2)),
    migratedAt: value.migratedAt === undefined ? undefined : normalizeInteger(value.migratedAt),
  }
}

function normalizeLifeNodeTitleIndexValue(value: unknown): LifeNodeTitleIndex | null {
  if (!isRecord(value)) return null

  const nodeId = normalizeString(value.nodeId, 120)
  if (!nodeId) return null

  return {
    nodeId,
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeLifeGraphIndexValue(value: unknown): LifeGraphIndex | null {
  if (!isRecord(value)) return null

  return {
    nodeIds: dedupeIds(normalizeStringArray(value.nodeIds)),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeLifeNodeForWrite(node: LifeNode): LifeNode {
  const normalized = normalizeLifeNodeValue(node)
  if (!normalized) {
    throw new Error('Invalid LifeNode payload')
  }
  return normalized
}

function normalizeLifeGraphMetaForWrite(meta: LifeGraphMeta): LifeGraphMeta {
  const normalized = normalizeLifeGraphMetaValue(meta, meta.userId)
  if (!normalized) {
    throw new Error('Invalid LifeGraphMeta payload')
  }
  return normalized
}

function normalizeLifeGraphIndexForWrite(index: LifeGraphIndex): LifeGraphIndex {
  const normalized = normalizeLifeGraphIndexValue(index)
  if (!normalized) {
    throw new Error('Invalid LifeGraphIndex payload')
  }
  return normalized
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function extractNodeIdFromKey(key: string, prefix: string): string | null {
  if (!key.startsWith(prefix)) return null
  const nodeId = key.slice(prefix.length).trim()
  return nodeId || null
}

function sortLifeNodes(nodes: LifeNode[]): LifeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt
    return a.id.localeCompare(b.id)
  })
}

async function readJsonValue<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function listKeysByPrefix(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  prefix: string,
): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined

  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) {
      keys.push(entry.name)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  return keys
}

export async function getLifeGraphMeta(kv: KVStore, userId: string): Promise<LifeGraphMeta> {
  const parsed = await readJsonValue<LifeGraphMeta>(kv, buildLifeGraphMetaKey(userId))
  return normalizeLifeGraphMetaValue(parsed, userId) ?? emptyLifeGraphMeta(userId)
}

export async function saveLifeGraphMeta(kv: KVStore, meta: LifeGraphMeta): Promise<LifeGraphMeta> {
  const normalized = normalizeLifeGraphMetaForWrite(meta)
  await kv.put(buildLifeGraphMetaKey(normalized.userId), JSON.stringify(normalized))
  return normalized
}

export async function getLifeGraphIndex(kv: KVStore, userId: string): Promise<LifeGraphIndex> {
  const parsed = await readJsonValue<LifeGraphIndex>(kv, buildLifeGraphIndexKey(userId))
  return normalizeLifeGraphIndexValue(parsed) ?? emptyLifeGraphIndex()
}

export async function saveLifeGraphIndex(
  kv: KVStore,
  userId: string,
  index: LifeGraphIndex,
): Promise<LifeGraphIndex> {
  const normalized = normalizeLifeGraphIndexForWrite(index)
  await kv.put(buildLifeGraphIndexKey(userId), JSON.stringify(normalized))
  return normalized
}

export async function addLifeNodeIdToIndex(
  kv: KVStore,
  userId: string,
  nodeId: string,
): Promise<LifeGraphIndex> {
  const index = await getLifeGraphIndex(kv, userId)
  return saveLifeGraphIndex(kv, userId, {
    nodeIds: dedupeIds([...index.nodeIds, nodeId]),
    updatedAt: Date.now(),
  })
}

export async function removeLifeNodeIdFromIndex(
  kv: KVStore,
  userId: string,
  nodeId: string,
): Promise<LifeGraphIndex> {
  const index = await getLifeGraphIndex(kv, userId)
  return saveLifeGraphIndex(kv, userId, {
    nodeIds: index.nodeIds.filter((existingId) => existingId !== nodeId),
    updatedAt: Date.now(),
  })
}

export async function getLifeNode(
  kv: KVStore,
  userId: string,
  nodeId: string,
): Promise<LifeNode | null> {
  const parsed = await readJsonValue<LifeNode>(kv, buildLifeGraphNodeKey(userId, nodeId))
  return normalizeLifeNodeValue(parsed)
}

export async function getLifeNodesByIds(
  kv: KVStore,
  userId: string,
  nodeIds: string[],
): Promise<LifeNode[]> {
  const uniqueIds = dedupeIds(nodeIds)
  const nodes = await Promise.all(uniqueIds.map((nodeId) => getLifeNode(kv, userId, nodeId)))
  return nodes.filter((node): node is LifeNode => node !== null)
}

export async function listLifeNodeIds(kv: KVStore, userId: string): Promise<string[]> {
  if (supportsList(kv)) {
    try {
      const prefix = buildLifeGraphNodePrefix(userId)
      const keys = await listKeysByPrefix(kv, prefix)
      const listedIds = dedupeIds(
        keys
          .map((key) => extractNodeIdFromKey(key, prefix))
          .filter((nodeId): nodeId is string => nodeId !== null),
      )
      if (listedIds.length > 0) {
        return listedIds
      }
    } catch {
    }
  }

  const index = await getLifeGraphIndex(kv, userId)
  return index.nodeIds
}

export async function listLifeNodes(kv: KVStore, userId: string): Promise<LifeNode[]> {
  const nodeIds = await listLifeNodeIds(kv, userId)
  const nodes = await getLifeNodesByIds(kv, userId, nodeIds)
  return sortLifeNodes(nodes)
}

function normalizeLifeGraphReadLimit(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const normalized = Math.floor(value)
  if (normalized <= 0) return null
  return Math.min(MAX_LIFE_GRAPH_READ_LIMIT, normalized)
}

function parseLifeGraphReadCursor(cursor: string | null | undefined): number {
  if (typeof cursor !== 'string' || cursor.trim().length === 0) return 0
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function buildLifeNodeIdPage(
  nodeIds: string[],
  options?: LifeGraphReadOptions,
): LifeNodeIdPage {
  const totalCount = nodeIds.length
  const limit = normalizeLifeGraphReadLimit(options?.limit)

  if (!limit) {
    return {
      nodeIds,
      nextCursor: null,
      hasMore: false,
      totalCount,
    }
  }

  const cursor = parseLifeGraphReadCursor(options?.cursor)

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

export async function listLifeNodeIdsPage(
  kv: KVStore,
  userId: string,
  options?: LifeGraphReadOptions,
): Promise<LifeNodeIdPage> {
  const index = await getLifeGraphIndex(kv, userId)
  if (index.nodeIds.length > 0 || !supportsList(kv)) {
    return buildLifeNodeIdPage(index.nodeIds, options)
  }

  const nodeIds = await listLifeNodeIds(kv, userId)
  return buildLifeNodeIdPage(nodeIds, options)
}

export async function listLifeNodesPage(
  kv: KVStore,
  userId: string,
  options?: LifeGraphReadOptions,
): Promise<LifeNodePage> {
  const page = await listLifeNodeIdsPage(kv, userId, options)
  const nodes = await getLifeNodesByIds(kv, userId, page.nodeIds)

  return {
    nodes,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    totalCount: page.totalCount,
  }
}

export async function putLifeNode(kv: KVStore, node: LifeNode): Promise<LifeNode> {
  const normalized = normalizeLifeNodeForWrite(node)
  await kv.put(buildLifeGraphNodeKey(normalized.userId, normalized.id), JSON.stringify(normalized))
  await addLifeNodeIdToIndex(kv, normalized.userId, normalized.id)
  return normalized
}

export async function deleteLifeNodeRecord(
  kv: KVStore,
  userId: string,
  nodeId: string,
): Promise<void> {
  await kv.delete(buildLifeGraphNodeKey(userId, nodeId))
  await removeLifeNodeIdFromIndex(kv, userId, nodeId)
}

export async function getLifeNodeTitleIndex(
  kv: KVStore,
  userId: string,
  normalizedTitle: string,
): Promise<LifeNodeTitleIndex | null> {
  const safeTitle = normalizeLifeGraphTitle(normalizedTitle)
  if (!safeTitle) return null
  const parsed = await readJsonValue<LifeNodeTitleIndex>(kv, buildLifeGraphTitleKey(userId, safeTitle))
  return normalizeLifeNodeTitleIndexValue(parsed)
}

export async function setLifeNodeTitleIndex(
  kv: KVStore,
  userId: string,
  normalizedTitle: string,
  nodeId: string,
): Promise<LifeNodeTitleIndex | null> {
  const safeTitle = normalizeLifeGraphTitle(normalizedTitle)
  const safeNodeId = nodeId.trim()
  if (!safeTitle || !safeNodeId) return null

  const value: LifeNodeTitleIndex = {
    nodeId: safeNodeId,
    updatedAt: Date.now(),
  }

  await kv.put(buildLifeGraphTitleKey(userId, safeTitle), JSON.stringify(value))
  return value
}

export async function deleteLifeNodeTitleIndex(
  kv: KVStore,
  userId: string,
  normalizedTitle: string,
): Promise<void> {
  const safeTitle = normalizeLifeGraphTitle(normalizedTitle)
  if (!safeTitle) return
  await kv.delete(buildLifeGraphTitleKey(userId, safeTitle))
}

export async function findLifeNodeByNormalizedTitle(
  kv: KVStore,
  userId: string,
  normalizedTitle: string,
): Promise<LifeNode | null> {
  const titleIndex = await getLifeNodeTitleIndex(kv, userId, normalizedTitle)
  if (!titleIndex) return null

  const node = await getLifeNode(kv, userId, titleIndex.nodeId)
  if (!node) {
    await deleteLifeNodeTitleIndex(kv, userId, normalizedTitle).catch(() => {})
    return null
  }

  return node
}

export async function recordNodeAccessBatch(
  kv: KVStore,
  userId: string,
  nodeIds: string[],
  accessedAt: number,
): Promise<void> {
  const nodes = await getLifeNodesByIds(kv, userId, nodeIds)
  await Promise.all(
    nodes.map((node) =>
      putLifeNode(kv, {
        ...node,
        accessCount: node.accessCount + 1,
        lastAccessedAt: accessedAt,
      }),
    ),
  )
}

export async function buildLifeGraphSnapshot(
  kv: KVStore,
  userId: string,
  options?: LifeGraphReadOptions,
): Promise<LifeGraph> {
  const [meta, pagedNodes] = await Promise.all([
    getLifeGraphMeta(kv, userId),
    options?.limit ? listLifeNodesPage(kv, userId, options) : listLifeNodes(kv, userId),
  ])
  const nodes = Array.isArray(pagedNodes) ? pagedNodes : pagedNodes.nodes

  const lastNodeUpdatedAt = nodes.reduce(
    (max, node) => Math.max(max, node.updatedAt, node.lastAccessedAt),
    0,
  )

  return {
    nodes,
    totalInteractions: meta.totalInteractions,
    lastUpdatedAt: Math.max(meta.lastUpdatedAt, lastNodeUpdatedAt),
    version: Math.max(meta.version, meta.storageVersion),
  }
}
