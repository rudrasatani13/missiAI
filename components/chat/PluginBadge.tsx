"use client"

import type { PluginConfig, PluginId } from "@/types/plugins"
import { Plus } from "lucide-react"

type SafePlugin = Omit<PluginConfig, "credentials">

interface PluginBadgeProps {
  plugins: SafePlugin[]
  onManage: () => void
}

const PLUGIN_COLORS: Record<PluginId, string> = {
  notion: "#000000",
  google_calendar: "#4285F4",
  webhook: "#F59E0B",
}

export function PluginBadge({ plugins, onManage }: PluginBadgeProps) {
  const connected = plugins.filter((p) => p.status === "connected")
  const count = connected.length
  const visibleDots = connected.slice(0, 3)
  const overflow = count > 3 ? count - 3 : 0

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onManage()
      }}
      data-testid="plugin-badge"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px",
        padding: "4px 10px",
        cursor: "pointer",
        color: count > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)",
        fontSize: "10px",
        fontWeight: 500,
        letterSpacing: "0.3px",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        transition: "background 0.2s, opacity 0.2s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"
      }}
    >
      {count === 0 ? (
        <>
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add plugins</span>
        </>
      ) : (
        <>
          {/* Colored dots for each connected plugin */}
          <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            {visibleDots.map((p) => (
              <span
                key={p.id}
                data-testid={`plugin-dot-${p.id}`}
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: PLUGIN_COLORS[p.id] ?? "#9ca3af",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            ))}
            {overflow > 0 && (
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>
                +{overflow}
              </span>
            )}
          </span>
          <span>
            {count} <span className="hidden sm:inline">{count === 1 ? "plugin" : "plugins"}</span>
          </span>
        </>
      )}
    </button>
  )
}
