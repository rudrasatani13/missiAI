"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import {
  Brain,
  Camera,
  Check,
  ChevronLeft,
  Crown,
  Flame,
  Heart,
  LogOut,
  Lock,
  Menu,
  MessageSquare,
  Mic2,
  Moon,
  MoreHorizontal,
  Plug,
  Settings,
  Sword,
  Target,
  Users,
  User as UserIcon,
  X as XIcon,
  Zap,
  Calendar,
  BookOpen,
  RefreshCw,
  Mail,
  Inbox,
  CheckSquare,
  LayoutGrid,
  Github,
} from "lucide-react"
import { toast } from "sonner"
import { LEDLogo } from "@/components/ui/LEDLogo"

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type PersonaInfo = {
  personaId: string
  displayName: string
  accentColor: string
  geminiVoiceName: string
}

export interface ChatSidebarProps {
  plan: "free" | "plus" | "pro" | undefined
  onLogout: () => void
  onNewChat: () => void
  isLiveMode: boolean
  activePersona: PersonaInfo | null
  onPersonaChange: (p: PersonaInfo) => void
  onSwitchToLive: () => void
  onPickImage: () => void
  /** Called whenever the desktop sidebar width resolves, so the page can offset fixed children. */
  onWidthChange?: (pxWidth: number) => void
}

type SubPanelKey = "voice" | "integrations" | "more" | null

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const LS_OPEN_KEY = "missi_sidebar_open"
const LS_PLUGIN_KEY = "missi_plugin_connections"
// Persist sub-panel state across route-change remounts (ChatShell re-mounts
// the sidebar on every page). Session-scoped so it clears on tab close.
const SS_SUB_KEY = "missi_sidebar_active_sub"
const SS_SUB_FORCED_KEY = "missi_sidebar_sub_forced"

const EXPANDED_WIDTH = 240
const COLLAPSED_WIDTH = 56

const ALL_PERSONAS: PersonaInfo[] = [
  { personaId: "calm", displayName: "Calm Therapist", accentColor: "#7DD3FC", geminiVoiceName: "Kore" },
  { personaId: "coach", displayName: "Energetic Coach", accentColor: "#F97316", geminiVoiceName: "Fenrir" },
  { personaId: "friend", displayName: "Sassy Friend", accentColor: "#A78BFA", geminiVoiceName: "Aoede" },
  { personaId: "bollywood", displayName: "Bollywood Narrator", accentColor: "#FBBF24", geminiVoiceName: "Charon" },
  { personaId: "desi-mom", displayName: "Desi Mom", accentColor: "#FB7185", geminiVoiceName: "Leda" },
]

const PERSONA_TAGLINES: Record<string, string> = {
  calm: "Warm & validating",
  coach: "Direct & motivating",
  friend: "Witty, Hinglish vibes",
  bollywood: "Dramatic & theatrical",
  "desi-mom": "Caring, lovingly bossy",
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function useMediaQuery(query: string, initial = false): boolean {
  // Lazy-initialize from window.matchMedia so the very first *client* render
  // already knows whether we're on a mobile viewport. Without this the hook
  // returns the SSR-default (`initial = false`) for one frame, which causes
  // the mobile drawer to render as a visible 240px desktop column and flash
  // open on page refresh before the effect flips it to the hidden drawer.
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial
    try {
      return window.matchMedia(query).matches
    } catch {
      return initial
    }
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [query])
  return matches
}

// ──────────────────────────────────────────────────────────────────────────────
// Nav item
// ──────────────────────────────────────────────────────────────────────────────

