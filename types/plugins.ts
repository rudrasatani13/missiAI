// ─── Plugin System Types ───────────────────────────────────────────────────────

export type PluginId = 'notion' | 'google_calendar' | 'webhook'

export type PluginStatus = 'connected' | 'disconnected' | 'error'

export interface PluginConfig {
  id: PluginId
  name: string
  status: PluginStatus
  /** Stored as-is in KV (server-side only). NEVER logged or sent to client. */
  credentials: Record<string, string>
  /** Non-sensitive settings, e.g. defaultDatabaseId, calendarId, webhookUrl. */
  settings: Record<string, string>
  connectedAt: number
  lastUsedAt?: number
}

export interface UserPlugins {
  userId: string
  plugins: PluginConfig[]
  updatedAt: number
}

export type PluginAction =
  | 'create_page'
  | 'append_to_page'
  | 'create_event'
  | 'trigger_webhook'
  | 'add_to_database'

export interface PluginCommand {
  pluginId: PluginId
  action: PluginAction
  parameters: Record<string, string>
  rawUserMessage: string
}

export interface PluginResult {
  success: boolean
  pluginId: PluginId
  action: PluginAction
  /** Voice-friendly output, max 150 chars. */
  output: string
  /** Link to created resource, if available. */
  url?: string
  error?: string
  executedAt: number
}
