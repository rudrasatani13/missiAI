"use client"

import { memo } from "react"
import { X } from "lucide-react"
import type { VoiceState } from "@/types/chat"

interface StatusDisplayProps {
  state: VoiceState
  streamingText: string
  errorMessage: string | null
  onDismissError: () => void
  userName: string
  statusText: string
  lastTranscript: string
}

function StatusDisplayInner({
  state,
  streamingText,
  errorMessage,
  onDismissError,
  userName,
  statusText,
  lastTranscript,
}: StatusDisplayProps) {
  return (
    <>
      <p
        className="text-base md:text-lg font-light tracking-tight mb-1 state-text"
        data-testid="voice-status-text"
        style={{
          color:
            state === "recording"
              ? "rgba(255,80,60,0.8)"
              : state === "speaking"
                ? "rgba(0,255,140,0.7)"
                : state === "thinking" || state === "transcribing"
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.3)",
          animation:
            state === "thinking"
              ? "pulseGlow 2s ease-in-out infinite"
              : "fadeIn 0.5s ease-out both",
        }}
      >
        {state === "idle" && `Hey${userName ? ` ${userName}` : ""}`}
        {state === "recording" && "Listening..."}
        {state === "transcribing" && "Processing..."}
        {state === "thinking" && "Thinking..."}
        {state === "speaking" && "Speaking..."}
      </p>

      {lastTranscript && state !== "idle" && (
        <p
          className="text-[11px] font-light italic max-w-[260px] mx-auto truncate"
          data-testid="last-transcript"
          style={{ color: "rgba(255,255,255,0.15)", animation: "fadeIn 0.4s ease-out both" }}
        >
          &ldquo;{lastTranscript}&rdquo;
        </p>
      )}

      {state === "idle" && (
        <p
          className="text-[11px] font-light tracking-wide mt-1 state-text"
          data-testid="idle-status-hint"
          style={{ color: "rgba(255,255,255,0.15)" }}
        >
          {statusText}
        </p>
      )}

      {state === "recording" && (
        <p
          className="text-[10px] font-light tracking-wider mt-1"
          data-testid="recording-hint"
          style={{ color: "rgba(255,80,60,0.3)", animation: "fadeIn 0.3s ease-out both" }}
        >
          Speak naturally &middot; auto-detects when you&apos;re done
        </p>
      )}

      {(state === "thinking" || state === "transcribing") && (
        <p
          className="text-[10px] font-light tracking-wider mt-1"
          data-testid="interrupt-hint"
          style={{ color: "rgba(255,255,255,0.2)", animation: "fadeIn 0.3s ease-out both" }}
        >
          Tap to interrupt
        </p>
      )}

      {state === "thinking" && streamingText && (
        <div
          className="max-w-sm mx-auto mt-3 px-4 overflow-hidden"
          data-testid="streaming-text-display"
          style={{ animation: "fadeIn 0.3s ease-out both", maxHeight: "120px", overflowY: "auto" }}
        >
          <p
            className="text-xs font-light leading-relaxed text-center"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {streamingText}
            <span
              className="inline-block w-[2px] h-[0.9em] ml-0.5 align-text-bottom"
              data-testid="streaming-cursor"
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                animation: "blink 1s step-end infinite",
              }}
            />
          </p>
        </div>
      )}

      {state === "speaking" && (
        <p
          className="text-[10px] font-light tracking-wider mt-1"
          data-testid="speaking-interrupt-hint"
          style={{ color: "rgba(0,255,140,0.25)", animation: "fadeIn 0.3s ease-out both" }}
        >
          Tap to interrupt
        </p>
      )}

      {errorMessage && (
        <div
          className="flex items-center gap-2 mt-2 pointer-events-auto"
          data-testid="error-display"
          style={{ animation: "fadeIn 0.3s ease-out both" }}
        >
          <p className="text-xs font-light" style={{ color: "rgba(239,68,68,0.7)" }}>
            {errorMessage}
          </p>
          <button
            onClick={onDismissError}
            data-testid="error-dismiss-btn"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(239,68,68,0.5)",
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  )
}

export const StatusDisplay = memo(StatusDisplayInner)
