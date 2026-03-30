"use client"

import { memo } from "react"
import { LogOut } from "lucide-react"
import type { PersonalityKey } from "@/types/chat"
import { PERSONALITY_OPTIONS } from "@/types/chat"

interface SettingsPanelProps {
  personality: PersonalityKey
  onPersonalityChange: (p: PersonalityKey) => void
  voiceEnabled: boolean
  onVoiceToggle: () => void
  isOpen: boolean
  onClose: () => void
  userName: string
  userEmail: string
  userImageUrl: string | null
  onLogout: () => void
}

function SettingsPanelInner({
  personality,
  onPersonalityChange,
  voiceEnabled,
  onVoiceToggle,
  isOpen,
  userName,
  userEmail,
  userImageUrl,
  onLogout,
}: SettingsPanelProps) {
  return (
    <div
      className="absolute top-16 right-5 z-30 w-64 rounded-2xl p-4 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      data-testid="settings-panel"
      style={{
        background: "rgba(0,0,0,0.7)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(30px)",
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transition: "transform 0.25s ease-out, opacity 0.25s ease-out",
      }}
    >
      <div
        className="flex items-center gap-3 mb-4 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {userImageUrl && (
          <img src={userImageUrl} alt="" className="w-8 h-8 rounded-full opacity-80" />
        )}
        <div>
          <p className="text-xs font-medium text-white/70">{userName}</p>
          <p className="text-[10px] font-light text-white/25">{userEmail}</p>
        </div>
      </div>

      <div className="mb-4">
        <p
          className="text-[10px] font-medium tracking-wider uppercase mb-2.5"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Missi&apos;s Personality
        </p>
        <div className="flex flex-col gap-1.5">
          {PERSONALITY_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPersonalityChange(p.key)}
              data-testid={`personality-${p.key}-btn`}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
              style={{
                background:
                  personality === p.key ? "rgba(255,255,255,0.08)" : "transparent",
                border:
                  personality === p.key
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <span className="text-sm">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      personality === p.key
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.45)",
                  }}
                >
                  {p.label}
                </p>
                <p
                  className="text-[9px] font-light"
                  style={{
                    color:
                      personality === p.key
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.18)",
                  }}
                >
                  {p.desc}
                </p>
              </div>
              {personality === p.key && (
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(0,255,140,0.6)" }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mb-4 flex items-center justify-between px-3 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Voice
        </span>
        <button
          onClick={onVoiceToggle}
          data-testid="voice-toggle-btn"
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{
            background: voiceEnabled ? "rgba(0,255,140,0.4)" : "rgba(255,255,255,0.1)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full"
            style={{
              background: voiceEnabled ? "rgba(0,255,140,0.9)" : "rgba(255,255,255,0.4)",
              left: voiceEnabled ? "18px" : "2px",
              transition: "left 0.2s ease, background 0.2s ease",
            }}
          />
        </button>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
        <button
          onClick={onLogout}
          data-testid="logout-btn"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-light transition-colors hover:bg-white/5"
          style={{
            color: "rgba(255,255,255,0.4)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  )
}

export const SettingsPanel = memo(SettingsPanelInner)
