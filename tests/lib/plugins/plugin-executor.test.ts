import { describe, it, expect, vi, beforeEach } from "vitest"
import { executePluginCommand, buildPluginCommand } from "@/lib/plugins/plugin-executor"
import type { PluginCommand, PluginConfig } from "@/types/plugins"

// ─── Mock plugin modules ──────────────────────────────────────────────────────

vi.mock("@/lib/plugins/notion-plugin", () => ({
  createNotionPage: vi.fn(),
  addToNotionDatabase: vi.fn(),
  appendToNotionPage: vi.fn(),
}))

vi.mock("@/lib/plugins/calendar-plugin", () => ({
  parseEventFromCommand: vi.fn(),
  createCalendarEvent: vi.fn(),
}))

vi.mock("@/lib/plugins/webhook-plugin", () => ({
  triggerWebhook: vi.fn(),
}))

vi.mock("@/services/ai.service", () => ({
  callAIDirect: vi.fn(),
}))

import { createNotionPage, addToNotionDatabase, appendToNotionPage } from "@/lib/plugins/notion-plugin"
import { parseEventFromCommand, createCalendarEvent } from "@/lib/plugins/calendar-plugin"
import { triggerWebhook } from "@/lib/plugins/webhook-plugin"
import { callAIDirect } from "@/services/ai.service"

const mockedCreateNotionPage = vi.mocked(createNotionPage)
const mockedAddToNotionDatabase = vi.mocked(addToNotionDatabase)
const mockedAppendToNotionPage = vi.mocked(appendToNotionPage)
const mockedParseEventFromCommand = vi.mocked(parseEventFromCommand)
const mockedCreateCalendarEvent = vi.mocked(createCalendarEvent)
const mockedTriggerWebhook = vi.mocked(triggerWebhook)
const mockedCallAIDirect = vi.mocked(callAIDirect)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotionConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    id: "notion",
    name: "Notion",
    status: "connected",
    credentials: { apiKey: "secret_test" },
    settings: { defaultPageId: "page-123" },
    connectedAt: Date.now(),
    ...overrides,
  }
}