function NavRow({
  icon,
  label,
  active,
  showLabel,
  onClick,
  href,
  testId,
  iconColor,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  showLabel: boolean
  onClick?: () => void
  href?: string
  testId?: string
  iconColor?: string
}) {
  const inner = (
    <div
      className={`missi-nav-row group relative flex items-center w-full h-9 rounded-xl overflow-hidden ${active ? "is-active" : ""}`}
      style={{ cursor: "pointer", justifyContent: showLabel ? "flex-start" : "center" }}
    >
      {/* Active left accent bar (animated width on hover/active) */}
      <span
        aria-hidden
        className="missi-nav-accent"
        style={{
          position: "absolute",
          left: 0,
          top: 6,
          bottom: 6,
          width: active ? 2 : 0,
          background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.4))",
          borderRadius: 2,
          transition: "width 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: "none",
        }}
      />
      {/* Soft horizontal wash for active state */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: active
            ? "linear-gradient(90deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 40%, transparent 70%)"
            : "transparent",
          transition: "background 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: "none",
        }}
      />
      <div
        className="missi-nav-icon flex items-center justify-center flex-shrink-0"
        style={{
          // When expanded, reserve a fixed icon-gutter so labels line up.
          // When collapsed, shrink to just the icon so justifyContent: center
          // can perfectly center it within the narrow sidebar.
          width: showLabel ? COLLAPSED_WIDTH : 24,
          color: iconColor ?? "white",
          opacity: active ? 1 : 0.5,
          transition: "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 220ms cubic-bezier(0.32, 0.72, 0, 1), width 200ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {icon}
      </div>
      <span
        className="missi-nav-label truncate"
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: 0.1,
          color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
          opacity: showLabel ? 1 : 0,
          // When collapsed, clamp the label's width to 0 so it no longer
          // consumes flex space (that was pushing the icon off-center).
          maxWidth: showLabel ? "100%" : 0,
          marginLeft: showLabel ? 0 : -4,
          transform: showLabel ? "translateX(0)" : "translateX(-4px)",
          transition:
            "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 220ms cubic-bezier(0.32, 0.72, 0, 1), max-width 220ms cubic-bezier(0.32, 0.72, 0, 1), color 220ms ease",
          pointerEvents: showLabel ? "auto" : "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {label}
      </span>
    </div>
  )

  const commonProps = {
    "data-testid": testId,
    "aria-label": label,
    "aria-current": active ? ("page" as const) : undefined,
  }

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-xl" {...commonProps}>
        {inner}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-xl"
      style={{ background: "transparent", border: "none", padding: 0 }}
      {...commonProps}
    >
      {inner}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Persona sub-panel
// ──────────────────────────────────────────────────────────────────────────────

function PersonaSubPanel({
  plan,
  isLiveMode,
  activePersona,
  onPersonaChange,
  onSwitchToLive,
  onClose,
}: {
  plan: ChatSidebarProps["plan"]
  isLiveMode: boolean
  activePersona: PersonaInfo | null
  onPersonaChange: (p: PersonaInfo) => void
  onSwitchToLive: () => void
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const isFreePlan = !plan || plan === "free"
  const isDefault = isLiveMode || !activePersona

  const handleSelect = useCallback(
    async (persona: PersonaInfo) => {
      if (saving) return
      if (isFreePlan) {
        toast.error("Upgrade to Plus or Pro to use AI Personas!")
        router.push("/pricing")
        return
      }
      setSaving(true)
      try {
        const res = await fetch("/api/v1/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId: persona.personaId }),
        })
        if (res.ok) {
          onPersonaChange(persona)
          toast.success(`Switched to ${persona.displayName}`)
          onClose()
        } else if (res.status === 429) {
          toast.error("Too many switches. Try again later.")
        }
      } catch {
        toast.error("Failed to change persona.")
      } finally {
        setSaving(false)
      }
    },
    [saving, isFreePlan, onPersonaChange, router, onClose],
  )

  const handleDefault = useCallback(() => {
    onSwitchToLive()
    toast.success("Switched to Missi Voice")
    onClose()
  }, [onSwitchToLive, onClose])

  return (
    <div className="p-3">
      <button
        onClick={handleDefault}
        data-testid="sidebar-switch-to-default-voice-btn"
        className="w-full flex items-center gap-3 text-left transition-colors active:scale-[0.98]"
        style={{
          padding: "9px 10px 9px 12px",
          borderRadius: 10,
          background: isDefault ? "rgba(255,255,255,0.04)" : "transparent",
          border: isDefault ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
          borderLeft: isDefault ? "2px solid rgba(94,234,212,0.5)" : "2px solid transparent",
          cursor: "pointer",
          color: "white",
          marginBottom: 2,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isDefault ? "rgba(94,234,212,0.8)" : "rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 12, fontWeight: 500, color: isDefault ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.3 }}>
            Missi Voice
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0", lineHeight: 1.3 }}>
            Real-time conversation
          </p>
        </div>
        {isDefault && <Check className="w-3 h-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.6)" }} strokeWidth={2.5} />}
      </button>

      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "8px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ALL_PERSONAS.map((p) => {
          const isActive = !isDefault && activePersona?.personaId === p.personaId
          return (
            <button
              key={p.personaId}
              onClick={() => handleSelect(p)}
              disabled={saving}
              data-testid={`sidebar-persona-${p.personaId}-btn`}
              className="w-full flex items-center gap-3 text-left transition-colors active:scale-[0.98]"
              style={{
                padding: "9px 10px 9px 12px",
                borderRadius: 10,
                background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                border: isActive ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
                borderLeft: isActive ? `2px solid ${p.accentColor}70` : "2px solid transparent",
                cursor: saving ? "default" : "pointer",
                opacity: isFreePlan ? 0.5 : saving ? 0.5 : 1,
                color: "white",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: p.accentColor,
                  opacity: isActive ? 1 : 0.5,
                  flexShrink: 0,
                }}
              />
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 12, fontWeight: 500, color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.3 }}>
                  {p.displayName}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0", lineHeight: 1.3 }}>
                  {PERSONA_TAGLINES[p.personaId] ?? ""}
                </p>
              </div>
              {isFreePlan ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Lock className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)" }}>PLUS</span>
                </div>
              ) : isActive ? (
                <Check className="w-3 h-3 flex-shrink-0" style={{ color: "rgba(255,255,255,0.6)" }} strokeWidth={2.5} />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Integrations sub-panel
// ──────────────────────────────────────────────────────────────────────────────

interface PluginStatus {
  google: { connected: boolean; expiresAt?: number } | null
  notion: { connected: boolean; workspaceName?: string } | null
  kvAvailable: boolean
}

function saveConnectionsToLS(connections: Partial<Record<"google" | "notion", boolean>>) {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_PLUGIN_KEY) ?? "{}")
    localStorage.setItem(LS_PLUGIN_KEY, JSON.stringify({ ...existing, ...connections }))
  } catch {}
}

