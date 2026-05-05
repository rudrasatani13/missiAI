"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import type { VoiceState } from "@/types/chat"

interface VoiceButtonProps {
  state: VoiceState
  onPress: () => void
  disabled: boolean
}

function VoiceButtonInner({ state, onPress, disabled }: VoiceButtonProps) {
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.85, y: 3 } : {}}
      whileHover={!disabled ? { scale: 1.05 } : {}}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      data-testid="voice-button"
      aria-label={`Voice assistant - ${state}`}
      disabled={disabled}
      onPointerDown={(e) => {
        // use onPointerDown instead of onClick for more robust tap handling
        e.preventDefault()
        if (typeof navigator !== "undefined" && navigator.vibrate && !disabled) {
          navigator.vibrate([30])
        }
        onPress()
      }}
      className="mb-3 flex items-center justify-center gap-2 pointer-events-auto select-none"
      style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", padding: "12px" }}
    >
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
                background: "var(--missi-border)",
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
                background: "var(--missi-border)",
                animation: `subtlePulse 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </span>
      )}
      {state === "speaking" && (
        <span
          className="w-2.5 h-2.5 rounded-full shadow-[0_0_15px_rgba(0,255,140,0.8)]"
          data-testid="speaking-indicator"
          style={{
            background: "rgba(0,255,140,0.9)",
            animation: "breathe 2s ease-in-out infinite",
          }}
        />
      )}
    </motion.button>
  )
}

export const VoiceButton = memo(VoiceButtonInner)
