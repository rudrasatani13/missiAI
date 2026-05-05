"use client"

import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import type { VoiceState } from "@/types/chat"
import type { EmotionProfile } from "@/types/emotion"

// Animates text letter-by-letter: each char fades+blurs in with stagger
function AnimatedStateText({ text, color }: { text: string; color: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={text}
        style={{ display: "inline-block", color }}
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.045 } },
          exit:    { transition: { staggerChildren: 0.025, staggerDirection: -1 } },
        }}
      >
        {text.split("").map((char, i) => (
          <motion.span
            key={i}
            style={{ display: "inline-block", whiteSpace: "pre" }}
            variants={{
              hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
              visible: { opacity: 1, y: 0,  filter: "blur(0px)",
                transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
              exit:   { opacity: 0, y: -6, filter: "blur(4px)",
                transition: { duration: 0.2, ease: "easeIn" } },
            }}
          >
            {char}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  )
}

const EMOTION_DOT_COLORS: Record<string, string> = {
  stressed: '#F59E0B',
  excited: '#10B981',
  fatigued: '#60A5FA',
  frustrated: '#EF4444',
  happy: '#FCD34D',
  confident: '#A78BFA',
  hesitant: '#9CA3AF',
}

interface ErrorDisplayProps {
  message: string
  onDismiss: () => void
}

function ErrorDisplay({ message, onDismiss }: ErrorDisplayProps) {
  return (
    <div
      className="flex items-center gap-2 mt-2 pointer-events-auto"
      data-testid="error-display"
      style={{ animation: "fadeIn 0.3s ease-out both" }}
    >
      <p className="text-xs font-light" style={{ color: "rgba(239,68,68,0.7)" }}>
        {message}
      </p>
      <button
        onClick={onDismiss}
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
  )
}

interface StatusDisplayProps {
  state: VoiceState
  streamingText: string
  lastResponse: string
  errorMessage: string | null
  onDismissError: () => void
  userName: string
  statusText: string
  lastTranscript: string
  currentEmotion?: EmotionProfile | null
  isLiveMode?: boolean
}

function StatusDisplayInner({
  state,
  errorMessage,
  onDismissError,
  userName,
  statusText,
  lastTranscript: _lastTranscript,
  lastResponse: _lastResponse,
  currentEmotion,
  isLiveMode,
}: StatusDisplayProps) {

  return (
    <>
      <p
        className="text-base md:text-lg font-light tracking-tight mb-1 state-text"
        data-testid="voice-status-text"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
      >
        <AnimatedStateText
          text={
            state === "idle"        ? `Hey${userName ? ` ${userName}` : ""}` :
            state === "recording"   ? "Listening..."   :
            state === "transcribing"? "Processing..."  :
            state === "thinking"    ? (isLiveMode ? "Connecting..." : "Thinking...")    :
            state === "speaking"    ? "Speaking..."    : ""
          }
          color={
            state === "recording"                            ? "rgba(255,80,60,0.8)"   :
            state === "speaking"                             ? "rgba(0,255,140,0.7)"   :
            state === "thinking" || state === "transcribing" ? "var(--missi-text-secondary)" :
                                                               "var(--missi-text-muted)"
          }
        />
      </p>

      {state === "idle" && (
        <p
          className="text-[11px] font-light tracking-wide mt-1 state-text"
          data-testid="idle-status-hint"
          style={{ color: "var(--missi-text-muted)" }}
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
          Speak naturally · auto-detects when you're done
        </p>
      )}

      {state === "recording" && currentEmotion && currentEmotion.confidence > 0.5 && currentEmotion.state !== 'neutral' && (
        <div
          data-testid="emotion-indicator-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: EMOTION_DOT_COLORS[currentEmotion.state] || 'transparent',
            marginTop: 6,
            opacity: 1,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {(state === "thinking" || state === "transcribing") && (
        <p
          className="text-[10px] font-light tracking-wider mt-1"
          data-testid="interrupt-hint"
          style={{ color: "var(--missi-text-muted)", animation: "fadeIn 0.3s ease-out both" }}
        >
          Tap to interrupt
        </p>
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
        <ErrorDisplay message={errorMessage} onDismiss={onDismissError} />
      )}
    </>
  )
}

export const StatusDisplay = memo(StatusDisplayInner)