function loadConnectionsFromLS(): Partial<Record<"google" | "notion", boolean>> {
  try {
    return JSON.parse(localStorage.getItem(LS_PLUGIN_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function clearConnectionFromLS(plugin: "google" | "notion") {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_PLUGIN_KEY) ?? "{}")
    delete existing[plugin]
    localStorage.setItem(LS_PLUGIN_KEY, JSON.stringify(existing))
  } catch {}
}

function IntegrationsSubPanel() {
  const [status, setStatus] = useState<PluginStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadStatus = useCallback(() => {
    const local = loadConnectionsFromLS()
    setStatus((prev) => ({
      kvAvailable: prev?.kvAvailable ?? false,
      google: local.google ? { connected: true } : (prev?.google ?? null),
      notion: local.notion ? { connected: true } : (prev?.notion ?? null),
    }))
    fetch("/api/v1/plugins/refresh")
      .then((r) => r.json())
      .then((d: PluginStatus) => {
        const merged: PluginStatus = {
          ...d,
          google: d.google ?? (local.google ? { connected: true } : null),
          notion: d.notion ?? (local.notion ? { connected: true, workspaceName: "Notion" } : null),
        }
        setStatus(merged)
        if (d.google) saveConnectionsToLS({ google: true })
        if (d.notion) saveConnectionsToLS({ notion: true })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthSuccess = params.get("oauth_success")
    const oauthError = params.get("oauth_error")

    if (oauthSuccess === "google") {
      saveConnectionsToLS({ google: true })
      toast.success("Google Calendar connected! 🗓️")
      params.delete("oauth_success")
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`)
    } else if (oauthSuccess === "notion") {
      saveConnectionsToLS({ notion: true })
      toast.success("Notion connected! 📝")
      params.delete("oauth_success")
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`)
    } else if (oauthError) {
      toast.error(`Connection failed: ${oauthError.replace(/_/g, " ")}`)
      params.delete("oauth_error")
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`)
    }

    loadStatus()
  }, [loadStatus])

  async function handleDisconnect(plugin: "google" | "notion") {
    try {
      await fetch(`/api/v1/plugins/refresh?plugin=${plugin}`, { method: "DELETE" })
      clearConnectionFromLS(plugin)
      setStatus((s) => (s ? { ...s, [plugin]: null } : s))
      toast.success(`${plugin === "google" ? "Google Calendar" : "Notion"} disconnected`)
    } catch {
      toast.error("Failed to disconnect")
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch("/api/v1/plugins/refresh", { method: "POST" })
      toast.success("Context refreshed!")
    } catch {
      toast.error("Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 6,
  }
  const dotStyle: React.CSSProperties = { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 }
  const nameStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "#fff", margin: 0, lineHeight: 1.3 }
  const metaStyle: React.CSSProperties = { fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "2px 0 0", lineHeight: 1.3 }
  const connectBtnStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "#0c0c10",
    background: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    textDecoration: "none",
  }
  const disconnectBtnStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: "rgba(255,255,255,0.7)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    padding: "4px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }
  const eyebrowStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    margin: "0 0 10px",
  }
  const dividerStyle: React.CSSProperties = { height: 1, background: "rgba(255,255,255,0.05)", border: "none", margin: "14px 0" }

  const PLUGINS_CONFIG = [
    {
      id: "google" as const,
      name: "Google Calendar",
      icon: <Calendar className="w-4 h-4" style={{ flexShrink: 0, color: "rgba(255,255,255,0.65)" }} />,
      connectedText: "Events synced",
    },
    {
      id: "notion" as const,
      name: "Notion",
      icon: <BookOpen className="w-4 h-4" style={{ flexShrink: 0, color: "rgba(255,255,255,0.65)" }} />,
      connectedText: status?.notion?.workspaceName ?? "Connected",
    },
  ]

  const connected = PLUGINS_CONFIG.filter((p) => status?.[p.id]?.connected)
  const available = PLUGINS_CONFIG.filter((p) => !status?.[p.id]?.connected)

  return (
    <div className="p-3">
      {connected.length > 0 && (
        <>
          <p style={eyebrowStyle}>Connected</p>
          {connected.map(({ id, name, icon, connectedText }) => (
            <div key={id} style={rowStyle}>
              <span style={{ ...dotStyle, background: "#4ade80" }} aria-hidden />
              {icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={nameStyle}>{name}</p>
                <p style={metaStyle}>{connectedText}</p>
              </div>
              <button style={disconnectBtnStyle} onClick={() => handleDisconnect(id)}>
                Disconnect
              </button>
            </div>
          ))}
          <hr style={dividerStyle} />
        </>
      )}

      {available.length > 0 && (
        <>
          <p style={eyebrowStyle}>Available</p>
          {available.map(({ id, name, icon }) => (
            <div key={id} style={rowStyle}>
              <span style={{ ...dotStyle, background: "rgba(255,255,255,0.25)" }} aria-hidden />
              {icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={nameStyle}>{name}</p>
                <p style={metaStyle}>Not connected</p>
              </div>
              <a href={`/api/auth/connect/${id}`} style={connectBtnStyle}>
                Connect
              </a>
            </div>
          ))}
        </>
      )}

      <hr style={dividerStyle} />
      <p style={eyebrowStyle}>Coming soon</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {[
          { icon: <Mail className="w-3 h-3" />, label: "Gmail" },
          { icon: <Inbox className="w-3 h-3" />, label: "Outlook" },
          { icon: <CheckSquare className="w-3 h-3" />, label: "Todoist" },
          { icon: <LayoutGrid className="w-3 h-3" />, label: "Linear" },
          { icon: <MessageSquare className="w-3 h-3" />, label: "Slack" },
          { icon: <Github className="w-3 h-3" />, label: "GitHub" },
        ].map(({ icon, label }) => (
          <div
            key={label}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {icon}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>

      {(status?.google?.connected || status?.notion?.connected) && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="active:scale-[0.97] transition-transform"
          style={{
            marginTop: 14,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 500,
            color: refreshing ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.65)",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: 8,
            cursor: refreshing ? "default" : "pointer",
          }}
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh context"}
        </button>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Settings sub-panel — REMOVED. The full settings surface now lives at /settings
// as its own dedicated page (see app/settings/page.tsx). The sidebar's
// "Settings" row navigates there instead of sliding a panel in.
// ──────────────────────────────────────────────────────────────────────────────

// Kept only so the existing ChatSidebarProps keep their shape (ChatShell and
// /chat/page.tsx still pass these through). They're no longer consumed inside
// the sidebar — the new /settings page reads from the same useChatSettings
// hook directly. We intentionally don't delete the props themselves to avoid
// a ripple change across the callers; TypeScript marks them as unused at the
// destructure site which is acceptable for now.
// ──────────────────────────────────────────────────────────────────────────────
// More sub-panel
// ──────────────────────────────────────────────────────────────────────────────

function MoreSubPanel({ onPickImage, onClose }: { onPickImage: () => void; onClose: () => void }) {
  const items: Array<
    | { kind: "link"; label: string; icon: React.ReactNode; href: string; color?: string }
    | { kind: "button"; label: string; icon: React.ReactNode; onClick: () => void; color?: string }
  > = [
    { kind: "button", label: "Vision", icon: <Camera className="w-4 h-4" />, onClick: () => { onPickImage(); onClose() } },
    { kind: "link", label: "Agents", icon: <Zap className="w-4 h-4" />, href: "/agents", color: "#a78bfa" },
    { kind: "link", label: "Mission", icon: <Target className="w-4 h-4" />, href: "/today", color: "#fbbf24" },
    { kind: "link", label: "Wind Down", icon: <Moon className="w-4 h-4" />, href: "/wind-down" },
    { kind: "link", label: "Quests", icon: <Sword className="w-4 h-4" />, href: "/quests", color: "#FBBF24" },
    { kind: "link", label: "WhatsApp & Telegram", icon: <MessageSquare className="w-4 h-4" />, href: "/settings/integrations", color: "#25D366" },
    { kind: "link", label: "Upgrade", icon: <Crown className="w-4 h-4" />, href: "/pricing", color: "#F59E0B" },
  ]

  return (
    <div className="p-2 flex flex-col gap-0.5">
      {items.map((it) => {
        const inner = (
          <div className="flex items-center gap-3 h-9 px-3 rounded-md transition-colors hover:bg-white/[0.04]" style={{ cursor: "pointer" }}>
            <div style={{ color: it.color ?? "white", opacity: 0.7, display: "flex", alignItems: "center" }}>{it.icon}</div>
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{it.label}</span>
          </div>
        )
        if (it.kind === "link") {
          return (
            <Link key={it.label} href={it.href} className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-md">
              {inner}
            </Link>
          )
        }
        return (
          <button
            key={it.label}
            type="button"
            onClick={it.onClick}
            className="block w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-md"
            style={{ background: "transparent", border: "none", padding: 0 }}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

function ChatSidebarInner({
  plan,
  onLogout,
  onNewChat,
  isLiveMode,
  activePersona,
  onPersonaChange,
  onSwitchToLive,
  onPickImage,
  onWidthChange,
}: ChatSidebarProps) {
  const { user } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useMediaQuery("(max-width: 767px)", false)

  // Desktop collapsed/expanded state — hydrated from localStorage
  const [open, setOpen] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_OPEN_KEY)
      if (stored !== null) setOpen(stored === "1")
    } catch {}
    setHydrated(true)
  }, [])

  const persistOpen = useCallback((next: boolean) => {
    setOpen(next)
    try {
      localStorage.setItem(LS_OPEN_KEY, next ? "1" : "0")
    } catch {}
  }, [])

  // Gate the one-time sidebar entrance animation — only plays on the first
  // mount within a browser session so cross-page navigations don't replay it.
  const [playEntrance, setPlayEntrance] = useState(false)
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem("missi-sidebar-entered")
      if (!seen) {
        setPlayEntrance(true)
        sessionStorage.setItem("missi-sidebar-entered", "1")
      }
    } catch {
      // sessionStorage unavailable — skip the animation rather than replay
    }
  }, [])

  // Sub-panel state. ChatShell re-mounts this sidebar on every route change,
  // so we hydrate from sessionStorage *during* useState initialization (NOT in
  // a later effect) — otherwise the first paint shows the root nav and then
  // slides into the sub-panel, causing an unwanted snapping animation.
  const [activeSub, setActiveSubState] = useState<SubPanelKey>(() => {
    if (typeof window === "undefined") return null
    try {
      const sub = sessionStorage.getItem(SS_SUB_KEY)
      // "settings" used to be a valid sub-panel; it now lives at /settings as
      // its own page, so we ignore any stale session value for it. Other
      // sub-panels still hydrate normally across route remounts.
      if (sub === "voice" || sub === "integrations" || sub === "more") {
        return sub
      }
      if (sub === "settings") {
        try {
          sessionStorage.removeItem(SS_SUB_KEY)
        } catch {}
      }
    } catch {}
    return null
  })
  const [subPanelForcedExpand, setSubPanelForcedExpandState] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      return sessionStorage.getItem(SS_SUB_FORCED_KEY) === "1"
    } catch {}
    return false
  })

  const setActiveSub = useCallback((next: SubPanelKey) => {
    setActiveSubState(next)
    try {
      if (next) sessionStorage.setItem(SS_SUB_KEY, next)
      else sessionStorage.removeItem(SS_SUB_KEY)
    } catch {}
  }, [])

  const setSubPanelForcedExpand = useCallback((next: boolean) => {
    setSubPanelForcedExpandState(next)
    try {
      if (next) sessionStorage.setItem(SS_SUB_FORCED_KEY, "1")
      else sessionStorage.removeItem(SS_SUB_FORCED_KEY)
    } catch {}
  }, [])

  const openSub = useCallback(
    (key: Exclude<SubPanelKey, null>) => {
      if (!open) setSubPanelForcedExpand(true)
      setActiveSub(key)
    },
    [open, setActiveSub, setSubPanelForcedExpand],
  )
  const closeSub = useCallback(() => {
    setActiveSub(null)
    setSubPanelForcedExpand(false)
  }, [setActiveSub, setSubPanelForcedExpand])

  // Mobile drawer
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    // Close the mobile drawer after navigation so the page is visible, but
    // keep the currently active sub-panel + forced-expand state so that when
    // a user clicks, say, "Mission" inside the "More" sub-panel, the sidebar
    // stays on the More panel instead of flipping back to the root nav.
    setMobileOpen(false)
  }, [pathname])

  // Effective desktop width.
  //
  // An active sub-panel always forces the sidebar wide enough to render its
  // rows, otherwise the sub-panel is rendered inside the 56px collapsed
  // column and every label gets clipped to 1-2 characters. This prevents
  // label clipping and is more robust than relying on `subPanelForcedExpand`
  // alone, which is only set when the sub-panel is opened from an already-
  // collapsed state — if the user opens a sub-panel while expanded and THEN
  // hits the collapse chevron, the forced-expand flag stays false and the
  // visible column shrinks while the panel is still mounted.
  const effectiveOpen = open || subPanelForcedExpand || activeSub !== null
  const desktopWidth = effectiveOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH
  const showLabels = effectiveOpen

  // Track the open→expanded transition so we can stagger labels in ONLY when
  // the user actually toggles expand. We skip the initial mount (where
  // effectiveOpen is already true) so navigating between shell pages doesn't
  // replay the cascade each time.
  const [isExpanding, setIsExpanding] = useState(false)
  const prevEffectiveOpenRef = useRef(effectiveOpen)
  useEffect(() => {
    const prev = prevEffectiveOpenRef.current
    prevEffectiveOpenRef.current = effectiveOpen
    // Only trigger stagger on a false → true transition (actual expand action)
    if (!prev && effectiveOpen) {
      setIsExpanding(true)
      const t = setTimeout(() => setIsExpanding(false), 520)
      return () => clearTimeout(t)
    }
    if (prev && !effectiveOpen) {
      setIsExpanding(false)
    }
  }, [effectiveOpen])

  // Report width to page (for offsetting fixed children)
  useEffect(() => {
    if (!onWidthChange) return
    if (isMobile) {
      onWidthChange(0)
    } else {
      onWidthChange(desktopWidth)
    }
  }, [desktopWidth, isMobile, onWidthChange])

  // Plan badge resolution (used by the top profile card)
  const resolvedPlan = useMemo<"pro" | "free">(() => {
    if (plan === "plus" || plan === "pro") return "pro"
    const meta = (user?.publicMetadata as { plan?: string } | undefined)?.plan
    if (meta === "plus" || meta === "pro") return "pro"
    return "free"
  }, [plan, user])

  const firstName = user?.firstName ?? ""
  const avatarUrl = user?.imageUrl ?? null

  const handleNewChatClick = useCallback(() => {
    closeSub()
    onNewChat()
    setMobileOpen(false)
  }, [closeSub, onNewChat])

  const isOnChat = pathname === "/chat"

  // ── Render ────────────────────────────────────────────────────────────────
  const asideStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: EXPANDED_WIDTH,
        // Must sit above the /chat page's MISSI pill (z-[100]) so the drawer
        // fully covers the top bar when opened on mobile instead of the pill
        // bleeding through over the sidebar's header.
        zIndex: 200,
        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
        background: "rgba(12, 12, 14, 0.96)",
        backdropFilter: "blur(24px) saturate(130%)",
        WebkitBackdropFilter: "blur(24px) saturate(130%)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
        boxShadow: "0 20px 60px -20px rgba(0,0,0,0.7)",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }
    : {
        width: desktopWidth,
        transition: "width 240ms cubic-bezier(0.32, 0.72, 0, 1)",
        background: "rgba(12, 12, 14, 0.92)",
        backdropFilter: "blur(24px) saturate(130%)",
        WebkitBackdropFilter: "blur(24px) saturate(130%)",
        // Fully bordered floating card (was just borderRight against flush edge)
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        // Soft depth to lift the floating card off the black canvas
        boxShadow:
          "0 20px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
        fontFamily: "var(--font-body)",
        flexShrink: 0,
        overflow: "hidden",
        // Establish stacking context above the particle canvas (z:0) AND the
        // UsageBar (z:50) so the sidebar's bottom Settings / Sign out rows
        // aren't clipped by the global usage strip along the viewport bottom.
        position: "relative",
        zIndex: 60,
      }

  const content = (
    <>
      {/* Scoped styles — custom scrollbar, shimmer, hover interactions, fade-up for sub-panels */}
      <style>{`
        /* Thin custom scrollbar inside the sidebar */
        .missi-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .missi-scroll::-webkit-scrollbar-track { background: transparent; }
        .missi-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
          transition: background 160ms ease;
        }
        .missi-scroll:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }
        .missi-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .missi-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; scroll-behavior: smooth; }

        /* Nav row hover micro-interactions */
        .missi-nav-row { transition: background-color 180ms cubic-bezier(0.32, 0.72, 0, 1); }
        .missi-nav-row:hover { background-color: rgba(255,255,255,0.035); }
        .missi-nav-row:hover .missi-nav-icon { opacity: 0.9; transform: scale(1.06); }
        .missi-nav-row:hover .missi-nav-label { color: rgba(255,255,255,0.92); }
        .missi-nav-row:hover .missi-nav-accent { width: 2px !important; background: linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0.15)); }
        .missi-nav-row.is-active:hover .missi-nav-accent { background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.4)); }
        .missi-nav-row:active .missi-nav-icon { transform: scale(0.96); }

        /* Button reset for nav rows */
        .missi-nav-btn { background: transparent; border: none; padding: 0; width: 100%; text-align: left; cursor: pointer; }
        .missi-nav-btn:focus-visible { outline: none; box-shadow: 0 0 0 1px rgba(255,255,255,0.25) inset; border-radius: 12px; }

        /* Collapse chevron rotation */
        .missi-chevron { transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1); }
        .missi-chevron.is-collapsed { transform: rotate(180deg); }

        /* Pro-badge subtle shimmer (used only when user is Pro/Plus) */
        @keyframes missi-shimmer {
          0%   { background-position: -160% 0; }
          100% { background-position: 160% 0; }
        }
        .missi-pro-pill {
          background: linear-gradient(90deg,
            rgba(245,158,11,0.18) 0%,
            rgba(251,191,36,0.38) 50%,
            rgba(245,158,11,0.18) 100%);
          background-size: 200% 100%;
          animation: missi-shimmer 3.2s ease-in-out infinite;
          color: #fbbf24;
        }

        /* Sub-panel entrance stagger */
        @keyframes missi-fade-up {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .missi-stagger > * {
          opacity: 0;
          animation: missi-fade-up 320ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        .missi-stagger > *:nth-child(1) { animation-delay: 20ms; }
        .missi-stagger > *:nth-child(2) { animation-delay: 60ms; }
        .missi-stagger > *:nth-child(3) { animation-delay: 100ms; }
        .missi-stagger > *:nth-child(4) { animation-delay: 140ms; }
        .missi-stagger > *:nth-child(5) { animation-delay: 180ms; }
        .missi-stagger > *:nth-child(6) { animation-delay: 220ms; }
        .missi-stagger > *:nth-child(7) { animation-delay: 260ms; }
        .missi-stagger > *:nth-child(8) { animation-delay: 300ms; }

        /* Sidebar entrance — runs only on the first mount of a browser session
           (gated by sessionStorage in JS). Otherwise every client-side route
           change would replay the fade-in and feel janky. */
        @keyframes missi-sidebar-in {
          0%   { opacity: 0; transform: translateX(-8px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .missi-sidebar-enter { animation: missi-sidebar-in 360ms cubic-bezier(0.32, 0.72, 0, 1) both; }

        /* Staggered label fade-in on expand.
           When closing, no delay is applied (data-opening="false")
           so all labels fade out together for a snappy collapse. */
        .missi-nav-group[data-opening="true"] > *:nth-child(1) .missi-nav-label  { transition-delay: 40ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(2) .missi-nav-label  { transition-delay: 80ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(3) .missi-nav-label  { transition-delay: 120ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(4) .missi-nav-label  { transition-delay: 160ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(5) .missi-nav-label  { transition-delay: 200ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(6) .missi-nav-label  { transition-delay: 240ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(7) .missi-nav-label  { transition-delay: 280ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(8) .missi-nav-label  { transition-delay: 320ms; }
        .missi-nav-group[data-opening="true"] > *:nth-child(9) .missi-nav-label  { transition-delay: 360ms; }

        /* (Icon-gutter width transition uses the inline transition set on
           each NavRow, so icons animate in sync with the sidebar width. No
           extra delay — keeps the expand animation tight.) */

        /* Avatar ring on hover (profile card) */
        .missi-profile-card:hover .missi-avatar { box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        .missi-avatar { transition: box-shadow 240ms cubic-bezier(0.32, 0.72, 0, 1); }

        /* Mobile hamburger rotate */
        .missi-menu-btn { transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1); }
        .missi-menu-btn.is-open { transform: rotate(90deg); }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .missi-scroll { scroll-behavior: auto; }
          .missi-pro-pill { animation: none; }
          .missi-sidebar-enter { animation: none; }
          .missi-stagger > * { animation: none; opacity: 1; }
          .missi-chevron, .missi-menu-btn, .missi-nav-row, .missi-nav-icon, .missi-nav-label,
          .missi-nav-accent, .missi-avatar { transition: none !important; }
        }
      `}</style>

      {/* Top section */}
      <div className="flex items-center h-14 px-3 border-b border-white/[0.04]">
        <div
          className="flex-1 overflow-hidden flex items-center"
          style={{
            opacity: showLabels ? 1 : 0,
            transform: showLabels ? "translateX(0)" : "translateX(-4px)",
            transition: "opacity 150ms ease, transform 150ms ease",
            pointerEvents: showLabels ? "auto" : "none",
          }}
        >
          <LEDLogo className="w-20" />
        </div>
        {!isMobile && (
          <button
            type="button"
            onClick={() => {
              // When collapsing, also close any open sub-panel so the
              // sidebar actually shrinks. Without this, `effectiveOpen`
              // stays true because of the active sub-panel and the
              // chevron "doesn't appear to do anything" — confusing UX.
              if (open && activeSub !== null) closeSub()
              persistOpen(!open)
            }}
            aria-expanded={open}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            data-testid="sidebar-toggle-btn"
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}
          >
            <ChevronLeft className={`w-4 h-4 missi-chevron ${open ? "" : "is-collapsed"}`} />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/[0.06] transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Profile card — lives at the top of the sidebar and links to /profile.
          Shows avatar (Clerk imageUrl), first name and Pro/Free plan pill.
          On collapse it shrinks to just the centered avatar. */}
      <Link
        href="/profile"
        className="missi-profile-card block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
        aria-label="Open profile"
        data-testid="sidebar-profile-card"
      >
        <div
          className="flex items-center h-14 hover:bg-white/[0.04] transition-colors duration-[220ms]"
          style={{
            justifyContent: showLabels ? "flex-start" : "center",
            paddingLeft: showLabels ? 12 : 0,
            paddingRight: showLabels ? 12 : 0,
            gap: showLabels ? 12 : 0,
            transition:
              "padding 220ms cubic-bezier(0.32, 0.72, 0, 1), gap 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: showLabels ? COLLAPSED_WIDTH - 24 : 28,
              transition: "width 220ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="missi-avatar rounded-full"
                style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.1)" }}
              />
            ) : (
              <div
                className="missi-avatar rounded-full flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <UserIcon className="w-3.5 h-3.5 text-white/50" />
              </div>
            )}
          </div>
          <div
            className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden"
            style={{
              opacity: showLabels ? 1 : 0,
              maxWidth: showLabels ? "100%" : 0,
              transform: showLabels ? "translateX(0)" : "translateX(-4px)",
              transition:
                "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), max-width 220ms cubic-bezier(0.32, 0.72, 0, 1), transform 220ms cubic-bezier(0.32, 0.72, 0, 1)",
              pointerEvents: showLabels ? "auto" : "none",
            }}
          >
            <span
              className="truncate"
              style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.9)", maxWidth: 110 }}
            >
              {firstName || "Guest"}
            </span>
            <span
              className={resolvedPlan === "pro" ? "missi-pro-pill" : ""}
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: 999,
                background: resolvedPlan === "pro" ? undefined : "rgba(255,255,255,0.06)",
                color: resolvedPlan === "pro" ? undefined : "rgba(255,255,255,0.55)",
                border:
                  resolvedPlan === "pro"
                    ? "1px solid rgba(251,191,36,0.28)"
                    : "1px solid rgba(255,255,255,0.06)",
                flexShrink: 0,
              }}
            >
              {resolvedPlan === "pro" ? "Pro" : "Free"}
            </span>
          </div>
        </div>
      </Link>

      {/* Sliding panel region */}
      <div className="relative flex-1 overflow-hidden">
        {/* Main nav */}
        <div
          className="missi-scroll absolute inset-0 flex flex-col overflow-y-auto"
          style={{
            transform: activeSub ? "translateX(-100%)" : "translateX(0)",
            transition: "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <nav
            className="missi-nav-group flex flex-col gap-0.5 px-2 pt-2"
            data-opening={isExpanding ? "true" : "false"}
            aria-label="Primary"
          >
            <NavRow
              icon={<MessageSquare className="w-4 h-4" />}
              label="Chat"
              active={isOnChat && !activeSub}
              showLabel={showLabels}
              onClick={handleNewChatClick}
              testId="sidebar-chat-btn"
            />
            <NavRow
              icon={<Mic2 className="w-4 h-4" />}
              label="Voice & Persona"
              showLabel={showLabels}
              onClick={() => openSub("voice")}
              iconColor={!isLiveMode && activePersona ? activePersona.accentColor : "white"}
              testId="sidebar-voice-btn"
            />
            <NavRow
              icon={<Brain className="w-4 h-4" />}
              label="Memory"
              href="/memory"
              active={pathname?.startsWith("/memory")}
              showLabel={showLabels}
              testId="sidebar-memory-btn"
            />
            <NavRow
              icon={<Users className="w-4 h-4" />}
              label="Spaces"
              href="/spaces"
              active={pathname?.startsWith("/spaces")}
              showLabel={showLabels}
              testId="sidebar-spaces-btn"
            />
            <NavRow
              icon={<Heart className="w-4 h-4" />}
              label="Mood"
              href="/mood"
              active={pathname?.startsWith("/mood")}
              showLabel={showLabels}
              testId="sidebar-mood-btn"
            />
            <NavRow
              icon={<Flame className="w-4 h-4" />}
              label="Streaks"
              href="/streak"
              active={pathname?.startsWith("/streak")}
              showLabel={showLabels}
              testId="sidebar-streaks-btn"
            />
            <NavRow
              icon={<BookOpen className="w-4 h-4" />}
              label="Exam Buddy"
              href="/exam-buddy"
              active={pathname?.startsWith("/exam-buddy")}
              showLabel={showLabels}
              testId="sidebar-exam-buddy-btn"
            />
            <NavRow
              icon={<Plug className="w-4 h-4" />}
              label="Integrations"
              showLabel={showLabels}
              onClick={() => openSub("integrations")}
              testId="sidebar-integrations-btn"
            />
            {/* Profile row removed — the top profile card already links to /profile. */}
            <NavRow
              icon={<MoreHorizontal className="w-4 h-4" />}
              label="More"
              showLabel={showLabels}
              onClick={() => openSub("more")}
              testId="sidebar-more-btn"
            />
          </nav>
        </div>

        {/* Sub-panel */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden"
          style={{
            transform: activeSub ? "translateX(0)" : "translateX(100%)",
            transition: "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(12,12,14,0.96)",
          }}
          aria-hidden={!activeSub}
        >
          <div className="flex items-center h-12 px-2 border-b border-white/[0.04]">
            <button
              type="button"
              onClick={closeSub}
              aria-label="Back to main navigation"
              data-testid="sidebar-back-btn"
              className="group flex items-center gap-1.5 px-2 h-8 rounded-md hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
            >
              <ChevronLeft
                className="w-4 h-4"
                style={{ transition: "transform 220ms cubic-bezier(0.32, 0.72, 0, 1)" }}
              />
              <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.2 }}>
                {activeSub === "voice"
                  ? "Voice & Persona"
                  : activeSub === "integrations"
                    ? "Integrations"
                    : activeSub === "more"
                      ? "More"
                      : "Back"}
              </span>
            </button>
          </div>
          <div key={activeSub ?? "none"} className="missi-scroll missi-stagger flex-1 overflow-y-auto">
            {activeSub === "voice" && (
              <PersonaSubPanel
                plan={plan}
                isLiveMode={isLiveMode}
                activePersona={activePersona}
                onPersonaChange={onPersonaChange}
                onSwitchToLive={onSwitchToLive}
                onClose={closeSub}
              />
            )}
            {activeSub === "integrations" && <IntegrationsSubPanel />}
            {activeSub === "more" && <MoreSubPanel onPickImage={onPickImage} onClose={closeSub} />}
            {/* The old "settings" sub-panel moved to its own full page at
                /settings (see components/chat/SettingsSubPanel below — now
                unused but kept for backwards reference until we delete it). */}
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div
        className="missi-nav-group flex flex-col gap-0.5 px-2 py-2 border-t border-white/[0.04]"
        data-opening={isExpanding ? "true" : "false"}
      >
        <NavRow
          icon={<Settings className="w-4 h-4" />}
          label="Settings"
          showLabel={showLabels}
          active={pathname?.startsWith("/settings") && !pathname?.startsWith("/settings/integrations")}
          onClick={() => {
            // Settings used to open as a sliding sub-panel in this sidebar; it
            // now lives on its own full page at /settings for a more focused
            // editing surface. Close any other open sub-panel before routing
            // so it doesn't linger when the user comes back.
            if (activeSub !== null) closeSub()
            setMobileOpen(false)
            router.push("/settings")
          }}
          testId="sidebar-settings-btn"
        />
        <NavRow
          icon={<LogOut className="w-4 h-4" />}
          label="Sign out"
          showLabel={showLabels}
          onClick={onLogout}
          testId="sidebar-signout-btn"
        />
      </div>
    </>
  )

  // SSR safety: render collapsed until hydrated to avoid flicker from localStorage mismatch
  const readyOnClient = hydrated

  return (
    <>
      {/* Mobile hamburger — fixed at top-left, only visible below md */}
      {isMobile && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
          aria-controls="chat-sidebar"
          aria-expanded={mobileOpen}
          data-testid="sidebar-hamburger-btn"
          // The hamburger's vertical position is page-aware so it always feels
          // balanced with each surface's own top chrome:
          //
          //   • On /chat, the page renders a floating "MISSI" pill whose
          //     glyphs are centered near viewport y ≈ 80 (p-2 outer + mt-12 +
          //     py-2.5 around a 20px SVG). A 36px button at `top: 62px`
          //     centers at 80, so the three lines balance with the lettering.
          //
          //   • Everywhere else the app uses ChatShell, whose mobile main card
          //     reserves a 44px top safe zone (see `.missi-shell-main` CSS in
          //     ChatShell). A top-of-card header (e.g. "Memory Graph",
          //     "Missi Agent") sits right below that safe zone, so a button
          //     at y ≈ 80 would land on top of it. We therefore move the
          //     hamburger into the safe zone at `top: 14px` on ChatShell
          //     routes, keeping it comfortably above the page header.
          //
          // Set via inline style rather than a Tailwind arbitrary class so it
          // can't be dropped by JIT/caching and so it always wins over any
          // stale utility.
          // Bare three-line icon — no circular chrome, no border, no backdrop.
          // Keeps focus-visible ring for keyboard users.
          className="fixed left-3 z-[210] flex items-center justify-center w-9 h-9 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          style={{
            top: isOnChat ? 62 : 14,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Menu className="w-4 h-4 missi-menu-btn" />
        </button>
      )}

      {/* Mobile backdrop — kept just under the drawer (z:200) but above the
          /chat page's MISSI pill (z:100) so the pill is visually dimmed and
          no longer punches through the drawer overlay. */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60"
          style={{ zIndex: 190 }}
          aria-hidden
        />
      )}

      <aside
        id="chat-sidebar"
        role="navigation"
        aria-label="Primary navigation"
        data-sidebar-open={effectiveOpen ? "true" : "false"}
        // The entrance keyframe animates `transform: translateX(-8px) → 0`,
        // which on mobile would override the inline `translateX(-100%)` used
        // to hide the drawer and cause the whole sidebar to briefly slide into
        // view on first load. Restrict the entrance
        // animation to desktop, where the sidebar is always visible anyway.
        className={`flex flex-col h-full ${!isMobile && playEntrance ? "missi-sidebar-enter" : ""}`}
        style={{ ...asideStyle, visibility: readyOnClient || isMobile ? "visible" : "visible" }}
      >
        {content}
      </aside>
    </>
  )
}

export const ChatSidebar = memo(ChatSidebarInner)
