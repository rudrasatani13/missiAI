import { describe, it, expect } from "vitest"
import { PLUGIN_METADATA, getPlugin, detectPluginCommand } from "@/lib/plugins/plugin-registry"
import type { PluginId } from "@/types/plugins"

describe("PLUGIN_METADATA", () => {
  const pluginIds: PluginId[] = ["notion", "google_calendar", "webhook"]

  it("has entries for all 3 plugins", () => {
    expect(Object.keys(PLUGIN_METADATA)).toHaveLength(3)
    for (const id of pluginIds) {
      expect(PLUGIN_METADATA[id]).toBeDefined()
    }
  })

  it.each(pluginIds)("%s has requiredCredentials", (id) => {
    expect(PLUGIN_METADATA[id].requiredCredentials).toBeDefined()
    expect(Array.isArray(PLUGIN_METADATA[id].requiredCredentials)).toBe(true)
    expect(PLUGIN_METADATA[id].requiredCredentials.length).toBeGreaterThan(0)
  })

  it.each(pluginIds)("%s has voiceTriggers", (id) => {
    expect(PLUGIN_METADATA[id].voiceTriggers).toBeDefined()
    expect(Array.isArray(PLUGIN_METADATA[id].voiceTriggers)).toBe(true)
    expect(PLUGIN_METADATA[id].voiceTriggers.length).toBeGreaterThan(0)
  })

  it.each(pluginIds)("%s has supportedActions", (id) => {
    expect(PLUGIN_METADATA[id].supportedActions).toBeDefined()
    expect(Array.isArray(PLUGIN_METADATA[id].supportedActions)).toBe(true)
    expect(PLUGIN_METADATA[id].supportedActions.length).toBeGreaterThan(0)
  })

  it("notion has correct required credentials", () => {
    expect(PLUGIN_METADATA.notion.requiredCredentials).toContain("apiKey")
  })

  it("google_calendar has correct required credentials", () => {
    expect(PLUGIN_METADATA.google_calendar.requiredCredentials).toContain("accessToken")
  })

  it("webhook has correct required credentials", () => {
    expect(PLUGIN_METADATA.webhook.requiredCredentials).toContain("url")
  })
})

describe("getPlugin", () => {
  it("returns the notion plugin metadata", () => {
    const meta = getPlugin("notion")
    expect(meta.name).toBe("Notion")
  })

  it("returns the google_calendar plugin metadata", () => {
    const meta = getPlugin("google_calendar")
    expect(meta.name).toBe("Google Calendar")
  })

  it("returns the webhook plugin metadata", () => {
    const meta = getPlugin("webhook")
    expect(meta.name).toBe("Custom Webhook")
  })
})

describe("detectPluginCommand", () => {
  it("returns 'notion' when message matches notion trigger and plugin is connected", () => {
    const result = detectPluginCommand("add to notion", ["notion"])
    expect(result).toBe("notion")
  })

  it("returns 'notion' for 'save to notion' trigger", () => {
    expect(detectPluginCommand("save to notion my meeting notes", ["notion"])).toBe("notion")
  })

  it("returns 'notion' for 'create notion page' trigger", () => {
    expect(detectPluginCommand("create notion page about project", ["notion"])).toBe("notion")
  })

  it("returns null when plugin is not in connectedPlugins", () => {
    const result = detectPluginCommand("add to notion", [])
    expect(result).toBeNull()
  })

  it("returns null when message does not match any trigger", () => {
    const result = detectPluginCommand("hello how are you", ["notion"])
    expect(result).toBeNull()
  })

  it("returns 'google_calendar' for schedule trigger", () => {
    expect(detectPluginCommand("schedule a meeting tomorrow at 3pm", ["google_calendar"])).toBe(
      "google_calendar",
    )
  })

  it("returns 'google_calendar' for 'add to calendar' trigger", () => {
    expect(
      detectPluginCommand("add to calendar my dentist appointment", ["google_calendar"]),
    ).toBe("google_calendar")
  })

  it("returns 'webhook' for trigger webhook", () => {
    expect(detectPluginCommand("trigger webhook now", ["webhook"])).toBe("webhook")
  })

  it("does not match google_calendar if only notion is connected", () => {
    expect(detectPluginCommand("add to calendar", ["notion"])).toBeNull()
  })

  it("returns first match when multiple plugins are connected", () => {
    const result = detectPluginCommand("add to notion database", ["google_calendar", "notion"])
    expect(result).toBe("notion")
  })

  it("is case-insensitive", () => {
    expect(detectPluginCommand("ADD TO NOTION", ["notion"])).toBe("notion")
  })
})
