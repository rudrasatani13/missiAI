"use client"

import { memo } from "react"
import type { VoiceState } from "@/types/chat"

interface VoiceButtonProps {
  state: VoiceState
  onPress: () => void
  onRelease: () => void
  disabled: boolean
}

function VoiceButtonInner({ state, onPress, onRelease, disabled }: VoiceButtonProps) {
  return (
    <button
      data-testid="voice-button"
      aria-label={`Voice assistant - ${state}`}
      disabled={disabled}
      onClick={onPress}
      onPointerUp={onRelease}
      className="mb-3 flex items-center justify-center gap-2 pointer-events-auto"
      style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", padding: 0 }}
    >
      {state === "idle" && (
        <span
          className="w-2 h-2 rounded-full"
          data-testid="idle-indicator"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />
      )}
      {state === "recording" && (
        <span
          className="w-2 h-2 rounded-full"
          data-testid="recording-indicator"
          style={{
            background: "rgba(255,80,60,0.9)",
            animation: "pulseGlow 1.2s ease-in-out infinite",
          }}
        />
      )}
      {state === "thinking" && (
        <span className="flex gap-1" data-testid="thinking-indicator">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.6)",
                animation: `subtlePulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </span>
      )}
      {state === "transcribing" && (
        <span className="flex gap-1" data-testid="transcribing-indicator">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.4)",
                animation: `subtlePulse 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </span>
      )}
      {state === "speaking" && (
        <span
          className="w-2 h-2 rounded-full"
          data-testid="speaking-indicator"
          style={{
            background: "rgba(0,255,140,0.7)",
            animation: "breathe 2s ease-in-out infinite",
          }}
        />
      )}
    </button>
  )
}

export const VoiceButton = memo(VoiceButtonInner)
