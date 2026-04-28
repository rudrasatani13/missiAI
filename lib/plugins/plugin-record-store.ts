import type { KVStore } from "@/types"
import {
  normalizeInteger,
  normalizeString,
} from "@/lib/validation/normalization"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import type { PluginConfig, PluginId, PluginStatus } from "@/types/plugins"

const V2_PREFIX = "plugins:v2"
const MAX_USER_ID_LENGTH = 200
const MAX_PLUGIN_NAME_LENGTH = 120
const MAX_RECORD_MAP_SIZE = 50
const MAX_RECORD_KEY_LENGTH = 120
const MAX_RECORD_VALUE_LENGTH = 500
const PLUGIN_STATUS_SET = new Set<PluginStatus>(["connected", "disconnected", "error"])

export const PLUGIN_CONFIG_RECORD_IDS = Object.freeze(Object.keys(PLUGIN_METADATA) as PluginId[])

export interface PluginConfigRecord {
  userId: string
  id: PluginId
  name: string
  status: PluginStatus
  credentials: Record<string, string>
  settings: Record<string, string>
  connectedAt: number
  lastUsedAt?: number
  updatedAt: number
}

export interface PluginConfigIndex {
  userId: string
  pluginIds: PluginId[]
  updatedAt: number
}

export function buildPluginConfigRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:config:${userId}:`
}

export function buildPluginConfigRecordKey(userId: string, pluginId: PluginId): string {
  return `${buildPluginConfigRecordPrefix(userId)}${pluginId}`
}

export function buildPluginConfigIndexKey(userId: string): string {
  return `${V2_PREFIX}:index:${userId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}

  const normalized: Record<string, string> = {}
  let count = 0
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeString(rawKey, MAX_RECORD_KEY_LENGTH)
    if (!key || typeof rawValue !== "string") continue
    normalized[key] = rawValue.trim().slice(0, MAX_RECORD_VALUE_LENGTH)
    count += 1
    if (count >= MAX_RECORD_MAP_SIZE) break
  }
  return normalized
}

function parsePluginId(value: unknown): PluginId | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLUGIN_METADATA, value)
    ? value as PluginId
    : null
}

function parsePluginStatus(value: unknown): PluginStatus | null {
  return typeof value === "string" && PLUGIN_STATUS_SET.has(value as PluginStatus)
    ? value as PluginStatus
    : null
}

