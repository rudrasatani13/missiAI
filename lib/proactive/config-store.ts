import type { KVStore } from '@/types'
import type { ProactiveConfig } from '@/types/proactive'

const CONFIG_PREFIX = 'proactive:config:'

const DEFAULT_CONFIG: ProactiveConfig = {
  enabled: true,
  briefingTime: '08:00',
  timezone: 'UTC',
  nudgesEnabled: true,
  maxItemsPerBriefing: 5,
  windDownEnabled: false,
  windDownTime: '22:00',
}

/**
 * Load the user's proactive config from KV.
 * Returns sensible defaults if no config is stored yet.
 */
export async function getProactiveConfig(
  kv: KVStore,
  userId: string,
): Promise<ProactiveConfig> {
  const raw = await kv.get(`${CONFIG_PREFIX}${userId}`)
  if (!raw) return { ...DEFAULT_CONFIG }
  try {
    const parsed = JSON.parse(raw) as ProactiveConfig
    // Merge with defaults to handle missing fields from older stored configs
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Persist the user's proactive config to KV.
 * Validates that timezone is a valid IANA string before saving.
 */
export async function saveProactiveConfig(
  kv: KVStore,
  userId: string,
  config: ProactiveConfig,
): Promise<void> {
  // Validate IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: config.timezone })
  } catch {
    throw new Error(`Invalid IANA timezone: "${config.timezone}"`)
  }
  await kv.put(`${CONFIG_PREFIX}${userId}`, JSON.stringify(config))
}
