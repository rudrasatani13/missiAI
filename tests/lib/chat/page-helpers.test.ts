import { describe, expect, it } from "vitest"
import {
  getDisplayName,
  getDisplayResult,
  getEffectiveStatusText,
  getEffectiveTranscriptValue,
  getEffectiveVoiceState,
  pluginResultToActionResult,
} from "@/lib/chat/page-helpers"

describe("chat page helpers", () => {
  it("maps plugin results into action-card results", () => {
    expect(pluginResultToActionResult({
      success: true,
      pluginId: "google_calendar",
      action: "create_event",
      output: "Calendar event created",
      url: "https://calendar.google.com/event/123",
      executedAt: 123,
    })).toEqual({
      success: true,
      type: "set_reminder",
      output: "Calendar event created",
      data: { url: "https://calendar.google.com/event/123" },
      actionTaken: "google_calendar: create_event",
      canUndo: false,
      executedAt: 123,
    })
  })

  it("resolves the display name from Clerk first, then local fallback", () => {
    expect(getDisplayName("Rudra", "Local")).toBe("Rudra")
    expect(getDisplayName(null, "Local")).toBe("Local")
    expect(getDisplayName(undefined, "")).toBe("")
  })

  it("derives the effective live voice state for the visualizer", () => {
    expect(getEffectiveVoiceState(true, "speaking", "idle")).toBe("speaking")
    expect(getEffectiveVoiceState(true, "connected", "idle")).toBe("recording")
    expect(getEffectiveVoiceState(true, "connecting", "idle")).toBe("thinking")
    expect(getEffectiveVoiceState(true, "error", "recording")).toBe("idle")
    expect(getEffectiveVoiceState(false, "connected", "speaking")).toBe("speaking")
  })

  it("derives the effective live status text and transcript values", () => {
    expect(getEffectiveStatusText(true, "connecting", "", "", null, "Idle")).toBe("Starting...")
    expect(getEffectiveStatusText(true, "connected", "hello", "", null, "Idle")).toBe("hello")
    expect(getEffectiveStatusText(true, "speaking", "", "Missi here", null, "Idle")).toBe("Missi here")
    expect(getEffectiveStatusText(true, "error", "", "", "Socket failed", "Idle")).toBe("Socket failed")
    expect(getEffectiveStatusText(false, "connected", "hello", "", null, "Idle")).toBe("Idle")

    expect(getEffectiveTranscriptValue(true, "connected", "live transcript", "fallback transcript")).toBe("live transcript")
    expect(getEffectiveTranscriptValue(false, "connected", "live transcript", "fallback transcript")).toBe("fallback transcript")
    expect(getEffectiveTranscriptValue(true, "disconnected", "live transcript", "fallback transcript")).toBe("fallback transcript")
  })

  it("prefers plugin results over action results for the display card", () => {
    expect(getDisplayResult(
      {
        success: true,
        pluginId: "notion",
        action: "create_page",
        output: "Saved to Notion",
        executedAt: 1,
      },
      {
        success: true,
        type: "draft_email",
        output: "Email draft",
        actionTaken: "draft_email",
        canUndo: false,
        executedAt: 2,
      },
    )?.type).toBe("take_note")

    expect(getDisplayResult(null, {
      success: true,
      type: "draft_email",
      output: "Email draft",
      actionTaken: "draft_email",
      canUndo: false,
      executedAt: 2,
    })?.type).toBe("draft_email")
  })
})
