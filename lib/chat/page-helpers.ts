import type { ActionResult } from "@/types/actions"
import type { PluginId, PluginResult } from "@/types/plugins"
import type { LiveState } from "@/hooks/chat/useGeminiLive"
import type { VoiceState } from "@/types/chat"

const PLUGIN_ACTION_TYPE_MAP: Record<PluginId, ActionResult["type"]> = {
  notion: "take_note",
  google_calendar: "set_reminder",
  webhook: "web_search",
}

export function pluginResultToActionResult(result: PluginResult): ActionResult {
  return {
    success: result.success,
    type: PLUGIN_ACTION_TYPE_MAP[result.pluginId] ?? "none",
    output: result.output,
    data: result.url ? { url: result.url } : undefined,
    actionTaken: `${result.pluginId}: ${result.action}`,
    canUndo: false,
    executedAt: result.executedAt,
  }
}

export function getDisplayName(firstName: string | null | undefined, localName: string): string {
  return firstName || localName || ""
}

export function getEffectiveVoiceState(liveMode: boolean, liveState: LiveState, voiceState: VoiceState): VoiceState {
  if (!liveMode || liveState === "disconnected") {
    return voiceState
  }

  if (liveState === "speaking") {
    return "speaking"
  }

  if (liveState === "connected") {
    return "recording"
  }

  if (liveState === "connecting") {
    return "thinking"
  }

  return "idle"
}

export function getEffectiveStatusText(
  liveMode: boolean,
  liveState: LiveState,
  liveTranscriptIn: string,
  liveTranscriptOut: string,
  liveError: string | null,
  statusText: string,
): string {
  if (!liveMode || liveState === "disconnected") {
    return statusText
  }

  if (liveState === "connecting") {
    return "Starting..."
  }

  if (liveState === "connected") {
    return liveTranscriptIn || "Listening..."
  }

  if (liveState === "speaking") {
    return liveTranscriptOut || "Speaking..."
  }

  return liveError || "Tap to start"
}

export function getEffectiveTranscriptValue(liveMode: boolean, liveState: LiveState, liveValue: string, fallbackValue: string): string {
  if (!liveMode || liveState === "disconnected") {
    return fallbackValue
  }

  return liveValue
}

export function getDisplayResult(pluginResult: PluginResult | null, actionResult: ActionResult | null): ActionResult | null {
  return pluginResult ? pluginResultToActionResult(pluginResult) : actionResult
}
