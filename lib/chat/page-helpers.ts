import type { LiveState } from "@/hooks/chat/useGeminiLive"
import type { VoiceState } from "@/types/chat"

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