function normalizePluginConfigRecordValue(
  value: unknown,
  userId: string,
  pluginId: PluginId,
): PluginConfigRecord | null {
  if (!isRecord(value)) return null

  const expectedUserId = normalizeString(userId, MAX_USER_ID_LENGTH)
  if (!expectedUserId) return null

  const storedUserId = normalizeString(value.userId, MAX_USER_ID_LENGTH)
  if (storedUserId && storedUserId !== expectedUserId) return null

  const storedPluginId = value.id === undefined ? pluginId : parsePluginId(value.id)
  if (!storedPluginId || storedPluginId !== pluginId) return null

  const name = normalizeString(value.name, MAX_PLUGIN_NAME_LENGTH)
  const status = parsePluginStatus(value.status)
  if (!name || !status) return null

  return {
    userId: storedUserId || expectedUserId,
    id: storedPluginId,
    name,
    status,
    credentials: normalizeStringMap(value.credentials),
    settings: normalizeStringMap(value.settings),
    connectedAt: normalizeInteger(value.connectedAt),
    lastUsedAt: normalizeOptionalInteger(value.lastUsedAt),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizePluginConfigIndexValue(
  value: unknown,
  userId: string,
): PluginConfigIndex | null {
  if (!isRecord(value)) return null

  const expectedUserId = normalizeString(userId, MAX_USER_ID_LENGTH)
  if (!expectedUserId) return null

  const storedUserId = normalizeString(value.userId, MAX_USER_ID_LENGTH)
  if (storedUserId && storedUserId !== expectedUserId) return null

  const rawPluginIds = Array.isArray(value.pluginIds) ? value.pluginIds : []
  const pluginIds: PluginId[] = []
  for (const rawPluginId of rawPluginIds) {
    const pluginId = parsePluginId(rawPluginId)
    if (pluginId && !pluginIds.includes(pluginId)) pluginIds.push(pluginId)
  }

  return {
    userId: storedUserId || expectedUserId,
    pluginIds,
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

async function putJSON(kv: KVStore, key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
  await kv.put(key, JSON.stringify(value), options)
}

async function readJSON<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function toPluginConfig(record: PluginConfigRecord): PluginConfig {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    credentials: { ...record.credentials },
    settings: { ...record.settings },
    connectedAt: record.connectedAt,
    ...(record.lastUsedAt !== undefined ? { lastUsedAt: record.lastUsedAt } : {}),
  }
}

export async function getPluginConfigRecord(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<PluginConfigRecord | null> {
  return normalizePluginConfigRecordValue(
    await readJSON<PluginConfigRecord>(kv, buildPluginConfigRecordKey(userId, pluginId)),
    userId,
    pluginId,
  )
}

export async function getPluginConfigIndex(
  kv: KVStore,
  userId: string,
): Promise<PluginConfigIndex | null> {
  return normalizePluginConfigIndexValue(
    await readJSON<PluginConfigIndex>(kv, buildPluginConfigIndexKey(userId)),
    userId,
  )
}

export async function putPluginConfigIndex(
  kv: KVStore,
  userId: string,
  pluginIds: PluginId[],
  updatedAt = Date.now(),
): Promise<PluginConfigIndex> {
  const normalized = normalizePluginConfigIndexValue({ userId, pluginIds, updatedAt }, userId)
  if (!normalized) throw new Error("Invalid PluginConfigIndex payload")
  await putJSON(kv, buildPluginConfigIndexKey(userId), normalized)
  return normalized
}

async function listPluginIdsFromRecords(kv: KVStore, userId: string): Promise<PluginId[]> {
  const records = await Promise.all(
    PLUGIN_CONFIG_RECORD_IDS.map((pluginId) => getPluginConfigRecord(kv, userId, pluginId)),
  )
  return records.filter((record): record is PluginConfigRecord => record !== null).map((record) => record.id)
}

async function addPluginConfigIndexId(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
  updatedAt: number,
): Promise<void> {
  const existing = await getPluginConfigIndex(kv, userId)
  const pluginIds = existing ? existing.pluginIds : await listPluginIdsFromRecords(kv, userId)
  await putPluginConfigIndex(kv, userId, [...pluginIds, pluginId], updatedAt)
}

async function removePluginConfigIndexId(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<void> {
  const existing = await getPluginConfigIndex(kv, userId)
  const pluginIds = existing ? existing.pluginIds : await listPluginIdsFromRecords(kv, userId)
  await putPluginConfigIndex(kv, userId, pluginIds.filter((id) => id !== pluginId))
}

export async function putPluginConfigRecord(
  kv: KVStore,
  userId: string,
  config: PluginConfig,
  options?: { expirationTtl?: number; updatedAt?: number },
): Promise<PluginConfigRecord> {
  const normalized = normalizePluginConfigRecordValue(
    {
      userId,
      id: config.id,
      name: config.name,
      status: config.status,
      credentials: config.credentials,
      settings: config.settings,
      connectedAt: config.connectedAt,
      lastUsedAt: config.lastUsedAt,
      updatedAt: options?.updatedAt ?? Date.now(),
    },
    userId,
    config.id,
  )
  if (!normalized) throw new Error("Invalid PluginConfig payload")

  await putJSON(kv, buildPluginConfigRecordKey(userId, normalized.id), normalized, {
    expirationTtl: options?.expirationTtl,
  })
  await addPluginConfigIndexId(kv, userId, normalized.id, normalized.updatedAt)

  return normalized
}

export async function deletePluginConfigRecord(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<void> {
  await kv.delete(buildPluginConfigRecordKey(userId, pluginId))
  await removePluginConfigIndexId(kv, userId, pluginId)
}

export async function listPluginConfigRecords(
  kv: KVStore,
  userId: string,
): Promise<PluginConfigRecord[]> {
  const index = await getPluginConfigIndex(kv, userId)
  const pluginIds = index ? index.pluginIds : PLUGIN_CONFIG_RECORD_IDS
  const records = await Promise.all(
    pluginIds.map((pluginId) => getPluginConfigRecord(kv, userId, pluginId)),
  )
  return records.filter((record): record is PluginConfigRecord => record !== null)
}
