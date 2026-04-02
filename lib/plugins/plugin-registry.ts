import type { PluginId, PluginAction } from "@/types/plugins"

// ─── Plugin Metadata Registry ────────────────────────────────────────────────

export const PLUGIN_METADATA: Record<
  PluginId,
  {
    name: string
    description: string
    requiredCredentials: string[]
    optionalSettings: string[]
    voiceTriggers: string[]
    supportedActions: PluginAction[]
  }
> = {
  notion: {
    name: "Notion",
    description: "Create pages and database entries in Notion",
    requiredCredentials: ["apiKey"],
    optionalSettings: ["defaultDatabaseId", "defaultPageId"],
    voiceTriggers: [
      "add to notion",
      "save to notion",
      "note in notion",
      "create notion page",
      "add to my notion",
    ],
    supportedActions: ["create_page", "append_to_page", "add_to_database"],
  },

  google_calendar: {
    name: "Google Calendar",
    description: "Create and manage calendar events",
    requiredCredentials: ["accessToken"],
    optionalSettings: ["calendarId"],
    voiceTriggers: [
      "add to calendar",
      "schedule",
      "create event",
      "book time",
      "put on my calendar",
    ],
    supportedActions: ["create_event"],
  },

  webhook: {
    name: "Custom Webhook",
    description: "Trigger any webhook URL with a payload",
    requiredCredentials: ["url"],
    optionalSettings: ["secret", "method"],
    voiceTriggers: ["trigger webhook", "send webhook", "fire webhook"],
    supportedActions: ["trigger_webhook"],
  },
}

export function getPlugin(id: PluginId): (typeof PLUGIN_METADATA)[PluginId] {
  return PLUGIN_METADATA[id]
}

/**
 * Check if a user message contains a voice trigger for any connected plugin.
 * Returns the first matching PluginId, or null if no match.
 */
export function detectPluginCommand(
  userMessage: string,
  connectedPlugins: PluginId[],
): PluginId | null {
  const lower = userMessage.toLowerCase()

  for (const id of connectedPlugins) {
    const meta = PLUGIN_METADATA[id]
    if (!meta) continue
    for (const trigger of meta.voiceTriggers) {
      if (lower.includes(trigger)) {
        return id
      }
    }
  }

  return null
}
