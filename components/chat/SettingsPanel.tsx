"use client"

import { memo, useState, useCallback, useEffect } from "react"
import { LogOut, Heart, Briefcase, Zap, BrainCircuit, Pencil, Check, X as XIcon, Calendar, BookOpen, RefreshCw, CheckCircle2, Mail, CheckSquare, MessageSquare, Github, LayoutGrid, Inbox } from "lucide-react"
import type { PersonalityKey } from "@/types/chat"
import { PERSONALITY_OPTIONS } from "@/types/chat"
import type { PluginConfig, PluginId } from "@/types/plugins"
import { toast } from "sonner"

type SafePlugin = Omit<PluginConfig, "credentials">

interface PluginConnectionStatus {
  google: { connected: boolean; expiresAt?: number } | null
  notion: { connected: boolean; workspaceName?: string } | null
  kvAvailable: boolean
}

interface SettingsPanelProps {
  personality: PersonalityKey
  onPersonalityChange: (p: PersonalityKey) => void
  voiceEnabled: boolean
  onVoiceToggle: () => void
  isOpen: boolean
  activePanel: 'settings' | 'plugins' | null
  onClose: () => void
  userName: string
  userEmail: string
  userImageUrl: string | null
  onLogout: () => void
  onNameChange?: (newName: string) => void
  onPanelMouseEnter?: () => void
  onPanelMouseLeave?: () => void
  plugins?: SafePlugin[]
  onConnectPlugin?: (
    id: PluginId,
    credentials: Record<string, string>,
    settings?: Record<string, string>,
  ) => Promise<boolean>
  onDisconnectPlugin?: (id: PluginId) => Promise<void>
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Heart: <Heart className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  BrainCircuit: <BrainCircuit className="w-4 h-4" />,
}

// ─── OAuth Plugin Panel ────────────────────────────────────────────────────────
const LS_KEY = "missi_plugin_connections"

function saveConnectionsToLS(connections: Partial<Record<"google" | "notion", boolean>>) {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}")
    localStorage.setItem(LS_KEY, JSON.stringify({ ...existing, ...connections }))
  } catch {}
}

function loadConnectionsFromLS(): Partial<Record<"google" | "notion", boolean>> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") } catch { return {} }
}

function clearConnectionFromLS(plugin: "google" | "notion") {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}")
    delete existing[plugin]
    localStorage.setItem(LS_KEY, JSON.stringify(existing))
  } catch {}
}

