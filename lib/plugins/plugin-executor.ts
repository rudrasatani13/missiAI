import { callAIDirect } from "@/services/ai.service"
import { createNotionPage, addToNotionDatabase, appendToNotionPage } from "./notion-plugin"
import { parseEventFromCommand, createCalendarEvent } from "./calendar-plugin"
import { triggerWebhook } from "./webhook-plugin"
import type { PluginCommand, PluginConfig, PluginResult, PluginId } from "@/types/plugins"

// ─── Plugin Executor ──────────────────────────────────────────────────────────

function errorResult(
  pluginId: PluginId,
  command: PluginCommand,
  message: string,
): PluginResult {
  return {
    success: false,
    pluginId,
    action: command.action,
    output: message,
    error: message,
    executedAt: Date.now(),
  }
}

/**
 * Execute a plugin command using the plugin's stored config.
 */
export async function executePluginCommand(
  command: PluginCommand,
  config: PluginConfig,
): Promise<PluginResult> {
  const { pluginId, action } = command

  // ── Notion ────────────────────────────────────────────────────────────────
  if (pluginId === "notion") {
    if (action === "create_page") {
      const parentId =
        command.parameters.parentId || config.settings.defaultPageId || ""
      if (!parentId) {
        return errorResult(pluginId, command, "No Notion page ID configured")
      }
      return createNotionPage(
        config.credentials.apiKey,
        parentId,
        command.parameters.title || "New Note",
        command.parameters.content || command.rawUserMessage,
      )
    }

    if (action === "add_to_database") {
      const databaseId =
        command.parameters.databaseId || config.settings.defaultDatabaseId || ""
      if (!databaseId) {
        return errorResult(pluginId, command, "No Notion database ID configured")
      }
      return addToNotionDatabase(
        config.credentials.apiKey,
        databaseId,
        command.parameters.title || "New Entry",
        command.parameters.content || command.rawUserMessage,
      )
    }

    if (action === "append_to_page") {
      const pageId =
        command.parameters.pageId || config.settings.defaultPageId || ""
      return appendToNotionPage(
        config.credentials.apiKey,
        pageId,
        command.parameters.content || command.rawUserMessage,
      )
    }
  }

  // ── Google Calendar ───────────────────────────────────────────────────────
  if (pluginId === "google_calendar" && action === "create_event") {
    const eventDetails = await parseEventFromCommand(command.rawUserMessage)
    const calendarId = config.settings.calendarId || "primary"
    return createCalendarEvent(config.credentials.accessToken, calendarId, eventDetails)
  }

  // ── Webhook ───────────────────────────────────────────────────────────────
  if (pluginId === "webhook" && action === "trigger_webhook") {
    const payload: Record<string, unknown> = {
      message: command.rawUserMessage,
      timestamp: Date.now(),
      source: "missiAI",
    }
    return triggerWebhook(
      config.credentials.url,
      config.settings.secret || "",
      config.settings.method || "POST",
      payload,
    )
  }

  // ── Unknown ───────────────────────────────────────────────────────────────
  return {
    success: false,
    pluginId,
    action,
    output: "Unknown plugin action",
    executedAt: Date.now(),
  }
}

/**
 * Build a PluginCommand from a raw voice message.
 * For Notion, uses AI to extract title + content.
 * For Google Calendar and webhook, rawUserMessage carries the payload.
 */
export async function buildPluginCommand(
  userMessage: string,
  pluginId: PluginId,
): Promise<PluginCommand> {
  if (pluginId === "notion") {
    let title = "New Note"
    let content = userMessage

    try {
      const raw = await callAIDirect(
        `Extract a short title and the main content from the user's message.
Return ONLY valid JSON: { "title": string, "content": string }
Title should be 2-6 words. Content is the full note body.`,
        userMessage,
        { temperature: 0.1, maxOutputTokens: 200, useGoogleSearch: false },
      )
      const cleaned = raw.replace(/```(?:json)?/gi, "").trim()
      const parsed = JSON.parse(cleaned)
      if (typeof parsed.title === "string" && parsed.title) title = parsed.title
      if (typeof parsed.content === "string" && parsed.content) content = parsed.content
    } catch {
      // Keep defaults on parse failure
    }

    return {
      pluginId,
      action: "create_page",
      parameters: { title, content },
      rawUserMessage: userMessage,
    }
  }

  if (pluginId === "google_calendar") {
    return {
      pluginId,
      action: "create_event",
      parameters: {},
      rawUserMessage: userMessage,
    }
  }

  // webhook
  return {
    pluginId,
    action: "trigger_webhook",
    parameters: { content: userMessage },
    rawUserMessage: userMessage,
  }
}
