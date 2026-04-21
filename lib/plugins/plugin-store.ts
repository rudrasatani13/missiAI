import type { KVStore } from "@/types"
import type { PluginConfig, PluginId, UserPlugins } from "@/types/plugins"

// ─── Plugin KV Store ──────────────────────────────────────────────────────────
// KV key: plugins:config:{userId}
// Credentials are NEVER logged — only pluginId and action are safe to log.

function kvKey(userId: string): string {
  return `plugins:config:${userId}`
}

/**
 * Load all plugins for a user. Returns empty structure if not found.
 */
export async function getUserPlugins(kv: KVStore, userId: string): Promise<UserPlugins> {
  try {
    const raw = await kv.get(kvKey(userId))
    if (!raw) {
      return { userId, plugins: [], updatedAt: Date.now() }
    }
    const parsed = JSON.parse(raw) as UserPlugins
    return parsed
  } catch {
    return { userId, plugins: [], updatedAt: Date.now() }
  }
}

/**
 * Persist the full UserPlugins record. Updates updatedAt automatically.
 */
export async function saveUserPlugins(
  kv: KVStore,
  userId: string,
  plugins: UserPlugins,
): Promise<void> {
  const record: UserPlugins = { ...plugins, updatedAt: Date.now() }
  await kv.put(kvKey(userId), JSON.stringify(record))
}

/**
 * Return a connected plugin config by id, or null if not found / disconnected.
 */
export async function getConnectedPlugin(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<PluginConfig | null> {
  const { plugins } = await getUserPlugins(kv, userId)
  const found = plugins.find((p) => p.id === pluginId && p.status === "connected")
  return found ?? null
}

/**
 * Insert or replace a plugin config in the user's plugin list.
 */
export async function upsertPlugin(
  kv: KVStore,
  userId: string,
  config: PluginConfig,
): Promise<void> {
  const userPlugins = await getUserPlugins(kv, userId)
  const idx = userPlugins.plugins.findIndex((p) => p.id === config.id)
  if (idx >= 0) {
    userPlugins.plugins[idx] = config
  } else {
    userPlugins.plugins.push(config)
  }
  await saveUserPlugins(kv, userId, userPlugins)
}

/**
 * Mark a plugin as disconnected and clear its credentials.
 */
export async function disconnectPlugin(
  kv: KVStore,
  userId: string,
  pluginId: PluginId,
): Promise<void> {
  const userPlugins = await getUserPlugins(kv, userId)
  const idx = userPlugins.plugins.findIndex((p) => p.id === pluginId)
  if (idx >= 0) {
    userPlugins.plugins[idx] = {
      ...userPlugins.plugins[idx],
      status: "disconnected",
      credentials: {},
    }
    await saveUserPlugins(kv, userId, userPlugins)
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