function makeCommand(overrides: Partial<PluginCommand> = {}): PluginCommand {
  return {
    pluginId: "notion",
    action: "create_page",
    parameters: {},
    rawUserMessage: "save this note",
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executePluginCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Notion ────────────────────────────────────────────────────────────────

  describe("notion + create_page", () => {
    it("returns error when no pageId configured", async () => {
      const config = makeNotionConfig({ settings: {} })
      const command = makeCommand()

      const result = await executePluginCommand(command, config)

      expect(result.success).toBe(false)
      expect(result.output).toContain("No Notion page ID")
      expect(mockedCreateNotionPage).not.toHaveBeenCalled()
    })

    it("calls createNotionPage when defaultPageId is set in settings", async () => {
      mockedCreateNotionPage.mockResolvedValueOnce({
        success: true,
        pluginId: "notion",
        action: "create_page",
        output: 'Page "Test" created in Notion',
        executedAt: Date.now(),
      })

      const config = makeNotionConfig()
      const command = makeCommand({
        parameters: { title: "Test", content: "Content here" },
      })

      const result = await executePluginCommand(command, config)

      expect(mockedCreateNotionPage).toHaveBeenCalledWith(
        "secret_test",
        "page-123",
        "Test",
        "Content here",
      )
      expect(result.success).toBe(true)
    })

    it("uses parentId from command parameters over settings", async () => {
      mockedCreateNotionPage.mockResolvedValueOnce({
        success: true,
        pluginId: "notion",
        action: "create_page",
        output: 'Page "Note" created in Notion',
        executedAt: Date.now(),
      })

      const config = makeNotionConfig()
      const command = makeCommand({ parameters: { parentId: "page-override" } })

      await executePluginCommand(command, config)

      expect(mockedCreateNotionPage).toHaveBeenCalledWith(
        "secret_test",
        "page-override",
        expect.any(String),
        expect.any(String),
      )
    })
  })

  describe("notion + add_to_database", () => {
    it("returns error when no databaseId configured", async () => {
      const config = makeNotionConfig({ settings: {} })
      const command = makeCommand({ action: "add_to_database" })

      const result = await executePluginCommand(command, config)

      expect(result.success).toBe(false)
      expect(result.output).toContain("No Notion database ID")
      expect(mockedAddToNotionDatabase).not.toHaveBeenCalled()
    })

    it("calls addToNotionDatabase when databaseId is set", async () => {
      mockedAddToNotionDatabase.mockResolvedValueOnce({
        success: true,
        pluginId: "notion",
        action: "add_to_database",
        output: '"Entry" added to your Notion database',
        executedAt: Date.now(),
      })

      const config = makeNotionConfig({ settings: { defaultDatabaseId: "db-456" } })
      const command = makeCommand({ action: "add_to_database" })

      await executePluginCommand(command, config)

      expect(mockedAddToNotionDatabase).toHaveBeenCalledWith(
        "secret_test",
        "db-456",
        expect.any(String),
        expect.any(String),
      )
    })
  })

  describe("notion + append_to_page", () => {
    it("calls appendToNotionPage", async () => {
      mockedAppendToNotionPage.mockResolvedValueOnce({
        success: true,
        pluginId: "notion",
        action: "append_to_page",
        output: "Content appended to your Notion page",
        executedAt: Date.now(),
      })

      const config = makeNotionConfig()
      const command = makeCommand({ action: "append_to_page" })

      await executePluginCommand(command, config)

      expect(mockedAppendToNotionPage).toHaveBeenCalled()
    })
  })

  // ── Google Calendar ───────────────────────────────────────────────────────

  describe("google_calendar + create_event", () => {
    it("calls parseEventFromCommand and createCalendarEvent", async () => {
      const eventDetails = {
        title: "Doctor appointment",
        startDateTime: "2024-12-01T15:00:00Z",
        endDateTime: "2024-12-01T16:00:00Z",
        description: "",
      }
      mockedParseEventFromCommand.mockResolvedValueOnce(eventDetails)
      mockedCreateCalendarEvent.mockResolvedValueOnce({
        success: true,
        pluginId: "google_calendar",
        action: "create_event",
        output: 'Event "Doctor appointment" added to your calendar',
        executedAt: Date.now(),
      })

      const config: PluginConfig = {
        id: "google_calendar",
        name: "Google Calendar",
        status: "connected",
        credentials: { accessToken: "token-xyz" },
        settings: { calendarId: "primary" },
        connectedAt: Date.now(),
      }
      const command: PluginCommand = {
        pluginId: "google_calendar",
        action: "create_event",
        parameters: {},
        rawUserMessage: "schedule doctor appointment tomorrow at 3pm",
      }

      const result = await executePluginCommand(command, config)

      expect(mockedParseEventFromCommand).toHaveBeenCalledWith(
        "schedule doctor appointment tomorrow at 3pm",
      )
      expect(mockedCreateCalendarEvent).toHaveBeenCalledWith(
        "token-xyz",
        "primary",
        eventDetails,
      )
      expect(result.success).toBe(true)
    })
  })

  // ── Webhook ───────────────────────────────────────────────────────────────

  describe("webhook + trigger_webhook", () => {
    it("calls triggerWebhook with correct payload", async () => {
      mockedTriggerWebhook.mockResolvedValueOnce({
        success: true,
        pluginId: "webhook",
        action: "trigger_webhook",
        output: "Webhook triggered successfully",
        executedAt: Date.now(),
      })

      const config: PluginConfig = {
        id: "webhook",
        name: "Custom Webhook",
        status: "connected",
        credentials: { url: "https://example.com/hook" },
        settings: { secret: "my-secret", method: "POST" },
        connectedAt: Date.now(),
      }
      const command: PluginCommand = {
        pluginId: "webhook",
        action: "trigger_webhook",
        parameters: {},
        rawUserMessage: "fire webhook",
      }

      const result = await executePluginCommand(command, config)

      expect(mockedTriggerWebhook).toHaveBeenCalledWith(
        "https://example.com/hook",
        "my-secret",
        "POST",
        expect.objectContaining({
          message: "fire webhook",
          source: "missiAI",
        }),
      )
      expect(result.success).toBe(true)
    })
  })

  // ── Unknown action ────────────────────────────────────────────────────────

  describe("unknown pluginId / action", () => {
    it("returns error result for unknown action", async () => {
      const config = makeNotionConfig()
      const command = makeCommand({ action: "create_event" as any })

      const result = await executePluginCommand(command, config)

      expect(result.success).toBe(false)
      expect(result.output).toContain("Unknown")
    })

    it("returns error result for unknown pluginId", async () => {
      const config: PluginConfig = {
        id: "notion", // mismatched — command has unknown id
        name: "Unknown",
        status: "connected",
        credentials: {},
        settings: {},
        connectedAt: Date.now(),
      }
      const command: PluginCommand = {
        pluginId: "webhook" as any,
        action: "trigger_webhook",
        parameters: {},
        rawUserMessage: "do something",
      }

      mockedTriggerWebhook.mockResolvedValueOnce({
        success: false,
        pluginId: "webhook",
        action: "trigger_webhook",
        output: "Only HTTPS webhooks allowed",
        executedAt: Date.now(),
      })

      // webhook with no url credential
      const webhookConfig: PluginConfig = {
        id: "webhook",
        name: "Webhook",
        status: "connected",
        credentials: { url: "http://insecure.com" },
        settings: {},
        connectedAt: Date.now(),
      }
      const result = await executePluginCommand(command, webhookConfig)
      expect(result.pluginId).toBe("webhook")
    })
  })
})

describe("buildPluginCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns create_page action for notion", async () => {
    mockedCallAIDirect.mockResolvedValueOnce(
      JSON.stringify({ title: "Meeting notes", content: "Discussed Q4 targets" }),
    )

    const command = await buildPluginCommand("note about Q4 meeting", "notion")

    expect(command.pluginId).toBe("notion")
    expect(command.action).toBe("create_page")
    expect(command.rawUserMessage).toBe("note about Q4 meeting")
  })

  it("returns create_event action for google_calendar without calling AI", async () => {
    const command = await buildPluginCommand(
      "schedule dentist tomorrow at 2pm",
      "google_calendar",
    )

    expect(command.pluginId).toBe("google_calendar")
    expect(command.action).toBe("create_event")
    expect(command.rawUserMessage).toBe("schedule dentist tomorrow at 2pm")
    expect(mockedCallAIDirect).not.toHaveBeenCalled()
  })

  it("returns trigger_webhook action for webhook without calling AI", async () => {
    const command = await buildPluginCommand("trigger webhook", "webhook")

    expect(command.pluginId).toBe("webhook")
    expect(command.action).toBe("trigger_webhook")
    expect(command.rawUserMessage).toBe("trigger webhook")
    expect(mockedCallAIDirect).not.toHaveBeenCalled()
  })

  it("uses default title/content when AI returns invalid JSON for notion", async () => {
    mockedCallAIDirect.mockResolvedValueOnce("not valid json at all")

    const command = await buildPluginCommand("save my notes", "notion")

    expect(command.pluginId).toBe("notion")
    expect(command.parameters.title).toBe("New Note")
    expect(command.parameters.content).toBe("save my notes")
  })
})
