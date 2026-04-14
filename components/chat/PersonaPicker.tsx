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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 200,
        }}
      />

      {/* Bottom Sheet */}
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
          background: "linear-gradient(180deg, rgba(18,18,24,0.98), rgba(10,10,14,0.99))",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          padding: "20px 20px 28px",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.15)",
            }}
          />
        </div>

        {/* ── Default Voice ── */}
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            marginBottom: 8,
          }}
        >
          Default
        </p>

        <button
          onClick={handleSwitchToLive}
          data-testid="switch-to-live-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 14,
            background: isLiveMode
              ? "rgba(255,255,255,0.08)"
              : "rgba(255,255,255,0.02)",
            border: isLiveMode
              ? "1px solid rgba(255,255,255,0.15)"
              : "1px solid rgba(255,255,255,0.06)",
            boxShadow: isLiveMode ? "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
            cursor: "pointer",
            transition: "all 0.2s ease",
            textAlign: "left" as const,
            width: "100%",
            color: "white",
            marginBottom: 16,
          }}
        >
          <Zap style={{ width: 14, height: 14, color: isLiveMode ? "#4ADE80" : "rgba(255,255,255,0.3)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: isLiveMode ? "#fff" : "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.3 }}>
              Missi Voice
            </p>
            <p style={{ fontSize: 10, fontWeight: 400, color: isLiveMode ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.25)", margin: "2px 0 0", lineHeight: 1.3 }}>
              Instant, real-time conversation
            </p>
          </div>
          {isLiveMode && (
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Check style={{ width: 11, height: 11, color: "#4ADE80" }} />
            </div>
          )}
        </button>

        {/* ── AI Personas ── */}
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            marginBottom: 8,
          }}
        >
          AI Personas
        </p>

        {/* Persona Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ALL_PERSONAS.map((persona) => {
            const isActive = !isLiveMode && activeId === persona.id
            const isDisabled = loading

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
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: isActive
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.02)",
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.15)"
                    : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isActive
                    ? "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
                    : "none",
                  cursor: isDisabled ? "default" : "pointer",
                  opacity: isDisabled ? 0.4 : 1,
                  transition: "all 0.2s ease",
                  textAlign: "left" as const,
                  width: "100%",
                  color: "white",
                }}
              >
                {/* Accent Dot */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: persona.accentColor,
                    boxShadow: isActive ? `0 0 8px ${persona.accentColor}40` : "none",
                    flexShrink: 0,
                  }}
                />

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {persona.displayName}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: isActive
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(255,255,255,0.25)",
                      margin: "2px 0 0",
                      lineHeight: 1.3,
                    }}
                  >
                    {persona.tagline}
                  </p>
                </div>

                {/* Checkmark */}
                {isActive && (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Check style={{ width: 11, height: 11, color: "#fff" }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Disclaimer */}
        <p
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.2)",
            marginTop: 14,
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
