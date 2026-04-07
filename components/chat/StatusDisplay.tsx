"use client"

import { memo, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import type { VoiceState } from "@/types/chat"
import type { DailyBriefing, BriefingItem } from "@/types/proactive"
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

interface StatusDisplayProps {
  state: VoiceState
  streamingText: string
  lastResponse: string
  errorMessage: string | null
  onDismissError: () => void
  userName: string
  statusText: string
  lastTranscript: string
  briefing?: DailyBriefing | null
  nudges?: BriefingItem[]
  onDismissItem?: (item: BriefingItem) => void
  onBriefingDelivered?: () => void
  currentEmotion?: EmotionProfile | null
}

function StatusDisplayInner({
  state,
  errorMessage,
  onDismissError,
  userName,
  statusText,
  lastTranscript,
  briefing,
  nudges = [],
  onDismissItem,
  onBriefingDelivered,
  currentEmotion,
}: StatusDisplayProps) {
  const deliveredRef = useRef(false)

  // Find first high-priority undismissed briefing item
  const topBriefingItem =
    briefing?.items.find(
      (item) => item.priority === "high" && !item.dismissedAt,
    ) ?? null

  // Mark delivered once on first render with visible item
  useEffect(() => {
    if (
      state === "idle" &&
      topBriefingItem &&
      !deliveredRef.current &&
      !briefing?.deliveredAt
    ) {
      deliveredRef.current = true
      onBriefingDelivered?.()
    }
  }, [state, topBriefingItem, briefing?.deliveredAt, onBriefingDelivered])

  const firstNudge = nudges[0] ?? null

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
            state === "thinking"    ? "Thinking..."    :
            state === "speaking"    ? "Speaking..."    : ""
          }
          color={
            state === "recording"                            ? "rgba(255,80,60,0.8)"   :
            state === "speaking"                             ? "rgba(0,255,140,0.7)"   :
            state === "thinking" || state === "transcribing" ? "rgba(255,255,255,0.5)" :
                                                               "rgba(255,255,255,0.3)"
          }
        />
      </p>

      <AnimatePresence mode="popLayout">
        {lastTranscript && state !== "idle" && (
          <motion.p
            key={lastTranscript}
            initial={{ opacity: 0, filter: "blur(12px)", y: 10 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(6px)", transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} // smooth spring-like ease
            className="text-[13px] md:text-[14px] font-medium tracking-wide max-w-[320px] mx-auto text-center leading-relaxed"
            data-testid="last-transcript"
            style={{ color: "rgba(255,255,255,0.85)", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
          >
            &ldquo;{lastTranscript}&rdquo;
          </motion.p>
        )}
      </AnimatePresence>

      {state === "idle" && (
        <p
          className="text-[11px] font-light tracking-wide mt-1 state-text"
          data-testid="idle-status-hint"
          style={{ color: "rgba(255,255,255,0.15)" }}
        >
          {statusText}
        </p>
      )}

      {/* ── Proactive briefing card ─────────────────────────────────────── */}
      {state === "idle" && topBriefingItem && (
        <div
          className="flex items-center gap-2 mt-3 max-w-[300px] rounded-lg px-3 py-2 pointer-events-auto"
          data-testid="briefing-card"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            animation: "fadeIn 0.5s ease-out both",
          }}
        >
          <p
            className="text-[11px] font-light flex-1 leading-snug"
            data-testid="briefing-card-message"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {topBriefingItem.message}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDismissItem?.(topBriefingItem)
            }}
            data-testid="briefing-card-dismiss-btn"
            aria-label="Dismiss suggestion"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.25)",
              padding: "2px",
              flexShrink: 0,
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Nudge pill ──────────────────────────────────────────────────── */}
      {state === "idle" && firstNudge && !topBriefingItem && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismissItem?.(firstNudge)
          }}
          className="mt-2 px-3 py-1 rounded-full pointer-events-auto"
          data-testid="nudge-pill"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.35)",
            fontSize: "10px",
            fontWeight: 300,
            cursor: "pointer",
            animation: "fadeIn 0.6s ease-out both",
          }}
        >
          {firstNudge.message}
        </button>
      )}

      {/* Show nudge pill below briefing card if both exist */}
      {state === "idle" && firstNudge && topBriefingItem && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismissItem?.(firstNudge)
          }}
          className="mt-1 px-3 py-1 rounded-full pointer-events-auto"
          data-testid="nudge-pill"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.3)",
            fontSize: "10px",
            fontWeight: 300,
            cursor: "pointer",
            animation: "fadeIn 0.7s ease-out both",
          }}
        >
          {firstNudge.message}
        </button>
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
          style={{ color: "rgba(255,255,255,0.2)", animation: "fadeIn 0.3s ease-out both" }}
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
