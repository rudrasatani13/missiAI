"use client"

import { useState, useEffect, useCallback } from "react"
import { Check, Zap } from "lucide-react"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonaOption {
  id: string
  displayName: string
  tagline: string
  accentColor: string
  geminiVoiceName: string
}

const ALL_PERSONAS: PersonaOption[] = [
  { id: "calm",      displayName: "Calm Therapist",     tagline: "Warm, measured, and validating",     accentColor: "#7DD3FC", geminiVoiceName: "Kore" },
  { id: "coach",     displayName: "Energetic Coach",    tagline: "Direct, punchy, and motivating",     accentColor: "#F97316", geminiVoiceName: "Fenrir" },
  { id: "friend",    displayName: "Sassy Friend",       tagline: "Casual, witty, Hinglish vibes",      accentColor: "#A78BFA", geminiVoiceName: "Aoede" },
  { id: "bollywood", displayName: "Bollywood Narrator", tagline: "Dramatic, theatrical, and fun",       accentColor: "#FBBF24", geminiVoiceName: "Charon" },
  { id: "desi-mom",  displayName: "Desi Mom",           tagline: "Caring, direct, lovingly bossy",     accentColor: "#FB7185", geminiVoiceName: "Leda" },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface PersonaPickerProps {
  isOpen: boolean
  onClose: () => void
  /** Whether real-time voice mode is currently active */
  isLiveMode: boolean
  /** Called when user picks a persona voice */
  onPersonaChange?: (persona: { personaId: string; displayName: string; accentColor: string; geminiVoiceName: string }) => void
  /** Called when user wants to go back to real-time voice */
  onSwitchToLive?: () => void
}

export function PersonaPicker({ isOpen, onClose, isLiveMode, onPersonaChange, onSwitchToLive }: PersonaPickerProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fetch current persona on mount
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    if (isLiveMode) {
      setActiveId(null)
      setLoading(false)
      return
    }
    fetch("/api/v1/persona")
      .then((r) => r.json())
      .then((data) => {
        if (data.personaId) {
          setActiveId(data.personaId)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, isLiveMode])

  const handleSelect = useCallback(
    async (persona: PersonaOption) => {
      if (persona.id === activeId || saving) return

      const previousId = activeId
      setActiveId(persona.id)
      setSaving(true)

      try {
        const res = await fetch("/api/v1/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId: persona.id }),
        })

        if (res.status === 429) {
          setActiveId(previousId)
          toast.error("You've switched personas too many times this hour. Try again later.")
          return
        }

        if (!res.ok) {
          setActiveId(previousId)
          toast.error("Failed to change persona. Try again.")
          return
        }

        onPersonaChange?.({
          personaId: persona.id,
          displayName: persona.displayName,
          accentColor: persona.accentColor,
          geminiVoiceName: persona.geminiVoiceName,
        })
        toast.success(`Switched to ${persona.displayName}`)
      } catch {
        setActiveId(previousId)
        toast.error("Failed to change persona. Try again.")
      } finally {
        setSaving(false)
      }
    },
    [activeId, saving, onPersonaChange],
  )

  const handleSwitchToLive = useCallback(() => {
    setActiveId(null)
    onSwitchToLive?.()
    toast.success("Switched to Missi Voice")
  }, [onSwitchToLive])

  if (!isOpen) return null

  // Shared eyebrow style
  const eyebrow: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    marginBottom: 8,
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 200,
        }}
      />

      {/* Bottom Sheet — glass tokens + soft teal tint */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 201,
          maxWidth: 480,
          margin: "0 auto",
          borderRadius: "20px 20px 0 0",
          background: "rgba(16, 18, 24, 0.92)",
          backdropFilter: "blur(24px) saturate(140%)",
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          boxShadow: "0 -20px 50px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
          padding: "20px 20px 32px",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 32,
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.12)",
            }}
          />
        </div>

        {/* ── Default Voice ── */}
        <p style={eyebrow}>Default</p>

        <button
          onClick={handleSwitchToLive}
          data-testid="switch-to-live-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            borderRadius: 12,
            background: isLiveMode ? "rgba(255,255,255,0.05)" : "transparent",
            border: isLiveMode
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(255,255,255,0.05)",
            borderLeft: isLiveMode ? "2px solid rgba(94,234,212,0.55)" : "1px solid rgba(255,255,255,0.05)",
            cursor: "pointer",
            transition: "background 0.15s ease, border-color 0.15s ease",
            textAlign: "left" as const,
            width: "100%",
            color: "white",
            marginBottom: 16,
          }}
        >
          <Zap
            style={{
              width: 13,
              height: 13,
              color: isLiveMode ? "rgba(94,234,212,0.75)" : "rgba(255,255,255,0.3)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: isLiveMode ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                margin: 0,
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              Missi Voice
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                margin: "3px 0 0",
                lineHeight: 1.3,
              }}
            >
              Instant, real-time conversation
            </p>
          </div>
          {isLiveMode && (
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Check style={{ width: 10, height: 10, color: "rgba(255,255,255,0.85)" }} strokeWidth={2.5} />
            </div>
          )}
        </button>

        {/* ── AI Personas ── */}
        <p style={eyebrow}>AI Personas</p>

        {/* Persona rows — flat, hairline-divided */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {ALL_PERSONAS.map((persona, idx) => {
            const isActive = !isLiveMode && activeId === persona.id
            const isDisabled = loading
            const isLastRow = idx === ALL_PERSONAS.length - 1

            return (
              <button
                key={persona.id}
                onClick={() => handleSelect(persona)}
                disabled={isDisabled}
                data-testid={`persona-${persona.id}-btn`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  borderRadius: 12,
                  background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid transparent",
                  borderLeft: isActive
                    ? `2px solid ${persona.accentColor}80`
                    : "2px solid transparent",
                  marginBottom: isLastRow ? 0 : 2,
                  cursor: isDisabled ? "default" : "pointer",
                  opacity: isDisabled ? 0.35 : 1,
                  transition: "background 0.15s ease, border-color 0.15s ease",
                  textAlign: "left" as const,
                  width: "100%",
                  color: "white",
                }}
              >
                {/* Accent dot — colored, no glow */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: persona.accentColor,
                    opacity: isActive ? 1 : 0.5,
                    flexShrink: 0,
                  }}
                />

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                      margin: 0,
                      lineHeight: 1.3,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {persona.displayName}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      margin: "3px 0 0",
                      lineHeight: 1.3,
                    }}
                  >
                    {persona.tagline}
                  </p>
                </div>

                {/* Checkmark — flat monochrome */}
                {isActive && (
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Check style={{ width: 10, height: 10, color: "rgba(255,255,255,0.85)" }} strokeWidth={2.5} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Disclaimer */}
        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.2)",
            marginTop: 16,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Each persona has a unique voice and personality style.
        </p>
      </div>
    </>
  )
}