function OAuthPluginPanel() {
  const [status, setStatus] = useState<PluginConnectionStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  function loadStatus() {
    // Start with localStorage state immediately (no flicker)
    const local = loadConnectionsFromLS()
    setStatus((prev) => ({
      kvAvailable: prev?.kvAvailable ?? false,
      google: local.google ? { connected: true } : (prev?.google ?? null),
      notion: local.notion ? { connected: true } : (prev?.notion ?? null),
    }))

    // Then merge with server response
    fetch("/api/v1/plugins/refresh")
      .then((r) => r.json())
      .then((d: PluginConnectionStatus) => {
        const merged = {
          ...d,
          google: d.google ?? (local.google ? { connected: true } : null),
          notion: d.notion ?? (local.notion ? { connected: true, workspaceName: "Notion" } : null),
        }
        setStatus(merged)
        // Keep localStorage in sync with server truth
        if (d.google) saveConnectionsToLS({ google: true })
        if (d.notion) saveConnectionsToLS({ notion: true })
      })
      .catch(() => {})
  }

  useEffect(() => {
    // Check URL params FIRST (right after OAuth redirect)
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
  }, [])

  async function handleDisconnect(plugin: "google" | "notion") {
    try {
      await fetch(`/api/v1/plugins/refresh?plugin=${plugin}`, { method: "DELETE" })
      clearConnectionFromLS(plugin)
      setStatus((s) => s ? { ...s, [plugin]: null } : s)
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
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: "8px",
  }

  const connectBtnStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "#000",
    background: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "5px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }

  const disconnectBtnStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 500,
    color: "rgba(255,255,255,0.6)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    padding: "4px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }

  return (
    <div>
      {/* Google Calendar */}
      <div style={rowStyle}>
        <Calendar className="w-4 h-4 text-white opacity-60" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "#fff", margin: 0 }}>Google Calendar</p>
          <p style={{ fontSize: "10px", color: status?.google?.connected ? "#4ade80" : "rgba(255,255,255,0.3)", margin: "2px 0 0" }}>
            {status?.google?.connected ? "✓ Connected — events synced" : "Not connected"}
          </p>
        </div>
        {status?.google?.connected ? (
          <button style={disconnectBtnStyle} onClick={() => handleDisconnect("google")}>Disconnect</button>
        ) : (
          <a href="/api/auth/connect/google" style={connectBtnStyle}>Connect</a>
        )}
      </div>

      {/* Notion */}
      <div style={rowStyle}>
        <BookOpen className="w-4 h-4 text-white opacity-60" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "#fff", margin: 0 }}>Notion</p>
          <p style={{ fontSize: "10px", color: status?.notion?.connected ? "#4ade80" : "rgba(255,255,255,0.3)", margin: "2px 0 0" }}>
            {status?.notion?.connected
              ? `✓ ${status.notion.workspaceName ?? "Connected"}`
              : "Not connected"}
          </p>
        </div>
        {status?.notion?.connected ? (
          <button style={disconnectBtnStyle} onClick={() => handleDisconnect("notion")}>Disconnect</button>
        ) : (
          <a href="/api/auth/connect/notion" style={connectBtnStyle}>Connect</a>
        )}
      </div>

      {/* ── Coming Soon ─────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: "6px",
        borderRadius: "12px",
        padding: "14px 14px 12px",
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        border: "1px dashed rgba(255,255,255,0.1)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Glow blob */}
        <div style={{
          position: "absolute",
          top: "-12px",
          right: "-12px",
          width: "60px",
          height: "60px",
          background: "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <p style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.25)",
          margin: "0 0 10px",
        }}>
          More plugins coming soon
        </p>

        {/* Plugin icons row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                gap: "5px",
                padding: "4px 8px",
                borderRadius: "7px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                opacity: 0.5,
                cursor: "default",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {icon}
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: "10px",
          color: "rgba(255,255,255,0.2)",
          margin: "10px 0 0",
          lineHeight: 1.4,
        }}>
          Missi will soon connect with your entire workflow — automatically.
        </p>
      </div>

      {/* Refresh button */}
      {(status?.google?.connected || status?.notion?.connected) && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            marginTop: "8px",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            fontSize: "11px",
            fontWeight: 500,
            color: refreshing ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "7px",
            cursor: refreshing ? "default" : "pointer",
          }}
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh context now"}
        </button>
      )}

    </div>
  )
}

const panelBox: React.CSSProperties = {
  background: "#050505",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "16px",
  padding: "20px",
}

