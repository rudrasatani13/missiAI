import type { KVStore } from "@/types"
import {
  getPluginConfigIndex,
  getPluginConfigRecord,
  listPluginConfigRecords,
  putPluginConfigRecord,
  toPluginConfig,
} from "@/lib/plugins/plugin-record-store"
import { PLUGIN_METADATA } from "@/lib/plugins/plugin-registry"
import type { PluginConfigRecord } from "@/lib/plugins/plugin-record-store"
import type { PluginConfig, PluginId, PluginStatus, UserPlugins } from "@/types/plugins"

// ─── Plugin KV Store ──────────────────────────────────────────────────────────
// KV key: plugins:config:{userId}
// Credentials are NEVER logged — only pluginId and action are safe to log.

const LEGACY_PLUGIN_CONFIG_PREFIX = "plugins:config:"
const PLUGIN_STATUS_SET = new Set<PluginStatus>(["connected", "disconnected", "error"])

function emptyUserPlugins(userId: string, updatedAt = Date.now()): UserPlugins {
  return {
    userId,
    plugins: [],
    updatedAt,
  }
}

function toUserPlugins(
  userId: string,
  records: PluginConfigRecord[],
  fallbackUpdatedAt = Date.now(),
): UserPlugins {
  const updatedAt = records.reduce((maxUpdatedAt, record) => Math.max(maxUpdatedAt, record.updatedAt), 0)
  return {
    userId,
    plugins: records.map(toPluginConfig),
    updatedAt: updatedAt > 0 ? updatedAt : fallbackUpdatedAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
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

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}

  const normalized: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string") normalized[key] = rawValue
  }
  return normalized
}

function normalizeLegacyPluginConfig(value: unknown): PluginConfig | null {
  if (!isRecord(value)) return null

  const id = parsePluginId(value.id)
  const status = parsePluginStatus(value.status)
  if (!id || !status) return null

  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : PLUGIN_METADATA[id].name
  const lastUsedAt = normalizeOptionalInteger(value.lastUsedAt)

  return {
    id,
    name,
    status,
    credentials: normalizeStringMap(value.credentials),
    settings: normalizeStringMap(value.settings),
    connectedAt: normalizeInteger(value.connectedAt),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
  }
}

async function readLegacyUserPlugins(kv: KVStore, userId: string): Promise<UserPlugins | null> {
  const raw = await kv.get(`${LEGACY_PLUGIN_CONFIG_PREFIX}${userId}`)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const storedUserId = typeof parsed.userId === "string" && parsed.userId.trim() ? parsed.userId.trim() : userId
  if (storedUserId !== userId) return null

  const plugins = Array.isArray(parsed.plugins)
    ? parsed.plugins.map(normalizeLegacyPluginConfig).filter((plugin): plugin is PluginConfig => plugin !== null)
    : []

  return {
    userId,
    plugins,
    updatedAt: normalizeInteger(parsed.updatedAt, Date.now()),
  }
}

async function backfillLegacyUserPlugins(kv: KVStore, userId: string, legacy: UserPlugins): Promise<void> {
  for (const plugin of legacy.plugins) {
    await putPluginConfigRecord(kv, userId, plugin, { updatedAt: legacy.updatedAt })
  }
}

async function backfillLegacyUserPluginsIfNeeded(kv: KVStore, userId: string): Promise<void> {
  const index = await getPluginConfigIndex(kv, userId)
  if (index) return

  const records = await listPluginConfigRecords(kv, userId)
  if (records.length > 0) return

  const legacy = await readLegacyUserPlugins(kv, userId)
  if (legacy) await backfillLegacyUserPlugins(kv, userId, legacy)
}

/**
 * Load all plugins for a user. Returns empty structure if not found.
 */
export async function getUserPlugins(kv: KVStore, userId: string): Promise<UserPlugins> {
  try {
    const v2Records = await listPluginConfigRecords(kv, userId)
    if (v2Records.length > 0) return toUserPlugins(userId, v2Records)

    const index = await getPluginConfigIndex(kv, userId)
    if (index) return emptyUserPlugins(userId, index.updatedAt)

    const legacy = await readLegacyUserPlugins(kv, userId)
    if (!legacy) return emptyUserPlugins(userId)

    try {
      await backfillLegacyUserPlugins(kv, userId, legacy)
    } catch {
    }
    return legacy
  } catch {
    return emptyUserPlugins(userId)
  }
}

/**
 * Return a connected plugin config by id, or null if not found / disconnected.
 */
export async function getConnectedPlugin(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<PluginConfig | null> {
  const record = await getPluginConfigRecord(kv, userId, pluginId)
  if (record) {
    return record.status === "connected" ? toPluginConfig(record) : null
  }

  const index = await getPluginConfigIndex(kv, userId)
  if (index) return null

  const v2Records = await listPluginConfigRecords(kv, userId)
  if (v2Records.length > 0) return null

  const legacy = await readLegacyUserPlugins(kv, userId)
  if (!legacy) return null

  try {
    await backfillLegacyUserPlugins(kv, userId, legacy)
  } catch {
  }

  const plugin = legacy.plugins.find((config) => config.id === pluginId)
  return plugin?.status === "connected" ? plugin : null
}

/**
 * Insert or replace a plugin config in the user's plugin list.
 */
export async function upsertPlugin(
  kv: KVStore,
  userId: string,
  config: PluginConfig,
): Promise<void> {
  await backfillLegacyUserPluginsIfNeeded(kv, userId)
  await putPluginConfigRecord(kv, userId, config)
}

/**
 * Mark a plugin as disconnected and clear its credentials.
 */
export async function disconnectPlugin(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<void> {
  await backfillLegacyUserPluginsIfNeeded(kv, userId)
  const record = await getPluginConfigRecord(kv, userId, pluginId)
  if (record) {
    await putPluginConfigRecord(kv, userId, {
      ...toPluginConfig(record),
      status: "disconnected",
      credentials: {},
    })
  }
}

/**
 * Strip credentials from a PluginConfig before sending to the client.
 */
export function stripCredentials(
  config: PluginConfig,
): Omit<PluginConfig, "credentials"> {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== 'credentials'),
  ) as Omit<PluginConfig, "credentials">
}