function SettingsPanelInner({
  personality,
  onPersonalityChange,
  voiceEnabled,
  onVoiceToggle,
  isOpen,
  activePanel,
  userName,
  userEmail,
  userImageUrl,
  onLogout,
  onNameChange,
  onPanelMouseEnter,
  onPanelMouseLeave,
}: SettingsPanelProps) {


  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(userName)
  const [savingName, setSavingName] = useState(false)
  const [renderedPanel, setRenderedPanel] = useState<'settings' | 'plugins' | null>(activePanel)

  useEffect(() => {
    if (activePanel) {
      setRenderedPanel(activePanel)
    }
  }, [activePanel])

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim()
    if (trimmed.length < 1 || trimmed === userName) {
      setIsEditingName(false)
      setEditName(userName)
      return
    }
    setSavingName(true)
    try {
      // Save to server
      await fetch('/api/v1/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      // Update local state
      onNameChange?.(trimmed)
      toast.success('Name updated!')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
      setIsEditingName(false)
    }
  }, [editName, userName, onNameChange])

  async function handleEnablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Push notifications are not supported in your browser')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Permission denied')
        return
      }
      toast.loading('Enabling check-ins...', { id: 'push' })
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      })
      if (!res.ok) throw new Error('Failed to save subscription')
      toast.success('Proactive Check-ins enabled!', { id: 'push' })
    } catch (err) {
      toast.error('Failed to enable notifications', { id: 'push' })
      console.error(err)
    }
  }

  return (
    <div
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave}
      style={{
        position: activePanel === 'plugins' ? 'fixed' : 'absolute',
        top: activePanel === 'plugins' ? '72px' : '100%',
        right: activePanel === 'plugins' ? '16px' : '0',
        marginTop: activePanel === 'plugins' ? '0' : '8px',
        width: "300px",
        zIndex: 40,
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
    <div
      style={{
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.96)",
        transformOrigin: "top right",
        opacity: isOpen ? 1 : 0,
        transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
        willChange: "transform, opacity",
      }}
    >
      {/* ── SETTINGS BOX — opens when gear icon is clicked ── */}
      {renderedPanel === 'settings' && (
        <div onClick={(e) => e.stopPropagation()} data-testid="settings-panel" style={panelBox}>
          {/* User profile */}
          <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {userImageUrl && <img src={userImageUrl} alt="" className="w-10 h-10 rounded-full" />}
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName()
                      if (e.key === 'Escape') { setIsEditingName(false); setEditName(userName) }
                    }}
                    className="text-xs font-semibold text-white tracking-wide bg-white/5 border border-white/15 rounded px-2 py-1 outline-none focus:border-white/30"
                    style={{ width: '120px', fontSize: '12px' }}
                    autoFocus
                    disabled={savingName}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', padding: '2px' }}
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setIsEditingName(false); setEditName(userName) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px' }}
                    title="Cancel"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-white tracking-wide">{userName}</p>
                  {onNameChange && (
                    <button
                      onClick={() => { setEditName(userName); setIsEditingName(true) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px' }}
                      title="Edit name"
                      data-testid="edit-name-btn"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-[10px] font-light text-white/40">{userEmail}</p>
            </div>
          </div>

          {/* Personality */}
          <div className="mb-5">
            <p className="text-[10px] font-medium tracking-wider uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              Personality Profile
            </p>
            <div className="flex flex-col gap-2">
              {PERSONALITY_OPTIONS.map((p) => {
                const IconComp = ICON_MAP[p.iconName as string]
                return (
                  <button
                    key={p.key}
                    onClick={() => onPersonalityChange(p.key)}
                    data-testid={`personality-${p.key}-btn`}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                    style={{
                      background: personality === p.key ? "rgba(255,255,255,0.08)" : "transparent",
                      border: personality === p.key ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ color: personality === p.key ? "#fff" : "rgba(255,255,255,0.4)" }}>
                      {IconComp}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: personality === p.key ? "#fff" : "rgba(255,255,255,0.5)" }}>
                        {p.label}
                      </p>
                      <p className="text-[10px] font-light" style={{ color: personality === p.key ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                        {p.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Voice toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              Voice Engine
            </span>
            <button
              onClick={onVoiceToggle}
              data-testid="voice-toggle-btn"
              className="relative w-10 h-6 rounded-full transition-colors"
              style={{ background: voiceEnabled ? "#fff" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer" }}
            >
              <span
                className="absolute top-1 w-4 h-4 rounded-full shadow-sm"
                style={{
                  background: voiceEnabled ? "#000" : "#fff",
                  left: voiceEnabled ? "20px" : "4px",
                  transition: "left 0.2s ease, background 0.2s ease",
                }}
              />
            </button>
          </div>

          {/* Notifications */}
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
              Proactive Check-Ins
            </span>
            <button
              onClick={handleEnablePush}
              className="text-[10px] font-bold px-3 py-1 rounded border transition-colors hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer" }}
            >
              Enable
            </button>
          </div>

          {/* Sign out */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px" }}>
            <button
              onClick={onLogout}
              data-testid="logout-btn"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
            >
              <LogOut className="w-3.5 h-3.5 opacity-80" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* ── PLUGINS BOX — opens when plugin badge is clicked ── */}
      {renderedPanel === 'plugins' && (
        <div onClick={(e) => e.stopPropagation()} style={panelBox}>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-white opacity-80" />
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              Connections
            </span>
          </div>
          <OAuthPluginPanel />
        </div>
      )}
    </div>
    </div>
  )
}

export const SettingsPanel = memo(SettingsPanelInner)
